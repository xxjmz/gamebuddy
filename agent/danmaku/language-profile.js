'use strict';

const PROFILES = {
  generic: { key: 'generic', tones: ['warm', 'tense', 'hype'] },
  ironclad: { key: 'ironclad', tones: ['bold', 'tense', 'hype'] },
  silent: { key: 'silent', tones: ['calm', 'tense', 'hype'] },
  defect: { key: 'defect', tones: ['curious', 'hype', 'tense'] },
  watcher: { key: 'watcher', tones: ['calm', 'bold', 'hype'] }
};

function normalizeCharacter(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return PROFILES[key] ? key : 'generic';
}

function sceneTags({ trigger, intentKinds = [], hpBand, event } = {}) {
  const tags = new Set();
  if (trigger) tags.add(String(trigger));
  if (intentKinds.includes('attack')) tags.add('attack-intent');
  if (hpBand === 'low') tags.add('low-hp');
  if (trigger === 'hp_drop') tags.add('hp-drop');
  if (trigger === 'mechanic') tags.add(String(event?.name || 'mechanic').replace(/\./g, '-'));
  return [...tags];
}

function toneFor({ trigger, intentKinds = [], hpBand } = {}) {
  if (trigger === 'victory') return 'hype';
  if (trigger === 'defeat' || trigger === 'low_hp' || trigger === 'hp_drop' || hpBand === 'low') return 'tense';
  if (trigger === 'attack' || intentKinds.includes('attack')) return 'tense';
  if (trigger === 'mechanic') return 'curious';
  return 'warm';
}

function createLanguageProfile(context) {
  const characterKey = normalizeCharacter(context?.character);
  return {
    characterKey,
    tones: PROFILES[characterKey].tones,
    tone: toneFor(context),
    sceneTags: sceneTags(context)
  };
}

module.exports = { PROFILES, normalizeCharacter, sceneTags, toneFor, createLanguageProfile };
