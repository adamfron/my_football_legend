import { z } from 'zod';
import type { CareerState } from '../types/domain';
import { careerStateSchema } from '../schemas/domainSchemas';
import { recoverOrphanedSeasonOneRound } from './careerWeeks';
import { generateProfessionalClubPool } from './professionalClubs';
import { dedupePeople } from './people';
import { RandomGenerator } from './random/RandomGenerator';
import { deriveGoalkeeperAttributes } from './goalkeeperAttributes';

export const CAREER_SAVE_VERSION = 1;
export const CAREER_SAVE_KEY = 'mfl.careerSave.v1';

export const careerSaveSchema = z.object({
  version: z.literal(CAREER_SAVE_VERSION),
  savedAt: z.string().datetime(),
  career: careerStateSchema,
});
export type CareerSave = z.infer<typeof careerSaveSchema>;
export type LoadCareerResult =
  | { ok: true; save: CareerSave }
  | { ok: false; reason: 'missing' | 'invalid_json' | 'incompatible_version' | 'invalid_data' };

const storageAvailable = () => typeof localStorage !== 'undefined';

export const saveCareer = (career: CareerState): CareerSave => {
  const save = careerSaveSchema.parse({
    version: CAREER_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    career,
  });
  if (storageAvailable()) localStorage.setItem(CAREER_SAVE_KEY, JSON.stringify(save));
  return save;
};

export const loadCareer = (): LoadCareerResult => {
  if (!storageAvailable()) return { ok: false, reason: 'missing' };
  const raw = localStorage.getItem(CAREER_SAVE_KEY);
  if (!raw) return { ok: false, reason: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (
    typeof parsed === 'object' &&
    parsed &&
    'version' in parsed &&
    parsed.version !== CAREER_SAVE_VERSION
  )
    return { ok: false, reason: 'incompatible_version' };
  if (
    typeof parsed === 'object' &&
    parsed &&
    'career' in parsed &&
    typeof parsed.career === 'object' &&
    parsed.career
  ) {
    const career = parsed.career as Record<string, unknown>;
    career.careerSeasonNumber ??= 1;
    career.careerPhase ??= career.currentSeason === 2026 ? 'academy' : 'regular_season';
    career.careerStatus ??= 'active';
    const migrateProfessionalClub = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const club = value as Record<string, unknown>;
      club.leagueTier = Math.max(
        1,
        Math.min(4, Math.round(Number(club.leagueTier ?? club.professionalLevel ?? 3))),
      );
    };
    migrateProfessionalClub(career.currentProfessionalClub);
    if (Array.isArray(career.professionalOffers))
      (career.professionalOffers as Array<Record<string, unknown>>).forEach((offer) =>
        migrateProfessionalClub(offer.club),
      );
    career.recentVariantKeys = Array.isArray(career.recentVariantKeys)
      ? career.recentVariantKeys.filter(
          (key): key is string => typeof key === 'string' && key.trim().length > 0,
        )
      : [];
    const player = career.player as Record<string, unknown>;
    player.matchPresentation ??= 'important_matches';
    player.matchEffort ??= 3;
    player.trainingEffort ??=
      career.trainingApproach === 'recovery' ? 1 : career.trainingApproach === 'extra_work' ? 5 : 3;
    const attributes = player.attributes as Record<string, unknown>;
    const fallback = Number(attributes.composure ?? 50);
    attributes.spatialAwareness ??= Math.round(
      (Number(attributes.vision ?? fallback) + fallback) / 2,
    );
    attributes.determination ??= fallback;
    attributes.ambition ??= fallback;
    attributes.professionalism ??= fallback;
    if (player.primaryPosition === 'goalkeeper' && !player.goalkeeperAttributes)
      player.goalkeeperAttributes = deriveGoalkeeperAttributes(
        String(career.seed),
        attributes as never,
        Number(player.age),
        typeof career.highestOVR === 'number' ? Number(career.highestOVR) : undefined,
      );
    career.seasonStartingAttributes ??= { ...attributes };
    const profileRng = RandomGenerator.fromSeed(`${String(career.seed)}:development-profile`);
    career.developmentProfile ??= {
      developmentType: 'normal',
      growthRate: profileRng.int(85, 115) / 100,
      peakAge: 27,
      declineStartAge: 31,
      softPotential: Number(player.potential ?? 75),
      developmentVolatility: 12,
      physicalPeakAge: 25,
      technicalPeakAge: 28,
      mentalPeakAge: 30,
    };
    career.clubWorld ??= generateProfessionalClubPool(String(career.seed));
    career.completedSeasons ??= [];
    career.trainingApproach ??= 'balanced';
    career.selectionStanding ??= 50;
    // One-time legacy import: preserve canonical rows and fill only missing controlled fixtures.
    {
      const history = Array.isArray(career.matchHistory)
        ? (career.matchHistory as Array<Record<string, unknown>>)
        : [];
      const canonical = Array.isArray(career.seasonParticipation)
        ? (career.seasonParticipation as Array<Record<string, unknown>>)
        : [];
      const byFixture = new Map(canonical.map((row) => [String(row.fixtureId), row]));
      const league = career.leagueSeason as
        | {
            id?: string;
            controlledClubId?: string;
            competition?: { id?: string; name?: string };
            rounds?: Array<{ fixtures?: Array<Record<string, unknown>> }>;
          }
        | undefined;
      const controlledFixtures = (league?.rounds ?? [])
        .flatMap((round) => round.fixtures ?? [])
        .filter((fixture) =>
          [fixture.homeClubId, fixture.awayClubId].includes(league?.controlledClubId),
        );
      for (const fixture of controlledFixtures) {
        const fixtureId = String(fixture.id);
        if (byFixture.has(fixtureId)) continue;
        const appearance = history.find(
          (item) => item.matchId === fixture.id || item.matchId === `academy_${fixtureId}`,
        );
        const minutes = Number(appearance?.minutes ?? 0);
        const completed = fixture.completed === true;
        byFixture.set(fixtureId, {
          fixtureId,
          seasonId: String(fixture.seasonId ?? league?.id ?? ''),
          competitionId: String(league?.competition?.id ?? fixture.competition ?? 'league'),
          date: String(fixture.date),
          homeClubId: String(fixture.homeClubId),
          awayClubId: String(fixture.awayClubId),
          opponentId: String(
            fixture.homeClubId === league?.controlledClubId
              ? fixture.awayClubId
              : fixture.homeClubId,
          ),
          venue: fixture.homeClubId === league?.controlledClubId ? 'home' : 'away',
          competition: league?.competition?.name ?? 'Liga',
          fixtureStatus: completed ? 'completed' : 'scheduled',
          ...(completed &&
          typeof fixture.homeGoals === 'number' &&
          typeof fixture.awayGoals === 'number'
            ? { score: { home: fixture.homeGoals, away: fixture.awayGoals } }
            : {}),
          status: completed
            ? minutes > 0
              ? appearance?.started
                ? 'starter'
                : 'substitute'
              : 'not_selected'
            : 'not_selected',
          plannedMinutes: minutes,
          minutes,
          started: Boolean(appearance?.started),
          ...(appearance ? { appearanceMatchId: String(appearance.matchId) } : {}),
          goals: Number(appearance?.goals ?? 0),
          assists: Number(appearance?.assists ?? 0),
          xG: minutes > 0 ? Number(appearance?.xG ?? 0) : 0,
          xA: minutes > 0 ? Number(appearance?.xA ?? 0) : 0,
          keyPasses: minutes > 0 ? Number(appearance?.keyPasses ?? 0) : 0,
          defensiveActions: minutes > 0 ? Number(appearance?.defensiveActions ?? 0) : 0,
          yellowCards: minutes > 0 ? Number(appearance?.yellowCards ?? 0) : 0,
          ...(appearance?.redCard ? { redCard: appearance.redCard } : {}),
          ...(typeof appearance?.rating === 'number' ? { rating: appearance.rating } : {}),
        });
      }
      career.seasonParticipation = [...byFixture.values()];
    }
    if (Array.isArray(career.significantPeople))
      career.significantPeople = dedupePeople(career.significantPeople as never[]);
    if (
      Number(player.age) > 23 &&
      career.currentContract &&
      typeof career.currentContract === 'object' &&
      (career.currentContract as Record<string, unknown>).squadRole === 'development_player'
    )
      (career.currentContract as Record<string, unknown>).squadRole = 'rotation';
    const dates = [
      career.currentDate,
      ...(Array.isArray(career.historyFacts)
        ? (career.historyFacts as Array<Record<string, unknown>>).map((fact) => fact.date)
        : []),
    ].filter((date): date is string => typeof date === 'string');
    career.currentDate = dates.sort().at(-1) ?? `${String(career.currentSeason)}-07-01`;
    if (career.leagueSeason && typeof career.leagueSeason === 'object') {
      const league = career.leagueSeason as Record<string, unknown>;
      league.controlledClubId ??= (career.currentClub as Record<string, unknown>).id;
      league.competition ??=
        career.currentSeason === 2026
          ? {
              id: 'polish-u17',
              name: 'Polska Liga U-17',
              country: 'Polska',
              category: 'youth',
              ageLevel: 'U17',
            }
          : {
              id: 'polish-professional-3',
              name: 'Polska Liga Regionalna',
              country: 'Polska',
              category: 'professional',
              tier: 3,
            };
      if (
        Number(career.careerSeasonNumber) >= 2 &&
        league.competition &&
        typeof league.competition === 'object'
      ) {
        const competition = league.competition as Record<string, unknown>;
        competition.category = 'professional';
        delete competition.ageLevel;
        competition.tier = Math.max(
          1,
          Math.min(
            4,
            Math.round(
              Number(
                competition.tier ??
                  (career.currentProfessionalClub as Record<string, unknown> | undefined)
                    ?.leagueTier ??
                  (career.currentProfessionalClub as Record<string, unknown> | undefined)
                    ?.professionalLevel ??
                  3,
              ),
            ),
          ),
        );
        const tierNames: Record<number, string> = {
          1: 'Polska Liga Elitarna',
          2: 'Polska Liga Krajowa',
          3: 'Polska Liga Regionalna',
          4: 'Polska Liga Okręgowa',
        };
        competition.name = tierNames[Number(competition.tier)];
        if (career.currentProfessionalClub && typeof career.currentProfessionalClub === 'object')
          (career.currentProfessionalClub as Record<string, unknown>).leagueTier = competition.tier;
        if (Array.isArray(league.clubs)) {
          const controlled = (league.clubs as Array<Record<string, unknown>>).find(
            (club) => club.clubId === league.controlledClubId,
          );
          if (controlled) controlled.name = (career.currentClub as Record<string, unknown>).name;
        }
      }
    }
    if (career.seasonOutcome && typeof career.seasonOutcome === 'object')
      (career.seasonOutcome as Record<string, unknown>).competitionType ??= 'academy';
    if (career.activeMatch && typeof career.activeMatch === 'object') {
      const match = career.activeMatch as Record<string, unknown>;
      const calendar = career.careerCalendar as Record<string, unknown> | undefined;
      const fixtures = Array.isArray(calendar?.fixtures)
        ? (calendar.fixtures as Array<Record<string, unknown>>)
        : [];
      const belongsToCurrentSeason = fixtures.some((fixture) => fixture.id === match.id);
      if ((career.careerSeasonNumber as number) >= 2 && !belongsToCurrentSeason) {
        // Runtime state is disposable; canonical appearances and facts remain untouched.
        delete career.activeMatch;
      } else if (!Array.isArray(match.goalEvents) && Array.isArray(match.momentum)) {
        match.goalEvents = (match.momentum as Array<Record<string, unknown>>).flatMap(
          (point, index) =>
            point.event === 'goal' && (point.scoringSide === 'home' || point.scoringSide === 'away')
              ? [
                  {
                    id: `${String(match.id)}:legacy:${index}`,
                    minute: point.minute,
                    scoringSide: point.scoringSide,
                    source: 'background',
                  },
                ]
              : [],
        );
      }
    }
  }
  const result = careerSaveSchema.safeParse(parsed);
  return result.success
    ? {
        ok: true,
        save: { ...result.data, career: recoverOrphanedSeasonOneRound(result.data.career) },
      }
    : { ok: false, reason: 'invalid_data' };
};
export const deleteCareer = () => {
  if (storageAvailable()) localStorage.removeItem(CAREER_SAVE_KEY);
};
export const hasValidCareer = () => loadCareer().ok;
