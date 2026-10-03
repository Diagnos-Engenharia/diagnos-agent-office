import { timingSafeEqual } from 'node:crypto';
import { AGENT_IDS, AGENT_STATES, EVENT_SOURCES, PROJECT_IDS, type OfficeEvent } from '../src/events/types';

export class InputError extends Error {}

export function validateOfficeEvent(input: unknown): OfficeEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Envie um objeto de evento.');
  const value = input as Record<string, unknown>;
  const enumValue = <T extends string>(key: string, allowed: readonly T[]): T => {
    if (typeof value[key] !== 'string' || !allowed.includes(value[key] as T)) throw new InputError(`Campo ${key} inválido.`);
    return value[key] as T;
  };
  const stringValue = (key: string, max: number, optional = false): string | undefined => {
    if (optional && value[key] === undefined) return undefined;
    if (typeof value[key] !== 'string' || !(value[key] as string).trim() || (value[key] as string).length > max) throw new InputError(`Campo ${key} inválido (limite ${max}).`);
    return (value[key] as string).trim();
  };
  const timestamp = stringValue('timestamp', 40)!;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new InputError('timestamp deve usar ISO 8601 UTC.');
  if (new Date(timestamp).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) throw new InputError('timestamp contém uma data inválida.');
  if (Date.parse(timestamp) > Date.now() + 5 * 60_000) throw new InputError('timestamp está no futuro.');
  const source = enumValue('source', EVENT_SOURCES);
  const provenance = enumValue('provenance', ['real', 'simulated'] as const);
  if ((source === 'simulation') !== (provenance === 'simulated')) throw new InputError('Simulações devem usar source=simulation e provenance=simulated.');
  const id = stringValue('id', 180)!;
  if (!/^[a-z\d][a-z\d:._/@-]*$/i.test(id)) throw new InputError('id deve usar letras, números e separadores ASCII seguros.');
  const url = stringValue('url', 2048, true);
  if (url) {
    try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); }
    catch { throw new InputError('url deve usar http ou https.'); }
  }
  return {
    id, agentId: enumValue('agentId', AGENT_IDS), projectId: enumValue('projectId', PROJECT_IDS),
    source, provenance, state: enumValue('state', AGENT_STATES), type: stringValue('type', 100)!, title: stringValue('title', 240)!,
    detail: stringValue('detail', 2000, true), timestamp: new Date(timestamp).toISOString(), url,
  };
}

/** Missing secret disables ingest. Compare equal-sized digests without leaking timing. */
export function isAuthorized(header: string | undefined, token: string | undefined): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
