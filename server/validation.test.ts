import { describe, expect, it } from 'vitest';
import { isAuthorized, validateOfficeEvent } from './validation';

export const exampleEvent = { id: 'qa:observed-test-run', agentId: 'qa', projectId: 'agent-office', source: 'qa', provenance: 'real', state: 'success', type: 'qa.tests', title: 'Testes locais aprovados', timestamp: '2026-10-02T12:00:00Z' };

describe('event trust boundary', () => {
  it('allows a bounded observed tool result', () => expect(validateOfficeEvent(exampleEvent).timestamp).toBe('2026-10-02T12:00:00.000Z'));
  it('rejects fake source/provenance combinations', () => {
    expect(() => validateOfficeEvent({ ...exampleEvent, source: 'simulation' })).toThrow('Simulações');
    expect(() => validateOfficeEvent({ ...exampleEvent, provenance: 'simulated' })).toThrow('Simulações');
  });
  it('blocks dangerous links and unbounded fields', () => {
    expect(() => validateOfficeEvent({ ...exampleEvent, url: 'javascript:alert(1)' })).toThrow('url');
    expect(() => validateOfficeEvent({ ...exampleEvent, detail: 'x'.repeat(2001) })).toThrow('detail');
  });
  it('rejects SSE delimiter injection and impossible enum values', () => {
    expect(() => validateOfficeEvent({ ...exampleEvent, id: 'qa\nevent:spoof' })).toThrow('id');
    expect(() => validateOfficeEvent({ ...exampleEvent, agentId: 'unknown' })).toThrow('agentId');
  });
  it('requires UTC timestamp and rejects future events', () => {
    expect(() => validateOfficeEvent({ ...exampleEvent, timestamp: 'yesterday' })).toThrow('timestamp');
    expect(() => validateOfficeEvent({ ...exampleEvent, timestamp: new Date(Date.now() + 600_000).toISOString() })).toThrow('futuro');
  });
  it('disables ingestion without a configured secret and verifies bearer exactly', () => {
    expect(isAuthorized('Bearer secret', undefined)).toBe(false);
    expect(isAuthorized(undefined, 'secret')).toBe(false);
    expect(isAuthorized('Bearer secre', 'secret')).toBe(false);
    expect(isAuthorized('Bearer wrong!', 'secret')).toBe(false);
    expect(isAuthorized('Bearer secret', 'secret')).toBe(true);
  });
});
