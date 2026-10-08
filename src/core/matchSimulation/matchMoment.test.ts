import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  MATCH_PRESENTATION_POLICIES,
  createTacticalMatch,
  projectMatchMoment,
  shouldSurfaceMatchMoment,
  projectPlayerAgency,
  stepTacticalMatchAfterDecisionProbe,
  FIXED_MATCH_DT,
} from '.';

const world = createCanonicalWorldDatabase();
const createState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'match-moment-foundation',
      control: { mode: 'spectator' },
    }),
  );

describe('pure match moment projection', () => {
  it('reuses exact negative agency probes without changing the projected moment', () => {
    let state = createState();
    for (let tick = 0; tick < 120; tick++) {
      const evaluation = projectPlayerAgency(state);
      expect(projectMatchMoment(state, evaluation.opportunity ?? null)).toEqual(
        projectMatchMoment(state),
      );
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    }
  });

  it('reuses positive and negative agency probes for the same controlled-player state', () => {
    const state = createState();
    const actor = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    state.controlledFootballerId = actor.id;
    // A credible close-range shot makes this an actual agency opportunity.
    actor.position = { x: 94, y: 34 };
    state.ball = { ...actor.position, ownerId: actor.id };
    state.possessionTeam = actor.team;
    state.players.find(
      (player) => player.team !== actor.team && player.profile.primaryPosition === 'goalkeeper',
    )!.position = {
      x: 103,
      y: 34,
    };
    state.players.find(
      (player) => player.team !== actor.team && player.profile.primaryPosition !== 'goalkeeper',
    )!.position = {
      x: 92.5,
      y: 34,
    };

    const decisionSnapshot = structuredClone(state);
    const positive = projectPlayerAgency(state);
    expect(positive.opportunity?.kind).toBe('on_ball');
    const decisionMoment = projectMatchMoment(state, positive.opportunity ?? null);
    expect(decisionMoment).toEqual(projectMatchMoment(state));
    expect(decisionMoment.requiresHumanDecision).toBe(true);
    expect(state).toEqual(decisionSnapshot);

    actor.position = { x: 51, y: 8 };
    state.ball = { ...actor.position, ownerId: actor.id };
    state.actionCooldown = 0;
    for (const opponent of state.players.filter((player) => player.team !== actor.team))
      opponent.position = { x: 36, y: 50 };
    const routineSnapshot = structuredClone(state);
    const negative = projectPlayerAgency(state);
    expect(negative.opportunity).toBeUndefined();
    expect(negative.probe.blockedReason).toBe('routine');
    const routineMoment = projectMatchMoment(state, negative.opportunity ?? null);
    expect(routineMoment).toEqual(projectMatchMoment(state));
    expect(routineMoment.requiresHumanDecision).toBe(false);
    expect(state).toEqual(routineSnapshot);
  });

  it('keeps routine midfield circulation low and is side-effect free', () => {
    const state = createState();
    const before = structuredClone(state);
    const first = projectMatchMoment(state);
    const second = projectMatchMoment(state);
    expect(first).toEqual(second);
    expect(first.kind).toBe('routine');
    expect(first.importance).toBeLessThan(0.2);
    expect(state).toEqual(before);
  });

  it('surfaces a shot without requiring controlled-player involvement', () => {
    const state = createState();
    const shooter = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
    )!;
    const { ownerId: _ownerId, ...releasedBall } = state.ball;
    void _ownerId;
    state.ball = {
      ...releasedBall,
      travelKind: 'shot',
      velocity: { x: 20, y: 0, z: 1 },
      shot: {
        shotId: 'moment-shot',
        shooterId: shooter.id,
        context: 'open_play',
        distance: 25,
        angle: 1,
        pressure: 0,
        blockingDefenders: 0,
        baseXg: 0.1,
        effectiveScoringExpectation: 0.1,
        shooterExecutionQuality: 0.8,
        intendedTarget: { horizontal: 0, vertical: 0.3 },
        actualTarget: { horizontal: 0, vertical: 0.3 },
        error: { horizontal: 0, vertical: 0 },
        speed: 20,
        classification: 'on_target',
      },
    };
    const moment = projectMatchMoment(state);
    expect(moment.kind).toBe('shot');
    expect(moment.importance).toBeGreaterThanOrEqual(0.86);
    expect(shouldSurfaceMatchMoment(moment, MATCH_PRESENTATION_POLICIES.key_match)).toBe(true);
  });

  it('treats penalties as very important and ordinary throw-ins as routine', () => {
    const penalty = createState();
    penalty.scenario = 'penalty';
    expect(projectMatchMoment(penalty)).toMatchObject({ kind: 'penalty', importance: 0.98 });
    const throwIn = createState();
    throwIn.scenario = 'throw_in';
    expect(projectMatchMoment(throwIn).kind).toBe('routine');
  });
});
