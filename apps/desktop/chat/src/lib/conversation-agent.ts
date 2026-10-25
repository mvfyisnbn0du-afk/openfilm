/**
 * Which agent a conversation goes on with, and with which options. Reads no React, so `node --test` can use it.
 *
 * A conversation keeps the agent it used and the options it used it with (on its session, lib/project-sessions):
 * opened again, after a restart too, it goes on with them, whatever was picked since in another one. A new
 * conversation takes the agent picked last.
 */
import type { LocalAgentId, RosterAgent } from './desktop-bridge';

type Prefs = Partial<Record<LocalAgentId, Record<string, unknown>>>;

/**
 * The agent a conversation goes on with: the one it `used` while that one is switched on and ready (or still being
 * checked, as the app starts), else `fallback`, the one picked last. `was`: the one it used, when it cannot go on with it.
 */
export function conversationAgent(used: LocalAgentId | undefined, roster: RosterAgent[] | null, fallback: LocalAgentId): { agent: LocalAgentId; was: LocalAgentId | null } {
  if (!used) return { agent: fallback, was: null };
  const it = roster?.find((a) => a.id === used);
  if (!roster || (it?.shown && (it.status === 'ready' || it.status === 'checking'))) return { agent: used, was: null };
  return { agent: fallback, was: fallback === used ? null : used };
}

/** The options picked last for each agent (`picked`), with a conversation's `own` for the agents it used standing over them. */
export function conversationPrefs(picked: Prefs, own: Prefs | undefined): Prefs {
  if (!own) return picked;
  const out: Prefs = { ...picked };
  for (const [agent, values] of Object.entries(own) as Array<[LocalAgentId, Record<string, unknown>]>) out[agent] = { ...picked[agent], ...values };
  return out;
}
