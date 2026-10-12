/**
 * How much of their plan Claude Code and Codex have left, for Settings → Agents: asked of the programs themselves, on
 * OpenFilm's own sign-in (agents.mjs agentHomeEnv), so the person does not open Claude Code or Codex to see it.
 *
 *   · Claude Code: the data behind its /usage, through its maker's SDK (the one the Claude Code adapter carries):
 *     each window's share used and when it resets (five hours, seven days, per model), and the plan. The SDK calls
 *     this experimental: an answer it does not give, or gives in another shape, is no usage, never an error.
 *   · Codex: its app server (`codex app-server`, JSON-RPC over stdin/stdout), `account/read` (the account's email and
 *     plan) and `account/rateLimits/read` (each window's share used, how long it is, when it resets).
 *
 * Nothing here reads or keeps a key or a token: each program answers about its own sign-in. Asked at most once a
 * minute an agent (the answer is kept), and never for longer than a short wait.
 *
 * Reads no Electron module, so `node --test` can use the readers.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PATH_SEP, childEnvironment, loginShellEnvironment } from './environment.mjs';
import { agentHomeEnv, resolveAgentCli } from './agents.mjs';

const require = createRequire(import.meta.url);

/**
 * @typedef {{ kind: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'window', minutes: number | null,
 *   usedPercent: number, resetsAt: number | null }} UsageWindow
 *   a window of the plan: its share used (0–100), how long it is (minutes; null when the program does not say), when
 *   it resets (ms since 1970)
 * @typedef {{ plan: string | null, windows: UsageWindow[], account?: { email?: string, plan?: string } }} AgentUsage
 */

const KEPT_MS = 60_000;
const WAIT_MS = 20_000;
/** @type {Map<string, { at: number, usage: Promise<AgentUsage | null> }>} */
const kept = new Map();

const clampPercent = (/** @type {unknown} */ n) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null);
const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Claude Code's /usage answer, as windows: the plan's own (five hours, seven days) and a model's own week, those with
 * a share used. @param {any} answer @returns {AgentUsage | null}
 */
export function readClaudeUsage(answer) {
  if (!answer || answer.rate_limits_available !== true || !answer.rate_limits || typeof answer.rate_limits !== 'object') return null;
  const minutes = { five_hour: 300, seven_day: 10_080, seven_day_opus: 10_080, seven_day_sonnet: 10_080 };
  /** @type {UsageWindow[]} */
  const windows = [];
  for (const kind of /** @type {const} */ (['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'])) {
    const w = answer.rate_limits[kind];
    const used = clampPercent(w?.utilization);
    if (used == null) continue;
    const resets = typeof w.resets_at === 'string' ? Date.parse(w.resets_at) : NaN;
    windows.push({ kind, minutes: minutes[kind], usedPercent: used, resetsAt: Number.isFinite(resets) ? resets : null });
  }
  return windows.length ? { plan: text(answer.subscription_type) ?? null, windows } : null;
}

/**
 * Codex's account and rate limits, as windows: the primary and secondary ones of its usage, each as long as it says.
 * @param {any} account `account/read`'s result @param {any} limits `account/rateLimits/read`'s result
 * @returns {AgentUsage | null}
 */
export function readCodexUsage(account, limits) {
  const snapshot = limits?.rateLimitsByLimitId?.codex ?? limits?.rateLimits ?? null;
  /** @type {UsageWindow[]} */
  const windows = [];
  for (const w of [snapshot?.primary, snapshot?.secondary]) {
    const used = clampPercent(w?.usedPercent);
    if (used == null) continue;
    const minutes = typeof w.windowDurationMins === 'number' ? w.windowDurationMins : null;
    const kind = minutes === 300 ? 'five_hour' : minutes === 10_080 ? 'seven_day' : 'window';
    windows.push({ kind, minutes, usedPercent: used, resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt * 1000 : null });
  }
  const acc = account?.account;
  const plan = text(snapshot?.planType) ?? text(acc?.planType) ?? null;
  const who = acc?.type === 'chatgpt' ? { ...(text(acc.email) ? { email: text(acc.email) } : {}), ...(text(acc.planType) ? { plan: text(acc.planType) } : {}) } : null;
  if (!windows.length && !who) return null;
  return { plan, windows, ...(who ? { account: who } : {}) };
}

/** A promise that gives up (null) after `ms`. @template T @param {Promise<T>} p @param {number} ms */
const within = (p, ms) => Promise.race([p, new Promise((done) => setTimeout(() => done(null), ms).unref?.())]);

/** Claude Code's usage, on OpenFilm's sign-in: the SDK opened with no prompt, asked, closed. @param {string} cli */
async function claudeUsage(cli) {
  const sdkPath = createRequire(require.resolve('@agentclientprotocol/claude-agent-acp/package.json')).resolve('@anthropic-ai/claude-agent-sdk');
  const { query } = await import(pathToFileURL(sdkPath).href);
  const shell = await loginShellEnvironment();
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise((done) => { release = () => done(undefined); });
  async function* prompt() { await held; }
  const q = query({
    prompt: prompt(),
    options: {
      pathToClaudeCodeExecutable: cli,
      cwd: mkdtempSync(join(tmpdir(), 'openfilm-usage-')),
      env: childEnvironment({ shell, extra: agentHomeEnv('claude') }),
    },
  });
  try {
    return readClaudeUsage(await within(q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), WAIT_MS));
  } finally {
    release();
    try { q.close?.(); } catch { /* gone */ }
  }
}

/** Codex's usage, on OpenFilm's sign-in: its app server asked twice, then stopped. @param {string} cli */
async function codexUsage(cli) {
  const shell = await loginShellEnvironment();
  const child = spawn(cli, ['app-server'], { env: childEnvironment({ shell, extra: agentHomeEnv('codex') }), stdio: ['pipe', 'pipe', 'ignore'] });
  child.once('error', () => {});
  /** @type {Map<number, (message: any) => void>} */
  const waiting = new Map();
  let buffer = '';
  child.stdout.on('data', (data) => {
    buffer += data;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      try {
        const message = JSON.parse(line);
        if (message.id != null) waiting.get(message.id)?.(message);
      } catch { /* not ours */ }
    }
  });
  let next = 0;
  const call = (/** @type {string} */ method, /** @type {unknown} */ params) => new Promise((done) => {
    const id = ++next;
    waiting.set(id, (m) => { waiting.delete(id); done(m.result ?? null); });
    child.stdin.write(`${JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) })}\n`);
  });
  try {
    return await within((async () => {
      await call('initialize', { clientInfo: { name: 'openfilm-desktop', title: 'OpenFilm', version: '1' }, capabilities: null });
      child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
      const account = await call('account/read', { refreshToken: false });
      const limits = await call('account/rateLimits/read', undefined);
      return readCodexUsage(account, limits);
    })(), WAIT_MS);
  } finally {
    child.kill();
  }
}

/**
 * What is left of an agent's plan (Claude Code, Codex), or null: another agent, not installed, signed out, or a
 * program that does not say. Kept for a minute; `fresh` asks again.
 * @param {string} id @param {{ fresh?: boolean }} [opts] @returns {Promise<AgentUsage | null>}
 */
export function agentUsage(id, { fresh = false } = {}) {
  if (id !== 'claude' && id !== 'codex') return Promise.resolve(null);
  const hit = kept.get(id);
  if (hit && !fresh && Date.now() - hit.at < KEPT_MS) return hit.usage;
  const usage = (async () => {
    const pathDirs = (await loginShellEnvironment()).PATH.split(PATH_SEP);
    const cli = resolveAgentCli(id, { pathDirs });
    if (!cli) return null;
    return id === 'claude' ? claudeUsage(cli.path) : codexUsage(cli.path);
  })().catch(() => null);
  kept.set(id, { at: Date.now(), usage });
  return usage;
}

/** Forget what was kept (a sign-in changed: another account's usage). @param {string} id */
export function forgetAgentUsage(id) { kept.delete(id); }
