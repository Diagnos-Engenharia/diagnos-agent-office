import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let child: ChildProcess;
let folder: string;
const port = 43000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const event = { id: 'cli:integration', agentId: 'dev', projectId: 'agent-office', source: 'cli', provenance: 'real', state: 'working', type: 'cli.run', title: 'Teste de ingestão real', timestamp: '2026-10-02T12:00:00Z' };
const post = (body: unknown, token?: string) => fetch(`${base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'diagnos-office-http-'));
  child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('server/dev.ts')], { cwd: folder, env: { ...process.env, PORT: String(port), EVENT_INGEST_TOKEN: 'integration-only', GITHUB_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Local server did not start')), 15_000);
    child.stdout!.on('data', chunk => { if (String(chunk).includes('Diagnos Agent Office:')) { clearTimeout(timer); resolveReady(); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Local server exited ${code}`)); });
    child.once('error', reject);
  });
}, 20_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>(done => child.once('exit', () => done()));
    child.kill(); await exited;
  }
  if (folder) await rm(folder, { recursive: true, force: true });
});

describe('HTTP local ingress and realtime', () => {
  it('requires authorization and validates received payloads', async () => {
    expect((await post(event)).status).toBe(401);
    expect((await post(event, 'incorrect')).status).toBe(401);
    expect((await post({ ...event, provenance: 'simulated' }, 'integration-only')).status).toBe(400);
    expect((await post({ ...event, detail: 'x'.repeat(18_000) }, 'integration-only')).status).toBe(400);
    expect((await fetch(`${base}/api/events`, { method: 'PUT' })).status).toBe(405);
  });
  it('streams a newly persisted event and replays it in history without duplicates', async () => {
    const abort = new AbortController();
    const stream = await fetch(`${base}/api/stream`, { signal: abort.signal });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain('event: snapshot');
    expect((await post(event, 'integration-only')).status).toBe(201);
    const delivered = await reader.read();
    expect(decoder.decode(delivered.value)).toContain('event: office-event');
    expect((await (await post(event, 'integration-only')).json()).duplicate).toBe(true);
    const history = await (await fetch(`${base}/api/events`)).json();
    expect(history.events.map((item: { id: string }) => item.id)).toEqual(['cli:integration']);
    expect(history.transport).toBe('local-sse');
    abort.abort();
  });
});
