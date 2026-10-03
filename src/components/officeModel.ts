import type { AgentId, AgentState, OfficeEvent, ProjectId } from '../events/types';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  shortName: string;
  color: string;
  sprite: number;
}

export const AGENTS: AgentDefinition[] = [
  { id: 'orchestrator', name: 'Orquestrador', shortName: 'ORQUESTRA', role: 'ChatGPT · coordenação', color: '#83e7cc', sprite: 0 },
  { id: 'dev', name: 'Dev', shortName: 'DEV', role: 'Código & integrações', color: '#91bdfc', sprite: 1 },
  { id: 'qa', name: 'QA Auditor', shortName: 'QA AUDITOR', role: 'Qualidade & testes', color: '#c0a5ee', sprite: 2 },
  { id: 'security', name: 'Segurança', shortName: 'SEGURANÇA', role: 'Proteção & revisão', color: '#efbd7d', sprite: 3 },
  { id: 'ux', name: 'UI/UX', shortName: 'UI / UX', role: 'Experiência & interface', color: '#e8a7c4', sprite: 4 },
];

export const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Disponível', working: 'Trabalhando', waiting: 'Aguardando', error: 'Atenção', success: 'Concluído',
};

export const STATE_COLORS: Record<AgentState, string> = {
  idle: '#778f92', working: '#8ae5c9', waiting: '#f3cd7e', error: '#ff9292', success: '#9bdd90',
};

export const PROJECTS: { id: ProjectId; name: string; description: string; initials: string; connected: boolean }[] = [
  { id: 'agent-office', name: 'Agent Office', description: 'Escritório de engenharia', initials: 'AO', connected: true },
  { id: 'dg-manual', name: 'DG Manual', description: 'Projeto de referência', initials: 'DM', connected: false },
  { id: 'dg-tech', name: 'DG Tech', description: 'Projeto de referência', initials: 'DT', connected: false },
  { id: 'diagnos-qa', name: 'Diagnos QA', description: 'Projeto de referência', initials: 'DQ', connected: false },
];

export interface AgentActivity {
  state: AgentState;
  event?: OfficeEvent;
  provenance?: 'real' | 'simulated';
}

export const EMPTY_ACTIVITY: AgentActivity = { state: 'idle' };

export function shortTime(timestamp: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp));
}
