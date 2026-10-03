import type { AgentId, AgentState, OfficeEvent } from './types';

const names: Record<AgentId, string> = {
  orchestrator: 'Orquestrador', dev: 'Dev', qa: 'QA Auditor', security: 'Segurança', ux: 'UI/UX',
};

/** Explicit demo adapter. These events are never emitted by real data providers. */
export function createSimulationEvent(agentId: AgentId, state: AgentState): OfficeEvent {
  return {
    id: `simulation:${crypto.randomUUID()}`,
    agentId,
    projectId: 'agent-office',
    source: 'simulation',
    provenance: 'simulated',
    state,
    type: 'demo.activity',
    title: `${names[agentId]} · demonstração`,
    detail: `Estado ${state} simulado para demonstrar o escritório; não representa execução ou validação real.`,
    timestamp: new Date().toISOString(),
  };
}
