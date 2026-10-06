import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  deriveCooperativePress,
  isDefensiveEpisodeLocked,
  protectedPressReceiver,
} from './defensiveChallenges';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { deriveOnBallPreparation } from './onBallPreparation';
import { distance, type TeamSide } from './matchSpace';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const shieldFixture = (side: TeamSide = 'home') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr151-physical-pincer',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  delete state.planningSchedule;
  state.scenario = 'open_play';
  state.time = 10;
  state.actionCooldown = 20;
  const carrier = state.players.find(
    (p) => p.team === side && p.profile.primaryPosition === 'striker',
  )!;
  const defenders = state.players.filter(
    (p) => p.team !== side && p.profile.primaryPosition !== 'goalkeeper',
  );
  const primary = defenders[0]!,
    secondary = defenders[1]!,
    cover = defenders[2]!;
  const dir = side === 'home' ? 1 : -1;
  const x = side === 'home' ? 85 : 20;
  for (const [index, player] of state.players.entries()) {
    player.profile = { ...player.profile, attributes: { ...player.profile.attributes } };
    player.position = {
      x: (side === 'home' ? 5 : 75) + (index % 5) * 4,
      y: 40 + Math.floor(index / 5) * 5,
    };
    player.velocity = { x: 0, y: 0 };
    Object.assign(player.profile.attributes, {
      positioning: 100,
      concentration: 100,
      gameReading: 100,
      aggression: 20,
      composure: 100,
      tackling: 80,
      agility: 70,
    });
  }
  carrier.position = { x, y: 9 };
  primary.position = { x: x + dir * 2.3, y: 9 };
  secondary.position = { x: x + dir * 1.1, y: 10.25 };
  cover.position = { x: x + dir * 11, y: 30 };
  for (const player of state.players) {
    player.target = { ...player.position };
    player.idealTarget = { ...player.position };
    player.facingAngle = (-dir * Math.PI) / 2;
  }
  state.ball = { x: x - dir * 0.38, y: 9, ownerId: carrier.id, lastTouchPlayerId: carrier.id };
  state.possessionTeam = side;
  state.currentPressure = 0.9;
  state.currentAction = { type: 'hold', actorId: carrier.id };
  state.onBallPreparation = deriveOnBallPreparation(state, carrier);
  state.onBallPreparation.gainedAt = 0;
  state.onBallPreparation.readyAt = 0.2;
  state.nearestChallengerId = primary.id;
  state.defensiveEpisodes = [
    {
      participants: [primary.id, carrier.id],
      ballEpisode: state.ballEpisode ?? 0,
      resolvedAt: 9,
      position: { ...carrier.position },
    },
  ];
  return {
    state,
    carrierId: carrier.id,
    primaryId: primary.id,
    secondaryId: secondary.id,
    coverId: cover.id,
  };
};

const runShield = (initial: TacticalMatchState) => {
  let state = initial;
  const attempts = new Set<string>();
  let abandonedDangerousMark = false;
  let maximumStep = 0;
  for (let tick = 0; tick < 8 / FIXED_MATCH_DT; tick++) {
    const previous = state;
    state = stepTacticalMatchAfterDecisionProbe(state);
    for (const player of state.players.filter((p) => distance(p.position, state.ball) < 15))
      maximumStep = Math.max(
        maximumStep,
        distance(player.position, previous.players.find((p) => p.id === player.id)!.position),
      );
    if (state.defensiveChallenge) attempts.add(state.defensiveChallenge.actorId);
    if (state.lastChallenge) {
      attempts.add(state.lastChallenge.actorId);
      if (state.lastChallenge.id !== previous.lastChallenge?.id) {
        const challenger = previous.players.find((p) => p.id === state.lastChallenge!.actorId)!;
        if (protectedPressReceiver(previous, challenger)) abandonedDangerousMark = true;
      }
    }
    if (state.ball.ownerId !== initial.ball.ownerId) break;
  }
  return { state, attempts, maximumStep, abandonedDangerousMark };
};

describe('PR151 cooperative physical engagement', () => {
  it.each(['home', 'away'] as const)(
    'turns a safe %s double press into canonical contact against prolonged shielding',
    (side) => {
      const f = shieldFixture(side);
      expect(isDefensiveEpisodeLocked(f.state, f.primaryId, f.carrierId)).toBe(true);
      expect(deriveCooperativePress(f.state, side === 'home' ? 'away' : 'home')?.secondaryId).toBe(
        f.secondaryId,
      );
      const result = runShield(f.state);
      expect(result.attempts.has(f.secondaryId)).toBe(true);
      expect(result.attempts.has(f.primaryId)).toBe(false);
      expect(result.state.defensiveTelemetry?.highRiskIntents ?? 0).toBe(0);
      expect(result.state.defensiveTelemetry?.fouls ?? 0).toBe(0);
      expect(result.state.lastChallenge?.technique).toBe('standing');
      expect(result.state.lastChallenge?.fromBehind).toBe(false);
      expect(result.state.lastChallenge?.ballDistance).toBeLessThanOrEqual(0.95);
      expect(result.maximumStep).toBeLessThan(0.25);
      expect(runShield(structuredClone(shieldFixture(side).state))).toEqual(result);
    },
  );

  it('lets a safety-vetted partner access the ball while the nearest body remains locked', () => {
    const f = shieldFixture();
    const owner = f.state.players.find((p) => p.id === f.carrierId)!;
    const primary = f.state.players.find((p) => p.id === f.primaryId)!;
    const secondary = f.state.players.find((p) => p.id === f.secondaryId)!;
    primary.position = { x: owner.position.x + 0.75, y: owner.position.y };
    secondary.position = { x: owner.position.x - 1.15, y: owner.position.y };
    secondary.facingAngle = Math.PI / 2;
    primary.target = { ...primary.position };
    secondary.target = { ...secondary.position };
    const next = stepTacticalMatchAfterDecisionProbe(f.state);
    expect(next.defensiveTelemetry?.byPlayer[f.secondaryId]?.attempted).toBe(1);
    expect(next.defensiveTelemetry?.byPlayer[f.primaryId]?.attempted ?? 0).toBe(0);
  });

  it('closes the primary screen through ordinary containment when it initially stands farther away', () => {
    const f = shieldFixture();
    delete f.state.defensiveEpisodes;
    const primary = f.state.players.find((p) => p.id === f.primaryId)!;
    primary.position = { x: 88, y: 9 };
    primary.target = { ...primary.position };
    const result = runShield(f.state);
    expect(result.attempts.size).toBeGreaterThan(0);
    expect(result.state.defensiveTelemetry?.highRiskIntents ?? 0).toBe(0);
    expect(result.state.defensiveTelemetry?.fouls ?? 0).toBe(0);
  });

  it('preserves central cover behind a wide carrier using the line toward the goal centre', () => {
    const f = shieldFixture();
    const cover = f.state.players.find((p) => p.id === f.coverId)!;
    cover.position = { x: 83.5, y: 30 };
    const press = deriveCooperativePress(f.state, 'away');
    expect(cover.position.x).toBeLessThan(f.state.ball.x);
    expect(press?.secondaryId).toBe(f.secondaryId);
    expect(press?.coverIds).toContain(f.coverId);
  });

  it('keeps ordinary central scanning contained while deliberate retention and remembered pressure can recruit support', () => {
    const f = shieldFixture();
    delete f.state.currentAction;
    delete f.state.onBallPreparation;
    const owner = f.state.players.find((p) => p.id === f.carrierId)!;
    owner.position = { x: 40, y: 34 };
    f.state.ball = { ...owner.position, ownerId: owner.id };
    f.state.players.find((p) => p.id === f.primaryId)!.position = { x: 42.3, y: 34 };
    f.state.players.find((p) => p.id === f.secondaryId)!.position = { x: 45, y: 37 };
    f.state.players.find((p) => p.id === f.coverId)!.position = { x: 55, y: 34 };
    f.state.defensiveEpisodes = [];
    expect(deriveCooperativePress(f.state, 'away')).toBeUndefined();
    f.state.currentAction = { type: 'hold', actorId: owner.id };
    expect(deriveCooperativePress(f.state, 'away')?.secondaryId).toBe(f.secondaryId);
    delete f.state.currentAction;
    f.state.teams.away.threatMemory!.response.doublePress = 0.3;
    expect(deriveCooperativePress(f.state, 'away')?.secondaryId).toBe(f.secondaryId);
  });

  it('keeps the secondary on a dangerous receiver when its mark cannot be inherited', () => {
    const f = shieldFixture();
    const receiver = f.state.players.find(
      (p) =>
        p.team === 'home' && p.id !== f.carrierId && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.position = { x: 86, y: 14 };
    // Preserve the dangerous mark throughout this fixture; support movement otherwise
    // legitimately opens a handoff and changes the initial no-inheritance geometry.
    f.state.playerMovementIntent = {
      actorId: receiver.id,
      type: 'hold_shape',
      target: { ...receiver.position },
      startedAt: 10,
      expiresAt: 19,
    };
    expect(deriveCooperativePress(f.state, 'away')).toBeUndefined();
    expect(
      protectedPressReceiver(f.state, f.state.players.find((p) => p.id === f.secondaryId)!),
    ).toBe(receiver);
    // Dynamic support can make a later handoff safe. Every actual contact must still
    // preserve coverage in its own pre-contact geometry, rather than freezing the XI.
    expect(runShield(f.state).abandonedDangerousMark).toBe(false);
  });

  it('recruits a fresh safe player after the earlier secondary already joined the same possession duel', () => {
    const f = shieldFixture();
    f.state.defensiveEpisodes!.push({
      participants: [f.secondaryId, f.carrierId],
      ballEpisode: f.state.ballEpisode ?? 0,
      resolvedAt: 9.5,
      position: { x: 85, y: 9 },
    });
    const fresh = f.state.players.find(
      (p) =>
        p.team === 'away' &&
        ![f.primaryId, f.secondaryId, f.coverId].includes(p.id) &&
        p.profile.primaryPosition !== 'goalkeeper',
    )!;
    fresh.position = { x: 85.8, y: 5 };
    expect(isDefensiveEpisodeLocked(f.state, f.secondaryId, f.carrierId)).toBe(true);
    expect(deriveCooperativePress(f.state, 'away')?.secondaryId).toBe(fresh.id);
    expect(isDefensiveEpisodeLocked(f.state, f.primaryId, f.carrierId)).toBe(true);
  });
});
