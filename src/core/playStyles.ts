import type { CareerState, HistoryFact, PlayStyleId, PlayStyleUnlock } from '../types/domain';
import { z } from 'zod';
import type { PlayerDecisionOutcome } from './matchSimulation/matchState';

export const playStyleIdSchema = z.enum([
  'progressive_passer',
  'between_the_lines',
  'ball_winner',
  'calm_finisher',
  'engine',
  'goalkeeper_distributor',
]);
export const playStyleEvidenceSchema = z
  .object({
    style: playStyleIdSchema,
    situations: z.number().int().min(0).max(8),
    successes: z.number().int().min(0).max(8),
    contexts: z.array(z.string().max(80)).max(8),
  })
  .refine(
    (evidence) =>
      evidence.successes <= evidence.situations && evidence.contexts.length <= evidence.situations,
    {
      message: 'Behavioural evidence exceeds its qualifying situations.',
    },
  );
export type PlayStyleEvidence = z.infer<typeof playStyleEvidenceSchema>;

/** Observable context, not an objective tactical-quality verdict (reserved for PR168). */
export const qualifyingPlayStyles = (outcome: PlayerDecisionOutcome): PlayStyleId[] => {
  const c = outcome.behaviourContext;
  if (!outcome.result || !c) return [];
  const intent = outcome.selectedIntent;
  const pass = intent.startsWith('pass:') || intent === 'space_pass';
  const shot = intent.startsWith('shot:') || intent === 'header:header_shot';
  const styles: PlayStyleId[] = [];
  if (pass && c.forwardMetres >= 8 && c.opponentsBypassed > 0) styles.push('progressive_passer');
  if (
    outcome.decisionKind === 'off_ball_run' &&
    c.betweenLines &&
    (outcome.result.progressDelta ?? 0) > 0.02
  )
    styles.push('between_the_lines');
  if (
    outcome.decisionKind === 'defensive_response' &&
    c.pressOpportunity &&
    (['press', 'intercept', 'challenge'].includes(intent) || intent.startsWith('challenge:')) &&
    !intent.includes('tactical')
  )
    styles.push('ball_winner');
  if (shot && c.goalDistance <= 25 && outcome.startContext.pressure >= 0.15)
    styles.push('calm_finisher');
  if (outcome.selectedAt >= 3600 && c.activeEffort && (outcome.result.progressDelta ?? 0) > 0.02)
    styles.push('engine');
  if (c.goalkeeper && pass && c.forwardMetres >= 8 && outcome.startContext.pressure >= 0.15)
    styles.push('goalkeeper_distributor');
  return styles;
};

export const getPlayStyleProgress = (career: CareerState) =>
  playStyleIdSchema.options.map((style) => {
    const matches = career.historyFacts
      .filter((fact) => fact.factType === 'canonical_match_result')
      .flatMap((fact) => {
        const raw = (fact.data.summary as { styles?: unknown[] } | undefined)?.styles ?? [];
        const evidence = raw
          .map((value) => playStyleEvidenceSchema.safeParse(value))
          .flatMap((parsed) =>
            parsed.success && parsed.data.style === style ? [parsed.data] : [],
          );
        return evidence.some((item) => item.situations > 0)
          ? [{ fact, evidence: evidence[0]! }]
          : [];
      });
    return {
      style,
      matches: matches.length,
      situations: matches.reduce((sum, item) => sum + item.evidence.situations, 0),
      successes: matches.reduce((sum, item) => sum + item.evidence.successes, 0),
      contexts: new Set(matches.flatMap((item) => item.evidence.contexts)).size,
      relatedFacts: matches.slice(-6).map((item) => item.fact.id),
    };
  });

/** Seconds of contextual preparation experience; physical contact/readiness floors still apply. */
export const playStylePreparationRelief = (
  styles: readonly PlayStyleId[] | undefined,
  context: {
    forwardMetres: number;
    goalDistance: number;
    pressure: number;
    goalkeeper: boolean;
    pass: boolean;
    shot: boolean;
    reception?: boolean;
  },
) =>
  Math.min(
    0.04,
    Number(
      Boolean(styles?.includes('progressive_passer') && context.pass && context.forwardMetres >= 8),
    ) *
      0.025 +
      Number(
        Boolean(
          styles?.includes('goalkeeper_distributor') &&
            context.goalkeeper &&
            context.pass &&
          context.forwardMetres >= 8 &&
            context.pressure >= 0.15,
        ),
      ) *
        0.025 +
      Number(
        Boolean(
          styles?.includes('calm_finisher') &&
            context.shot &&
            context.goalDistance <= 25 &&
            context.pressure >= 0.15,
        ),
      ) *
        0.025 +
      Number(
        Boolean(
          styles?.includes('between_the_lines') && context.reception && context.pressure >= 0.15,
        ),
      ) *
        0.025,
  );

export const PLAY_STYLE_PRESENTATION: Record<
  PlayStyleId,
  { name: string; description: string; effect: string }
> = {
  progressive_passer: {
    name: 'Podanie progresywne',
    description: 'Coraz częściej potrafisz jednym podaniem przesunąć akcję przez linię rywala.',
    effect: 'Przy podaniu co najmniej 8 m do przodu skraca przygotowanie o 0,025 s.',
  },
  between_the_lines: {
    name: 'Gra między liniami',
    description: 'Regularnie znajdujesz przestrzeń poza polem widzenia pomocników.',
    effect: 'Kierunkowe przyjęcie pod presją w ataku pozycyjnym skraca przygotowanie o 0,025 s.',
  },
  ball_winner: {
    name: 'Odbiór i pressing',
    description: 'Czytasz moment doskoku i odzyskujesz piłkę.',
    effect:
      'W bliskim pressingu przewiduje ruch rywala o dodatkowe 0,02 s; odbiór nadal wymaga kontaktu.',
  },
  calm_finisher: {
    name: 'Chłodna głowa pod bramką',
    description: 'Powtarzalne dobre wybory budują spokój w polu karnym.',
    effect: 'Pod presją do 25 m od bramki skraca przygotowanie strzału o 0,025 s.',
  },
  engine: {
    name: 'Nieustępliwy silnik',
    description: 'Intensywność utrzymujesz także w późnych fazach meczu.',
    effect:
      'Po 60 minutach rzeczywistego wysiłku regeneracja gotowości podczas odpoczynku jest o 3% szybsza.',
  },
  goalkeeper_distributor: {
    name: 'Rozpoczęcie gry',
    description: 'Pod presją potrafisz rozpocząć atak celnym zagraniem.',
    effect: 'Przy progresywnym podaniu bramkarza pod presją skraca przygotowanie o 0,025 s.',
  },
};
export const getUnlockedPlayStyles = (career: CareerState): PlayStyleId[] => [
  ...new Set(
    career.historyFacts
      .filter((f) => f.factType === 'play_style_unlocked')
      .flatMap((f) => {
        const value = playStyleIdSchema.safeParse(f.data.playStyleId);
        return value.success ? [value.data] : [];
      }),
  ),
];
export const evaluatePlayStyleUnlocks = (
  career: CareerState,
  date = career.currentDate ?? career.activeMatch?.date ?? '2026-09-30',
): CareerState => {
  const existing = new Set(getUnlockedPlayStyles(career));
  const minutes =
    (career.matchHistory ?? []).reduce((s, m) => s + m.minutes, 0) +
    (career.completedSeasons ?? [])
      .filter((season) => season.seasonNumber < career.careerSeasonNumber)
      .reduce((sum, season) => sum + season.player.minutes, 0);
  const progress = getPlayStyleProgress(career);
  const attributes = career.player.attributes;
  const contextualAttributes: Record<PlayStyleId, number> = {
    progressive_passer: Math.min(attributes.passing, attributes.technique),
    between_the_lines: Math.min(attributes.positioning, attributes.gameReading),
    ball_winner: Math.min(attributes.tackling, attributes.gameReading),
    calm_finisher: Math.min(attributes.finishing, attributes.composure),
    engine: Math.min(attributes.stamina, attributes.determination),
    goalkeeper_distributor: attributes.passing,
  };
  const behavioural = progress.find(
    (p) =>
      !existing.has(p.style) &&
      p.matches >= 4 &&
      p.situations >= 8 &&
      p.successes >= 2 &&
      p.contexts >= 2 &&
      minutes >= 180 &&
      contextualAttributes[p.style] >= 45 &&
      (p.style !== 'goalkeeper_distributor' || career.player.primaryPosition === 'goalkeeper'),
  );
  if (!behavioural) return career;
  const eligible: [PlayStyleId, boolean, Record<string, number>] = [
    behavioural.style,
    true,
    {
      matches: behavioural.matches,
      situations: behavioural.situations,
      successes: behavioural.successes,
      contexts: behavioural.contexts,
      minutes,
    },
  ];
  if (!eligible) return career;
  const [playStyleId, , relevantStats] = eligible;
  const relatedFacts = behavioural.relatedFacts;
  const unlock: PlayStyleUnlock = {
    playStyleId,
    date,
    causes: relatedFacts,
    relevantStats,
    relatedFacts,
  };
  const fact: HistoryFact = {
    id: `fact_play_style_unlocked_${playStyleId}`,
    factType: 'play_style_unlocked',
    season: career.currentSeason,
    date,
    actors: [career.player.id],
    targets: [],
    clubs: [career.currentClub.id],
    competitions: [],
    data: unlock as unknown as Record<string, unknown>,
    causes: relatedFacts,
    tags: ['development', 'play_style'],
    visibility: 'public',
    narrativeImportance: 68,
    emotionalTone: 'positive',
  };
  return { ...career, historyFacts: [...career.historyFacts, fact] };
};
export const playStyleDecisionModifier = (
  career: CareerState,
  momentId: string,
  decisionId: string,
) =>
  getUnlockedPlayStyles(career).includes('progressive_passer') &&
  momentId === 'mid_progress' &&
  decisionId === 'team'
    ? 3
    : 0;
