import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readClaudeUsage, readCodexUsage } from './agent-usage.mjs';

test('Claude Code\'s /usage as windows: those with a share used, their reset as a time, the plan', () => {
  const usage = readClaudeUsage({
    subscription_type: 'team',
    rate_limits_available: true,
    rate_limits: {
      five_hour: { utilization: 12.5, resets_at: null },
      seven_day: { utilization: 0, resets_at: '2026-10-19T07:00:00+00:00' },
      seven_day_opus: null,
      seven_day_sonnet: { utilization: 140, resets_at: 'not a date' },
      tangelo: { utilization: 50 },
    },
  });
  assert.deepEqual(usage, {
    plan: 'team',
    windows: [
      { kind: 'five_hour', minutes: 300, usedPercent: 12.5, resetsAt: null },
      { kind: 'seven_day', minutes: 10_080, usedPercent: 0, resetsAt: Date.parse('2026-10-19T07:00:00+00:00') },
      { kind: 'seven_day_sonnet', minutes: 10_080, usedPercent: 100, resetsAt: null },
    ],
  });
  assert.equal(readClaudeUsage({ rate_limits_available: false, rate_limits: null }), null, 'an API key has no plan to show');
  assert.equal(readClaudeUsage(null), null, 'no answer, no usage');
  assert.equal(readClaudeUsage({ rate_limits_available: true, rate_limits: { five_hour: null } }), null);
});

test('Codex\'s rate limits as windows, each as long as it says; its account\'s email and plan', () => {
  const account = { account: { type: 'chatgpt', email: 'a@b.test', planType: 'plus' }, requiresOpenaiAuth: true };
  const limits = {
    rateLimits: { primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1 } },
    rateLimitsByLimitId: { codex: { planType: 'plus', primary: { usedPercent: 3, windowDurationMins: 10_080, resetsAt: 1_792_329_499 }, secondary: { usedPercent: 40, windowDurationMins: 60, resetsAt: null } } },
  };
  assert.deepEqual(readCodexUsage(account, limits), {
    plan: 'plus',
    windows: [
      { kind: 'seven_day', minutes: 10_080, usedPercent: 3, resetsAt: 1_792_329_499_000 },
      { kind: 'window', minutes: 60, usedPercent: 40, resetsAt: null },
    ],
    account: { email: 'a@b.test', plan: 'plus' },
  });
  assert.deepEqual(readCodexUsage({ account: { type: 'apiKey' } }, null), null, 'an API key: nothing to show');
  assert.deepEqual(readCodexUsage(null, { rateLimits: { primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: null } } }),
    { plan: null, windows: [{ kind: 'five_hour', minutes: 300, usedPercent: 10, resetsAt: null }] });
});
