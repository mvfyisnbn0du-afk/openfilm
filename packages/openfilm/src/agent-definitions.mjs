// @ts-check
/** The chat's ACP agents. Add a standard agent here; the roster, launcher and both UIs read these definitions. */

/**
 * Exactly one ACP entry: a bundled adapter, or the installed command with ACP arguments.
 * @typedef {{ adapter: string, args?: never, runtime?: never } |
 *   { adapter?: never, args: string[], runtime?: 'app' | 'node' }} AgentConnection
 *
 * Terminal methods come from initialize.authMethods; command arguments run the installed CLI.
 * An empty command runs the CLI's own interactive setup. There is no fallback between these methods.
 * @typedef {{ command: string[], terminalMethod?: never } |
 *   { command?: never, terminalMethod: string }} AgentSignIn
 *
 * statusArgs queries CLI login status; omitted means probe an ACP session.
 * sessionAuthMethod invokes ACP authenticate after initialization, independently of terminal sign-in.
 * identity checks local package/bin ownership, not authenticity; omitted means no package identity check.
 * @typedef {{ label: string, names: string[], install: string, signIn: AgentSignIn, statusArgs?: string[],
 *   binDirs?: string[][], identity?: { npmPackage: string }, mark?: string, approve?: boolean,
 *   systemPrompt?: boolean, sessionAuthMethod?: string, prefs?: Record<string, string> } & AgentConnection} AgentDefinition
 */

/** @satisfies {Record<string, AgentDefinition>} */
const definitions = {
  codex: {
    label: 'Codex', names: ['codex'], install: 'https://developers.openai.com/codex', mark: 'openai',
    adapter: '@agentclientprotocol/codex-acp', statusArgs: ['login', 'status'], signIn: { command: ['login'] }, systemPrompt: true,
    prefs: { mode: 'agent-full-access' },
  },
  claude: {
    label: 'Claude Code', names: ['claude'], install: 'https://claude.com/download',
    adapter: '@agentclientprotocol/claude-agent-acp', statusArgs: ['auth', 'status'],
    signIn: { terminalMethod: 'claude-ai-login' }, systemPrompt: true, prefs: { mode: 'bypassPermissions' },
  },
  copilot: {
    label: 'GitHub Copilot', names: ['copilot'], install: 'https://github.com/features/copilot/cli',
    args: ['--acp', '--allow-all'], signIn: { command: ['login'] }, approve: true,
  },
  cursor: {
    label: 'Cursor', names: ['cursor-agent'], install: 'https://cursor.com/cli',
    args: ['--force', 'acp'], statusArgs: ['status'], signIn: { command: ['login'] }, sessionAuthMethod: 'cursor_login', approve: true,
  },
  opencode: {
    label: 'OpenCode', names: ['opencode'], install: 'https://opencode.ai/download', binDirs: [['.opencode', 'bin']],
    args: ['acp'], signIn: { command: ['auth', 'login'] }, approve: true,
  },
  codebuddy: {
    label: 'CodeBuddy', names: ['codebuddy', 'cbc'], install: 'https://www.workbuddy.ai/docs/cli/installation',
    args: ['--acp', '--permission-mode', 'bypassPermissions'], signIn: { command: [] }, approve: true,
  },
  qwen: {
    label: 'Qwen Code', names: ['qwen'], install: 'https://github.com/QwenLM/qwen-code',
    args: ['--acp', '--approval-mode', 'yolo'], signIn: { command: [] }, approve: true,
  },
  kimi: {
    label: 'Kimi', names: ['kimi'], install: 'https://www.kimi.com/code', binDirs: [['.kimi-code', 'bin']],
    args: ['acp'], signIn: { command: ['login'] }, approve: true, prefs: { mode: 'yolo' },
  },
  minimax: {
    label: 'MiniMax Code', names: ['mcode'], install: 'https://www.npmjs.com/package/@minimax-ai/code', binDirs: [['.minimax-code', 'bin']],
    args: ['acp'], signIn: { command: ['login'] }, approve: true, prefs: { permissionMode: 'bypassPermissions' },
  },
  deepseek: {
    label: 'DeepSeek Harness', names: ['dsh'], install: 'https://www.npmjs.com/package/@deepseek-ai/dsh', mark: 'deepseek',
    identity: { npmPackage: '@deepseek-ai/dsh' }, runtime: 'node',
    args: ['--profile', 'acp'], signIn: { command: ['web'] }, approve: true,
  },
  hermes: {
    label: 'Hermes Agent', names: ['hermes'], install: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/acp', mark: 'hermesagent',
    args: ['acp'], signIn: { terminalMethod: 'hermes-setup' }, approve: true,
  },
};

/** @type {Readonly<Record<keyof typeof definitions, AgentDefinition>>} */
export const AGENT_DEFINITIONS = Object.freeze(definitions);
export const OWN_AGENT_IDS = Object.freeze(/** @type {(keyof typeof definitions)[]} */ (Object.keys(AGENT_DEFINITIONS)));
export const AGENT_IDS = Object.freeze([...OWN_AGENT_IDS, 'byok']);
/** @type {Readonly<Record<string, string>>} */
export const AGENT_NAMES = Object.freeze({ ...Object.fromEntries(OWN_AGENT_IDS.map((id) => [id, AGENT_DEFINITIONS[id].label])), byok: 'Own key' });
/** @type {Readonly<Partial<Record<keyof typeof definitions | 'byok', Record<string, string>>>>} */
export const AGENT_FORCED_PREFS = Object.freeze({
  ...Object.fromEntries(OWN_AGENT_IDS.filter((id) => AGENT_DEFINITIONS[id].prefs).map((id) => [id, AGENT_DEFINITIONS[id].prefs])),
  byok: { mode: 'agent-full-access' },
});
