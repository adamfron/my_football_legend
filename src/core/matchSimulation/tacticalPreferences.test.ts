import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { derivePressingAssignment, deriveTeamBlockTransform } from './tacticalPositioning';
import { scoreActionForAI, npcPossessionDecisionDelay } from './matchActions';
import {
  deriveEconomicalMovementCost,
  derivePressingOpportunity,
  deriveTacticalSuitability,
  deriveTeamTacticalPreferences,
  pressingOpportunitySchema,
  tacticalPreferencesSchema,
  tacticalSuitabilitySchema,
  TACTICAL_PREFERENCE_DEFAULTS,
} from './tacticalPreferences';
import type { MatchPlayerState } from './matchState';

const world = createCanonicalWorldDatabase();
const makeState = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr158-tactics',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 30;
  state.playerAgencyEnabled = false;
  state.players = state.players.map((player) => ({
    ...player,
    profile: { ...player.profile, attributes: { ...player.profile.attributes } },
  }));
  state.possessionTeam = 'home';
  state.timeSincePossessionChanged = 15;
  state.teams.home.phase = 'positional_attack';
  state.teams.away.phase = 'defensive_block';
  const carrier = state.players.find(
    (player) => player.team === 'home' && player.slot.position === 'center_back',
  )!;
  state.players.forEach((player, index) => {
    player.position = {
      x: player.team === 'home' ? 18 + (index % 3) * 9 : 50 + (index % 3) * 10,
      y: 7 + (index % 8) * 7,
    };
    player.velocity = { x: 0, y: 0 };
    player.facingAngle = player.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
    player.target = { ...player.position };
    player.idealTarget = { ...player.position };
  });
  carrier.position = { x: 22, y: 34 };
  state.ball = {
    ...state.ball,
    ownerId: carrier.id,
    x: 22.55,
    y: 34,
    velocity: { x: 0, y: 0 },
    height: 0,
    airborne: false,
  };
  delete state.onBallPreparation;
  state.ballOwnershipStartedAt = 29.8;
  return state;
};

const setAbility = (player: MatchPlayerState, value: number) => {
  for (const key of [
    'pace',
    'agility',
    'stamina',
    'gameReading',
    'positioning',
    'concentration',
    'aggression',
    'passing',
    'technique',
    'firstTouch',
    'dribbling',
  ] as const)
    player.profile.attributes[key] = value;
};

describe('PR158 tactical preferences and opportunity', () => {
  it('validates the six smallest independent axes and rejects unbounded or nonfinite preferences', () => {
    for (const profile of Object.values(TACTICAL_PREFERENCE_DEFAULTS))
      expect(tacticalPreferencesSchema.parse(profile)).toEqual(profile);
    expect(Object.keys(TACTICAL_PREFERENCE_DEFAULTS.balanced)).toHaveLength(6);
    expect(
      tacticalPreferencesSchema.safeParse({
        ...TACTICAL_PREFERENCE_DEFAULTS.balanced,
        counterpress: 1.01,
      }).success,
    ).toBe(false);
    expect(
      tacticalPreferencesSchema.safeParse({
        ...TACTICAL_PREFERENCE_DEFAULTS.balanced,
        blockHeight: NaN,
      }).success,
    ).toBe(false);
  });

  it('screens safe centre-back outlets despite a high press preference and recognises a covered constrained touch', () => {
    const state = makeState();
    state.teams.away.style = 'pressing';
    const carrier = state.players.find((player) => player.id === state.ball.ownerId)!;
    const mates = state.players
      .filter((player) => player.team === 'home' && player.id !== carrier.id)
      .slice(0, 3);
    mates.forEach((player, index) => {
      player.position = [
        { x: 12, y: 34 },
        { x: 22, y: 18 },
        { x: 33, y: 44 },
      ][index]!;
    });
    const safe = derivePressingOpportunity(state, 'away');
    expect(safe.safeOutletCount).toBeGreaterThanOrEqual(3);
    expect(safe.engagement).toBeLessThan(0.3);
    expect(['mid_block', 'low_block']).toContain(safe.mode);
    expect(derivePressingAssignment(state, 'away').secondary).toBeUndefined();
    carrier.position = { x: 22, y: 2 };
    state.ball = { ...state.ball, x: 24, y: 2 };
    state.players
      .filter((player) => player.team === 'home' && player.id !== carrier.id)
      .forEach((player) => {
        player.position = { x: 60, y: 34 };
      });
    state.players
      .filter((player) => player.team === 'away')
      .slice(0, 5)
      .forEach((player, index) => {
        player.position = { x: 23 + index * 2, y: 3 + index * 2 };
      });
    const trapped = derivePressingOpportunity(state, 'away');
    expect(pressingOpportunitySchema.safeParse(trapped).success).toBe(true);
    expect(trapped.engagement).toBeGreaterThan(safe.engagement + 0.35);
    expect(trapped.triggers.heavyTouch).toBeGreaterThan(0.7);
    expect(trapped.coverQuality).toBeGreaterThan(0);
  });

  it('separates a decaying counterpress from reorganised opponents without an eight-second discontinuity', () => {
    const state = makeState();
    state.teams.away.style = 'pressing';
    state.teams.away.phase = 'defensive_transition';
    const carrier = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.players
      .filter((player) => player.team === 'home' && player.id !== carrier.id)
      .forEach((player) => {
        player.position = { x: 65, y: 34 };
      });
    state.players
      .filter((player) => player.team === 'away')
      .slice(0, 4)
      .forEach((player, index) => {
        player.position = { x: 24 + index, y: 30 + index * 2 };
      });
    state.timeSincePossessionChanged = 0.5;
    const early = derivePressingOpportunity(state, 'away');
    expect(early.mode).toBe('counterpress');
    state.timeSincePossessionChanged = 7.99;
    const before = derivePressingOpportunity(state, 'away');
    state.timeSincePossessionChanged = 8.01;
    const after = derivePressingOpportunity(state, 'away');
    expect(after.transitionOpportunity).toBeGreaterThan(0);
    expect(Math.abs(after.transitionOpportunity - before.transitionOpportunity)).toBeLessThan(
      0.002,
    );
    state.lastPossessionChange = {
      at: state.time - 8.01,
      from: 'away',
      to: 'home',
      cause: 'interception',
    };
    state.teams.away.phase = 'defensive_block';
    expect(derivePressingOpportunity(state, 'away').transitionOpportunity).toBe(
      after.transitionOpportunity,
    );
    delete state.lastPossessionChange;
    state.teams.away.phase = 'defensive_transition';
    state.timeSincePossessionChanged = 0.5;
    state.players
      .filter((player) => player.team === 'home' && player.id !== carrier.id)
      .slice(0, 4)
      .forEach((player, index) => {
        player.position = { x: 10 + index * 4, y: 10 + index * 14 };
      });
    state.players
      .filter((player) => player.team === 'away')
      .forEach((player) => {
        player.position = { x: 60, y: 34 };
      });
    const reorganised = derivePressingOpportunity(state, 'away');
    expect(reorganised.transitionOpportunity).toBeLessThan(early.transitionOpportunity * 0.3);
    expect(reorganised.mode).not.toBe('counterpress');
  });

  it('adapts pressing and high cover continuously to the actual squad without changing attributes', () => {
    const state = makeState();
    state.teams.away.style = 'pressing';
    state.players
      .filter((player) => player.team === 'away')
      .forEach((player) => setAbility(player, 25));
    const weak = deriveTeamTacticalPreferences(state, 'away');
    const weakSuitability = deriveTacticalSuitability(state, 'away');
    state.players
      .filter((player) => player.team === 'away')
      .forEach((player) => setAbility(player, 90));
    const strong = deriveTeamTacticalPreferences(state, 'away');
    expect(strong.organisedPress).toBeGreaterThan(weak.organisedPress);
    expect(strong.blockHeight).toBeGreaterThan(weak.blockHeight);
    expect(weak.organisedPress).toBeGreaterThan(0);
    expect(tacticalSuitabilitySchema.safeParse(weakSuitability).success).toBe(true);
    expect(weakSuitability.preferredPressCost).toBeGreaterThan(
      deriveTacticalSuitability(state, 'away').preferredPressCost,
    );
    const snapshot = structuredClone(state);
    deriveTeamTacticalPreferences(state, 'away');
    derivePressingOpportunity(state, 'away');
    expect(state).toEqual(snapshot);
  });

  it('changes block height, compactness and patience independently and preserves the physical state', () => {
    const state = makeState();
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.teams.away.tacticalPreferences = {
      ...TACTICAL_PREFERENCE_DEFAULTS.balanced,
      blockHeight: 0.1,
      compactness: 0.1,
    };
    const deep = deriveTeamBlockTransform(state, 'away');
    state.teams.away.tacticalPreferences = {
      ...state.teams.away.tacticalPreferences,
      blockHeight: 0.9,
    };
    const high = deriveTeamBlockTransform(state, 'away');
    expect(high.advance).toBeGreaterThan(deep.advance + 8);
    expect(high.widthScale).toBe(deep.widthScale);
    state.teams.away.tacticalPreferences.compactness = 0.9;
    const compact = deriveTeamBlockTransform(state, 'away');
    expect(compact.widthScale).toBeLessThan(high.widthScale);
    expect(compact.advance).toBe(high.advance);
    const hold = { type: 'hold' as const, actorId: actor.id };
    state.teams.home.tacticalPreferences = {
      ...TACTICAL_PREFERENCE_DEFAULTS.balanced,
      possessionPatience: 0.1,
    };
    const impatient = scoreActionForAI(state, actor.id, hold);
    const fast = npcPossessionDecisionDelay(state, actor);
    state.teams.home.tacticalPreferences.possessionPatience = 0.9;
    expect(scoreActionForAI(state, actor.id, hold)).toBeGreaterThan(impatient + 25);
    expect(npcPossessionDecisionDelay(state, actor)).toBeGreaterThan(fast);
  });

  it('values shorter intelligent routes and exposes low-stamina running cost without depletion', () => {
    const state = makeState();
    const actor = state.players[0]!;
    const before = actor.profile.attributes.stamina;
    const near = { x: actor.position.x + 2, y: actor.position.y };
    const far = { x: actor.position.x + 20, y: actor.position.y };
    expect(deriveEconomicalMovementCost(actor, near)).toBeLessThan(
      deriveEconomicalMovementCost(actor, far),
    );
    expect(actor.profile.attributes.stamina).toBe(before);
    actor.profile.attributes.stamina = 10;
    const low = deriveEconomicalMovementCost(actor, far);
    actor.profile.attributes.stamina = 90;
    expect(deriveEconomicalMovementCost(actor, far)).toBeLessThan(low);
  });
});
