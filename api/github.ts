import type { IncomingMessage, ServerResponse } from 'node:http';
import { publicGitHubProvider } from '../server/github.js';

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); response.statusCode = 405; response.end(JSON.stringify({ error: 'Método não permitido.' })); return; }
  const snapshot = await publicGitHubProvider.getSnapshot();
  const ttl = process.env.GITHUB_TOKEN ? 60 : 300;
  response.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=30`);
  response.statusCode = 200;
  response.end(JSON.stringify(snapshot));
}
