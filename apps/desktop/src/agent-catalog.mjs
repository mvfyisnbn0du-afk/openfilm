// @ts-check
/** Desktop agent metadata shared by the roster and UI builds; launch and sign-in behavior stay in agents.mjs. */
export const AGENT_CATALOG = Object.freeze({
  codex: { name: 'Codex', install: 'https://developers.openai.com/codex' },
  claude: { name: 'Claude Code', install: 'https://claude.com/download' },
  copilot: { name: 'GitHub Copilot', install: 'https://github.com/features/copilot/cli' },
  cursor: { name: 'Cursor', install: 'https://cursor.com/cli' },
  opencode: { name: 'OpenCode', install: 'https://opencode.ai/download' },
  codebuddy: { name: 'CodeBuddy', install: 'https://www.codebuddy.cn/docs/cli/installation' },
  qwen: { name: 'Qwen Code', install: 'https://github.com/QwenLM/qwen-code' },
  kimi: { name: 'Kimi', install: 'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html' },
  minimax: { name: 'MiniMax Code', install: 'https://www.npmjs.com/package/@minimax-ai/code' },
  byok: { name: 'Own key', install: null },
});

export const AGENT_IDS = Object.freeze(/** @type {(keyof typeof AGENT_CATALOG)[]} */ (Object.keys(AGENT_CATALOG)));
export const OWN_AGENT_IDS = Object.freeze(AGENT_IDS.filter((id) => id !== 'byok'));
export const AGENT_NAMES = Object.freeze(Object.fromEntries(AGENT_IDS.map((id) => [id, AGENT_CATALOG[id].name])));
export const AGENT_DOWNLOADS = Object.freeze(Object.fromEntries(OWN_AGENT_IDS.map((id) => [id, AGENT_CATALOG[id].install])));
