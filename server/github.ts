import type { GitHubSnapshot, OfficeEvent } from '../src/events/types';

interface GitHubOptions {
  repository?: string;
  branch?: string;
  token?: string;
  fetch?: typeof fetch;
  now?: () => number;
  cacheMs?: number;
  timeoutMs?: number;
  allowPrivate?: boolean;
}
type JsonRecord = Record<string, unknown>;
interface EndpointCache { data: unknown; etag?: string; fetchedAt: number }
class GitHubError extends Error {
  constructor(message: string, readonly status = 0, readonly retryAt = 0) { super(message); }
}

const object = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const array = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.slice(0, 30).map(object) : [];
const str = (value: unknown, max = 2000): string => typeof value === 'string' ? value.slice(0, max) : '';
const date = (value: unknown): string | undefined => {
  const parsed = Date.parse(str(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
};
const sha = (value: unknown) => /^[a-f\d]{40,64}$/i.test(str(value)) ? str(value) : '';

/** Server-only adapter. Tokens never enter OfficeEvent payloads or browser bundles. */
export function createGitHubProvider(options: GitHubOptions = {}) {
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY ?? 'Diagnos-Engenharia/diagnos-agent-office';
  const branch = options.branch ?? process.env.GITHUB_BRANCH ?? 'feat/diagnos-agent-office';
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  // Public GitHub REST grants only 60 requests/hour: leave room for initial details.
  const cacheMs = options.cacheMs ?? (token ? 60_000 : 5 * 60_000);
  const timeoutMs = options.timeoutMs ?? 8_000;
  const endpoints = new Map<string, EndpointCache>();
  const pullVersions = new Map<number, string>();
  let lastSync: string | null = null;
  let snapshot: GitHubSnapshot | undefined;
  let expires = 0;
  let blockedUntil = 0;
  let inFlight: Promise<GitHubSnapshot> | undefined;
  let syncDeadline = 0;
  const root = `/repos/${repository}`;

  async function request(path: string, ttl = 0): Promise<unknown> {
    const cached = endpoints.get(path);
    if (cached && now() - cached.fetchedAt < ttl) return cached.data;
    if (Date.now() >= syncDeadline) throw new GitHubError('Consulta parcial: prazo total de sincronização atingido.');
    if (blockedUntil > now()) throw new GitHubError('Limite de consultas do GitHub atingido; aguardando liberação.', 429, blockedUntil);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Diagnos-Agent-Office' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    let response: Response;
    try { response = await fetcher(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, syncDeadline - Date.now()))) }); }
    catch { throw new GitHubError('O GitHub não respondeu dentro do prazo ou a conexão falhou.'); }
    if (response.status === 304 && cached) { cached.fetchedAt = now(); return cached.data; }
    if (!response.ok) {
      const isRateLimit = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      const retrySeconds = Number(response.headers.get('retry-after'));
      const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      if (isRateLimit) {
        blockedUntil = Math.max(now() + (retrySeconds > 0 ? retrySeconds * 1000 : 60_000), Number.isFinite(resetAt) ? resetAt : 0);
        throw new GitHubError('Limite de consultas do GitHub atingido; tente após a liberação.', response.status, blockedUntil);
      }
      if (response.status === 404) throw new GitHubError('Repositório ou referência não encontrado; verifique acesso e configuração.', 404);
      if ([401, 403].includes(response.status)) throw new GitHubError('Acesso ao GitHub recusado; verifique a credencial e suas permissões.', response.status);
      throw new GitHubError(`Falha na consulta ao GitHub (HTTP ${response.status}).`, response.status);
    }
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new GitHubError('O GitHub retornou uma resposta inválida.'); }
    endpoints.set(path, { data, etag: response.headers.get('etag') ?? undefined, fetchedAt: now() });
    // Fixed-size provider cache; commit detail keys may grow over time.
    if (endpoints.size > 150) endpoints.delete(endpoints.keys().next().value!);
    return data;
  }

  async function sync(): Promise<GitHubSnapshot> {
    syncDeadline = Date.now() + 20_000;
    if (repository.length > 200 || !/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repository)) return { events: [], connection: { state: 'unconfigured', repository, lastSync, error: 'GITHUB_REPOSITORY deve usar organização/repositório.' } };
    const previous = snapshot?.events ?? [];
    const events: OfficeEvent[] = [];
    const warnings: string[] = [];
    try {
      const repo = object(await request(root, 15 * 60_000));
      if (options.allowPrivate === false && repo.private !== false) {
        return { events: [], connection: { state: 'unconfigured', repository, lastSync: null, pollIntervalSeconds: Math.ceil(cacheMs / 1000), error: 'O preview público aceita somente repositórios públicos. Use o servidor local para observar um repositório privado.' } };
      }
      const defaultBranch = str(repo.default_branch, 200) || 'main';
      const refs = [...new Set([defaultBranch, branch].filter(Boolean))];
      const commits = new Map<string, { data: JsonRecord; refs: string[] }>();
      const results = await Promise.allSettled([
        ...refs.map(ref => request(`${root}/commits?sha=${encodeURIComponent(ref)}&per_page=6`)),
        request(`${root}/pulls?state=all&sort=updated&direction=desc&per_page=10`),
      ]);
      for (const [index, ref] of refs.entries()) {
        const result = results[index];
        if (result.status === 'rejected') {
          if (result.reason instanceof GitHubError && result.reason.status === 404 && ref !== defaultBranch) continue;
          throw result.reason;
        }
          for (const commit of array(result.value)) {
            const hash = sha(commit.sha);
            if (!hash) continue;
            const entry = commits.get(hash);
            if (entry) entry.refs.push(ref); else commits.set(hash, { data: commit, refs: [ref] });
          }
      }
      const pullResult = results[refs.length];
      if (pullResult.status === 'rejected') throw pullResult.reason;
      const pulls = array(pullResult.value);
      let detailBudget = 3;
      for (const [hash, entry] of commits) {
        const content = object(entry.data.commit);
        const timestamp = date(object(content.committer).date) ?? date(object(content.author).date);
        if (!timestamp) continue;
        let changes = '';
        if (detailBudget-- > 0) {
          try {
            const detail = object(await request(`${root}/commits/${hash}?per_page=100`, 24 * 60 * 60_000));
            const fileCount = Array.isArray(detail.files) ? detail.files.length : undefined;
            const stats = object(detail.stats);
            if (fileCount !== undefined) changes = ` · ${fileCount >= 100 ? 'ao menos ' : ''}${fileCount} arquivo(s) alterado(s)`;
            if (typeof stats.additions === 'number' && typeof stats.deletions === 'number') changes += ` · +${stats.additions} / −${stats.deletions}`;
          } catch (error) { warnings.push(error instanceof Error ? error.message : 'Detalhes indisponíveis.'); }
        }
        events.push({
          id: `github:commit:${hash}`, agentId: 'dev', projectId: 'agent-office', source: 'github', provenance: 'real', state: 'success', type: 'github.commit',
          title: `Commit ${hash.slice(0, 7)} · ${str(content.message, 240).split('\n')[0]}`.slice(0, 240),
          detail: `${str(object(entry.data.author).login, 100) || str(object(content.author).name, 100) || 'Autor'} · ${entry.refs.join(', ')}${changes}. Registro de commit; não comprova testes.`,
          timestamp, url: `https://github.com/${repository}/commit/${hash}`,
        });
      }
      for (const [index, pull] of pulls.entries()) {
        const number = Number(pull.number);
        const timestamp = date(pull.updated_at);
        const head = object(pull.head);
        const hash = sha(head.sha);
        if (!Number.isSafeInteger(number) || number <= 0 || !timestamp) continue;
        let changedFiles: number | undefined;
        if (index < 3) {
          try {
            const path = `${root}/pulls/${number}`;
            if (pullVersions.get(number) !== timestamp) { endpoints.delete(path); pullVersions.set(number, timestamp); }
            const details = object(await request(path, 24 * 60 * 60_000));
            changedFiles = typeof details.changed_files === 'number' ? details.changed_files : undefined;
          } catch (error) { warnings.push(error instanceof Error ? error.message : 'Detalhes de PR indisponíveis.'); }
        }
        const closed = pull.state === 'closed';
        const merged = !!pull.merged_at;
        events.push({
          id: `github:pr:${number}:${timestamp}:${hash.slice(0, 12)}:${closed ? 'closed' : 'open'}`,
          agentId: 'orchestrator', projectId: 'agent-office', source: 'github', provenance: 'real',
          state: merged ? 'success' : closed ? 'idle' : pull.draft ? 'working' : 'waiting', type: 'github.pull_request',
          title: `PR #${number} ${merged ? 'integrado' : closed ? 'fechado' : pull.draft ? 'em elaboração' : 'aguardando revisão'} · ${str(pull.title, 160)}`,
          detail: `${str(head.ref, 200)} → ${str(object(pull.base).ref, 200)}${changedFiles !== undefined ? ` · ${changedFiles} arquivo(s) alterado(s)` : ''} · atualização registrada pelo GitHub.`,
          timestamp, url: `https://github.com/${repository}/pull/${number}`,
        });
      }
      // Read existing external status contexts; never create or trigger GitHub Actions.
      const headHashes = [...new Set(pulls.slice(0, 2).map(p => sha(object(p.head).sha)).filter(Boolean))];
      for (const hash of headHashes) {
        try {
          const statusData = object(await request(`${root}/commits/${hash}/status?per_page=20`, token ? 60_000 : 10 * 60_000));
          for (const status of array(statusData.statuses)) {
            const context = str(status.context, 100);
            const timestamp = date(status.updated_at) ?? date(status.created_at);
            const statusId = Number(status.id);
            if (!timestamp || !Number.isSafeInteger(statusId)) continue;
            const agentId = /security|sast|audit/i.test(context) ? 'security' : /qa|test|lint|typecheck/i.test(context) ? 'qa' : 'dev';
            const state = status.state === 'success' ? 'success' : status.state === 'failure' || status.state === 'error' ? 'error' : 'working';
            const target = str(status.target_url, 2048);
            events.push({ id: `github:status:${statusId}:${timestamp}`, agentId, projectId: 'agent-office', source: 'github', provenance: 'real', state, type: 'github.status', title: `${context || 'Status GitHub'} · ${str(status.state, 30)}`, detail: str(status.description, 2000) || 'Resultado de status externo registrado no GitHub.', timestamp, ...(target.startsWith('https://') ? { url: target } : {}) });
          }
        } catch (error) { warnings.push(error instanceof Error ? error.message : 'Status externo indisponível.'); }
      }
      lastSync = new Date(now()).toISOString();
      const unique = new Map([...previous, ...events].map(event => [event.id, event]));
      const sorted = [...unique.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 150);
      return { events: sorted, connection: { state: 'connected', repository, lastSync, pollIntervalSeconds: Math.ceil(cacheMs / 1000), ...(warnings.length ? { warning: [...new Set(warnings)].join(' ').slice(0, 500) } : {}) } };
    } catch (error) {
      // Preserve the last verified feed; a provider failure must never create fake work.
      return { events: previous, connection: { state: 'error', repository, lastSync, pollIntervalSeconds: Math.ceil(cacheMs / 1000), error: error instanceof Error ? error.message : 'Não foi possível consultar o GitHub.' } };
    }
  }

  return {
    async getSnapshot(): Promise<GitHubSnapshot> {
      if (snapshot && now() < expires) return snapshot;
      if (inFlight) return inFlight;
      inFlight = sync().then(result => { snapshot = result; expires = Math.max(now() + cacheMs, blockedUntil); return result; }).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}

export const githubProvider = createGitHubProvider();
export const publicGitHubProvider = createGitHubProvider({ allowPrivate: false });
