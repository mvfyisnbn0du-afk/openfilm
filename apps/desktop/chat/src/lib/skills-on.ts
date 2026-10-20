/**
 * Skills kept on in a project (a skill pill's pin in the composer): every message's agent works with them, without
 * their pill. Each conversation gives an agent a skill's SKILL.md once, with the first message it
 * gets after the skill is on; the agent keeps it from then on. Reads nothing, so `node --test` can use it.
 */

/**
 * The skills kept on that go with this message: those `agent` has not had in this conversation (`sent`, by agent),
 * and not named in the message already (`named`, whose pages go with it anyway).
 */
export function skillsToSend(on: readonly string[], sent: Readonly<Record<string, readonly string[]>> | undefined, agent: string, named: readonly string[]): string[] {
  const had = new Set([...(sent?.[agent] ?? []), ...named]);
  return on.filter((name) => !had.has(name));
}

/** What the conversation has given `agent` once this message goes: the skills kept on that are with it now too. */
export function sentAfter(sent: Readonly<Record<string, readonly string[]>> | undefined, agent: string, given: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [by, names] of Object.entries(sent ?? {})) out[by] = [...names];
  out[agent] = [...new Set([...(out[agent] ?? []), ...given])];
  return out;
}

/** The line the agent reads for them, before their pages: the skills, as a pill names one. */
export function skillsOnLine(names: readonly string[]): string {
  return names.length ? `\n\nKept on in this project: ${names.map((name) => `skill “${name}”`).join(', ')}.` : '';
}
