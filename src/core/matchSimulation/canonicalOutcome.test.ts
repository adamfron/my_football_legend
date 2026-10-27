import { describe, expect, it } from 'vitest';
import { createCalibrationFixture } from './assumptionCalibration';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import {
  outcomeContractSchema,
  outcomeSampleSchema,
  interpretCanonicalOutcome as interpret,
  runCanonicalOutcomeTrial as run,
  sampleCanonicalOutcome,
} from './canonicalOutcome';

const contract = () =>
  outcomeContractSchema.parse({
    version: 'original-delivery-v1',
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
const sample = (at: number, overrides: Record<string, unknown> = {}) =>
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
    ...overrides,
  });
const touch = (actorId: string, at: number) => ({
  actorId,
  at,
  source: 'ground',
  disruption: true,
});

describe('original-action outcome attribution', () => {
  it('separates direct touch, control and one-second retention', () => {
    const o = interpret(contract(), [
      sample(1.5, { contacts: [touch('r', 1.5)] }),
      sample(1.6, { ownerId: 'r' }),
      sample(2.6, { ownerId: 'r' }),
    ]);
    expect(o.directReceiverTouch).toBe(true);
    expect(o.receiverControl).toBe(true);
    expect(o.teamPossessionAtOneSecond).toBe(true);
    expect(o.uninterruptedRetention).toBe(true);
  });
  it('keeps deflection without possession separate from original delivery and control', () => {
    const o = interpret(contract(), [
      sample(1.3, { contacts: [touch('d', 1.3)] }),
      sample(1.7, { contacts: [touch('r', 1.7)] }),
      sample(5),
    ]);
    expect(o.directReceiverTouch).toBe(false);
    expect(o.deflectedReceiverTouch).toBe(true);
    expect(o.defensiveDisruptionAt).toBe(1.3);
    expect(o.defensiveControlAt).toBeNull();
    expect(o.receiverControl).toBeNull();
    expect(o.censored).toBe(true);
  });
  it('does not credit a later reception after defender control and immediate turnover', () => {
    const o = interpret(contract(), [
      sample(1.4, { ownerId: 'd', contacts: [touch('d', 1.4)] }),
      sample(1.5, { ownerId: 'r', contacts: [touch('r', 1.5)] }),
    ]);
    expect(o.receiverControl).toBe(false);
    expect(o.directReceiverTouch).toBe(false);
    expect(o.defensiveControlAt).toBe(1.4);
  });
  it('terminates on a later pass or autonomous shot before attributing its contacts', () => {
    for (const change of [{ passId: 'p2' }, { shotId: 'unrelated-shot', shotOutcome: 'goal' }]) {
      const o = interpret(contract(), [
        sample(2, { ...change, ownerId: 'r', contacts: [touch('r', 2)] }),
      ]);
      expect(o.terminal).toBe('new_action');
      expect(o.receiverTouchAt).toBeNull();
      expect(o.originalShotOutcome).toBeNull();
    }
  });
  it('preserves censoring for loose ball, absent receiver and short retention horizon', () => {
    expect(interpret(contract(), [sample(5)]).directReceiverTouch).toBeNull();
    expect(interpret(contract(), [sample(2, { activeIds: ['a', 'd'] })]).terminal).toBe(
      'receiver_absent',
    );
    expect(
      interpret(contract(), [sample(4.5, { ownerId: 'r' })]).teamPossessionAtOneSecond,
    ).toBeNull();
  });
  it('counts a boundary restart separately from a foul restart', () => {
    expect(interpret(contract(), [sample(2, { restart: 'throw_in' })]).outOfPlayAt).toBe(2);
    expect(interpret(contract(), [sample(2, { restart: 'free_kick' })]).outOfPlayAt).toBeNull();
  });
  it('distinguishes a live released restart context from a newly awarded stoppage', () => {
    const samples = [
      sample(1.1, { restart: 'throw_in', restartReleased: true }),
      sample(1.5, { ownerId: 'r', contacts: [touch('r', 1.5)] }),
      sample(2.5, { ownerId: 'r' }),
    ];
    const legacy = interpret(contract(), samples);
    const corrected = interpret({ ...contract(), version: 'original-delivery-v2' }, samples);
    expect(legacy.terminal).toBe('restart');
    expect(corrected.directReceiverTouch).toBe(true);
    expect(corrected.receiverControl).toBe(true);
    expect(corrected.outOfPlayAt).toBeNull();
    expect(corrected.teamPossessionAtOneSecond).toBe(true);
    const stopped = interpret({ ...contract(), version: 'original-delivery-v2' }, [
      sample(1.1, { restart: 'throw_in', restartReleased: false }),
    ]);
    expect(stopped.outOfPlayAt).toBe(1.1);
  });
  it('keeps inherited shot/contact metadata from becoming a new event', () => {
    const c = { ...contract(), previousShotId: 'old-shot' };
    expect(interpret(c, [sample(2, { shotId: 'old-shot', ownerId: 'r' })]).receiverControl).toBe(
      true,
    );
    const f = createCalibrationFixture({ scenario: 'safe_pass' });
    expect(sampleCanonicalOutcome(f.state, f.state).contacts).toEqual([]);
  });
  it('records endpoint regain separately from uninterrupted retention', () => {
    const o = interpret(contract(), [
      sample(2, { ownerId: 'r' }),
      sample(2.5, { ownerId: 'd' }),
      sample(3, { ownerId: 'r' }),
    ]);
    expect(o.teamPossessionAtOneSecond).toBe(true);
    expect(o.uninterruptedRetention).toBe(false);
  });
  it('never rescues a rejected request with a later event', () => {
    const c = { ...contract(), releasedAt: null, passId: null };
    const o = interpret(c, [sample(3, { ownerId: 'r', shotId: 'later', shotOutcome: 'goal' })]);
    expect(o.directReceiverTouch).toBeNull();
    expect(o.originalShotOutcome).toBeNull();
    expect(o.terminal).toBe('not_released');
    const f = createCalibrationFixture({ scenario: 'infeasible_contact' });
    expect(run(f.state, f.action, 0.1).outcome.released).toBe(false);
  });
  it('resolves only the requested shot ID and does not score pass-retention on a shot', () => {
    const c = { ...contract(), receiverId: null, passId: null, shotId: 'shot1' };
    const o = interpret(c, [
      sample(2, { shotId: 'shot1', shotOutcome: 'save' }),
      sample(3, { shotId: 'later', shotOutcome: 'goal' }),
    ]);
    expect(o.originalShotOutcome).toBe('save');
    expect(o.terminal).toBe('shot_terminal');
    expect(o.censored).toBe(false);
    expect(o.teamPossessionAtOneSecond).toBeNull();
  });
  it('replays saved states, isolates observers and equals bare canonical execution', () => {
    const f = createCalibrationFixture({ scenario: 'safe_pass' }),
      before = structuredClone(f.state);
    const a = run(f.state, f.action, 0.2, (s) => {
      s.contacts.length = 0;
      s.ball.x = -900;
    });
    const b = run(JSON.parse(JSON.stringify(f.state)), f.action, 0.2);
    let bare = resolveMatchAction(structuredClone(f.state), f.action, 'autonomous_npc');
    for (let i = 0; i < 8; i++) bare = step(bare, 0.025);
    expect(a).toEqual(b);
    expect(a.final).toEqual(bare);
    expect(f.state).toEqual(before);
  });
});
