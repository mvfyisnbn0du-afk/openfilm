import { AGENT_DEFINITIONS } from 'openfilm/agents';
import { agentMark } from 'openfilm/studio-ui/lib/provider-marks.ts';
import { ProviderMark } from 'openfilm/studio-ui/components/settings/ProviderMark.tsx';

export type AgentIconId = keyof typeof AGENT_DEFINITIONS | 'devin';

export const hasAgentIcon = (id: string): id is AgentIconId => id === 'devin' || Object.hasOwn(AGENT_DEFINITIONS, id);

export function AgentIcon({ id, size = 18 }: { id: AgentIconId; size?: number }) {
  return <ProviderMark id={agentMark(id)} size={size} className="" />;
}
