import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DEFINITIONS } from 'openfilm/agents';
import { MARKS, agentMark } from '../../../packages/openfilm/studio/ui/src/lib/provider-marks.ts';

/* An explicit mark must exist; agents without one use ProviderMark's letter fallback. */
test('every explicitly configured agent mark exists', () => {
  const missing = Object.entries(AGENT_DEFINITIONS).filter(([id, agent]) => agent.mark && !MARKS[agentMark(id)]).map(([id]) => id);
  assert.deepEqual(missing, [], `no mark in packages/openfilm/studio/ui/src/lib/provider-marks.ts for: ${missing.join(', ')}`);
});
