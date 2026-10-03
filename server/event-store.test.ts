import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalEventStore, MAX_HISTORY_BYTES } from './event-store';
import { validateOfficeEvent } from './validation';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });
const event = (id: string) => validateOfficeEvent({ id, agentId: 'qa', projectId: 'agent-office', source: 'qa', provenance: 'real', state: 'working', type: 'qa.run', title: 'Execução observada', timestamp: '2026-10-02T12:00:00Z' });

describe('local persistent store', () => {
  it('persists before notifying, deduplicates concurrent ingress and reloads after restart', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'diagnos-office-')); folders.push(folder);
    const file = join(folder, 'events.jsonl');
    const store = new LocalEventStore(file);
    await store.load();
    const seen: string[] = [];
    const unsubscribe = store.subscribe(value => seen.push(value.id));
    const results = await Promise.all([store.append(event('qa:a')), store.append(event('qa:a')), store.append(event('qa:b'))]);
    expect(results).toEqual([true, false, true]);
    expect(seen).toEqual(['qa:a', 'qa:b']);
    unsubscribe();
    await store.append(event('qa:c'));
    expect(seen).toHaveLength(2);
    expect((await readFile(file, 'utf8')).trim().split('\n')).toHaveLength(3);
    const restarted = new LocalEventStore(file);
    await restarted.load();
    expect(restarted.history()).toHaveLength(3);
  });
  it('skips damaged persisted records and keeps valid replay', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'diagnos-office-')); folders.push(folder);
    const file = join(folder, 'events.jsonl');
    await writeFile(file, `${JSON.stringify(event('qa:valid'))}\n{broken\n`);
    const store = new LocalEventStore(file); await store.load();
    expect(store.history().map(item => item.id)).toEqual(['qa:valid']);
  });
  it('evicts oldest records at the byte bound and continues accepting new events', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'diagnos-office-')); folders.push(folder);
    const file = join(folder, 'events.jsonl');
    const records = Array.from({ length: 900 }, (_, i) => ({ ...event(`qa:large-${i}`), detail: 'é'.repeat(2000), url: `https://example.com/${'a'.repeat(1000)}` }));
    // Load an existing bounded feed almost at the byte limit, without hundreds of disk writes.
    const kept: typeof records = [];
    let bytes = 0;
    for (const record of records) {
      const size = Buffer.byteLength(JSON.stringify(record)) + 1;
      if (bytes + size > MAX_HISTORY_BYTES) break;
      kept.push(record); bytes += size;
    }
    await writeFile(file, kept.map(item => JSON.stringify(item)).join('\n') + '\n');
    const store = new LocalEventStore(file); await store.load();
    await store.append({ ...event('qa:new-large'), detail: 'é'.repeat(2000), url: `https://example.com/${'a'.repeat(1000)}` });
    expect(store.history(1000).some(item => item.id === 'qa:new-large')).toBe(true);
    expect(store.history(1000).some(item => item.id === 'qa:large-0')).toBe(false);
    expect(Buffer.byteLength(await readFile(file, 'utf8'))).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
  });
});
