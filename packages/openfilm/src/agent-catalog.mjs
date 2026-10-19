// @ts-check
/** The chat's ACP agents. Add a standard agent here; the roster, launcher and both UIs read this catalog. */

/**
 * @typedef {{ label: string, names: string[], install: string, args?: string[], login: string[], auth?: string[],
 *   binDirs?: string[][], identity?: { npmPackage: string }, runtime?: 'app' | 'node', adapter?: string,
 *   mark?: string, approve?: boolean, systemPrompt?: boolean,
 *   authenticate?: string, acpSignIn?: string, prefs?: Record<string, string> }} AgentDefinition
 */

/** @satisfies {Record<string, AgentDefinition>} */
const definitions = {
  codex: {
    label: 'Codex', names: ['codex'], install: 'https://developers.openai.com/codex', mark: 'openai',
    adapter: '@agentclientprotocol/codex-acp', auth: ['login', 'status'], login: ['login'], systemPrompt: true,
    prefs: { mode: 'agent-full-access' },
  },
  claude: {
    label: 'Claude Code', names: ['claude'], install: 'https://claude.com/download',
    adapter: '@agentclientprotocol/claude-agent-acp', auth: ['auth', 'status'], login: ['auth', 'login'],
    acpSignIn: 'claude-ai-login', systemPrompt: true, prefs: { mode: 'bypassPermissions' },
  },
  copilot: {
    label: 'GitHub Copilot', names: ['copilot'], install: 'https://github.com/features/copilot/cli',
    args: ['--acp', '--allow-all'], login: ['login'], approve: true,
  },
  cursor: {
    label: 'Cursor', names: ['cursor-agent'], install: 'https://cursor.com/cli',
    args: ['--force', 'acp'], auth: ['status'], login: ['login'], authenticate: 'cursor_login', approve: true,
  },
  opencode: {
    label: 'OpenCode', names: ['opencode'], install: 'https://opencode.ai/download', binDirs: [['.opencode', 'bin']],
    args: ['acp'], login: ['auth', 'login'], approve: true,
  },
  codebuddy: {
    label: 'CodeBuddy', names: ['codebuddy', 'cbc'], install: 'https://www.workbuddy.ai/docs/cli/installation',
    args: ['--acp', '--permission-mode', 'bypassPermissions'], login: [], approve: true,
  },
  qwen: {
    label: 'Qwen Code', names: ['qwen'], install: 'https://github.com/QwenLM/qwen-code',
    args: ['--acp', '--approval-mode', 'yolo'], login: [], approve: true,
  },
  kimi: {
    label: 'Kimi', names: ['kimi'], install: 'https://www.kimi.com/code', binDirs: [['.kimi-code', 'bin']],
    args: ['acp'], login: ['login'], approve: true, prefs: { mode: 'yolo' },
  },
  minimax: {
    label: 'MiniMax Code', names: ['mcode'], install: 'https://www.npmjs.com/package/@minimax-ai/code', binDirs: [['.minimax-code', 'bin']],
    args: ['acp'], login: ['login'], approve: true, prefs: { permissionMode: 'bypassPermissions' },
  },
  deepseek: {
    label: 'DeepSeek Harness', names: ['dsh'], install: 'https://www.npmjs.com/package/@deepseek-ai/dsh', mark: 'deepseek',
    identity: { npmPackage: '@deepseek-ai/dsh' }, runtime: 'node',
    args: ['--profile', 'acp'], login: ['web'], approve: true,
  },
  hermes: {
    label: 'Hermes Agent', names: ['hermes'], install: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/acp', mark: 'hermesagent',
    args: ['acp'], login: ['acp', '--setup'], acpSignIn: 'hermes-setup', approve: true,
  },
};

/** @type {Readonly<Record<keyof typeof definitions, AgentDefinition>>} */
export const AGENT_CATALOG = Object.freeze(definitions);
export const OWN_AGENT_IDS = Object.freeze(/** @type {(keyof typeof definitions)[]} */ (Object.keys(AGENT_CATALOG)));
export const AGENT_IDS = Object.freeze([...OWN_AGENT_IDS, 'byok']);
/** @type {Readonly<Record<string, string>>} */
export const AGENT_NAMES = Object.freeze({ ...Object.fromEntries(OWN_AGENT_IDS.map((id) => [id, AGENT_CATALOG[id].label])), byok: 'Own key' });
/** @type {Readonly<Partial<Record<keyof typeof definitions | 'byok', Record<string, string>>>>} */
export const AGENT_FORCED_PREFS = Object.freeze({
  ...Object.fromEntries(OWN_AGENT_IDS.filter((id) => AGENT_CATALOG[id].prefs).map((id) => [id, AGENT_CATALOG[id].prefs])),
  byok: { mode: 'agent-full-access' },
});
