import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_CATALOG, AGENT_IDS, OWN_AGENT_IDS, AGENT_NAMES, AGENT_DOWNLOADS } from './agent-catalog.mjs';
import { AGENTS } from './agents.mjs';
import { AGENT_PROGRAMS, AGENT_DOWNLOADS as installationLinks } from './agent-installation.mjs';
import { AGENT_IDS as rosterIds, AGENT_NAMES as rosterNames } from './agent-roster.mjs';

test('the desktop catalog covers exactly the existing launchers and discovery programs', () => {
  const own = [...OWN_AGENT_IDS].sort();
  assert.deepEqual(own, Object.keys(AGENTS).sort());
  assert.deepEqual(own, Object.keys(AGENT_PROGRAMS).sort());
  assert.deepEqual(own, Object.keys(AGENT_DOWNLOADS).sort());
  assert.deepEqual(AGENT_IDS, [...OWN_AGENT_IDS, 'byok']);
  for (const id of OWN_AGENT_IDS) {
    assert.equal(AGENT_NAMES[id], AGENTS[id].label);
    assert.equal(AGENT_CATALOG[id].name, AGENT_NAMES[id]);
    assert.equal(new URL(AGENT_DOWNLOADS[id]).protocol, 'https:');
  }
  assert.equal(AGENT_CATALOG.byok.install, null);
});

test('the roster and installation API keep their existing metadata exports', () => {
  assert.equal(rosterIds, AGENT_IDS);
  assert.equal(rosterNames, AGENT_NAMES);
  assert.equal(installationLinks, AGENT_DOWNLOADS);
});
