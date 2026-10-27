import { describe, it, expect } from 'vitest';
import {
  outcomeContractSchema,
  outcomeSampleSchema,
  interpretCanonicalOutcome,
} from './canonicalOutcome';
const contract = () =>
  outcomeContractSchema.parse({
    version: 'original-delivery-v3',
    actorId: 'a',
    receiverId: 'r',
    teamIds: ['a', 'r', 't'],
    opponentIds: ['d'],
    requestedAt: 1,
    horizonAt: 5,
    releasedAt: 1,
    passId: 'p1',
    shotId: null,
    information: 'privileged_engineering_observer',
    conditionalOnRelease: true,
  });
const sample = (at: number, extra: Record<string, unknown> = {}) =>
  outcomeSampleSchema.parse({
    at,
    passId: 'p1',
    shotId: null,
    shotOutcome: null,
    ownerId: null,
    activeIds: ['a', 'r', 't', 'd'],
    ball: { x: 40, y: 34, height: 0.11 },
    velocity: { x: 4, y: 0, z: 0 },
    restart: null,
    restartTeam: null,
    contacts: [],
    ...extra,
  });
const contact = (actorId: string, at: number) => ({
  actorId,
  at,
  source: 'release',
  disruption: true,
});
describe('PR197 original-delivery v3 release lineage', () => {
  it('records a defensive header contact and does not inherit control from its new delivery', () => {
    const samples = [
      sample(2, {
        contacts: [contact('d', 2)],
        releaseContact: { actorId: 'd', at: 2, kind: 'header' },
      }),
      sample(3, { ownerId: 'r' }),
      sample(4, { ownerId: 'r' }),
    ];
    const result = interpretCanonicalOutcome(contract(), samples);
    expect(result.terminal).toBe('new_action');
    expect(result.terminalAt).toBe(2);
    expect(result.defensiveDisruptionAt).toBe(2);
    expect(result.defensiveControlAt).toBeNull();
    expect(result.directReceiverTouch).toBe(false);
    expect(result.receiverControl).toBe(false);
    expect(result.censored).toBe(false);
    expect(
      interpretCanonicalOutcome({ ...contract(), version: 'original-delivery-v2' }, samples)
        .receiverControl,
    ).toBe(true);
  });
  it('counts the real receiver touch of a first-time pass before terminating the incoming ball', () => {
    const result = interpretCanonicalOutcome(contract(), [
      sample(2, {
        passId: 'p2',
        contacts: [contact('r', 2)],
        releaseContact: { actorId: 'r', at: 2, kind: 'first_time_pass' },
      }),
      sample(3, { ownerId: 'r' }),
    ]);
    expect(result.directReceiverTouch).toBe(true);
    expect(result.receiverControl).toBe(false);
    expect(result.teamPossessionAtOneSecond).toBe(false);
    expect(result.terminal).toBe('new_action');
  });
  it('does not attach an unrelated release contact without an incoming-contact witness', () => {
    const result = interpretCanonicalOutcome(contract(), [
      sample(2, { passId: 'p2', contacts: [contact('r', 2)], ownerId: 'r' }),
    ]);
    expect(result.receiverTouchAt).toBeNull();
    expect(result.terminal).toBe('new_action');
  });
  it('does not end a first-time request on its own initial release', () => {
    const result = interpretCanonicalOutcome(contract(), [
      sample(1, {
        contacts: [contact('a', 1)],
        releaseContact: { actorId: 'a', at: 1, kind: 'first_time_pass' },
      }),
      sample(2, { ownerId: 'r', contacts: [contact('r', 2)] }),
      sample(3, { ownerId: 'r' }),
    ]);
    expect(result.directReceiverTouch).toBe(true);
    expect(result.receiverControl).toBe(true);
    expect(result.teamPossessionAtOneSecond).toBe(true);
  });
  it('keeps an explicit later possession endpoint after a prior genuine control', () => {
    const result = interpretCanonicalOutcome(contract(), [
      sample(1.4, { ownerId: 'r', contacts: [contact('r', 1.4)] }),
      sample(2, {
        contacts: [contact('r', 2)],
        releaseContact: { actorId: 'r', at: 2, kind: 'header' },
      }),
      sample(2.4, { ownerId: 't' }),
    ]);
    expect(result.receiverControl).toBe(true);
    expect(result.teamPossessionAtOneSecond).toBe(true);
    expect(result.uninterruptedRetention).toBe(true);
  });
  it('keeps a rejected request ineligible despite subsequent autonomous contacts', () => {
    const result = interpretCanonicalOutcome({ ...contract(), releasedAt: null }, [
      sample(2, { ownerId: 'r', contacts: [contact('r', 2)] }),
    ]);
    expect(result.terminal).toBe('not_released');
    expect(result.directReceiverTouch).toBeNull();
    expect(result.receiverControl).toBeNull();
  });
});
