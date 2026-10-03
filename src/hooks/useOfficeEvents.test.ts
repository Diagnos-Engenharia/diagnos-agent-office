import { describe, expect, it } from 'vitest';
import { isNewLiveActivity } from './useOfficeEvents';
import type { OfficeEvent } from '../events/types';

const now = Date.parse('2026-10-03T12:00:00.000Z');
const event = (source: OfficeEvent['source'], timestamp: string): OfficeEvent => ({
  id: `${source}:test`, agentId: 'dev', projectId: 'agent-office', source,
  provenance: 'real', state: 'success', type: 'test', title: 'Teste', timestamp,
});

describe('live activity recency', () => {
  it('does not replay the first GitHub sync or events seen before its cursor', () => {
    const recent = event('github', new Date(now - 60_000).toISOString());
    expect(isNewLiveActivity(recent, undefined, 300, now)).toBe(false);
    expect(isNewLiveActivity(recent, now - 120_000, 300, now)).toBe(true);
    expect(isNewLiveActivity(recent, now - 30_000, 300, now)).toBe(false);
  });

  it('covers the full uncached GitHub polling interval and rejects stale history', () => {
    expect(isNewLiveActivity(event('github', new Date(now - 270_000).toISOString()), now - 300_000, 300, now)).toBe(true);
    expect(isNewLiveActivity(event('github', new Date(now - 400_000).toISOString()), now - 500_000, 300, now)).toBe(false);
  });

  it('lets fresh local CLI events animate immediately while excluding stale or future events', () => {
    expect(isNewLiveActivity(event('cli', new Date(now - 1_000).toISOString()), undefined, 300, now)).toBe(true);
    expect(isNewLiveActivity(event('cli', new Date(now - 600_000).toISOString()), undefined, 300, now)).toBe(false);
    expect(isNewLiveActivity(event('cli', new Date(now + 600_000).toISOString()), undefined, 300, now)).toBe(false);
  });
});
