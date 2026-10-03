export const AGENT_IDS = ['orchestrator', 'dev', 'qa', 'security', 'ux'] as const;
export const PROJECT_IDS = ['agent-office', 'dg-manual', 'dg-tech', 'diagnos-qa'] as const;
export const EVENT_SOURCES = ['github', 'qa', 'mcp', 'api', 'cli', 'deploy', 'simulation'] as const;
export const AGENT_STATES = ['idle', 'working', 'waiting', 'error', 'success'] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type ProjectId = (typeof PROJECT_IDS)[number];
export type EventSource = (typeof EVENT_SOURCES)[number];
export type AgentState = (typeof AGENT_STATES)[number];
export type Provenance = 'real' | 'simulated';

export interface OfficeEvent {
  id: string;
  agentId: AgentId;
  projectId: ProjectId;
  source: EventSource;
  provenance: Provenance;
  state: AgentState;
  type: string;
  title: string;
  detail?: string;
  timestamp: string;
  url?: string;
}

export interface GitHubConnection {
  state: 'connected' | 'error' | 'unconfigured';
  repository: string;
  lastSync: string | null;
  error?: string;
  pollIntervalSeconds?: number;
  warning?: string;
}

export interface GitHubSnapshot {
  events: OfficeEvent[];
  connection: GitHubConnection;
}

export interface EventHistory {
  events: OfficeEvent[];
  transport: 'local-sse' | 'polling';
  ingress: 'enabled' | 'unconfigured' | 'local-only';
  message?: string;
}
