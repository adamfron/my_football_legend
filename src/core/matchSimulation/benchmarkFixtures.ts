import { z } from 'zod';
import { FORMATIONS, type FormationId } from '../footballerWorld';
import { getEffectivePositionOverall, PLAYER_POSITIONS } from '../playerOverall';
import type { SingleMatchSession, SingleMatchTeam } from '../singleMatch';
import {
  footballerProfileSchema,
  hiddenPlayerProfileSchema,
  playerAttributesSchema,
  professionalClubSchema,
} from '../../schemas/domainSchemas';
import { TACTICAL_PREFERENCE_DEFAULTS } from './tacticalPreferences';
import { createTacticalMatch } from './matchSimulation';
import { tacticalStyleSchema } from './matchState';

export const formationIdSchema = z.enum(['4-3-3', '4-2-3-1', '4-4-2', '3-4-2-1', '3-5-2']);
export const benchmarkFixtureSchema = z.object({
  anchor: formationIdSchema.default('4-4-2'),
  opponent: formationIdSchema,
  seed: z.string().min(1),
  reversed: z.boolean().default(false),
  attributes: z.number().int().min(1).max(100).default(50),
  opponentAttributes: z.number().int().min(1).max(100).optional(),
  style: tacticalStyleSchema.default('balanced'),
  normaliseDuties: z.boolean().default(false),
});
export type BenchmarkFixture = z.infer<typeof benchmarkFixtureSchema>;

/** Direct legal XI construction: no generated manager, selection or shared profile mutation. */
const buildTeam = (
  identity: 'anchor' | 'opponent',
  formation: FormationId,
  ability: number,
  normaliseDuties: boolean,
): SingleMatchTeam => {
  const profile = (index: number, position: (typeof PLAYER_POSITIONS)[number]) =>
    footballerProfileSchema.parse({
      id: `geometry:${identity}:${index}`,
      firstName: identity,
      lastName: `${index}`,
      age: 25,
      dateOfBirth: '2001-01-01',
      nationality: 'PL',
      heightCm: 180,
      weightKg: 75,
      attributes: Object.fromEntries(
        Object.keys(playerAttributesSchema.shape).map((key) => [key, ability]),
      ),
      hiddenProfile: Object.fromEntries(
        Object.keys(hiddenPlayerProfileSchema.shape).map((key) => [key, 50]),
      ),
      dominantFoot: 'right',
      weakFootProficiency: 100,
      traits: [],
      primaryPosition: position,
      secondaryPositions: PLAYER_POSITIONS.filter((p) => p !== position),
      positionFamiliarity: Object.fromEntries(PLAYER_POSITIONS.map((p) => [p, 1])),
    });
  const players = FORMATIONS[formation].map((nativeSlot, index) => {
    const slot = { ...nativeSlot, ...(normaliseDuties ? { duty: 'support' as const } : {}) };
    const player = profile(index, slot.position);
    return {
      footballerId: player.id,
      profile: player,
      condition: 100,
      slotIndex: index,
      slot,
      x: (1 - slot.y / 100) * 105,
      y: (slot.x / 100) * 68,
    };
  });
  // Same auxiliary profiles and bench roles for every formation; genuine independent identities.
  const bench = PLAYER_POSITIONS.map((position, index) => {
    const player = profile(11 + index, position);
    return { footballerId: player.id, profile: player, condition: 100 };
  });
  const club = professionalClubSchema.parse({
    id: `geometry:${identity}`,
    name: `Geometry ${identity}`,
    country: 'PL',
    region: 'benchmark',
    managerId: 'geometry:neutral-manager',
    leagueTier: 2,
    reputation: 50,
    strengthRating: ability,
    financialLevel: 50,
    playingStyle: 'balanced',
    youthPolicy: 50,
    developmentReputation: 50,
    sellingClubTendency: 50,
    pressureLevel: 50,
    coachYouthTrust: 50,
    archetype: 'LOCAL_DEVELOPMENT',
    positionalNeeds: Object.fromEntries(
      ['goalkeeper', 'defense', 'midfield', 'attack'].map((key) => [
        key,
        { starterQuality: ability, depth: 'normal', needLevel: 50 },
      ]),
    ),
    squadPlayerIds: [...players, ...bench].map((p) => p.footballerId),
  });
  return {
    club,
    formation,
    players,
    bench,
    strength:
      players.reduce((sum, p) => sum + getEffectivePositionOverall(p.profile, p.slot.position), 0) /
      11,
  };
};

export const createFormationBenchmarkSession = (
  input: z.input<typeof benchmarkFixtureSchema>,
): SingleMatchSession => {
  const config = benchmarkFixtureSchema.parse(input);
  const anchor = buildTeam('anchor', config.anchor, config.attributes, config.normaliseDuties);
  const opponent = buildTeam(
    'opponent',
    config.opponent,
    config.opponentAttributes ?? config.attributes,
    config.normaliseDuties,
  );
  const home = config.reversed ? opponent : anchor;
  const away = config.reversed ? anchor : opponent;
  return {
    setup: {
      homeClubId: home.club.id,
      awayClubId: away.club.id,
      seed: config.seed,
      control: { mode: 'spectator' },
    },
    home,
    away,
  };
};

export const createFormationBenchmarkMatch = (input: z.input<typeof benchmarkFixtureSchema>) => {
  const config = benchmarkFixtureSchema.parse(input);
  const session = createFormationBenchmarkSession(config);
  const state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  for (const side of ['home', 'away'] as const) {
    state.teams[side].style = config.style;
    state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS[config.style] };
  }
  return { session, state };
};
