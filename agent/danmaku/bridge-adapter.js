'use strict';

const { DanmakuDirector, sameContext } = require('./director');
const { extractSceneContext, factLines, categoryLabel } = require('./scene-context');
const { nextActionFact } = require('./codex-facts');
const { buildRecommendationDialogue } = require('./recommendation-dialogue');
const { createMonsterDisplayName } = require('./monster-identity');
const { buildSharedScene } = require('./shared-scene');

function isLiveCombat(state) {
  return Boolean(state?.combat)
    && (state.combat.enemies || []).some(enemy => enemy?.name && enemy.alive !== false);
}

class DanmakuBridgeAdapter {
  constructor({
    now = () => Date.now(),
    schedule = setTimeout,
    idleMs = 20_000,
    sharedClient = null,
    llmAtmosphere = null,
    ...directorOptions
  } = {}) {
    this.now = now;
    this.schedule = schedule;
    this.idleMs = idleMs;
    this.sharedClient = sharedClient;
    this.llmAtmosphere = llmAtmosphere;
    this.director = new DanmakuDirector({ now, ...directorOptions });
    this.reset();
  }

  reset() {
    this.director.invalidate();
    this.director.context = null;
    this.director.closed = false;
    this.sequence = -1;
    this.previous = null;
    this.scope = null;
    this.runId = null;
    this.serial = 0;
    this.sceneCount = (this.sceneCount || 0) + 1;
    this.accepting = false;
    this.lastFactAt = 0;
    this.idleEmitted = false;
    this.lastMoveKeys = new Map();
    this.fightKey = '';
    this.sharedScene = null;
  }

  invalidate() {
    this.accepting = false;
    this.director.invalidate();
  }

  markFact() {
    this.lastFactAt = this.now();
    this.idleEmitted = false;
  }

  getSharedScene() {
    return this.sharedScene ? { ...this.sharedScene, tags: [...(this.sharedScene.tags || [])] } : null;
  }

  async submitShared(text, { echoDelayMs = 3000 } = {}) {
    const scene = this.getSharedScene();
    if (!scene || !this.scope || !this.accepting) {
      return { accepted: false, reason: '当前没有可共享的战斗场景' };
    }
    if (!this.sharedClient?.enabled) {
      return { accepted: false, reason: 'shared_service_not_configured' };
    }
    const result = await this.sharedClient.submit({ ...scene, text });
    if (!result.accepted) return result;
    const expected = { sceneKey: scene.sceneKey, phase: scene.phase, sceneId: this.scope.sceneId };
    const content = String(result.item?.text || text || '').trim();
    const messageId = result.item?.id || `${this.now()}-${++this.serial}`;
    this.schedule(() => this.enqueueOwnShared(content, expected, messageId), Math.max(0, Number(echoDelayMs) || 3000));
    return result;
  }

  enqueueOwnShared(text, expected, messageId) {
    const current = this.getSharedScene();
    if (!text || !current || !this.scope || this.director.closed
      || current.sceneKey !== expected.sceneKey
      || current.phase !== expected.phase
      || this.scope.sceneId !== expected.sceneId) {
      return { accepted: false, reason: 'stale_shared_scene' };
    }
    return this.director.burst({
      ...this.scope,
      eventId: `shared-self-${messageId}`,
      trigger: 'shared_self',
      key: `${expected.sceneKey}:${expected.phase}:${messageId}`,
      priority: 3,
      factTexts: [text],
      detailByText: {
        [text]: {
          title: '你留下的弹幕',
          lines: ['已保存到当前场景'],
          source: 'shared'
        }
      },
      factSourceByText: {
        [text]: { type: 'shared_player', source: 'shared' }
      }
    });
  }

  async enqueueShared({ state, phase, scope }) {
    if (!this.sharedClient?.enabled || !state || !scope) return { accepted: false, reason: 'shared_service_not_configured' };
    const sharedScene = buildSharedScene(state, phase);
    this.sharedScene = sharedScene;
    const sceneId = scope.sceneId;
    const items = await this.sharedClient.list({ sceneKey: sharedScene.sceneKey, phase });
    if (!items.length || this.scope?.sceneId !== sceneId || this.director.closed) {
      return { accepted: false, reason: 'no_shared_messages' };
    }
    const texts = [...new Set(items.map(item => String(item.text || '').trim()).filter(Boolean))];
    if (!texts.length) return { accepted: false, reason: 'no_shared_messages' };
    return this.director.burst({
      ...scope,
      eventId: `shared-${phase}-${sceneId}`,
      trigger: `shared_${phase}`,
      key: `${sharedScene.sceneKey}:${phase}`,
      // 共享弹幕是异步补充，不能被本地入场弹幕的短冷却吞掉；它仍然只是表达层。
      priority: 3,
      factTexts: texts,
      detailByText: Object.fromEntries(texts.map(text => [text, {
        title: '其他玩家留下的弹幕',
        lines: [`场景：${sharedScene.character} · ${sharedScene.objectKey}`, `时机：${phase === 'death' ? '死亡' : '战斗中'}`],
        source: 'shared'
      }])),
      factSourceByText: Object.fromEntries(texts.map(text => [text, {
        type: 'shared_player',
        source: 'shared'
      }]))
    });
  }

  async enterDeath(state, { runId, revision, eventId } = {}) {
    const scope = { runId, sceneId: `${runId}:death-${++this.sceneCount}`, stateRevision: revision };
    this.scope = scope;
    this.previous = structuredClone(state || {});
    this.accepting = true;
    this.director.setContext(scope);
    this.sharedScene = buildSharedScene(state, 'death');
    void this.enqueueShared({ state, phase: 'death', scope }).catch(() => {});
    return { accepted: true, reason: 'death_started', eventId };
  }

  displayName(enemy, index = 0) {
    return createMonsterDisplayName({
      sceneId: this.scope?.sceneId || 'unknown-scene',
      monsterId: enemy?.id,
      name: enemy?.name,
      index
    });
  }

  enemyKey(enemy, index = 0) {
    return `${enemy?.id || enemy?.name || 'enemy'}#${index}`;
  }

  actionSignature(enemy, index = 0) {
    const fact = nextActionFact(enemy, {
      categoryLabel,
      sceneId: this.scope?.sceneId || 'unknown-scene',
      displayName: this.displayName(enemy, index)
    });
    return [enemy.id || enemy.name, fact?.moveKey || '', fact?.kind || enemy.intent || ''].join('|');
  }

  async emit(trigger, extras = {}) {
    const scope = { ...this.scope };
    const sceneContext = extractSceneContext({ state: this.previous || {}, trigger, event: extras.event });
    const factTexts = extras.factTexts || factLines(sceneContext, { event: extras.event });
    const result = this.director.burst({
      ...scope,
      eventId: extras.eventId || `derived-${++this.serial}`,
      trigger,
      factTexts,
      ...extras
    });
    if (result.accepted && trigger !== 'entry' && this.llmAtmosphere && !extras.disableAI) {
      const facts = [];
      for (const enemy of sceneContext.enemies || []) {
        const action = enemy.nextMoveName || enemy.intent;
        if (action) facts.push(`${enemy.name}正在${action}`);
      }
      if (extras.recommendation?.primary) {
        const primary = extras.recommendation.primary;
        facts.push(`建议内容：${primary.cardName || primary.displayLabel || primary.label || primary.action || ''}`);
      }
      if (!facts.length) facts.push(...(extras.factTexts || []).slice(0, 2));
      const eventId = extras.eventId || `derived-${this.serial}`;
      void this.llmAtmosphere.generate({
        character: sceneContext.characterKey || 'ironclad',
        trigger,
        facts: [...new Set(facts)].filter(Boolean)
      }).then(phrases => {
        if (!phrases.length || this.scope?.sceneId !== scope.sceneId || this.director.closed) return;
        this.director.burst({
          ...scope,
          eventId: `${eventId}-ai`,
          trigger: 'ai_atmosphere',
          key: `${eventId}-ai`,
          priority: 3,
          factTexts: phrases,
          detailByText: Object.fromEntries(phrases.map(text => [text, {
            title: '铁甲战士的战场感想',
            lines: ['根据当前 Mod 场景生成'],
            source: 'ai'
          }])),
          factSourceByText: Object.fromEntries(phrases.map(text => [text, {
            type: 'ai_generated',
            source: 'ai'
          }]))
        });
      }).catch(error => console.warn('[GameBuddy Danmaku] AI line skipped:', error.message));
    }
    return result;
  }

  async ingestObservation(observation, { runId } = {}) {
    if (!runId) throw new TypeError('主进程必须提供稳定的 runId');
    if (observation?.schema !== 'gamebuddy.observation.v1' || !Number.isInteger(observation.sequence)) {
      throw new TypeError('无效 observation');
    }
    if (this.runId !== runId) {
      this.reset();
      this.runId = runId;
    }
    if (observation.fresh !== true || !observation.state) {
      this.invalidate();
      return { accepted: false, reason: 'not_fresh' };
    }
    if (observation.sequence <= this.sequence) return { accepted: false, reason: 'old_observation' };
    this.accepting = true;
    this.sequence = observation.sequence;
    const state = observation.state;
    const previous = this.previous;
    const wasCombat = isLiveCombat(previous);
    const inCombat = isLiveCombat(state);

    if (!inCombat) {
      this.previous = structuredClone(state);
      this.fightKey = '';
      if (wasCombat && this.scope) {
        const died = Number(state?.player?.hp) <= 0;
        if (died) {
          return this.enterDeath(previous, {
            runId,
            revision: observation.sequence,
            eventId: `death-${++this.serial}`
          });
        }
        this.sharedScene = null;
        this.accepting = false;
        return this.director.close({ ...this.scope, eventId: `exit-${++this.serial}`, outcome: 'unknown' });
      }
      if (!wasCombat && this.sharedScene?.phase !== 'death') this.sharedScene = null;
      return { accepted: false, reason: 'non_combat' };
    }

    const sceneContext = extractSceneContext({ state });
    const names = [...sceneContext.enemyNames].sort();
    const fightKey = JSON.stringify([state.run?.act, state.run?.floor, names]);
    const entering = fightKey !== this.fightKey;
    this.fightKey = fightKey;
    this.previous = structuredClone(state);
    if (entering) this.sceneCount += 1;
    this.scope = { runId, sceneId: `${runId}:combat-${this.sceneCount}`, stateRevision: observation.sequence };
    this.director.setContext(this.scope);

    if (entering) {
      this.sharedScene = buildSharedScene(state, 'combat');
      this.markFact();
      this.lastMoveKeys = new Map(sceneContext.enemies.map((enemy, index) => [
        this.enemyKey(enemy, index), this.actionSignature(enemy, index)
      ]));
      const facts = [combatHeadline(sceneContext.enemies)];
      const seen = new Set(facts.map(item => item.text));
      for (const [index, enemy] of sceneContext.enemies.entries()) {
        const fact = nextActionFact(enemy, {
          categoryLabel,
          sceneId: this.scope.sceneId,
          displayName: this.displayName(enemy, index),
          occurrence: index
        });
        if (!fact || seen.has(fact.text)) continue;
        seen.add(fact.text);
        facts.push({ text: fact.text, detail: fact.detail });
      }
      const result = await this.emit('entry', {
        eventId: `entry-${this.scope.sceneId}`,
        key: 'entry',
        factTexts: facts.map(item => item.text),
        detailByText: Object.fromEntries(facts.map(item => [item.text, item.detail])),
        factSourceByText: Object.fromEntries(facts.map(item => [item.text, {
          type: 'fixed_dialogue',
          source: 'original_template'
        }]))
      });
      void this.enqueueShared({ state, phase: 'combat', scope: this.scope }).catch(() => {});
      return result;
    }

    const changed = sceneContext.enemies
      .map((enemy, index) => ({
        enemy,
        index,
        fact: nextActionFact(enemy, {
          categoryLabel,
          sceneId: this.scope.sceneId,
          displayName: this.displayName(enemy, index),
          occurrence: sceneContext.turn || 0
        }),
        key: this.actionSignature(enemy, index)
      }))
      .filter(item => item.fact && item.key !== this.lastMoveKeys.get(this.enemyKey(item.enemy, item.index)));
    for (const [index, enemy] of sceneContext.enemies.entries()) {
      this.lastMoveKeys.set(this.enemyKey(enemy, index), this.actionSignature(enemy, index));
    }
    if (changed.length) {
      this.markFact();
      return this.emit('enemy_move', {
        eventId: `move-${this.scope.sceneId}-${sceneContext.turn ?? 'unknown'}-${++this.serial}`,
        key: `${sceneContext.turn ?? 'x'}:${changed.map(item => item.key).join('|')}`,
        priority: 3,
        factTexts: changed.map(item => item.fact.text),
        detailByText: Object.fromEntries(changed.map(item => [item.fact.text, item.fact.detail])),
        factSourceByText: Object.fromEntries(changed.map(item => [item.fact.text, {
          type: 'fixed_dialogue',
          source: 'original_template'
        }]))
      });
    }

    if (!this.idleEmitted && this.lastFactAt && this.now() - this.lastFactAt >= this.idleMs) {
      this.idleEmitted = true;
      return { accepted: false, reason: 'idle_no_new_action' };
    }
    return { accepted: false, reason: 'no_new_trigger' };
  }

  async ingestRecommendation(recommendation, { runId, observation } = {}) {
    if (!recommendation || !runId) return { accepted: false, reason: 'invalid_recommendation' };
    const revision = Number.isInteger(observation?.sequence) ? observation.sequence : 0;
    const scope = this.accepting && this.scope
      ? this.scope
      : { runId, sceneId: `${runId}:advice-${recommendation.task || 'unknown'}`, stateRevision: revision };
    this.scope = scope;
    this.previous = observation?.state ? structuredClone(observation.state) : this.previous || {};
    this.accepting = true;
    this.director.setContext(scope);
    const dialogue = buildRecommendationDialogue(recommendation);
    const recommendationId = recommendation.id || `${recommendation.task || 'recommendation'}-${recommendation.timestamp || Date.now()}`;
    return this.emit('recommendation', {
      eventId: `recommendation-${recommendationId}`,
      key: recommendationId,
      priority: 3,
      factTexts: [dialogue.text],
      detailByText: { [dialogue.text]: dialogue.detail },
      factSourceByText: { [dialogue.text]: { type: 'recommendation', source: 'recommendation' } },
      recommendationId,
      recommendation
    });
  }

  async ingestEvent(event) {
    if (!event?.name) return { accepted: false, reason: 'invalid_event' };
    const scope = this.scope || this.director.context;
    if (!scope || !sameContext(event.scope || scope, scope)) return { accepted: false, reason: 'stale_event' };
    if (event.name === 'combat.ended') {
      if (Number(this.previous?.player?.hp) <= 0 && this.runId) {
        return this.enterDeath(this.previous, {
          runId: this.runId,
          revision: this.sequence,
          eventId: event.eventId || `death-${++this.serial}`
        });
      }
      this.sharedScene = null;
      return this.director.close({ ...scope, eventId: event.eventId || `event-${++this.serial}`, outcome: event.outcome || 'unknown' });
    }
    if (!this.accepting) return { accepted: false, reason: 'not_accepting' };
    const triggerByEvent = {
      'enemy.spawned': 'mechanic',
      'enemy.revived': 'mechanic',
      'enemy.phase_changed': 'mechanic',
      'card.played': 'card_played'
    };
    const trigger = triggerByEvent[event.name];
    if (!trigger) return { accepted: false, reason: 'unsupported_event' };
    this.markFact();
    return this.emit(trigger, {
      eventId: event.eventId || `event-${++this.serial}`,
      key: event.eventId,
      event,
      priority: 3,
      factTexts: factLines(extractSceneContext({ state: this.previous || {}, trigger, event }), { event })
    });
  }
}

function combatHeadline(enemies = []) {
  const alive = enemies.filter(enemy => enemy?.name && enemy.alive !== false);
  if (!alive.length) return '战斗开始了。';
  const grouped = new Map();
  for (const enemy of alive) grouped.set(enemy.name, (grouped.get(enemy.name) || 0) + 1);
  if (grouped.size !== 1) return '一群敌人来了。';
  const [[name, count]] = grouped;
  const countText = count === 2 ? '两只' : count === 3 ? '三只' : count === 4 ? '四只' : count > 1 ? `${count}只` : '';
  return `${countText}${name}来袭～`;
}

module.exports = { DanmakuBridgeAdapter };
