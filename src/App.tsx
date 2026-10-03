import { useMemo, useState, type CSSProperties } from 'react';
import { Activity, ArrowUpRight, ChevronRight, Code2, ExternalLink, FolderGit2, GitBranch, Github, Info, Layers3, LayoutGrid, Link2, Pause, Play, Radio, RefreshCw, ShieldCheck, Sparkles, Terminal, Workflow, X } from 'lucide-react';
import { OfficeCanvas } from './components/OfficeCanvas';
import { AGENTS, EMPTY_ACTIVITY, PROJECTS, STATE_LABELS, shortTime, type AgentActivity } from './components/officeModel';
import { useOfficeEvents } from './hooks/useOfficeEvents';
import type { AgentId, EventSource, OfficeEvent, ProjectId } from './events/types';

const AGENT_ICONS = { orchestrator: Workflow, dev: Code2, qa: ShieldCheck, security: ShieldCheck, ux: Sparkles };
const SOURCE_NAMES: Record<EventSource, string> = { github: 'GitHub', qa: 'QA', mcp: 'MCP', api: 'API', cli: 'CLI', deploy: 'Deploy', simulation: 'Demo' };
const SOURCE_ICONS = { github: GitBranch, qa: ShieldCheck, mcp: Link2, api: Terminal, cli: Terminal, deploy: ArrowUpRight, simulation: Sparkles };

function EventItem({ event, selected, onSelect }: { event: OfficeEvent; selected: boolean; onSelect: () => void }) {
  const Icon = SOURCE_ICONS[event.source];
  const agent = AGENTS.find(candidate => candidate.id === event.agentId)!;
  return <article className={`event-item ${selected ? 'event-selected' : ''}`}>
    <div className={`event-icon ${event.provenance}`}><Icon size={15} strokeWidth={1.6} /></div>
    <div className="event-copy">
      <div className="event-meta"><span className={`source-badge ${event.provenance}`}>{event.provenance === 'real' ? 'REAL' : 'SIMULADO'}</span><span>{SOURCE_NAMES[event.source]}</span><time dateTime={event.timestamp} title={new Date(event.timestamp).toLocaleString('pt-BR')}>{shortTime(event.timestamp)}</time></div>
      <button className="event-title" onClick={onSelect}>{event.title}</button>
      <div className="event-byline"><span style={{ color: agent.color }}>{agent.name}</span><span>·</span><span>{STATE_LABELS[event.state]}</span>{event.url && <a href={event.url} target="_blank" rel="noreferrer" aria-label={`Abrir no GitHub: ${event.title}`}><ArrowUpRight size={13} /></a>}</div>
    </div>
  </article>;
}

function AgentCard({ agent, activity, selected, onSelect }: { agent: typeof AGENTS[number]; activity: AgentActivity; selected: boolean; onSelect: () => void }) {
  const Icon = AGENT_ICONS[agent.id];
  return <button className={`agent-card ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected} style={{ '--agent-color': agent.color } as CSSProperties}>
    <div className="agent-card-top"><div className="character-avatar" style={{ backgroundImage: `url(/assets/characters/char_${agent.sprite}.png)` }} /><Icon size={13} /></div>
    <strong>{agent.name}</strong>
    <span className={`agent-status state-${activity.state}`}><i />{STATE_LABELS[activity.state]}</span>
    <span className="agent-provenance">{activity.provenance === 'real' ? 'Fonte real' : activity.provenance === 'simulated' ? 'Demonstração' : 'Sem atividade'}</span>
  </button>;
}

export default function App() {
  const office = useOfficeEvents();
  const [projectId, setProjectId] = useState<ProjectId>('agent-office');
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('orchestrator');
  const [filter, setFilter] = useState<'all' | 'real' | 'simulated'>('all');
  const [agentFilter, setAgentFilter] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<OfficeEvent | undefined>();
  const project = PROJECTS.find(candidate => candidate.id === projectId)!;
  const agent = AGENTS.find(candidate => candidate.id === selectedAgent)!;
  const referenceProject = projectId !== 'agent-office';
  const active = referenceProject ? EMPTY_ACTIVITY : office.activities[selectedAgent];
  const workingCount = referenceProject ? 0 : AGENTS.filter(item => office.activities[item.id].state === 'working').length;
  const realCount = office.events.filter(event => event.provenance === 'real').length;
  const demoCount = office.events.filter(event => event.provenance === 'simulated').length;
  const projectEvents = useMemo(() => office.events.filter(event => event.projectId === projectId), [office.events, projectId]);
  const visibleEvents = projectEvents.filter(event => (filter === 'all' || event.provenance === filter) && (!agentFilter || event.agentId === selectedAgent));
  const repositoryUrl = `https://github.com/${office.connection.repository}`;
  const intervalSeconds = office.connection.pollIntervalSeconds ?? 300;
  const pollingLabel = intervalSeconds >= 60 ? `${Math.round(intervalSeconds / 60)} min` : `${intervalSeconds} s`;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Ir para o escritório</a>
    <aside className="sidebar" aria-label="Navegação principal">
      <a className="brand" href="#main" aria-label="Diagnos Agent Office"><span className="brand-mark"><i /><i /><i /><i /></span><span><strong>diagnos<span>.</span></strong><small>AGENT OFFICE</small></span></a>
      <div className="workspace-label"><span>WORKSPACE</span><span>01</span></div>
      <nav className="main-nav">
        <button className={!connectionsOpen ? 'active' : ''} onClick={() => { setConnectionsOpen(false); setProjectId('agent-office'); }}><LayoutGrid size={17} /><span>Escritório</span><span className="nav-count">5</span></button>
        <button className={connectionsOpen ? 'active' : ''} onClick={() => setConnectionsOpen(true)}><Link2 size={17} /><span>Conexões</span><span className={`nav-indicator ${office.connection.state}`} /></button>
      </nav>
      <div className="sidebar-section-label">PROJETOS <Layers3 size={12} /></div>
      <div className="project-list">
        {PROJECTS.map(item => <button key={item.id} className={`project-nav ${item.id === projectId ? 'selected' : ''}`} onClick={() => { setProjectId(item.id); setSelectedEvent(undefined); }} aria-pressed={item.id === projectId}>
          <span className="project-initials">{item.initials}</span><span><strong>{item.name}</strong><small>{item.connected ? office.connection.state === 'connected' ? 'GitHub conectado' : office.connection.state === 'error' ? 'GitHub indisponível' : 'Conectando ao GitHub' : 'Sem fonte conectada'}</small></span>{item.id === projectId && <ChevronRight size={13} />}
        </button>)}
      </div>
      <div className="sidebar-note"><span className="tiny-orbit"><Radio size={14} /></span><p>Um lugar para acompanhar<br /><strong>o trabalho da engenharia.</strong></p></div>
      <div className="sidebar-bottom"><a href="https://github.com/pixel-agents-hq/pixel-agents" target="_blank" rel="noreferrer">Base Pixel Agents <ExternalLink size={11} /><span>MIT</span></a><div className="workspace-identity"><span className="identity-avatar">D</span><div><strong>Diagnos Engenharia</strong><small>Ecossistema Diagnos</small></div></div></div>
    </aside>

    <main id="main" className="main-content">
      <header className="page-header"><div><div className="eyebrow">ECOSSISTEMA DIAGNOS <ChevronRight size={11} /> AGENT OFFICE</div><h1>Engenharia, em movimento<span>.</span></h1><p>Seu time de agentes. Um escritório vivo.</p></div><a className="repository-button" href={repositoryUrl} target="_blank" rel="noreferrer"><Github size={16} /><span>Repositório</span><ArrowUpRight size={14} /></a></header>

      <div className="telemetry-bar" aria-label="Conexões e contagem de eventos">
        <div className={`connection-label connection-${office.connection.state}`}><i /><strong>{office.connection.state === 'connected' ? 'GitHub conectado' : office.connection.state === 'error' ? 'GitHub indisponível' : 'GitHub a conectar'}</strong><span>Consulta a cada {pollingLabel}</span></div>
        <div className="telemetry-counters"><span><i className="real-dot" /> <strong>{realCount}</strong> reais</span><span><i className="demo-dot" /> <strong>{demoCount}</strong> simulados</span><span className="preview-tag">PREVIEW <span>v0.1</span></span></div>
      </div>

      {connectionsOpen && <section className="connections-panel" aria-label="Conexões disponíveis"><div className="connection-panel-header"><div><span className="eyebrow">FONTES DE ATIVIDADE</span><h2>De onde vêm os eventos</h2></div><button className="icon-button" onClick={() => setConnectionsOpen(false)} aria-label="Fechar conexões"><X size={17} /></button></div><div className="connection-grid"><article><Github size={20} /><strong>GitHub do Agent Office</strong><span className={`connection-text-${office.connection.state}`}>{office.connection.state === 'connected' ? 'Fonte real conectada' : office.connection.state === 'error' ? 'Fonte temporariamente indisponível' : 'Aguardando configuração'}</span><p>Commits, pull requests e alterações. Histórico na primeira consulta; novas atividades nas seguintes.</p></article><article><Terminal size={20} /><strong>MCP, API, CLI, QA & deploy</strong><span>{office.ingress === 'enabled' && office.streamConnected ? 'Entrada local conectada' : 'Adaptadores preparados'}</span><p>{office.ingress === 'local-only' ? 'Neste preview, a entrada externa exige um servidor persistente. Os agentes usam demonstração.' : 'Eventos reais podem entrar pela API local autenticada. Sem adaptador, os agentes usam demonstração.'}</p></article><article><FolderGit2 size={20} /><strong>Outros projetos Diagnos</strong><span>Sem fonte conectada</span><p>DG Manual, DG Tech e Diagnos QA são referências no painel. Nenhuma atividade é atribuída a eles.</p></article></div></section>}
      {office.connection.state === 'error' && <div className="connection-error" role="status"><Info size={16} /><span>{office.connection.error || 'O GitHub não respondeu. Uma nova consulta será feita automaticamente.'}</span><button onClick={() => void office.refreshGitHub()} disabled={office.refreshing}>Tentar novamente</button></div>}
      {office.connection.warning && <div className="connection-warning" role="status"><Info size={15} /><span>Consulta parcial: {office.connection.warning}</span></div>}

      <div className="dashboard-grid">
        <div className="office-column">
          <section className="office-panel" aria-labelledby="office-heading">
            <div className="panel-heading"><div className="panel-title"><span className="section-icon"><LayoutGrid size={18} /></span><div><h2 id="office-heading">{project.name === 'Agent Office' ? 'Escritório de agentes' : project.name}</h2><p>{referenceProject ? 'Projeto de referência · sem atividade conectada' : 'Agent Office / andar de engenharia'}</p></div></div><div className="office-live-tag"><i className={workingCount ? 'live-pulse' : ''} />{referenceProject ? 'SEM FONTE' : `${workingCount} EM ATIVIDADE`}</div></div>
            <div className="canvas-heading"><span><i /> ENGINEERING FLOOR</span><span>5 ESTAÇÕES <span>·</span> 1 EQUIPE</span></div>
            <OfficeCanvas activities={office.activities} selectedAgent={selectedAgent} onSelectAgent={id => { setSelectedAgent(id); setSelectedEvent(undefined); }} animate={office.demoEnabled && office.demoRunning || Object.values(office.activities).some(item => item.provenance === 'real')} referenceProject={referenceProject} />
            <div className="office-controls"><div className="demo-control"><button className={`toggle-switch ${office.demoEnabled ? 'on' : ''}`} role="switch" aria-checked={office.demoEnabled} aria-label="Ativar demonstração dos agentes" onClick={() => office.setDemoEnabled(!office.demoEnabled)}><span /></button><div><strong>{office.demoEnabled ? office.demoRunning ? 'Demonstração ativa' : 'Demonstração pausada' : 'Demonstração desligada'}</strong><span>Atividades internas simuladas</span></div><button className="icon-button demo-pause" disabled={!office.demoEnabled} onClick={() => office.setDemoRunning(!office.demoRunning)} aria-label={office.demoRunning ? 'Pausar demonstração' : 'Retomar demonstração'}>{office.demoRunning ? <Pause size={15} /> : <Play size={15} />}</button></div><button className="refresh-button" onClick={() => void office.refreshGitHub()} disabled={office.refreshing}><RefreshCw size={14} className={office.refreshing ? 'spin' : ''} /><span>{office.refreshing ? 'Atualizando…' : 'Atualizar GitHub'}</span></button></div>
            <div className="source-note"><Info size={13} /><p>GitHub é uma fonte real. Os demais papéis são demonstrativos até seus adaptadores serem conectados.</p></div>
          </section>

          <section className="team-section" aria-labelledby="team-heading"><div className="section-heading"><h2 id="team-heading">A equipe <span>05</span></h2><span>Selecione um agente</span></div><div className="agent-grid">{AGENTS.map(item => <AgentCard key={item.id} agent={item} activity={referenceProject ? EMPTY_ACTIVITY : office.activities[item.id]} selected={selectedAgent === item.id} onSelect={() => { setSelectedAgent(item.id); setSelectedEvent(undefined); }} />)}</div></section>

          <section className="agent-detail" style={{ '--agent-color': agent.color } as CSSProperties} aria-label={`Detalhes de ${agent.name}`}><span className="detail-role-icon">{(() => { const Icon = AGENT_ICONS[agent.id]; return <Icon size={20} />; })()}</span><div className="detail-text"><div><h3>{agent.name}</h3><span className={`source-badge ${active.provenance || 'inactive'}`}>{active.provenance === 'real' ? 'FONTE REAL' : active.provenance === 'simulated' ? 'SIMULADO' : 'DISPONÍVEL'}</span></div><p>{selectedEvent && selectedEvent.agentId === agent.id ? selectedEvent.detail || selectedEvent.title : active.event?.title || 'Pronto para receber atividades de uma fonte conectada.'}</p><small>{agent.role}{agent.id === 'orchestrator' && ' · Sessão ChatGPT ainda sem adaptador direto'}</small></div><span className={`detail-state state-${active.state}`}><i />{STATE_LABELS[active.state]}</span></section>

          <section className="project-section" aria-labelledby="projects-heading"><div className="section-heading"><h2 id="projects-heading">No ecossistema</h2><span>Projetos de referência</span></div><div className="project-card-grid">{PROJECTS.filter(item => !item.connected).map(item => <button key={item.id} className={`project-card ${projectId === item.id ? 'selected' : ''}`} onClick={() => { setProjectId(item.id); setSelectedEvent(undefined); }} aria-pressed={projectId === item.id}><span className="project-card-icon"><FolderGit2 size={17} /></span><strong>{item.name}</strong><ArrowUpRight size={13} /><small><i />Sem fonte conectada</small></button>)}</div></section>
        </div>

        <section className="activity-panel" aria-labelledby="activity-heading"><div className="activity-header"><div><span className="section-icon"><Activity size={17} /></span><h2 id="activity-heading">Atividade</h2></div><span className="feed-count">{visibleEvents.length}</span></div><p className="activity-subtitle">Cada evento, com sua origem.</p><div className="feed-tabs" aria-label="Filtrar origem dos eventos">{([{ id: 'all', label: 'Todos' }, { id: 'real', label: 'Reais' }, { id: 'simulated', label: 'Simulados' }] as const).map(item => <button key={item.id} className={filter === item.id ? 'selected' : ''} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}</button>)}</div><label className="agent-filter"><input type="checkbox" checked={agentFilter} onChange={event => setAgentFilter(event.target.checked)} /><span>Só {agent.name}</span></label>
          <div className="event-list" aria-live="off">{visibleEvents.length ? visibleEvents.slice(0, 45).map(event => <EventItem key={event.id} event={event} selected={selectedEvent?.id === event.id} onSelect={() => { setSelectedAgent(event.agentId); setSelectedEvent(event); }} />) : <div className="empty-feed"><Radio size={27} /><strong>{referenceProject ? 'Sem fonte conectada' : filter === 'real' ? 'Aguardando eventos reais' : 'Nenhum evento neste filtro'}</strong><p>{referenceProject ? 'Este projeto não tem uma fonte de atividade configurada.' : filter === 'real' ? 'Commits e pull requests do Agent Office aparecerão aqui após a consulta ao GitHub.' : 'Mude o filtro ou ative a demonstração para explorar o escritório.'}</p>{referenceProject && <button onClick={() => setProjectId('agent-office')}>Abrir Agent Office <ArrowUpRight size={13} /></button>}</div>}</div>
          <div className="activity-footer"><span className={office.connection.state === 'connected' ? 'connected' : ''}><i />{office.connection.lastSync ? `Última consulta · ${shortTime(office.connection.lastSync)}` : 'Aguardando primeira consulta'}</span><span>GitHub: {pollingLabel}</span></div>
        </section>
      </div>
      <footer className="page-footer"><span>DIAGNOS AGENT OFFICE <i /> Um escritório para o que vem a seguir.</span><div><a href="https://jik-a-4.itch.io/metrocity-free-topdown-character-pack" target="_blank" rel="noreferrer">Personagens · JIK-A-4 / MetroCity · CC0 <ExternalLink size={11} /></a><a href="https://github.com/pixel-agents-hq/pixel-agents" target="_blank" rel="noreferrer">Base Pixel Agents · MIT <ExternalLink size={11} /></a></div></footer>
    </main>
  </div>;
}
