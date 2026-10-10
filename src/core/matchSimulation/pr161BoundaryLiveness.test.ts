// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createBoundaryFixture } from '../../../scripts/pr161BoundaryFixture';
import {
  deriveLooseBallAssignments,
  evaluateGlobalBallRace,
  predictLooseBallIntercept,
} from './looseBallPhysics';
import { FIXED_MATCH_DT, stepTacticalMatch } from './matchSimulation';
import { findPitchBoundaryCrossing, isBallWithinPlayingBoundary } from './pitchBoundary';
import { playerContactGeometry } from './ballContactGeometry';
import { distance } from './matchSpace';
import { observeLooseBallLiveness, looseBallLivenessDiagnosticSchema } from './looseBallLiveness';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { RandomGenerator } from '../random/RandomGenerator';

const recover = (initial: TacticalMatchState, ticks = 400) => {
  let state = initial;
  for (let tick = 0; tick < ticks && !state.ball.ownerId; tick++) {
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(state.scenario).toBe('open_play');
    expect(state.lastBoundaryRestart).toBeUndefined();
  }
  const actor = state.players.find((player) => player.id === state.ball.ownerId);
  expect(
    actor,
    `No physical recovery at ${state.time}; ball ${JSON.stringify(state.ball)}`,
  ).toBeDefined();
  const geometry = playerContactGeometry(actor!);
  expect(
    Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball)),
  ).toBeLessThanOrEqual(geometry.footReach);
  expect(state.statistics?.players.find((entry) => entry.playerId === actor!.id)?.touches).toBe(1);
  const parsed = tacticalMatchStateSchema.safeParse(state);
  expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(
    true,
  );
  return state;
};

describe('PR161 boundary-ball liveness reference lab-mv2640wz', () => {
  it('pursues a stationary legal ball partly beyond the painted touchline and physically recovers it', () => {
    let state = createBoundaryFixture();
    expect(findPitchBoundaryCrossing(state.ball, state.ball)).toBeUndefined();
    expect(deriveLooseBallAssignments(state).length).toBeGreaterThan(0);
    expect(evaluateGlobalBallRace(state).length).toBeGreaterThan(0);
    const before = structuredClone(state.ball);
    const assignment = deriveLooseBallAssignments(state)[0]!;
    expect(assignment.target).toEqual({ x: state.ball.x, y: 0.4 });
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.ball).toMatchObject({ x: before.x, y: before.y, velocity: before.velocity }); // The approach conversion cannot move the ball.
    expect(next.ball.ownerId).toBeUndefined();
    state = recover(next);
    expect(state.time - 439).toBeLessThan(2);
    expect(state.lastBoundaryRestart).toBeUndefined();
    for (let tick = 0; tick < 80; tick++) state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(state.contactControlTelemetry?.physicalContacts).toBeGreaterThan(1);
    expect(
      state.statistics?.players.find((entry) => entry.playerId === state.ball.ownerId)?.touches,
    ).toBe(1);
  });

  it.each([
    ['wholly inside', { x: 45.0816, y: 0.25 }, { x: 0, y: 0 }],
    ['top touchline', { x: 45.0816, y: -0.1 }, { x: 0, y: 0 }],
    ['bottom touchline', { x: 45.0816, y: 68.1 }, { x: 0, y: 0 }],
    ['slow tangential movement', { x: 45.0816, y: -0.0324 }, { x: 0.45, y: 0 }],
    ['approaching corner', { x: 104.8, y: -0.0324 }, { x: 0.4, y: 0 }],
  ] as const)('recovers a legal ball: %s', (_label, point, velocity) => {
    const state = createBoundaryFixture(point, velocity);
    expect(isBallWithinPlayingBoundary(state.ball)).toBe(true);
    expect(predictLooseBallIntercept(state.ball, velocity, state.players[1]!)).toMatchObject({
      kind: 'in_play',
    });
    expect(deriveLooseBallAssignments(state).length).toBeGreaterThan(0);
    recover(state);
  });

  it('recovers after an actual finite-contact control failure without retaining the old contact plan', () => {
    let state = createBoundaryFixture();
    const actor = state.players.find((player) => player.id === state.ball.lastTouchPlayerId)!;
    actor.position = { x: state.ball.x - 2.8, y: 0.4 };
    actor.target = { ...actor.position };
    state.ball.ownerId = actor.id;
    delete state.ball.looseSince;
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(state.ball.ownerId).toBeUndefined();
    expect(state.pendingPossessionLoss?.cause).toBe('failed_control');
    expect(state.controlledBallContact).toBeUndefined();
    expect(state.contactControlTelemetry?.failedControls).toBe(1);
    recover(state);
  });

  it('recovers a second ball after a recorded defender deflection at the touchline', () => {
    const state = createBoundaryFixture(undefined, { x: 0.3, y: 0 });
    const defender = state.players.find(
      (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
    )!;
    state.lastBallContact = {
      kind: 'defender',
      playerId: defender.id,
      point: { x: state.ball.x, y: state.ball.y, z: 0 },
      at: state.time - 1,
      segmentFraction: 0.5,
      preContactSpeed: 2,
      postContactSpeed: 0.3,
    };
    state.ball.lastTouchPlayerId = defender.id;
    state.ballEpisode = 4;
    const next = recover(state);
    expect(next.ballEpisode).toBe(4);
  });

  it('credits the physically reachable claimant when multiple players can contest a legal boundary ball', () => {
    const state = createBoundaryFixture();
    const actor = state.players.find((player) => player.id === state.ball.lastTouchPlayerId)!;
    const rival = state.players.find(
      (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
    )!;
    actor.position = { x: state.ball.x - 1.2, y: 0.4 };
    actor.target = { ...actor.position };
    rival.position = { x: state.ball.x + 1.2, y: 0.4 };
    rival.target = { ...rival.position };
    rival.facingAngle = -Math.PI / 2;
    const next = recover(state);
    expect([actor.id, rival.id]).toContain(next.ball.ownerId);
  });

  it('reaches with a real foot while the pursuing body remains constrained by the pitch edge', () => {
    const state = createBoundaryFixture({ x: 45.0816, y: -0.105 });
    const actor = state.players.find((player) => player.id === state.ball.lastTouchPlayerId)!;
    actor.position = { x: state.ball.x - 2, y: 0.4 };
    actor.target = { ...actor.position };
    actor.facingAngle = Math.PI / 2;
    const next = recover(state);
    expect(
      next.players.find((player) => player.id === next.ball.ownerId)!.position.y,
    ).toBeGreaterThanOrEqual(0.4);
  });

  it.each([
    ['top', { x: 45.0816, y: -0.12 }],
    ['bottom', { x: 45.0816, y: 68.12 }],
  ] as const)(
    'awards a fully crossed %s throw-in, physically executes it and returns to open play',
    (_label, point) => {
      let state = createBoundaryFixture(point);
      expect(isBallWithinPlayingBoundary(state.ball)).toBe(false);
      expect(deriveLooseBallAssignments(state)).toEqual([]);
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      expect(state.scenario).toBe('throw_in');
      expect(state.restart).toMatchObject({
        origin: 'live_event',
        phase: 'preparing',
        restartTeam: 'away',
      });
      expect(state.restart?.spot).toEqual({ x: point.x, y: _label === 'top' ? 0 : 68 });
      expect(state.ball.ownerId).toBeUndefined();
      const awardId = state.restart!.awardId;
      let released = false;
      for (let tick = 0; tick < 2400 && (!released || !state.ball.ownerId); tick++) {
        state = stepTacticalMatch(state, FIXED_MATCH_DT);
        released ||= Boolean(
          state.throwInRestriction?.releasedAt ||
            state.stoppageLedger?.intervals.some(
              (interval) => interval.incidentId === awardId && interval.endReason === 'execution',
            ),
        );
      }
      expect(released).toBe(true);
      expect(state.scenario).toBe('open_play');
      expect(state.ball.ownerId).toBeDefined();
      expect(state.statistics?.teamAccounting?.away.throwIns).toBe(1);
      expect(state.lastPassDiagnostic?.passerId).toBeDefined();
    },
  );

  it('keeps exact trailing-edge contact in play and identifies a genuine goal-line departure near a corner', () => {
    expect(findPitchBoundaryCrossing({ x: 45, y: 0 }, { x: 45, y: -0.11 })).toBeUndefined();
    const state = stepTacticalMatch(
      createBoundaryFixture({ x: 105.12, y: -0.0324 }),
      FIXED_MATCH_DT,
    );
    expect(state.lastBoundaryCrossing).toMatchObject({
      boundary: 'goal_line_away',
      point: { x: 105, y: 0 },
    });
    expect(state.scenario).toBe('goal_kick');
  });
});

describe('PR161 bounded loose-ball observer', () => {
  it('samples at 1 Hz, emits bounded diagnostics and leaves football, RNG and the input untouched', () => {
    const initial = createBoundaryFixture();
    const snapshot = structuredClone(initial);
    const random = vi.spyOn(RandomGenerator.prototype, 'float');
    try {
      let observed = observeLooseBallLiveness(initial);
      expect(
        observeLooseBallLiveness({ ...observed, time: observed.time + 0.5 })
          .looseBallLivenessObservation,
      ).toBe(observed.looseBallLivenessObservation);
      for (let index = 1; index <= 35; index++)
        observed = observeLooseBallLiveness({ ...observed, time: initial.time + index * 30 });
      expect(observed.looseBallLivenessDiagnostics).toHaveLength(32);
      expect(observed.looseBallLivenessDiagnostics![0]!.actors.length).toBeLessThanOrEqual(8);
      expect(
        observed.looseBallLivenessDiagnostics!.every(
          (diagnostic) => looseBallLivenessDiagnosticSchema.safeParse(diagnostic).success,
        ),
      ).toBe(true);
      expect(observed.looseBallLivenessDiagnostics!.at(-1)).toMatchObject({
        classification: 'legal_unresolved',
        ball: { x: 45.0816, y: -0.0324, radius: 0.11 },
      });
      expect(observed.ball).toEqual(initial.ball);
      expect(observed.players).toEqual(initial.players);
      expect(observed.statistics).toEqual(initial.statistics);
      expect(initial).toEqual(snapshot);
      expect(random).not.toHaveBeenCalled();
      const resolved = observeLooseBallLiveness({
        ...observed,
        ball: { ...observed.ball, ownerId: initial.ball.lastTouchPlayerId! },
      });
      expect(resolved.looseBallLivenessObservation).toBeUndefined();
      expect(resolved.looseBallLivenessDiagnostics).toEqual(observed.looseBallLivenessDiagnostics);
    } finally {
      random.mockRestore();
    }
  });

  it('does not diagnose a legitimate wholly out-of-play ball as legal unresolved football', () => {
    const state = createBoundaryFixture({ x: 45, y: -0.12 });
    expect(observeLooseBallLiveness(state)).toBe(state);
  });
});
