import type { IncomingMessage, ServerResponse } from 'node:http';

/** Ingress requires a durable adapter. Never claim serverless process memory persists. */
export default function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const message = 'Eventos CLI/QA/MCP/API/deploy usam o servidor local nesta versão. Ingress no preview requer um adaptador durável compartilhado.';
  if (request.method === 'GET') { response.statusCode = 200; response.end(JSON.stringify({ events: [], transport: 'polling', ingress: 'local-only', message })); return; }
  if (request.method === 'POST') { response.statusCode = 503; response.end(JSON.stringify({ error: message, code: 'DURABLE_ADAPTER_REQUIRED' })); return; }
  response.setHeader('Allow', 'GET, POST');
  response.statusCode = 405;
  response.end(JSON.stringify({ error: 'Método não permitido.' }));
}
