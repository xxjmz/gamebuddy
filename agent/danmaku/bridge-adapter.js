'use strict';

const { DanmakuDirector, sameContext } = require('./director');
const { DanmakuRetriever } = require('./retrieval');
const { extractSceneContext, factLines } = require('./scene-context');
const { specialtyCandidates } = require('./catalog');
const { codexFactCandidates, currentMoveDetail } = require('./codex-facts');

class DanmakuBridgeAdapter {
  constructor({ retriever = new DanmakuRetriever(), llmAtmosphere = null, ...directorOptions } = {}) {
    this.retriever = retriever;
    this.llmAtmosphere = llmAtmosphere;
    this.director = new DanmakuDirector(directorOptions);
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
    this.place = null;
    this.serial = 0;
    this.sceneCount = (this.sceneCount || 0) + 1;
    this.accepting = false;
  }

  invalidate() {
    this.accepting = false;
    this.director.invalidate();
  }

  async emit(trigger, extras = {}) {
    const scope = { ...this.scope };
    const state = this.previous || {};
    const sceneContext = extractSceneContext({ state, trigger, event: extras.event });
    const hpRatio = sceneContext.playerMaxHp > 0 ? sceneContext.playerHp / sceneContext.playerMaxHp : undefined;
    const enemyNames = extras.enemyNames || sceneContext.enemyNames;
    const llmPromise = !extras.factOnly && this.llmAtmosphere
      ? this.llmAtmosphere.generate(sceneContext)
      : null;
    const corpusCandidates = this.retriever && !extras.factOnly
      ? await this.retriever.retrieve({
        trigger,
        scene: sceneContext.scene,
        keywords: sceneContext.keywords,
        enemyNames,
        hpRatio,
        certainty: extras.certainty,
        tone: sceneContext.tone,
        characterKey: sceneContext.characterKey
      })
      : [];
    const result = this.director.burst({
      ...scope,
      eventId: `derived-${++this.serial}`,
      trigger,
      enemyNames,
      corpusCandidates,
      knowledgeCandidates: extras.factOnly && !extras.allowCodexFacts ? [] : codexFactCandidates(sceneContext.enemies),
      localCandidates: extras.factOnly ? [] : specialtyCandidates(sceneContext),
      reserveLlmSlots: llmPromise ? 2 : 0,
      factTexts: extras.factTexts || factLines(sceneContext, {
        previousHp: extras.previousHp,
        event: extras.event
      }),
      ...extras
    });
    if (llmPromise && result.accepted) {
      void llmPromise.then(items => this.director.appendAtmosphere({
        context: scope,
        trigger,
        items,
        limit: Math.max(0, 8 - result.count)
      })).catch(error => console.warn('[GameBuddy Danmaku] LLM atmosphere skipped:', error.message));
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
    const wasCombat = Boolean(previous?.combat);
    const inCombat = Boolean(state.combat);
    const place = JSON.stringify([state.run?.act, state.run?.floor, state.run?.currentCoord, state.run?.room]);

    if (!inCombat) {
      this.previous = structuredClone(state);
      this.place = place;
      if (wasCombat && this.scope) {
        this.accepting = false;
        return this.director.close({ ...this.scope, eventId: `exit-${++this.serial}`, outcome: 'unknown' });
      }
      return { accepted: false, reason: 'non_combat' };
    }

    const entering = !wasCombat || place !== this.place || this.director.closed;
    this.previous = structuredClone(state);
    this.place = place;
    if (entering) this.sceneCount += 1;
    this.scope = { runId, sceneId: `${runId}:combat-${this.sceneCount}`, stateRevision: observation.sequence };
    this.director.setContext(this.scope);
    const sceneContext = extractSceneContext({ state });
    const names = sceneContext.enemyNames;
    if (entering) {
      const entryFacts = factLines(extractSceneContext({ state, trigger: 'entry' }));
      return this.emit('entry', {
        enemyNames: names,
        key: 'entry',
        factOnly: true,
        allowCodexFacts: true,
        factTexts: entryFacts
      });
    }
    const previousMoves = new Map(extractSceneContext({ state: previous }).enemies
      .map(enemy => [enemy.id || enemy.name, enemy.nextMoveId || enemy.nextMoveName]));
    const changedMoves = sceneContext.enemies
      .filter(enemy => (enemy.nextMoveId || enemy.nextMoveName)
        && (enemy.nextMoveId || enemy.nextMoveName) !== previousMoves.get(enemy.id || enemy.name))
      .map(enemy => ({ enemy, detail: currentMoveDetail(enemy) }))
      .filter(item => item.detail);
    if (changedMoves.length) {
      const detailByText = Object.fromEntries(changedMoves.map(item => [item.detail.title, item.detail]));
      return this.emit('enemy_move', {
        key: changedMoves.map(item => item.detail.moveId).join('|'),
        priority: 3,
        factOnly: true,
        factTexts: changedMoves.map(item => item.detail.title),
        detailByText
      });
    }
    return { accepted: false, reason: 'no_new_trigger' };
  }

  async ingestRecommendation(recommendation, scope) {
    return { accepted: false, reason: !this.accepting || !sameContext(scope, this.scope)
      ? 'stale_recommendation'
      : 'recommendation_not_rendered' };
  }

  async ingestEvent(event) {
    if (!event?.name) return { accepted: false, reason: 'invalid_event' };
    const scope = this.scope || this.director.context;
    if (!scope || !sameContext(event.scope || scope, scope)) return { accepted: false, reason: 'stale_event' };
    if (event.name === 'combat.ended') {
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
    return this.emit(trigger, {
      eventId: event.eventId || `event-${++this.serial}`,
      key: event.eventId,
      event,
      priority: 3
    });
  }
}

module.exports = { DanmakuBridgeAdapter };
