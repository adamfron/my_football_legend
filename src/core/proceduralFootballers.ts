import type { Id, PlayerPosition, ProfessionalClub, WorldFootballer } from '../types/domain';
import { generateCanonicalFootballerProfile } from './footballerWorld';
import { generateDevelopmentProfile } from './playerCreator';
import { RandomGenerator } from './random/RandomGenerator';
import { deriveNpcDevelopmentCurveId } from './seasonDevelopment';
import { deriveYouthTeamQuality, generateYouthFootballer } from './youthTalent';
const PROCEDURAL_WORLD_SEED = 'mfl-world-pl-2026-v2';
const proceduralFootballerCache = new Map<Id, WorldFootballer>();

export const PROCEDURAL_PLAYER_VERSION = 2;
const PREFIX = `footballer_proc_v${PROCEDURAL_PLAYER_VERSION}_`;
const LEGACY_PREFIX = 'footballer_proc_v1_';

export interface ProceduralPlayerOrigin {
  kind: 'intake' | 'supplemental' | 'emergency';
  ownerId: Id;
  season: number;
  position: PlayerPosition;
  slot: number;
}

export const createProceduralFootballerId = (origin: ProceduralPlayerOrigin): Id =>
  `${PREFIX}${origin.kind}_${origin.ownerId}_${origin.season}_${origin.position}_${origin.slot}`;

const positions: PlayerPosition[] = [
  'goalkeeper',
  'center_back',
  'left_back',
  'right_back',
  'defensive_midfielder',
  'attacking_midfielder',
  'left_winger',
  'right_winger',
  'striker',
];

export const parseProceduralFootballerId = (id: Id): ProceduralPlayerOrigin | undefined => {
  const prefix = id.startsWith(PREFIX) ? PREFIX : id.startsWith(LEGACY_PREFIX) ? LEGACY_PREFIX : '';
  if (!prefix) return undefined;
  const suffix = id.slice(prefix.length);
  const kind = suffix.startsWith('intake_')
    ? 'intake'
    : suffix.startsWith('supplemental_')
      ? 'supplemental'
      : suffix.startsWith('emergency_')
        ? 'emergency'
        : undefined;
  if (!kind) return undefined;
  const body = suffix.slice(kind.length + 1);
  const match = body.match(
    /^(.*)_(\d{4})_(goalkeeper|center_back|left_back|right_back|defensive_midfielder|attacking_midfielder|left_winger|right_winger|striker)_(\d+)$/,
  );
  if (!match || !positions.includes(match[3] as PlayerPosition)) return undefined;
  return {
    kind,
    ownerId: match[1]!,
    season: Number(match[2]),
    position: match[3] as PlayerPosition,
    slot: Number(match[4]),
  };
};

export const resolveProceduralFootballer = (
  id: Id,
  clubs: readonly ProfessionalClub[],
): WorldFootballer | undefined => {
  const origin = parseProceduralFootballerId(id);
  if (!origin) return undefined;
  const cached = proceduralFootballerCache.get(id);
  if (cached) return cached;
  const club = clubs.find((item) => item.id === origin.ownerId);
  const isLegacy = id.startsWith(LEGACY_PREFIX);
  const quality =
    origin.kind === 'emergency'
      ? Math.max(30, Math.min(55, (club?.strengthRating ?? 45) - 12))
      : origin.kind === 'supplemental' && !isLegacy
        ? Math.max(34, Math.min(58, (club?.strengthRating ?? 48) - 10))
        : Math.max(
            30,
            Math.min(
              65,
              Math.round(
                club
                  ? club.developmentReputation * 0.38 +
                      club.youthPolicy * 0.27 +
                      (club.infrastructure?.coachingQuality ?? 50) * 0.16 +
                      (club.infrastructure?.trainingFacilities ?? 50) * 0.14 +
                      (club.strengthRating ?? 50) * 0.05
                  : 45,
              ),
            ),
          );
  const rng = RandomGenerator.fromSeed(`${PROCEDURAL_WORLD_SEED}:${id}:youth`);
  const age = origin.kind === 'intake' ? (rng.bool(0.72) ? 16 : 15) : rng.int(17, 20);
  if (origin.kind === 'intake' && !isLegacy) {
    const footballer = generateYouthFootballer({
      id,
      seed: PROCEDURAL_WORLD_SEED,
      age,
      referenceDate: `${origin.season}-07-01`,
      primaryPosition: origin.position,
      academyQuality: club ? deriveYouthTeamQuality(club) : 45,
    });
    proceduralFootballerCache.set(id, footballer);
    return footballer;
  }
  const targetOverall = Math.max(
    30,
    Math.min(
      origin.kind === 'supplemental' && !isLegacy ? 64 : 70,
      quality +
        rng.int(
          origin.kind === 'supplemental' && !isLegacy ? -4 : -10,
          origin.kind === 'supplemental' && !isLegacy ? 4 : 10,
        ) +
        (origin.kind === 'supplemental' && !isLegacy ? 0 : origin.slot % 6 === 0 ? 3 : 0),
    ),
  );
  const profile = generateCanonicalFootballerProfile({
    id,
    seed: `${PROCEDURAL_WORLD_SEED}:procedural:v${isLegacy ? 1 : PROCEDURAL_PLAYER_VERSION}`,
    age,
    referenceDate: `${origin.season}-07-01`,
    targetOverall,
    primaryPosition: origin.position,
  });
  const footballer: WorldFootballer = {
    profile,
    developmentProfile: generateDevelopmentProfile(
      RandomGenerator.fromSeed(`${PROCEDURAL_WORLD_SEED}:${id}:development`),
    ),
    careerStatus: 'active',
    reputation: Math.max(1, targetOverall - 30),
    fitness: rng.int(78, 100),
  };
  if (origin.kind === 'supplemental' && !isLegacy) {
    // This last-resort supply keeps squads viable; it must not inject guaranteed future stars.
    for (const family of Object.keys(footballer.developmentProfile.familyCapacity) as Array<
      keyof typeof footballer.developmentProfile.familyCapacity
    >)
      footballer.developmentProfile.familyCapacity[family] = Math.max(
        targetOverall + 5,
        Math.min(82, footballer.developmentProfile.familyCapacity[family]),
      );
  }
  footballer.developmentCurveId = deriveNpcDevelopmentCurveId(footballer);
  proceduralFootballerCache.set(id, footballer);
  return footballer;
};
