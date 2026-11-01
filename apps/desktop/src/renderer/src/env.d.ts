import type { AgentHubApi } from '@agenthub/contracts';

declare global {
  interface Window {
    agentHub: AgentHubApi;
  }
}
