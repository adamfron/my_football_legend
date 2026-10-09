// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { ContactTacticalTracker } from './contactTacticalDiagnostics';
import type { ChallengeDiagnostic } from './defensiveChallenges';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr158-independent-observer-contracts',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 100;
  state.actionCooldown = 20;
  state.playerAgencyEnabled = false;
  state.players.forEach((player, index) => {
    player.position = { x: player.team === 'home' ? 10 : 90, y: 5 + index * 2 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
    player.facingAngle = player.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
  });
  const home = state.players.find(
    (player) => player.team === 'home' && player.slot.position === 'center_back',
  )!;
  const receiver = state.players.find(
    (player) =>
      player.team === 'home' && player.id !== home.id && player.slot.position !== 'goalkeeper',
  )!;
  const pressers = state.players
    .filter((player) => player.team === 'away' && /striker|winger/.test(player.slot.position))
    .slice(0, 2);
  home.position = { x: 50, y: 34 };
  receiver.position = { x: 60, y: 34 };
  pressers.forEach((player, index) => {
    player.position = { x: 52, y: 33 + index * 2 };
  });
  state.ball = { x: 50.4, y: 34, ownerId: home.id, lastTouchPlayerId: home.id };
  state.possessionTeam = 'home';
  state.ballOwnershipStartedAt = state.time;
  return { state, home, receiver, pressers };
};

const lose = (state: TacticalMatchState, winnerId: string): TacticalMatchState => ({
  ...structuredClone(state),
  time: state.time + 1,
  possessionTeam: 'away',
  ball: { x: 52, y: 34, ownerId: winnerId },
  lastPossessionLoss: {
    id: `${state.seed}:test-loss`,
    at: state.time + 1,
    from: 'home',
    to: 'away',
    cause: 'tackle',
    position: { x: 52, y: 34 },
    loserId: state.ball.ownerId,
    winnerId,
  },
});

const regain = (state: TacticalMatchState, winnerId: string): TacticalMatchState => ({
  ...structuredClone(state),
  time: state.time + 1,
  possessionTeam: 'home',
  ball: { x: 50.4, y: 34, ownerId: winnerId },
  lastPossessionChange: {
    at: state.time + 1,
    from: 'away',
    to: 'home',
    cause: 'claim',
    winnerId,
  },
});

const trackerAfterRegain = () => {
  const context = fixture();
  const tracker = new ContactTacticalTracker();
  const lost = lose(context.state, context.pressers[0]!.id);
  tracker.observe(context.state, lost);
  const regained = regain(lost, context.home.id);
  tracker.observe(lost, regained);
  return { ...context, tracker, regained };
};

describe('PR158 independently audited observational contracts', () => {
  it('does not turn an older shot result into a new post-regain release', () => {
    const { tracker, regained, home } = trackerAfterRegain();
    const releaseState = structuredClone(regained);
    releaseState.time = 99;
    releaseState.players.find((player) => player.id === home.id)!.position = { x: 94, y: 34 };
    releaseState.ball = { x: 94.4, y: 34, ownerId: home.id };
    const released = resolveMatchAction(
      releaseState,
      {
        type: 'shot',
        actorId: home.id,
        intent: 'driven',
        contact: 'settled',
        target: { x: 105, y: 34 },
      },
      'human_selected',
    );
    expect(released.ball.shot?.releasedAt).toBe(99);
    const resolved = {
      ...structuredClone(regained),
      time: 103,
      lastShot: { ...released.ball.shot!, outcome: 'miss' as const },
    };
    tracker.observe(regained, resolved);
    expect(sum(tracker.snapshot().clocks.home.regainToShot)).toBe(0);
  });

  it('measures actual forward pass release geometry rather than a direct-pass label', () => {
    const testRelease = (targetX: number) => {
      const { tracker, regained, home, receiver } = trackerAfterRegain();
      regained.players.find((player) => player.id === receiver.id)!.position = {
        x: targetX,
        y: 34,
      };
      const released = resolveMatchAction(
        { ...regained, time: 103 },
        {
          type: 'pass',
          actorId: home.id,
          receiverId: receiver.id,
          intent: 'direct',
          target: { x: targetX, y: 34 },
        },
        'human_selected',
      );
      expect(released.lastPassDiagnostic?.releasedAt).toBe(103);
      tracker.observe(regained, released);
      return sum(tracker.snapshot().clocks.home.regainToProgression);
    };
    expect(testRelease(40)).toBe(0);
    expect(testRelease(60)).toBe(1);
  });

  it('closes an interrupted open-play loss before a restart recovery and later shot', () => {
    const { state, home, pressers } = fixture();
    const tracker = new ContactTacticalTracker();
    const lost = lose(state, pressers[0]!.id);
    tracker.observe(state, lost);
    const stoppage = { ...structuredClone(lost), time: 102, scenario: 'free_kick' as const };
    tracker.observe(lost, stoppage);
    const restored = regain(stoppage, home.id);
    restored.scenario = 'open_play';
    tracker.observe(stoppage, restored);
    restored.players.find((player) => player.id === home.id)!.position = { x: 94, y: 34 };
    restored.ball = { x: 94.4, y: 34, ownerId: home.id };
    const released = resolveMatchAction(
      { ...restored, time: 104 },
      {
        type: 'shot',
        actorId: home.id,
        intent: 'driven',
        contact: 'settled',
        target: { x: 105, y: 34 },
      },
      'human_selected',
    );
    tracker.observe(restored, released);
    const values = tracker.snapshot().clocks.home;
    expect(values.losses).toBe(1);
    expect(values.regains).toBe(0);
    expect(values.incompleteLosses).toBe(1);
    expect(sum(values.lossToRegain)).toBe(0);
    expect(sum(values.regainToShot)).toBe(0);
  });

  it('stops an already regained attack clock at a later interruption', () => {
    const { tracker, regained, home } = trackerAfterRegain();
    const stoppage = {
      ...structuredClone(regained),
      time: 103,
      scenario: 'free_kick' as const,
    };
    tracker.observe(regained, stoppage);
    const resumed = { ...structuredClone(stoppage), time: 104, scenario: 'open_play' as const };
    resumed.players.find((player) => player.id === home.id)!.position = { x: 94, y: 34 };
    resumed.ball = { x: 94.4, y: 34, ownerId: home.id };
    tracker.observe(stoppage, resumed);
    const released = resolveMatchAction(
      { ...resumed, time: 105 },
      {
        type: 'shot',
        actorId: home.id,
        intent: 'driven',
        contact: 'settled',
        target: { x: 105, y: 34 },
      },
      'human_selected',
    );
    tracker.observe(resumed, released);
    const values = tracker.snapshot().clocks.home;
    expect(values.regains).toBe(1);
    expect(values.censoredRegains).toBe(1);
    expect(sum(values.regainToShot)).toBe(0);
  });

  it('counts two simultaneous pressers once each despite nearest-player swaps', () => {
    const { state, pressers } = fixture();
    pressers.forEach((player) => {
      player.locomotionReason = 'press_commit';
    });
    state.nearestChallengerId = pressers[0]!.id;
    const tracker = new ContactTacticalTracker();
    let previous = state;
    for (let tick = 0; tick < 4; tick++) {
      const next = structuredClone(previous);
      next.time += 0.025;
      next.nearestChallengerId = pressers[(tick + 1) % 2]!.id;
      tracker.observe(previous, next);
      previous = next;
    }
    expect(sum(tracker.snapshot().pressureByThird)).toBe(2);
  });

  it('ongoing diagnostic snapshots do not split a continuous carrier episode', () => {
    const { state, home } = fixture();
    const tracker = new ContactTacticalTracker();
    const first = structuredClone(state);
    first.time += 0.025;
    first.players.find((player) => player.id === home.id)!.facingAngle += 0.6;
    tracker.observe(state, first);
    const firstSnapshot = tracker.snapshot(first);
    expect(tracker.snapshot(first)).toEqual(firstSnapshot);
    const second = structuredClone(first);
    second.time += 0.025;
    second.players.find((player) => player.id === home.id)!.facingAngle += 0.6;
    tracker.observe(first, second);
    const summary = tracker.snapshot(second);
    expect(summary.carrierEpisodes).toBe(1);
    expect(summary.rotationTraces).toHaveLength(1);
    expect(summary.rotationTraces[0]!.absoluteRotation).toBeCloseTo(1.2);
  });

  it('a pass after contact in the same pressure episode is not release-before-contact', () => {
    const { state, home, receiver, pressers } = fixture();
    const defender = pressers[0]!;
    defender.locomotionReason = 'press_commit';
    state.nearestChallengerId = defender.id;
    const tracker = new ContactTacticalTracker();
    const diagnostic: ChallengeDiagnostic = {
      id: 'pr158-body-contact',
      at: 100.025,
      actorId: defender.id,
      team: 'away',
      opponentId: home.id,
      technique: 'standing',
      source: 'autonomous_npc',
      position: { x: 50, y: 34 },
      outcome: 'beaten',
      ballFirst: false,
      opponentContact: true,
      ballDistance: 1,
      opponentDistance: 0.9,
      facingError: 0,
      relativeSpeed: 1,
      lateness: 0,
      force: 0.1,
      fromBehind: false,
    };
    const contacted = { ...structuredClone(state), time: 100.025, lastChallenge: diagnostic };
    tracker.observe(state, contacted);
    const released = resolveMatchAction(
      { ...contacted, time: 100.05 },
      {
        type: 'pass',
        actorId: home.id,
        receiverId: receiver.id,
        intent: 'support',
        target: { ...receiver.position },
      },
      'human_selected',
    );
    tracker.observe(contacted, released);
    expect(tracker.snapshot().releasesBeforeContact).toBe(0);
  });
});
