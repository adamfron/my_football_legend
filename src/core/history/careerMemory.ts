import type { CareerMemory, CareerState, HistoryFact } from '../../types/domain';

export const emptyCareerMemory = (): CareerMemory => ({
  factTypeCounts: {},
  tagCounts: {},
  regularSeasonEventIds: [],
});

export const rememberFacts = (memory: CareerMemory | undefined, facts: HistoryFact[]) => {
  const next: CareerMemory = {
    factTypeCounts: { ...(memory?.factTypeCounts ?? {}) },
    tagCounts: { ...(memory?.tagCounts ?? {}) },
    regularSeasonEventIds: [...(memory?.regularSeasonEventIds ?? [])],
  };
  const events = new Set(next.regularSeasonEventIds);
  for (const fact of facts) {
    next.factTypeCounts[fact.factType] = (next.factTypeCounts[fact.factType] ?? 0) + 1;
    for (const tag of fact.tags) next.tagCounts[tag] = (next.tagCounts[tag] ?? 0) + 1;
    if (fact.factType === 'regular_season_decision' && typeof fact.data.eventId === 'string')
      events.add(fact.data.eventId);
  }
  next.regularSeasonEventIds = [...events].sort();
  return next;
};

export const hasCareerFactType = (career: CareerState, type: string) =>
  (career.careerMemory?.factTypeCounts[type] ?? 0) > 0 ||
  career.historyFacts.some((fact) => fact.factType === type);
export const hasCareerTag = (career: CareerState, tag: string) =>
  (career.careerMemory?.tagCounts[tag] ?? 0) > 0 ||
  career.historyFacts.some((f) => f.tags.includes(tag));
export const hasSeenRegularSeasonEvent = (career: CareerState, id: string) =>
  career.careerMemory?.regularSeasonEventIds.includes(id) === true ||
  career.historyFacts.some(
    (fact) => fact.factType === 'regular_season_decision' && fact.data.eventId === id,
  );
