import { z } from 'zod';
import type { CareerState, CompletedSeasonSnapshot } from '../../types/domain';
import { getSeasonOutfieldStats, getSeasonGoalkeeperStats } from '../seasonParticipation';
import { getSeasonHonours } from '../history/careerHistory';
import { getDistinctCareerFacts } from './careerEvidence';
import { getFactPresentation } from './factPresentation';
import { selectNarrativeVariant, type NarrativeVariantSet } from './narrativeVariants';
import { translate } from './localization';
import { positionCode } from '../positionPresentation';
import { getProfileAge } from '../age';
import { createCompletedSeasonSnapshot } from '../seasonArchive';

export const careerNewsItemSchema = z.object({
  id: z.string(),
  factId: z.string(),
  date: z.string(),
  headline: z.string(),
  summary: z.string(),
  category: z.enum(['achievement', 'club', 'transfer', 'development', 'health', 'season']),
  clubName: z.string().optional(),
});
export type CareerNewsItem = z.infer<typeof careerNewsItemSchema>;

const categories: Record<string, CareerNewsItem['category']> = {
  top_tier_champion: 'achievement',
  division_winner: 'achievement',
  club_promoted: 'club',
  club_relegated: 'club',
  transfer_completed: 'transfer',
  first_professional_contract: 'transfer',
  contract_renewed: 'transfer',
  contract_renegotiated: 'transfer',
  contract_negotiation_rejected: 'transfer',
  head_coach_changed: 'club',
  senior_debut: 'development',
  first_senior_goal: 'achievement',
  first_senior_assist: 'achievement',
  play_style_unlocked: 'development',
  career_stat_milestone: 'achievement',
  career_longevity: 'achievement',
  injury_started: 'health',
  injury_recovered: 'health',
  player_injured: 'health',
  season_completed: 'season',
  retired: 'achievement',
  canonical_match_result: 'achievement',
};
export const NEWS_VARIANTS: NarrativeVariantSet = {
  id: 'career_news_v1',
  variants: [
    { key: 'news.title.direct' },
    { key: 'news.title.club', requiredTags: ['club'] },
    { key: 'news.title.date' },
  ],
};
/** Pure bounded projection. Every article points to one retained fact; no articles are persisted. */
export const buildCareerNews = (career: CareerState, limit = 24): CareerNewsItem[] => {
  if (limit <= 0) return [];
  const previousKeys = new Map<string, string>();
  const significantMatch = (data: Record<string, unknown>) => {
    const parsed = z
      .object({
        rating: z.number().optional(),
        status: z.string().optional(),
        provenance: z.unknown().optional(),
        playerStatistics: z.object({ goals: z.number(), saves: z.number() }).nullable().optional(),
      })
      .safeParse(data.summary);
    return (
      parsed.success &&
      parsed.data.status === 'full_time' &&
      !parsed.data.provenance &&
      ((parsed.data.rating ?? 0) >= 9 ||
        (parsed.data.playerStatistics?.goals ?? 0) >= 3 ||
        (parsed.data.playerStatistics?.saves ?? 0) >= 8)
    );
  };
  return getDistinctCareerFacts(career.historyFacts)
    .filter(
      (f) =>
        categories[f.factType] &&
        f.visibility !== 'hidden' &&
        (f.factType === 'canonical_match_result'
          ? significantMatch(f.data)
          : f.narrativeImportance >= 60) &&
        (!['injury_started', 'player_injured'].includes(f.factType) ||
          f.data.severity === 'major' ||
          f.data.severity === 'moderate'),
    )
    .map((f) => {
      const p = getFactPresentation(career, f);
      if (f.factType === 'canonical_match_result') p.title = 'Wyróżniający się występ';
      const variants = NEWS_VARIANTS.variants.filter(
        (v) => p.clubName || !v.requiredTags?.includes('club'),
      );
      let key = selectNarrativeVariant(NEWS_VARIANTS, {
        careerSeed: career.seed,
        scope: f.id,
        tags: p.clubName ? ['club'] : [],
        factIds: [f.id],
      });
      if (previousKeys.get(f.factType) === key)
        key = variants[(variants.findIndex((v) => v.key === key) + 1) % variants.length]!.key;
      previousKeys.set(f.factType, key);
      return careerNewsItemSchema.parse({
        id: `news:${f.id}`,
        factId: f.id,
        date: f.date,
        headline: translate(key, {
          title: p.title,
          club: p.clubName ?? '',
          season: `${f.season}/${f.season + 1}`,
        }),
        summary: p.summary,
        category: categories[f.factType],
        clubName: p.clubName,
      });
    })
    .slice(-Math.min(60, limit))
    .reverse();
};

/** Snapshots and current ledger never contribute the same season twice. Youth remains labelled. */
export const getCareerStatistics = (career: CareerState) => {
  const seasons = [
    ...new Map((career.completedSeasons ?? []).map((s) => [s.seasonId, s])).values(),
  ];
  const current = getSeasonOutfieldStats(career.seasonParticipation ?? []);
  const currentGK = getSeasonGoalkeeperStats(career.seasonParticipation ?? []);
  const includeCurrent = !seasons.some((s) => s.seasonId === career.leagueSeason?.id);
  const totals = seasons.reduce(
    (sum, s) => ({
      appearances: sum.appearances + s.player.appearances,
      starts: sum.starts + s.player.starts,
      minutes: sum.minutes + s.player.minutes,
      goals: sum.goals + s.player.goals,
      assists: sum.assists + s.player.assists,
      cleanSheets:
        sum.cleanSheets +
        s.matches.filter(
          (m) =>
            m.minutes > 0 &&
            m.goalkeeper?.cleanSheet &&
            m.metricsSource !== 'canonical_plus_summary',
        ).length,
    }),
    {
      appearances: includeCurrent ? current.appearances : 0,
      starts: includeCurrent ? current.starts : 0,
      minutes: includeCurrent ? current.minutes : 0,
      goals: includeCurrent ? current.goals : 0,
      assists: includeCurrent ? current.assists : 0,
      cleanSheets: includeCurrent ? currentGK.cleanSheets : 0,
    },
  );
  return {
    current: { ...current, cleanSheets: currentGK.cleanSheets },
    totals,
    seasons: seasons.length + Number(includeCurrent && current.appearances > 0),
    nationalTeam: { available: false as const },
    partialActions:
      (career.seasonParticipation ?? []).some(
        (r) => r.metricsSource === 'canonical_plus_summary',
      ) ||
      seasons.some((s) => s.matches.some((m) => m.metricsSource === 'canonical_plus_summary')) ||
      career.historyFacts.some(
        (f) =>
          (f.data.summary as { provenance?: { source?: string } } | undefined)?.provenance
            ?.source === 'canonical_plus_summary',
      ),
  };
};

export const buildSeasonNarrative = (
  career: CareerState,
  season: CompletedSeasonSnapshot,
): string[] => {
  const p = season.player;
  const partialActions =
    season.matches.some((m) => m.metricsSource === 'canonical_plus_summary') ||
    career.historyFacts.some(
      (f) =>
        f.season === Number(season.label.slice(0, 4)) &&
        (f.data.summary as { provenance?: { source?: string } } | undefined)?.provenance?.source ===
          'canonical_plus_summary',
    );
  const honours = getSeasonHonours(career.historyFacts, season);
  const outcome =
    season.seasonResult === 'relegated'
      ? 'Sezon zakończył się spadkiem.'
      : season.seasonResult === 'promoted'
        ? 'Zespół wywalczył awans.'
        : honours.includes('Mistrzostwo')
          ? 'Zespół zdobył mistrzostwo najwyższej ligi.'
          : `Zespół zakończył ligę na ${season.clubFinish}. miejscu.`;
  const previous = (career.completedSeasons ?? [])
    .filter((s) => s.seasonNumber < season.seasonNumber)
    .sort((a, b) => b.seasonNumber - a.seasonNumber)[0];
  const share = season.matches.length ? p.starts / season.matches.length : 0;
  const role =
    p.missedByInjury >= 5
      ? 'Urazy wyraźnie ograniczyły udział w sezonie.'
      : previous && previous.player.minutes < 900 && p.minutes >= 1800
        ? 'To był przełom pod względem czasu na boisku.'
        : share >= 0.65
          ? 'Regularne miejsce w pierwszym składzie było ważną częścią tego sezonu.'
          : p.minutes < 900
            ? 'Możliwości gry pozostawały ograniczone.'
            : 'Występy łączyły pierwszy skład i rolę rezerwowego.';
  const keeper = season.matches.filter((m) => m.goalkeeper);
  const contribution = keeper.length
    ? `${keeper.reduce((n, m) => n + (m.goalkeeper?.saves ?? 0), 0)} zapisanych obron; ${keeper.filter((m) => m.goalkeeper?.cleanSheet && m.metricsSource !== 'canonical_plus_summary').length} potwierdzonych czystych kont.`
    : `Gole: ${p.goals}; asysty: ${p.assists}.`;
  const change = season.development.seasonEndOVR - season.development.seasonStartOVR;
  const development =
    change >= 3
      ? `OVR wzrósł o ${change}.`
      : change <= -3
        ? `OVR spadł o ${-change}.`
        : 'OVR pozostał na zbliżonym poziomie.';
  const paragraphs = [
    `${season.clubName} · ${season.leagueName}. ${outcome}`,
    `${role} Występy: ${p.appearances}; minuty: ${Math.round(p.minutes)}. ${contribution}${p.ratedAppearances ? ` Średnia z ${p.ratedAppearances} ocen: ${p.averageRating.toFixed(1).replace('.', ',')}.` : ''}`,
    `${development}${p.missedByInjury ? ` Opuszczone przez uraz: ${p.missedByInjury}.` : ''}${p.missedBySuspension ? ` Opuszczone przez zawieszenie: ${p.missedBySuspension}.` : ''}`,
  ];
  if (previous && previous.player.minutes !== p.minutes)
    paragraphs.push(
      `${previous.clubId !== season.clubId ? 'Po zmianie klubu' : 'W porównaniu z poprzednim sezonem'} liczba minut ${p.minutes > previous.player.minutes ? 'wzrosła' : 'spadła'} z ${Math.round(previous.player.minutes)} do ${Math.round(p.minutes)}.`,
    );
  const positions = [
    ...new Set(
      season.matches.flatMap((m) =>
        m.minutes > 0 && m.assignedPosition ? [positionCode(m.assignedPosition)] : [],
      ),
    ),
  ];
  if (positions.length > 1)
    paragraphs.push(`Zapisane występy na pozycjach: ${positions.join(', ')}.`);
  if (partialActions)
    paragraphs.push(
      'Część meczów dokończono statystycznie. Indywidualne gole, asysty i akcje obejmują wyłącznie zachowany zapis; minut i wyników nie brakuje.',
    );
  return paragraphs;
};

export const buildRetirementNarrative = (career: CareerState): string => {
  const s = getCareerStatistics(career);
  const seasons = [...(career.completedSeasons ?? [])];
  if (
    career.leagueSeason &&
    s.current.appearances > 0 &&
    !seasons.some((y) => y.seasonId === career.leagueSeason?.id)
  )
    seasons.push(createCompletedSeasonSnapshot(career));
  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
  const start = career.historyFacts.find((f) => f.factType === 'career_started');
  const first =
    (start ? getFactPresentation(career, start).clubName : undefined) ?? seasons[0]?.clubName;
  const titles = seasons.filter((y) =>
    getSeasonHonours(career.historyFacts, y).includes('Mistrzostwo'),
  ).length;
  const transfers = getDistinctCareerFacts(career.historyFacts).filter(
    (f) => f.factType === 'transfer_completed',
  ).length;
  const injuries = getDistinctCareerFacts(career.historyFacts).filter(
    (f) => f.factType === 'player_injured',
  ).length;
  const positions = [
    ...new Set(
      seasons.flatMap((y) =>
        y.matches.flatMap((m) =>
          m.assignedPosition && m.minutes > 0 ? [positionCode(m.assignedPosition)] : [],
        ),
      ),
    ),
  ];
  return `Od ${first ?? 'pierwszego klubu'} do ${career.currentClub.name}: sezony z zapisanym udziałem: ${s.seasons}. Występy: ${s.totals.appearances}; gole: ${s.totals.goals}; asysty: ${s.totals.assists}. ${titles ? `Mistrzostwa najwyższej ligi: ${titles}.` : 'Bez mistrzostwa najwyższej ligi w zachowanym dorobku.'} Transfery: ${transfers}. Najwyższy zapisany OVR: ${career.highestOVR ?? '—'}.${positions.length ? ` Pozycje: ${positions.join(', ')}.` : ''}${injuries ? ` Istotne urazy w zachowanej historii: ${injuries}.` : ''}`;
};

export const careerStorySchema = z.object({
  id: z.string(),
  sourceIds: z.array(z.string()).min(1),
  text: z.string(),
});
/** Modular interpretations carry source references, and are rebuilt rather than accumulated. */
export const buildCareerStories = (career: CareerState) => {
  const stories: z.infer<typeof careerStorySchema>[] = [];
  const add = (id: string, sourceIds: string[], text: string) =>
    stories.push(careerStorySchema.parse({ id, sourceIds, text }));
  const rows = (career.seasonParticipation ?? []).filter(
    (r) => (r.canonicalStats?.minutesPlayed ?? r.minutes) > 0,
  );
  const recent = rows.filter((r) => r.rating !== undefined).slice(-5);
  if (recent.length === 5 && recent.every((r) => r.rating! >= 7))
    add(
      'good_form',
      recent.map((r) => r.fixtureId),
      'Pięć ostatnich ocenionych występów przyniosło oceny co najmniej 7,0. To potwierdzona seria dobrych występów.',
    );
  if (recent.length === 5 && recent.every((r) => r.rating! < 6))
    add(
      'difficult_form',
      recent.map((r) => r.fixtureId),
      'Pięć ostatnich ocenionych występów zakończyło się ocenami poniżej 6,0. To trudniejszy fragment sezonu.',
    );
  if (rows.length >= 15 && rows.filter((r) => r.started).length / rows.length >= 0.7)
    add(
      'regular',
      rows.map((r) => r.fixtureId),
      'W co najmniej 70% zapisanych występów tego sezonu rozpoczynałeś w pierwszym składzie.',
    );
  const seasons = [...(career.completedSeasons ?? [])].sort(
    (a, b) => b.seasonNumber - a.seasonNumber,
  );
  const previous = seasons[0];
  if (
    previous &&
    previous.clubId !== career.currentClub.id &&
    rows.reduce((n, r) => n + (r.canonicalStats?.minutesPlayed ?? r.minutes), 0) >
      previous.player.minutes
  )
    add(
      'transfer_minutes',
      [previous.seasonId, ...rows.map((r) => r.fixtureId)],
      'Po zmianie klubu liczba minut w obecnym sezonie przekroczyła wynik z całego poprzedniego sezonu.',
    );
  if (seasons.length >= 3 && seasons.slice(0, 3).every((s) => s.clubId === career.currentClub.id))
    add(
      'club_continuity',
      seasons.slice(0, 3).map((s) => s.seasonId),
      'Trzy ostatnie zakończone sezony spędziłeś w obecnym klubie.',
    );
  const changedPositions = rows.filter(
    (r) => r.assignedPosition && r.assignedPosition !== career.player.primaryPosition,
  );
  if (changedPositions.length >= 8)
    add(
      'position_use',
      changedPositions.map((r) => r.fixtureId),
      'Co najmniej osiem występów tego sezonu odbyło się poza twoją główną pozycją. To zapis faktycznego wykorzystania przez trenera.',
    );
  const injuryFacts = getDistinctCareerFacts(career.historyFacts).filter(
    (f) => f.factType === 'player_injured',
  );
  if (injuryFacts.length >= 3)
    add(
      'recurring_injuries',
      injuryFacts.slice(-3).map((f) => f.id),
      'W historii zapisano co najmniej trzy istotne urazy. Każdy dotyczy odrębnego okresu kariery.',
    );
  const age = getProfileAge(career.player, career.currentDate ?? `${career.currentSeason}-07-01`);
  if (age >= 34 && previous)
    add(
      'veteran',
      [previous.seasonId],
      `W wieku ${age} lat kontynuujesz karierę jako doświadczony zawodnik.`,
    );
  const titleSeasons = seasons.filter((s) =>
    getSeasonHonours(career.historyFacts, s).includes('Mistrzostwo'),
  );
  if (titleSeasons.length >= 2)
    add(
      'repeated_titles',
      titleSeasons.map((s) => s.seasonId),
      `Mistrzostwa najwyższej ligi w zachowanym dorobku: ${titleSeasons.length}.`,
    );
  return stories.slice(-6);
};
