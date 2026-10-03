import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { OfficeEvent } from '../src/events/types';
import { validateOfficeEvent } from './validation';

export const MAX_EVENTS = 1000;
export const MAX_HISTORY_BYTES = 4 * 1024 * 1024;

/** Local durable adapter. Serverless handlers deliberately do not instantiate it. */
export class LocalEventStore {
  private events = new Map<string, OfficeEvent>();
  private listeners = new Set<(event: OfficeEvent) => void>();
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const metadata = await stat(this.file);
      if (metadata.size > MAX_HISTORY_BYTES) throw new Error('Histórico local excede 4 MB; mova o arquivo antes de iniciar.');
      const lines = (await readFile(this.file, 'utf8')).split('\n').filter(Boolean).slice(-MAX_EVENTS);
      for (const line of lines) {
        try { const event = validateOfficeEvent(JSON.parse(line)); this.events.set(event.id, event); }
        catch { /* A damaged/truncated record must not stop replay of verified records. */ }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  history(limit = 200): OfficeEvent[] {
    return [...this.events.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, Math.max(1, Math.min(MAX_EVENTS, limit)));
  }

  subscribe(callback: (event: OfficeEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async append(event: OfficeEvent): Promise<boolean> {
    const operation = this.writeQueue.then(async () => {
      if (this.events.has(event.id)) return false;
      const next = new Map(this.events);
      next.set(event.id, event);
      if (next.size > MAX_EVENTS) next.delete(next.keys().next().value!);
      let lines = [...next.values()].map(item => JSON.stringify(item));
      let bytes = lines.reduce((total, line) => total + Buffer.byteLength(line) + 1, 0);
      // Retain newest records within both entry and byte bounds; a full feed keeps accepting work.
      while (bytes > MAX_HISTORY_BYTES && next.size > 1) {
        bytes -= Buffer.byteLength(lines.shift()!) + 1;
        next.delete(next.keys().next().value!);
      }
      if (bytes > MAX_HISTORY_BYTES) throw new Error('Evento excede o limite local.');
      const text = lines.join('\n') + '\n';
      await mkdir(dirname(this.file), { recursive: true });
      // Publish only after the persistent file has been atomically replaced.
      await writeFile(`${this.file}.tmp`, text, 'utf8');
      await rename(`${this.file}.tmp`, this.file);
      this.events = next;
      for (const listener of this.listeners) {
        try { listener(event); } catch { /* A disconnected client cannot abort ingestion. */ }
      }
      return true;
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
