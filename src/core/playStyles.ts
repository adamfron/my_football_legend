import type {
  CareerState,
  HistoryFact,
  MatchBehaviorTag,
  PlayStyleId,
  PlayStyleUnlock,
} from '../types/domain';

export const PLAY_STYLE_PRESENTATION: Record<
  PlayStyleId,
  { name: string; description: string; effect: string }
> = {
  progressive_passer: {
    name: 'Podanie progresywne',
    description: 'Coraz częściej potrafisz jednym podaniem przesunąć akcję przez linię rywala.',
    effect: 'W podobnych sytuacjach doświadczenie pomaga szybciej znaleźć agresywne podanie.',
  },
  between_the_lines: {
    name: 'Gra między liniami',
    description: 'Regularnie znajdujesz przestrzeń poza polem widzenia pomocników.',
    effect: 'Łatwiej dostrzegasz moment do przyjęcia między formacjami.',
  },
  ball_winner: {
    name: 'Odbiór i pressing',
    description: 'Czytasz moment doskoku i odzyskujesz piłkę.',
    effect: 'W pressingu szybciej rozpoznajesz właściwy kierunek doskoku.',
  },
  calm_finisher: {
    name: 'Chłodna głowa pod bramką',
    description: 'Powtarzalne dobre wybory budują spokój w polu karnym.',
    effect: 'W sytuacji bramkowej potrafisz dłużej zachować kontrolę.',
  },
  engine: {
    name: 'Nieustępliwy silnik',
    description: 'Intensywność utrzymujesz także w późnych fazach meczu.',
    effect: 'Zmęczenie rzadziej odbiera ci gotowość do kolejnego wysiłku.',
  },
  goalkeeper_distributor: {
    name: 'Rozpoczęcie gry',
    description: 'Pod presją potrafisz rozpocząć atak celnym zagraniem.',
    effect: 'Po przechwyceniu szybciej dostrzegasz możliwość uruchomienia kontry.',
  },
};
const countTag = (career: CareerState, tag: MatchBehaviorTag) =>
  (career.activeMatch?.resolvedMoments ?? []).filter((r) => r.behaviorTags?.includes(tag)).length +
  career.historyFacts
    .filter((f) => f.factType === 'match_played')
    .reduce(
      (sum, f) =>
        sum + ((f.data.behaviorTags as string[] | undefined)?.filter((t) => t === tag).length ?? 0),
      0,
    );
export const getUnlockedPlayStyles = (career: CareerState): PlayStyleId[] =>
  career.historyFacts
    .filter((f) => f.factType === 'play_style_unlocked')
    .map((f) => f.data.playStyleId as PlayStyleId);
export const evaluatePlayStyleUnlocks = (
  career: CareerState,
  date = career.activeMatch?.date ?? '2026-09-30',
): CareerState => {
  const existing = new Set(getUnlockedPlayStyles(career));
  const minutes = (career.matchHistory ?? []).reduce((s, m) => s + m.minutes, 0);
  const candidates: Array<[PlayStyleId, boolean, Record<string, number>]> = [
    [
      'progressive_passer',
      career.player.attributes.passing >= 58 &&
        career.player.attributes.technique >= 56 &&
        countTag(career, 'progressive_pass') >= 3 &&
        minutes >= 120,
      { progressivePasses: countTag(career, 'progressive_pass'), minutes },
    ],
    [
      'ball_winner',
      career.player.attributes.tackling >= 60 &&
        countTag(career, 'defensive_read') + countTag(career, 'pressing_action') >= 4 &&
        minutes >= 180,
      { defensiveReads: countTag(career, 'defensive_read'), minutes },
    ],
    [
      'goalkeeper_distributor',
      career.player.primaryPosition === 'goalkeeper' &&
        career.player.attributes.passing >= 57 &&
        countTag(career, 'goalkeeper_distribution') >= 3 &&
        minutes >= 150,
      { distributions: countTag(career, 'goalkeeper_distribution'), minutes },
    ],
  ];
  const eligible = candidates.find(([id, ok]) => ok && !existing.has(id));
  if (!eligible) return career;
  const [playStyleId, , relevantStats] = eligible;
  const relatedFacts = career.historyFacts
    .filter((f) => f.factType === 'match_played')
    .slice(-4)
    .map((f) => f.id);
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
