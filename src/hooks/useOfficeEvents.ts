import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_IDS, type AgentId, type AgentState, type EventHistory, type GitHubConnection, type GitHubSnapshot, type OfficeEvent } from '../events/types';
import { createSimulationEvent } from '../events/simulation';
import { type AgentActivity } from '../components/officeModel';

const MAX_HISTORY = 140;
const REAL_ACTIVITY_TTL = 18_000;
const demoTitles: Record<AgentId, string[]> = {
  orchestrator: ['Organizando a próxima entrega', 'Distribuindo tarefas do escritório', 'Aguardando uma nova instrução'],
  dev: ['Construindo uma integração', 'Lendo o código do projeto', 'Preparando uma alteração'],
  qa: ['Explorando um fluxo de teste', 'Revisando cenários de qualidade', 'Conferindo uma entrega'],
  security: ['Revisando permissões de acesso', 'Conferindo entradas da API', 'Inspecionando a configuração'],
  ux: ['Desenhando a experiência do escritório', 'Ajustando detalhes da interface', 'Explorando um novo layout'],
};

export function mergeEvents(existing: OfficeEvent[], incoming: OfficeEvent[]): OfficeEvent[] {
  const byId = new Map(existing.map(event => [event.id, event]));
  for (const event of incoming) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, MAX_HISTORY);
}

export function isNewLiveActivity(event: OfficeEvent, previousSync: number | undefined, pollIntervalSeconds: number, now = Date.now()): boolean {
  const timestamp = Date.parse(event.timestamp);
  const age = now - timestamp;
  const freshnessWindow = Math.max(180_000, pollIntervalSeconds * 1_000 + 30_000);
  if (!Number.isFinite(timestamp) || age < -300_000 || age > freshnessWindow) return false;
  // The first response is history. A GitHub event becomes live only when it is newer than a prior successful sync.
  if (event.source === 'github' && (previousSync === undefined || timestamp <= previousSync - 30_000)) return false;
  return true;
}

export function useOfficeEvents() {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [connection, setConnection] = useState<GitHubConnection>({ state: 'unconfigured', repository: 'Diagnos-Engenharia/diagnos-agent-office', lastSync: null });
  const [refreshing, setRefreshing] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [demoRunning, setDemoRunning] = useState(true);
  const [activities, setActivities] = useState<Record<AgentId, AgentActivity>>(() => Object.fromEntries(AGENT_IDS.map(id => [id, { state: 'idle' }])) as Record<AgentId, AgentActivity>);
  const [ingress, setIngress] = useState<EventHistory['ingress']>('unconfigured');
  const [streamConnected, setStreamConnected] = useState(false);
  const seenReal = useRef(new Set<string>());
  const realActivity = useRef(new Map<AgentId, { event: OfficeEvent; expiresAt: number }>());
  const demoActivity = useRef(new Map<AgentId, OfficeEvent>());
  const mounted = useRef(false);
  const refreshingRef = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const githubInitialized = useRef(false);
  const githubSyncCursor = useRef<number | undefined>(undefined);
  const demoFlags = useRef({ enabled: true, running: true });
  demoFlags.current = { enabled: demoEnabled, running: demoRunning };

  const reconcile = useCallback(() => {
    const now = Date.now();
    const next = Object.fromEntries(AGENT_IDS.map(id => {
      const live = realActivity.current.get(id);
      if (live && live.expiresAt > now) return [id, { state: live.event.state, event: live.event, provenance: 'real' }];
      if (live) realActivity.current.delete(id);
      const demo = demoActivity.current.get(id);
      if (demoFlags.current.enabled && demoFlags.current.running && demo) return [id, { state: demo.state, event: demo, provenance: 'simulated' }];
      return [id, { state: 'idle' }];
    })) as Record<AgentId, AgentActivity>;
    setActivities(next);
  }, []);

  const ingest = useCallback((incoming: OfficeEvent[], activate: boolean, previousSync = githubSyncCursor.current) => {
    if (!mounted.current) return;
    const newReal = incoming.filter(event => event.provenance === 'real' && !seenReal.current.has(event.id));
    if (activate) for (const event of newReal) {
      // First-sync history never animates. Later GitHub changes use the sync cursor and cache interval.
      if (isNewLiveActivity(event, previousSync, connection.pollIntervalSeconds ?? 60)) {
        realActivity.current.set(event.agentId, { event, expiresAt: Date.now() + REAL_ACTIVITY_TTL });
      }
    }
    for (const event of incoming) if (event.provenance === 'real') seenReal.current.add(event.id);
    setEvents(previous => mergeEvents(previous, incoming));
    reconcile();
  }, [connection.pollIntervalSeconds, reconcile]);

  const refreshGitHub = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const response = await fetch('/api/github', { signal: controller.signal });
      const snapshot = await response.json() as GitHubSnapshot;
      if (!mounted.current) return;
      if (!Array.isArray(snapshot.events) || !snapshot.connection) throw new Error('Resposta inesperada do GitHub.');
      setConnection(snapshot.connection);
      ingest(snapshot.events, githubInitialized.current, githubSyncCursor.current);
      if (snapshot.connection.state === 'connected') {
        githubInitialized.current = true;
        const syncTime = snapshot.connection.lastSync ? Date.parse(snapshot.connection.lastSync) : NaN;
        if (Number.isFinite(syncTime) && (githubSyncCursor.current === undefined || syncTime > githubSyncCursor.current)) githubSyncCursor.current = syncTime;
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        setConnection(previous => ({ ...previous, state: 'error', error: error instanceof Error ? error.message : 'Não foi possível atualizar o GitHub.' }));
      }
    } finally {
      controllers.current.delete(controller);
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [ingest]);

  useEffect(() => {
    mounted.current = true;
    let stream: EventSource | undefined;
    const controller = new AbortController();
    controllers.current.add(controller);
    void refreshGitHub();
    void (async () => {
      try {
        const response = await fetch('/api/events', { signal: controller.signal });
        if (!response.ok) return;
        const history = await response.json() as EventHistory;
        if (!mounted.current || controller.signal.aborted) return;
        setIngress(history.ingress);
        ingest(history.events, false);
        if (history.transport === 'local-sse') {
          stream = new EventSource('/api/stream');
          stream.onopen = () => setStreamConnected(true);
          stream.onerror = () => setStreamConnected(false);
          stream.addEventListener('snapshot', message => {
            try { ingest((JSON.parse((message as MessageEvent).data) as { events: OfficeEvent[] }).events, false); } catch { /* Invalid frames do not interrupt the feed. */ }
          });
          stream.addEventListener('office-event', message => {
            try { ingest([JSON.parse((message as MessageEvent).data) as OfficeEvent], true); } catch { /* Ignore malformed frames. */ }
          });
        }
      } catch { /* GitHub polling remains available if the local transport is unavailable. */ }
      finally { controllers.current.delete(controller); }
    })();
    const poll = window.setInterval(() => void refreshGitHub(), 30_000);
    const expiry = window.setInterval(reconcile, 1_000);
    return () => {
      mounted.current = false;
      controller.abort();
      for (const pending of controllers.current) pending.abort();
      stream?.close();
      window.clearInterval(poll);
      window.clearInterval(expiry);
    };
  }, [ingest, reconcile, refreshGitHub]);

  useEffect(() => {
    reconcile();
    if (!demoEnabled || !demoRunning) return;
    let tick = 0;
    const emit = (id: AgentId, state: AgentState, phase: number) => {
      const event = createSimulationEvent(id, state);
      event.title = demoTitles[id][phase % demoTitles[id].length];
      event.detail = 'Atividade de demonstração. Este agente ainda não está conectado a uma execução real.';
      demoActivity.current.set(id, event);
      setEvents(previous => mergeEvents(previous, [event]));
    };
    AGENT_IDS.forEach((id, index) => emit(id, index === 2 ? 'waiting' : index === 4 ? 'idle' : 'working', index));
    reconcile();
    const sequence: AgentState[] = ['working', 'success', 'idle', 'working', 'waiting', 'working', 'success', 'error'];
    const interval = window.setInterval(() => {
      const index = tick % AGENT_IDS.length;
      emit(AGENT_IDS[index], sequence[Math.floor(tick / AGENT_IDS.length) % sequence.length], tick + index);
      tick += 1;
      reconcile();
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [demoEnabled, demoRunning, reconcile]);

  return { events, connection, refreshing, refreshGitHub, demoEnabled, setDemoEnabled, demoRunning, setDemoRunning, activities, ingress, streamConnected };
}
