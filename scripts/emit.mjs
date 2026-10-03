import { readFile } from 'node:fs/promises';

// Use an explicit observed event JSON file; this command never invents successful work.
const file = process.argv[2];
if (!file || !process.env.EVENT_INGEST_TOKEN) {
  console.error('Uso: EVENT_INGEST_TOKEN=<segredo> node scripts/emit.mjs evento.json');
  process.exit(1);
}
const endpoint = new URL('/api/events', process.env.OFFICE_URL ?? 'http://localhost:4173');
if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('OFFICE_URL deve usar http ou https.');
const body = await readFile(file, 'utf8');
if (Buffer.byteLength(body) > 16 * 1024) throw new Error('Evento excede 16 KB.');
JSON.parse(body);
const response = await fetch(endpoint, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EVENT_INGEST_TOKEN}` }, body,
  signal: AbortSignal.timeout(10_000),
});
const result = await response.json();
if (!response.ok) { console.error(result.error ?? `HTTP ${response.status}`); process.exit(1); }
console.log(`Evento ${result.event.id} ${result.duplicate ? 'já registrado' : 'registrado'}.`);
