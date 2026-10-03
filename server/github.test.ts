import { describe, expect, it, vi } from 'vitest';
import { createGitHubProvider } from './github';

const hash = 'a'.repeat(40);
const nextHash = 'b'.repeat(40);
const timestamp = '2026-10-02T12:00:00Z';
const commit = { sha: hash, author: { login: 'diagnos' }, commit: { message: 'Implement office', author: { date: timestamp }, committer: { date: timestamp } } };
const pull = { number: 1, updated_at: timestamp, title: 'First office', state: 'open', draft: false, head: { sha: hash, ref: 'feat/diagnos-agent-office' }, base: { ref: 'main' } };

function fixtures(overrides: { fail?: boolean; pull?: typeof pull; status?: boolean } = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    if (overrides.fail) return new Response('{}', { status: 503 });
    let body: unknown = {};
    if (path.endsWith('/diagnos-agent-office')) body = { default_branch: 'main', private: false };
    else if (path.endsWith('/commits')) body = [commit];
    else if (path.endsWith(`/commits/${hash}`)) body = { files: [{ filename: 'src/App.tsx' }], stats: { additions: 5, deletions: 1 } };
    else if (path.endsWith('/pulls')) body = [overrides.pull ?? pull];
    else if (path.endsWith('/pulls/1')) body = { changed_files: 2 };
    else if (path.endsWith('/status')) body = { statuses: overrides.status ? [{ id: 12, context: 'QA / local tests', state: 'failure', created_at: timestamp, description: 'A test failed' }] : [] };
    return new Response(JSON.stringify(body), { headers: { ETag: '"fixture"', 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('GitHub provider', () => {
  it('deduplicates commits across refs and represents real changes without inventing QA success', async () => {
    const fetch = fixtures();
    const provider = createGitHubProvider({ fetch, token: '', cacheMs: 0 });
    const result = await provider.getSnapshot();
    expect(result.connection.state).toBe('connected');
    expect(result.events.filter(e => e.type === 'github.commit')).toHaveLength(1);
    expect(result.events.find(e => e.type === 'github.commit')?.detail).toContain('1 arquivo(s)');
    expect(result.events.find(e => e.type === 'github.pull_request')?.state).toBe('waiting');
    expect(result.events.every(e => e.provenance === 'real')).toBe(true);
    expect(result.events.some(e => e.agentId === 'qa')).toBe(false);
  });

  it('tracks an updated PR head as a separate observation and keeps bounded history', async () => {
    let version = pull;
    const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => fixtures({ pull: version })(url, init)) as typeof globalThis.fetch;
    const provider = createGitHubProvider({ fetch, token: '', cacheMs: 0 });
    await provider.getSnapshot();
    version = { ...pull, updated_at: '2026-10-02T12:01:00Z', head: { ...pull.head, sha: nextHash } };
    const result = await provider.getSnapshot();
    expect(result.events.filter(e => e.type === 'github.pull_request')).toHaveLength(2);
  });

  it('represents only actual external status results', async () => {
    const provider = createGitHubProvider({ fetch: fixtures({ status: true }), token: '', cacheMs: 0 });
    const result = await provider.getSnapshot();
    expect(result.events.find(e => e.agentId === 'qa')).toMatchObject({ state: 'error', provenance: 'real', type: 'github.status' });
  });

  it('preserves verified events and last successful sync when the provider fails', async () => {
    let failed = false;
    const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => fixtures({ fail: failed })(url, init)) as typeof globalThis.fetch;
    const provider = createGitHubProvider({ fetch, cacheMs: 0, token: '' });
    const first = await provider.getSnapshot();
    failed = true;
    const second = await provider.getSnapshot();
    expect(second.connection.state).toBe('error');
    expect(second.connection.lastSync).toBe(first.connection.lastSync);
    expect(second.events).toEqual(first.events);
  });

  it('caches and coalesces concurrent browser refreshes', async () => {
    const fetch = fixtures();
    const provider = createGitHubProvider({ fetch, token: '' });
    const [a, b] = await Promise.all([provider.getSnapshot(), provider.getSnapshot()]);
    const count = fetch.mock.calls.length;
    await provider.getSnapshot();
    expect(a).toEqual(b);
    expect(fetch.mock.calls).toHaveLength(count);
    expect(a.connection.pollIntervalSeconds).toBe(300);
  });

  it('uses conditional requests and cached bodies on GitHub 304 responses', async () => {
    let notModified = false;
    const fixture = fixtures();
    const headers: Headers[] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      headers.push(new Headers(init?.headers));
      if (notModified) return new Response(null, { status: 304 });
      return fixture(url, init);
    }) as typeof globalThis.fetch;
    const provider = createGitHubProvider({ fetch, cacheMs: 0, token: '' });
    const first = await provider.getSnapshot();
    notModified = true;
    const second = await provider.getSnapshot();
    expect(second.events).toEqual(first.events);
    expect(headers.some(value => value.get('if-none-match') === '"fixture"')).toBe(true);
  });

  it('respects rate-limit reset instead of continuously hammering GitHub', async () => {
    let time = Date.now();
    const fetch = vi.fn(async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.ceil((time + 3_600_000) / 1000)) } })) as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
    const provider = createGitHubProvider({ fetch, now: () => time, cacheMs: 0, token: '' });
    const result = await provider.getSnapshot();
    time += 60_000;
    await provider.getSnapshot();
    expect(result.connection.state).toBe('error');
    expect(result.events).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed configuration without making any network call', async () => {
    const fetch = fixtures();
    const result = await createGitHubProvider({ repository: 'https://attacker.example/repo', fetch }).getSnapshot();
    expect(result.connection.state).toBe('unconfigured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns network/timeout failures into explicit connection errors', async () => {
    const fetch = vi.fn(async () => { throw new DOMException('Timeout', 'TimeoutError'); }) as typeof globalThis.fetch;
    const result = await createGitHubProvider({ fetch }).getSnapshot();
    expect(result.connection.state).toBe('error');
    expect(result.connection.error).toContain('prazo');
    expect(result.events).toHaveLength(0);
  });
  it('rejects private sources in the public preview before fetching any commit or PR content', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ default_branch: 'main', private: true }))) as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
    const result = await createGitHubProvider({ fetch, allowPrivate: false, token: 'server-only' }).getSnapshot();
    expect(result.connection.state).toBe('unconfigured');
    expect(result.connection.error).toContain('somente repositórios públicos');
    expect(result.events).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('server-only');
  });
  it('keeps the real core feed connected when optional external status access is refused', async () => {
    const fixture = fixtures();
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(url)).pathname.endsWith('/status')) return new Response('{}', { status: 403 });
      return fixture(url, init);
    }) as typeof globalThis.fetch;
    const result = await createGitHubProvider({ fetch, token: '', cacheMs: 0 }).getSnapshot();
    expect(result.connection.state).toBe('connected');
    expect(result.connection.warning).toContain('recusado');
    expect(result.events.find(e => e.type === 'github.commit')).toBeDefined();
    expect(result.events.some(e => e.agentId === 'qa')).toBe(false);
  });
});
