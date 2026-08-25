import type { CareerState, HistoryFact, PlayerAttributes } from '../types/domain';

export const recordAttributeChange = (
  career: CareerState,
  attribute: keyof PlayerAttributes,
  before: number,
  after: number,
  date: string,
  source: string,
  causes: string[] = [],
): CareerState => {
  if (before === after) return career;
  const id = `fact_attribute_changed_${date}_${attribute}_${before}_${after}`;
  if (career.historyFacts.some((fact) => fact.id === id)) return career;
  const fact: HistoryFact = {
    id,
    factType: 'attribute_changed',
    season: career.currentSeason,
    date,
    actors: [career.player.id],
    targets: [],
    clubs: [career.currentClub.id],
    competitions: [],
    data: { attribute, before, after, date, source, causes },
    causes,
    tags: ['development', attribute],
    visibility: 'public',
    narrativeImportance: 35,
    emotionalTone: after > before ? 'positive' : 'negative',
  };
  return {
    ...career,
    player: { ...career.player, attributes: { ...career.player.attributes, [attribute]: after } },
    historyFacts: [...career.historyFacts, fact],
  };
};

export const getMonthlyDevelopmentSummary = (career: CareerState, year: number, month: number) => {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const changes = career.historyFacts.filter(
    (f) => f.factType === 'attribute_changed' && f.date.startsWith(prefix),
  );
  const matches = (career.matchHistory ?? []).filter((m) => m.date.startsWith(prefix));
  const minutes = matches.reduce((sum, match) => sum + match.minutes, 0);
  const progress = (career.developmentProgress ?? []).reduce((sum, item) => sum + item.progress, 0);
  const training =
    career.augustPlanning?.results.filter(
      (r) => r.date.startsWith(prefix) && r.activityId.includes('training'),
    ).length ?? 0;
  const overload =
    career.augustPlanning?.results.some((r) => r.date.startsWith(prefix) && r.overloaded) ?? false;
  const level =
    changes.length >= 2 || (minutes >= 180 && training > 0)
      ? 'bardzo dobry miesiąc rozwojowy'
      : changes.length || minutes >= 90
        ? 'wyraźny postęp'
        : progress > 0 || training
          ? 'lekki postęp'
          : 'stagnacja';
  return {
    level,
    changes: changes.map((f) => f.data),
    minutes,
    matches: matches.length,
    training,
    overload,
    progress,
    narrative: changes.length
      ? 'Regularna praca przełożyła się na widoczną zmianę w profilu.'
      : progress > 0 || minutes > 0
        ? 'Nie zmieniła się jeszcze żadna liczba w profilu, ale regularna gra przybliżyła cię do kolejnego kroku.'
        : 'W tym miesiącu rozwój wyhamował; świeżość może być teraz równie ważna jak dodatkowa praca.',
  };
};
