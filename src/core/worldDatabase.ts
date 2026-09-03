import { z } from 'zod';
import type {
  CareerState,
  CareerWorldDelta,
  Id,
  PlayerAttributes,
  ProfessionalClub,
  WorldDatabase,
  WorldFootballer,
} from '../types/domain';
import { professionalClubSchema, worldFootballerSchema } from '../schemas/domainSchemas';

export const WORLD_DATABASE_VERSION = 'pl-2026-v2';
export const WORLD_DATABASE_SEED = 'mfl-world-pl-2026-v2';

export const worldDatabaseSchema = z.object({
  version: z.literal(WORLD_DATABASE_VERSION),
  startingSeason: z.literal(2026),
  seed: z.literal(WORLD_DATABASE_SEED),
  clubs: z.array(professionalClubSchema),
  footballers: z.record(z.string(), worldFootballerSchema),
  youthCohorts: z.record(z.string(), z.array(z.string())),
});

export const emptyWorldDelta = (): CareerWorldDelta => ({
  clubOverrides: {},
  footballerOverrides: {},
  squadOverrides: {},
  youthCohortOverrides: {},
  newFootballers: {},
  retiredFootballerIds: [],
  managerOverrides: {},
  npcTransferRecords: [],
});

let cached: WorldDatabase | undefined;
export const buildWorldDatabaseUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/$/, '')}/data/world/${WORLD_DATABASE_VERSION}.json`;

export const loadWorldDatabase = async (): Promise<WorldDatabase> => {
  if (cached) return cached;
  const url = buildWorldDatabaseUrl(import.meta.env.BASE_URL);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Nie udało się pobrać świata z ${url} (status ${response.status}).`);
  cached = worldDatabaseSchema.parse(await response.json()) as WorldDatabase;
  return cached;
};
export const cacheWorldDatabase = (database: WorldDatabase) => {
  cached = worldDatabaseSchema.parse(database) as WorldDatabase;
};
export const getCachedWorldDatabase = () => cached;
export const clearWorldDatabaseCache = () => {
  cached = undefined;
};
/** Synchronous fallback for tests and already-bundled desktop builds. Browser UX preloads the asset. */

type WorldContext = Pick<CareerState, 'player' | 'worldDelta'> & { baseWorld: WorldDatabase };
export const resolveWorldFootballer = (
  world: WorldContext,
  id: Id,
): WorldFootballer | undefined => {
  if (id === world.player.id) return undefined;
  const delta = world.worldDelta;
  if (delta?.retiredFootballerIds.includes(id)) return undefined;
  const footballer =
    delta?.footballerOverrides[id] ?? delta?.newFootballers[id] ?? world.baseWorld.footballers[id];
  if (!footballer) return undefined;
  const attributes = delta?.footballerAttributeOverrides?.[id];
  return attributes
    ? {
        ...footballer,
        profile: {
          ...footballer.profile,
          attributes: { ...footballer.profile.attributes, ...attributes } as PlayerAttributes,
        },
      }
    : footballer;
};

/** Composes base/new, rare full override, then the sparse development overlay. */
export const resolveCareerWorldFootballer = (
  career: Pick<CareerState, 'footballerWorld' | 'worldDelta'>,
  id: Id,
): WorldFootballer | undefined => {
  const delta = career.worldDelta;
  const footballer =
    delta?.footballerOverrides[id] ?? delta?.newFootballers[id] ?? career.footballerWorld?.[id];
  if (!footballer || delta?.retiredFootballerIds.includes(id)) return undefined;
  const patch = delta?.footballerAttributeOverrides?.[id];
  return patch
    ? {
        ...footballer,
        profile: {
          ...footballer.profile,
          attributes: { ...footballer.profile.attributes, ...patch } as PlayerAttributes,
        },
      }
    : footballer;
};

/** Boundary-local resolver: indexes retirement once and may memoize an immutable pass. */
export const createCareerWorldFootballerResolver = (
  career: Pick<CareerState, 'footballerWorld' | 'worldDelta'>,
  options: { cache?: boolean } = {},
) => {
  const delta = career.worldDelta;
  const retired = new Set(delta?.retiredFootballerIds ?? []);
  const cache = options.cache ? new Map<Id, WorldFootballer | undefined>() : undefined;
  return (id: Id): WorldFootballer | undefined => {
    if (cache?.has(id)) return cache.get(id);
    const footballer = retired.has(id)
      ? undefined
      : (delta?.footballerOverrides[id] ??
        delta?.newFootballers[id] ??
        career.footballerWorld?.[id]);
    const patch = delta?.footballerAttributeOverrides?.[id];
    const effective =
      footballer && patch
        ? {
            ...footballer,
            profile: {
              ...footballer.profile,
              attributes: { ...footballer.profile.attributes, ...patch } as PlayerAttributes,
            },
          }
        : footballer;
    cache?.set(id, effective);
    return effective;
  };
};
export const resolveWorldSquad = (world: WorldContext, clubId: Id): Id[] | undefined =>
  world.worldDelta?.squadOverrides[clubId] ??
  world.baseWorld.clubs.find((club) => club.id === clubId)?.squadPlayerIds;

export const resolveYouthCohort = (
  career: Pick<CareerState, 'youthCohorts' | 'worldDelta'>,
  cohortKey: string,
): Id[] | undefined =>
  career.worldDelta?.youthCohortOverrides?.[cohortKey] ?? career.youthCohorts?.[cohortKey];

export const updateWorldFootballer = (
  delta: CareerWorldDelta,
  footballer: WorldFootballer,
): CareerWorldDelta => ({
  ...delta,
  footballerOverrides: { ...delta.footballerOverrides, [footballer.profile.id]: footballer },
});
export const registerNewFootballer = (
  delta: CareerWorldDelta,
  footballer: WorldFootballer,
): CareerWorldDelta => ({
  ...delta,
  newFootballers: { ...delta.newFootballers, [footballer.profile.id]: footballer },
});
export const moveFootballer = (
  delta: CareerWorldDelta,
  club: ProfessionalClub,
  squad: Id[],
): CareerWorldDelta => ({
  ...delta,
  squadOverrides: { ...delta.squadOverrides, [club.id]: [...squad] },
});
