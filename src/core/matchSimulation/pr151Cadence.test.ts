// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import {
  MATCH_PRESENTATION_POLICIES,
  projectMatchMoment,
  shouldSurfaceMatchMoment,
} from './matchMoment';
import { projectIncomingPlayerInvolvement, projectPlayerAgency } from './playerDecision';
import { enumerateCanonicalShootingOptions } from './shootingOptions';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { resolveMatchAction } from './matchActions';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr151-cadence-context',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 20;
  state.actionCooldown = 0;
  for (const player of state.players) {
    player.position = { x: player.team === 'home' ? 15 : 95, y: 60 };
    player.velocity = { x: 0, y: 0 };
  }
  const actor = state.players.find(
    (p) => p.team === 'home' && p.profile.primaryPosition === 'central_midfielder',
  )!;
  actor.position = { x: 40, y: 34 };
  actor.facingAngle = Math.PI / 2;
  state.controlledFootballerId = actor.id;
  const passer = state.players.find((p) => p.team === actor.team && p.id !== actor.id)!;
  state.ball = {
    x: 32,
    y: 34,
    target: actor.position,
    from: { x: 15, y: 34 },
    velocity: { x: 10, y: 0 },
    travelKind: 'long_distribution',
    sourceAction: 'pass',
    intendedReceiverId: actor.id,
    lastTouchPlayerId: passer.id,
  };
  state.possessionTeam = actor.team;
  return { state, actor };
};

const shotFlight = (expectation: number): TacticalMatchState => {
  const { state, actor } = fixture();
  state.ball = {
    x: 92,
    y: 34,
    travelKind: 'shot',
    velocity: { x: 20, y: 0 },
    shot: {
      shotId: 'cadence-shot',
      shooterId: actor.id,
      context: 'open_play',
      distance: 13,
      angle: 1,
      pressure: 0,
      blockingDefenders: 0,
      baseXg: expectation,
      effectiveScoringExpectation: expectation,
      shooterExecutionQuality: 0.8,
      intendedTarget: { horizontal: 0, vertical: 0.3 },
      actualTarget: { horizontal: 0, vertical: 0.3 },
      error: { horizontal: 0, vertical: 0 },
      speed: 20,
      classification: 'on_target',
    },
  };
  return state;
};

describe('PR151 sparse episode entry with continuous human agency', () => {
  it('keeps an unpressured long distribution in safe midfield autonomous', () => {
    const { state, actor } = fixture();
    expect(projectIncomingPlayerInvolvement(state, actor.id)).toMatchObject({
      important: false,
      relevant: false,
    });
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
    state.ball.travelKind = 'through_ball';
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(true);
    expect(projectPlayerAgency(state).opportunity?.kind).toBe('incoming_ball');
  });

  it('retains an advanced or tightly pressured long reception as a human choice', () => {
    const { state, actor } = fixture();
    const foe = state.players.find((p) => p.team !== actor.team)!;
    foe.position = { x: actor.position.x + 2, y: actor.position.y };
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(true);
    foe.position = { x: 95, y: 60 };
    actor.position = { x: 78, y: 34 };
    state.ball = { ...state.ball, x: 70, target: actor.position };
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(true);
  });

  it('does not open an episode merely because a speculative first-time shot is physically legal', () => {
    const { state, actor } = fixture();
    actor.position = { x: 77, y: 34 };
    actor.profile = {
      ...actor.profile,
      attributes: { ...actor.profile.attributes, finishing: 5, technique: 5, composure: 5 },
    };
    const keeper = state.players.find(
      (p) => p.team !== actor.team && p.profile.primaryPosition === 'goalkeeper',
    )!;
    keeper.position = { x: 105, y: 34 };
    state.ball = {
      ...state.ball,
      x: 76.5,
      target: { x: 85, y: 34 },
      travelKind: 'pass',
      height: 0.11,
    };
    expect(enumerateCanonicalShootingOptions(state, actor.id).length).toBeGreaterThan(0);
    expect(['speculative', 'non_viable']).toContain(
      evaluateShootingOpportunity(state, actor).category,
    );
    expect(projectIncomingPlayerInvolvement(state, actor.id).reasons).not.toContain(
      'first_time_finishing_choice',
    );
  });

  it('filters low-value NPC shot episodes but retains high-value chances and every controlled shot', () => {
    const low = shotFlight(0.03);
    delete low.controlledFootballerId;
    const lowMoment = projectMatchMoment(low, null);
    expect(shouldSurfaceMatchMoment(lowMoment, MATCH_PRESENTATION_POLICIES.key_player)).toBe(false);
    expect(
      shouldSurfaceMatchMoment(
        projectMatchMoment(shotFlight(0.03), null),
        MATCH_PRESENTATION_POLICIES.key_player,
      ),
    ).toBe(true);
    const high = shotFlight(0.24);
    delete high.controlledFootballerId;
    expect(
      shouldSurfaceMatchMoment(
        projectMatchMoment(high, null),
        MATCH_PRESENTATION_POLICIES.key_player,
      ),
    ).toBe(true);
    expect(shouldSurfaceMatchMoment(lowMoment, MATCH_PRESENTATION_POLICIES.player_extended)).toBe(
      true,
    );
  });

  it('restores human control at a selected carry waypoint even in a low-value zone', () => {
    const { state, actor } = fixture();
    state.ball = { ...actor.position, ownerId: actor.id };
    state.ballOwnershipStartedAt = state.time;
    const carried = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: { x: 48, y: 34 } },
      'human_selected',
    );
    const waypoint = {
      ...carried,
      time: carried.time + 2,
      actionCooldown: 0,
      players: carried.players.map((p) =>
        p.id === actor.id ? { ...p, position: { x: 47.5, y: 34 } } : p,
      ),
      ball: { ...carried.ball, x: 47.5, y: 34 },
    };
    const decision = projectPlayerAgency(waypoint).opportunity;
    expect(decision?.triggerReason).toBe('carry_decision_waypoint');
    expect(
      shouldSurfaceMatchMoment(
        projectMatchMoment(waypoint, decision),
        MATCH_PRESENTATION_POLICIES.key_player,
      ),
    ).toBe(true);
  });
});
