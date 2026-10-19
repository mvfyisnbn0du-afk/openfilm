// Compiled by agent-definitions.test.mjs. Each expect-error must remain a real type error.
import type { AgentDefinition } from 'openfilm/agents';

const direct = {
  label: 'Example', names: ['example'], install: 'https://example.com',
  args: ['acp'], signIn: { command: ['login'] },
} satisfies AgentDefinition;
const accept = (_definition: AgentDefinition) => {};
accept(direct);
accept({ ...direct, runtime: 'node', identity: { npmPackage: '@example/agent' } });
accept({ ...direct, signIn: { command: [] } });
accept({ ...direct, signIn: { terminalMethod: 'example-setup' } });
accept({ label: direct.label, names: direct.names, install: direct.install,
  adapter: '@example/adapter', signIn: { command: ['login'] } });

// @ts-expect-error An adapter and direct ACP arguments cannot both own startup.
accept({ ...direct, adapter: '@example/adapter' });
// @ts-expect-error An adapter owns its runtime; runtime belongs to direct programs.
accept({ label: direct.label, names: direct.names, install: direct.install, adapter: '@example/adapter', runtime: 'node', signIn: direct.signIn });
// @ts-expect-error A direct connection must declare its ACP arguments.
accept({ label: direct.label, names: direct.names, install: direct.install, signIn: direct.signIn });
// @ts-expect-error Choose one sign-in method; there is no implicit precedence.
accept({ ...direct, signIn: { command: ['login'], terminalMethod: 'setup' } });
// @ts-expect-error A sign-in method must be declared explicitly.
accept({ ...direct, signIn: {} });
// @ts-expect-error Unknown fields must not be silently ignored.
accept({ ...direct, acpSignIn: 'old-field' });
// @ts-expect-error Identity must name the package to check.
accept({ ...direct, identity: {} });
// @ts-expect-error Login-status arguments are CLI arguments, not an ACP method ID.
accept({ ...direct, statusArgs: 'login/status' });
