export const IpcChannel = {
  systemStatus: 'system:status',
} as const;

export interface SystemStatusDto {
  appVersion: string;
  storage: {
    engineVersion: string;
    schemaVersion: number;
  };
}

export interface AgentHubApi {
  getSystemStatus(): Promise<SystemStatusDto>;
}
