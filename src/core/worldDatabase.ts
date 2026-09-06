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
import { projectNpcAttributesAtDate } from './seasonDevelopment';
import { parseProceduralFootballerId, resolveProceduralFootballer } from './proceduralFootballers';

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
  footballerStateOverrides: {},
  npcClubMembership: {},
  youthCohortOverrides: {},
  newFootballers: {},
  retiredFootballerIds: [],
  professionalMarketExitCount: 0,
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
    delta?.footballerOverrides[id] ??
    world.baseWorld.footballers[id] ??
    resolveProceduralFootballer(id, world.baseWorld.clubs);
  if (!footballer) return undefined;
  const state = delta?.footballerStateOverrides?.[id];
  const clubId = delta?.npcClubMembership[id];
  const composed = {
    ...(state ? composeFootballerState(footballer, state) : footballer),
    ...(clubId !== undefined ? { currentClubId: clubId ?? undefined } : {}),
  };
  const attributes = delta?.footballerAttributeOverrides?.[id];
  return attributes
    ? {
        ...composed,
        profile: {
          ...composed.profile,
          attributes: { ...composed.profile.attributes, ...attributes } as PlayerAttributes,
        },
      }
    : composed;
};

const composeFootballerState = (
  footballer: WorldFootballer,
  state: NonNullable<CareerWorldDelta['footballerStateOverrides']>[Id],
): WorldFootballer => ({
  ...footballer,
  ...(state.currentContract !== undefined
    ? { currentContract: state.currentContract ?? undefined }
    : {}),
});

/** Composes base/new, rare full override, then the sparse development overlay. */
export const resolveCareerWorldFootballer = (
  career: Pick<CareerState, 'footballerWorld' | 'worldDelta'> &
    Partial<Pick<CareerState, 'currentDate' | 'seed'>>,
  id: Id,
): WorldFootballer | undefined => {
  const delta = career.worldDelta;
  const base =
    delta?.footballerOverrides[id] ??
    career.footballerWorld?.[id] ??
    resolveProceduralFootballer(id, (career as Partial<CareerState>).clubWorld ?? []);
  const composed =
    base && delta?.footballerStateOverrides?.[id]
      ? composeFootballerState(base, delta.footballerStateOverrides[id]!)
      : base;
  const clubId = delta?.npcClubMembership[id];
  const footballer = composed
    ? { ...composed, ...(clubId !== undefined ? { currentClubId: clubId ?? undefined } : {}) }
    : composed;
  if (!footballer || delta?.retiredFootballerIds.includes(id)) return undefined;
  const projected = career.currentDate
    ? {
        ...footballer,
        profile: {
          ...footballer.profile,
          attributes: projectNpcAttributesAtDate({
            footballer,
            date: career.currentDate,
            ...(career.seed ? { seed: career.seed } : {}),
          }),
        },
      }
    : footballer;
  const patch = delta?.footballerAttributeOverrides?.[id];
  return patch
    ? {
        ...projected,
        profile: {
          ...projected.profile,
          attributes: { ...projected.profile.attributes, ...patch } as PlayerAttributes,
        },
      }
    : projected;
};

/** Boundary-local resolver: indexes retirement once and may memoize an immutable pass. */
export const createCareerWorldFootballerResolver = (
  career: Pick<CareerState, 'footballerWorld' | 'worldDelta'> &
    Partial<Pick<CareerState, 'currentDate' | 'seed'>>,
  options: { cache?: boolean } = {},
) => {
  const delta = career.worldDelta;
  const retired = new Set(delta?.retiredFootballerIds ?? []);
  const cache = options.cache ? new Map<Id, WorldFootballer | undefined>() : undefined;
  return (id: Id): WorldFootballer | undefined => {
    if (cache?.has(id)) return cache.get(id);
    const base = retired.has(id)
      ? undefined
      : (delta?.footballerOverrides[id] ??
        career.footballerWorld?.[id] ??
        resolveProceduralFootballer(id, (career as Partial<CareerState>).clubWorld ?? []));
    const composed =
      base && delta?.footballerStateOverrides?.[id]
        ? composeFootballerState(base, delta.footballerStateOverrides[id]!)
        : base;
    const clubId = delta?.npcClubMembership[id];
    const footballer = composed
      ? { ...composed, ...(clubId !== undefined ? { currentClubId: clubId ?? undefined } : {}) }
      : composed;
    const projected =
      footballer && career.currentDate
        ? {
            ...footballer,
            profile: {
              ...footballer.profile,
              attributes: projectNpcAttributesAtDate({
                footballer,
                date: career.currentDate,
                ...(career.seed ? { seed: career.seed } : {}),
              }),
            },
          }
        : footballer;
    const patch = delta?.footballerAttributeOverrides?.[id];
    const effective =
      projected && patch
        ? {
            ...projected,
            profile: {
              ...projected.profile,
              attributes: { ...projected.profile.attributes, ...patch } as PlayerAttributes,
            },
          }
        : projected;
    cache?.set(id, effective);
    return effective;
  };
};
export const resolveNpcClubMembership = (
  career: Pick<CareerState, 'clubWorld' | 'worldDelta'>,
  playerId: Id,
): Id | null => {
  const explicit = career.worldDelta?.npcClubMembership[playerId];
  if (explicit !== undefined) return explicit;
  return career.clubWorld?.find((club) => club.squadPlayerIds?.includes(playerId))?.id ?? null;
};

const seniorSquadIndexCache = new WeakMap<object, Map<Id, Id[]>>();
export const buildEffectiveSeniorSquadIndex = (
  career: Pick<CareerState, 'clubWorld' | 'worldDelta'>,
): Map<Id, Id[]> => {
  const cachedIndex = seniorSquadIndexCache.get(career);
  if (cachedIndex) return cachedIndex;
  const result = new Map(
    (career.clubWorld ?? []).map((club) => [club.id, [...(club.squadPlayerIds ?? [])]]),
  );
  const retired = new Set(career.worldDelta?.retiredFootballerIds ?? []);
  for (const [id, destination] of Object.entries(career.worldDelta?.npcClubMembership ?? {})) {
    for (const ids of result.values()) {
      const index = ids.indexOf(id);
      if (index >= 0) ids.splice(index, 1);
    }
    if (destination && result.has(destination)) result.get(destination)!.push(id);
  }
  for (const [clubId, ids] of result)
    result.set(
      clubId,
      [...new Set(ids)].filter((id) => !retired.has(id)),
    );
  seniorSquadIndexCache.set(career, result);
  return result;
};

export const resolveWorldSquad = (world: WorldContext, clubId: Id): Id[] | undefined =>
  buildEffectiveSeniorSquadIndex({
    clubWorld: world.baseWorld.clubs,
    worldDelta: world.worldDelta,
  }).get(clubId);

/** The only runtime source of senior membership: bootstrap IDs plus sparse career state. */
export const resolveEffectiveSeniorSquad = (
  career: Pick<
    CareerState,
    'player' | 'currentProfessionalClub' | 'clubWorld' | 'footballerWorld' | 'worldDelta'
  >,
  clubId: Id,
  resolveFootballer: (id: Id) => WorldFootballer | undefined = (id) =>
    resolveCareerWorldFootballer(career, id),
): Id[] => {
  const club = career.clubWorld?.find((item) => item.id === clubId);
  const bootstrap =
    buildEffectiveSeniorSquadIndex(career).get(clubId) ?? club?.squadPlayerIds ?? [];
  const retired = new Set(career.worldDelta?.retiredFootballerIds ?? []);
  const protagonistBelongs = career.currentProfessionalClub?.id === clubId;
  return [...new Set([...bootstrap, ...(protagonistBelongs ? [career.player.id] : [])])].filter(
    (id) => !retired.has(id) && (id === career.player.id || Boolean(resolveFootballer(id))),
  );
};

export const resolveEffectiveProfessionalClub = (
  career: Pick<
    CareerState,
    'player' | 'currentProfessionalClub' | 'clubWorld' | 'footballerWorld' | 'worldDelta'
  >,
  clubId: Id,
): ProfessionalClub | undefined => {
  const club = career.clubWorld?.find((item) => item.id === clubId);
  return club
    ? { ...club, squadPlayerIds: resolveEffectiveSeniorSquad(career, clubId) }
    : undefined;
};

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
  newFootballers: parseProceduralFootballerId(footballer.profile.id)
    ? delta.newFootballers
    : { ...delta.newFootballers, [footballer.profile.id]: footballer },
});
export const setNpcClubMembership = (
  delta: CareerWorldDelta,
  playerId: Id,
  clubId: Id | null,
): CareerWorldDelta => ({
  ...delta,
  npcClubMembership: { ...delta.npcClubMembership, [playerId]: clubId },
});
