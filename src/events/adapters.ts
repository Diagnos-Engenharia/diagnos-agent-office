import type { AgentId, AgentState, EventSource, OfficeEvent, ProjectId } from './types';

export interface ExecutionReport {
  id: string;
  source: Exclude<EventSource, 'github' | 'simulation'>;
  agentId: AgentId;
  projectId?: ProjectId;
  state: AgentState;
  type: string;
  title: string;
  detail?: string;
  timestamp?: string;
  url?: string;
}

/** Bridge for verified tool results. Call only after observing the actual execution. */
export function eventFromExecution(report: ExecutionReport): OfficeEvent {
  return {
    ...report,
    id: `${report.source}:${report.id}`,
    projectId: report.projectId ?? 'agent-office',
    provenance: 'real',
    timestamp: report.timestamp ?? new Date().toISOString(),
  };
}
