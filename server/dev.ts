import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { LocalEventStore } from './event-store';
import { githubProvider } from './github';
import { InputError, isAuthorized, validateOfficeEvent } from './validation';

const MAX_BODY = 16 * 1024;
const maxStreams = 20;
let activeStreams = 0;
const store = new LocalEventStore(resolve('.data/events.jsonl'));
await store.load();
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new InputError('Use Content-Type: application/json.');
  const length = Number(request.headers['content-length']);
  if (length > MAX_BODY) throw new InputError('Evento excede 16 KB.');
  const buffers: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY) throw new InputError('Evento excede 16 KB.');
    buffers.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(buffers).toString('utf8')); }
  catch { throw new InputError('JSON inválido.'); }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  void (async () => {
    if (url.pathname === '/api/github') {
      if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return json(response, 405, { error: 'Método não permitido.' }); }
      const snapshot = await githubProvider.getSnapshot();
      // Persist verified observations so local stream consumers see new GitHub events.
      for (const event of [...snapshot.events].reverse()) await store.append(event);
      return json(response, 200, snapshot);
    }
    if (url.pathname === '/api/events') {
      if (request.method === 'GET') return json(response, 200, { events: store.history(), transport: 'local-sse', ingress: process.env.EVENT_INGEST_TOKEN ? 'enabled' : 'unconfigured' });
      if (request.method !== 'POST') { response.setHeader('Allow', 'GET, POST'); return json(response, 405, { error: 'Método não permitido.' }); }
      if (!process.env.EVENT_INGEST_TOKEN) return json(response, 503, { error: 'Ingress desabilitado. Configure EVENT_INGEST_TOKEN no servidor local.' });
      if (!isAuthorized(request.headers.authorization, process.env.EVENT_INGEST_TOKEN)) return json(response, 401, { error: 'Credencial de ingestão inválida.' });
      const event = validateOfficeEvent(await readJson(request));
      const created = await store.append(event);
      return json(response, created ? 201 : 200, { event, duplicate: !created });
    }
    if (url.pathname === '/api/stream') {
      if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return json(response, 405, { error: 'Método não permitido.' }); }
      if (activeStreams >= maxStreams) return json(response, 503, { error: 'Limite de conexões locais atingido.' });
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      response.write(`event: snapshot\ndata: ${JSON.stringify({ events: store.history() })}\n\n`);
      activeStreams += 1;
      const unsubscribe = store.subscribe(event => {
        if (response.writableLength > 256 * 1024) return response.destroy();
        response.write(`id: ${event.id}\nevent: office-event\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
      let closed = false;
      const cleanup = () => { if (closed) return; closed = true; activeStreams -= 1; clearInterval(heartbeat); unsubscribe(); };
      response.on('close', cleanup);
      response.on('error', cleanup);
      return;
    }
    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Endpoint não encontrado.' });
    vite.middlewares(request, response);
  })().catch(error => {
    if (!response.headersSent) json(response, error instanceof InputError ? 400 : 500, { error: error instanceof InputError ? error.message : 'Falha ao processar o evento local.' });
    else response.end();
  });
});

server.requestTimeout = 15_000;
const port = Number(process.env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Diagnos Agent Office: http://localhost:${port}`));

async function shutdown() { server.close(); await vite.close(); process.exit(0); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
