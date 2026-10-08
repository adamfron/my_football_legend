// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatch, FIXED_MATCH_DT } from './matchSimulation';
import {
  beginDefensiveChallenge,
  derivePressingPlan,
  pressingPlanSchema,
  resolveDefensiveChallenge,
  chooseNpcDefensiveChallengeAction,
} from './defensiveChallenges';
import { deriveOnBallPreparation } from './onBallPreparation';
import { deriveBuildUpSupport, deriveTacticalTargets } from './tacticalPositioning';
import { deriveCarryExecution } from './carryExecution';
import { distance } from './matchSpace';
import { deriveMovementCapability } from './locomotion';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr157-press') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 600;
  state.actionCooldown = 20;
  const carrierId = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!.id;
  const defenderId = state.players.find(
    (p) => p.team === 'away' && p.slot.position === 'center_back',
  )!.id;
  state.players.forEach((p, index) => {
    p.profile = {
      ...p.profile,
      attributes: {
        ...p.profile.attributes,
        aggression: 60,
        tackling: 60,
        gameReading: 60,
        positioning: 60,
        composure: 60,
        strength: 60,
        pace: 60,
        agility: 60,
        dribbling: 60,
        technique: 60,
      },
    };
    p.position = {
      x: p.team === 'home' ? 34 - (index % 3) * 4 : 74 + (index % 3) * 4,
      y: 7 + (index % 10) * 5.5,
    };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  const carrier = state.players.find((p) => p.id === carrierId)!;
  const defender = state.players.find((p) => p.id === defenderId)!;
  carrier.position = { x: 52, y: 34 };
  carrier.target = { ...carrier.position };
  carrier.facingAngle = Math.PI / 2;
  defender.position = { x: 57, y: 34 };
  defender.anchor = { ...defender.position };
  defender.target = { ...defender.position };
  defender.facingAngle = -Math.PI / 2;
  state.players
    .filter((p) => p.team === 'away' && p.id !== defender.id && p.slot.position !== 'goalkeeper')
    .slice(0, 3)
    .forEach((p, i) => {
      p.position = { x: 62 + i * 3, y: 27 + i * 7 };
    });
  state.ball = { x: 52.45, y: 34, ownerId: carrier.id };
  state.possessionTeam = 'home';
  state.currentPressure = 0.5;
  state.nearestChallengerId = defender.id;
  state.teams.home.phase = 'positional_attack';
  state.teams.away.phase = 'defensive_block';
  state.onBallPreparation = deriveOnBallPreparation(state, carrier, 'clean_control');
  return { state, carrier, defender };
};

describe('PR157 continuous pressing, risk and physical carrier response', () => {
  it('isolates aggression commitment and makes a booking a contextual risk shift', () => {
    const { state, defender } = fixture();
    defender.profile.attributes.aggression = 30;
    const cautious = derivePressingPlan(state, defender.id, null)!;
    defender.profile.attributes.aggression = 90;
    const aggressive = derivePressingPlan(state, defender.id, null)!;
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    const booked = derivePressingPlan(state, defender.id, null)!;
    expect(pressingPlanSchema.safeParse(aggressive).success).toBe(true);
    expect(cautious.intention).toBe('contain');
    expect(aggressive.intention).toBe('engage');
    expect(aggressive.commitment).toBeGreaterThan(cautious.commitment + 0.3);
    expect(booked.commitment).toBeLessThan(aggressive.commitment);
    expect(booked.commitment).toBeGreaterThan(cautious.commitment);
    const carrier = state.players.find((p) => p.id === state.ball.ownerId)!;
    carrier.position.x = 91;
    state.ball.x = 91.45;
    state.players
      .filter((p) => p.team === defender.team && p.id !== defender.id)
      .forEach((p) => {
        p.position.x = 60;
      });
    defender.position = { x: 92.15, y: 34 };
    defender.profile.attributes.aggression = 100;
    state.time = 83 * 60;
    state.score = { home: 1, away: 0 };
    expect(['engage', 'emergency']).toContain(
      derivePressingPlan(state, defender.id, null)!.intention,
    );
  });
  it('aggression does not improve identical physical contact; tackling independently improves outcomes', () => {
    const tallies = { weak: 0, elite: 0 };
    for (let seed = 0; seed < 96; seed++) {
      const { state, carrier, defender } = fixture(`pr157-fixed-contact-${seed}`);
      defender.position = { x: 53.15, y: 34 };
      const action = {
        type: 'challenge' as const,
        actorId: defender.id,
        opponentId: carrier.id,
        technique: 'standing' as const,
      };
      defender.profile.attributes.aggression = 10;
      const low = resolveDefensiveChallenge(
        beginDefensiveChallenge(state, action, 'autonomous_npc'),
      ).diagnostic;
      defender.profile.attributes.aggression = 100;
      expect(
        resolveDefensiveChallenge(beginDefensiveChallenge(state, action, 'autonomous_npc'))
          .diagnostic,
      ).toEqual(low);
      for (const [key, tackling] of [
        ['weak', 10],
        ['elite', 100],
      ] as const) {
        defender.profile.attributes.tackling = tackling;
        const outcome = resolveDefensiveChallenge(
          beginDefensiveChallenge(state, action, 'autonomous_npc'),
        ).diagnostic!.outcome;
        tallies[key] += outcome === 'clean_win' || outcome === 'loose_ball' ? 1 : 0;
      }
    }
    expect(tallies.elite).toBeGreaterThan(tallies.weak + 15);
  });
  it('safe cover permits engagement, poor cover delays, and immediate danger justifies risk', () => {
    const { state, carrier, defender } = fixture();
    const covered = derivePressingPlan(state, defender.id, null)!;
    expect(covered.intention).toBe('engage');
    state.players
      .filter((p) => p.team === defender.team && p.id !== defender.id)
      .forEach((p) => {
        p.position = { x: 28, y: 62 };
      });
    const exposed = derivePressingPlan(state, defender.id, null)!;
    expect(exposed.intention).toBe('contain');
    expect(exposed.commitment).toBeLessThan(covered.commitment);
    carrier.position = { x: 87, y: 34 };
    state.ball = { x: 87.45, y: 34, ownerId: carrier.id };
    defender.position = { x: 88.15, y: 34 };
    const emergency = derivePressingPlan(state, defender.id, null)!;
    expect(['engage', 'emergency']).toContain(emergency.intention);
    expect(emergency.commitment).toBeGreaterThan(exposed.commitment);
  });
  it.each([false, true])(
    'a cautious defender closes immediate goal danger when booked=%s but retains safe contact selection',
    (booked) => {
      const { state, carrier, defender } = fixture();
      defender.profile.attributes.aggression = 30;
      state.players
        .filter((p) => p.team === defender.team && p.id !== defender.id)
        .forEach((p) => {
          p.position = { x: 28, y: 62 };
        });
      carrier.position = { x: 91, y: 34 };
      defender.position = { x: 92.15, y: 34 };
      state.ball = { x: 91.45, y: 34, ownerId: carrier.id };
      if (booked)
        state.discipline = {
          [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team },
        };
      const plan = derivePressingPlan(state, defender.id, null)!;
      expect(plan.intention).toBe('engage');
      expect(distance(plan.target, state.ball)).toBeLessThan(0.95);
      expect(chooseNpcDefensiveChallengeAction(state, defender.id, null)?.technique).toBe(
        'standing',
      );
      state.ball.x = carrier.position.x - 0.45;
      expect(chooseNpcDefensiveChallengeAction(state, defender.id, null)).toBeUndefined();
    },
  );
  it('targets the exposed ball shoulder rather than stopping outside the physical resolver', () => {
    const { state, carrier, defender } = fixture();
    defender.position = { x: 53.3, y: 34 };
    defender.profile.attributes.aggression = 90;
    const plan = derivePressingPlan(state, defender.id, null)!;
    expect(distance(plan.target, state.ball)).toBeLessThan(0.95);
    expect(distance(plan.target, carrier.position)).toBeGreaterThan(1);
    // The former shield-only0.72m eligibility gate excluded a legal0.95m poke:
    // body standoff1.15m minus safe-side shield touch0.32m is0.83m.
    state.ball.x = carrier.position.x + 0.32;
    const shieldPlan = derivePressingPlan(state, defender.id, null)!;
    expect(distance(shieldPlan.target, state.ball)).toBeGreaterThan(0.72);
    expect(distance(shieldPlan.target, state.ball)).toBeLessThan(0.95);
  });
  it('takes an attainable standing contact before a slower high-risk action even at maximum aggression', () => {
    const { state, defender } = fixture();
    defender.profile.attributes.aggression = 100;
    defender.profile.attributes.tackling = 90;
    defender.profile.attributes.positioning = 90;
    defender.profile.attributes.gameReading = 90;
    defender.position = { x: 53.1, y: 34 };
    expect(chooseNpcDefensiveChallengeAction(state, defender.id, null)?.technique).toBe('standing');
  });
  it('reserves prepared contact for exposed control at the physical contact time', () => {
    const { state, defender } = fixture();
    defender.profile.attributes.aggression = 90;
    defender.position = { x: 53.2, y: 34 };
    defender.velocity = { x: -5, y: 0 };
    state.onBallPreparation!.micro!.shielding = false;
    expect(chooseNpcDefensiveChallengeAction(state, defender.id, null)?.technique).toBe(
      'committed',
    );
    // The same current ball position is no longer accessible once its safe-side touch
    // is predicted behind the carrier. The presser continues movement without a tackle timer.
    state.onBallPreparation!.micro!.shielding = true;
    expect(chooseNpcDefensiveChallengeAction(state, defender.id, null)).toBeUndefined();
    expect(state.defensiveChallenge).toBeUndefined();
  });
  it.each([30, 90])(
    'a stationary pressured control stays dynamically responsive at aggression %i',
    (aggression) => {
      const { state: initial, carrier, defender } = fixture(`pr157-freeze-${aggression}`);
      defender.profile.attributes.aggression = aggression;
      defender.position = { x: 54.3, y: 34 };
      const origin = { ...carrier.position };
      let state = initial;
      let changingGeometry = 0;
      for (
        let tick = 0;
        tick < 160 && state.ball.ownerId === carrier.id && !state.restart;
        tick++
      ) {
        const previous = state;
        state = stepTacticalMatch(state, FIXED_MATCH_DT);
        const owner = state.players.find((p) => p.id === carrier.id)!;
        const before = previous.players.find((p) => p.id === carrier.id)!;
        changingGeometry += distance(before.position, owner.position);
      }
      const outcomeChanged =
        state.ball.ownerId !== carrier.id || Boolean(state.restart) || Boolean(state.lastChallenge);
      expect(outcomeChanged || changingGeometry > 0.65).toBe(true);
      expect(
        outcomeChanged ||
          distance(state.players.find((p) => p.id === carrier.id)!.position, origin) > 0.35,
      ).toBe(true);
    },
  );
  it('changes the evasion route using incoming momentum while preserving the chosen destination', () => {
    const { state, carrier, defender } = fixture();
    defender.position = { x: 54, y: 34 };
    defender.velocity = { x: -5, y: 3 };
    const target = { x: 68, y: 34 };
    const intent = {
      actorId: carrier.id,
      type: 'carry' as const,
      movementMode: 'dribble' as const,
      target,
      startPosition: carrier.position,
      closestPointReached: carrier.position,
      startedAt: state.time,
      expiresAt: state.time + 8,
      estimatedArrival: state.time + 5,
      humanSelected: true,
    };
    const first = deriveCarryExecution(state, carrier, intent);
    defender.velocity.y = -3;
    const second = deriveCarryExecution(state, carrier, intent);
    expect(first.mode).toBe('evade');
    expect(second.mode).toBe('evade');
    expect(first.localTarget.y).not.toBe(second.localTarget.y);
    expect(intent.target).toEqual(target);
    expect(deriveMovementCapability(carrier).acceleration).toBeGreaterThan(0);
  });
  it('preserves complementary local support and remote defensive structure', () => {
    const { state, carrier, defender } = fixture();
    defender.position = { x: 54, y: 34 };
    state.currentPressure = 0.8;
    const support = deriveBuildUpSupport(state, carrier.team);
    expect(new Set(support.map((p) => p.role)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(support.map((p) => p.playerId)).size).toBe(support.length);
    const targets = deriveTacticalTargets(state);
    const defenders = targets.filter(
      (p) => p.team === defender.team && p.id !== defender.id && p.slot.position !== 'goalkeeper',
    );
    expect(
      defenders.filter((p) => distance(p.idealTarget, carrier.position) > 9).length,
    ).toBeGreaterThanOrEqual(5);
  });
});
