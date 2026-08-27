import type { CompletedSeasonSnapshot, HistoryFact } from '../../types/domain';

const honourLabels: Record<string, string> = {
  top_tier_champion: 'Mistrzostwo',
  domestic_cup_winner: 'Puchar kraju',
  top_scorer: 'Król strzelców',
  player_of_season: 'Piłkarz sezonu',
  ballon_dor: 'Złota Piłka',
};

/** Read-only query layer over canonical facts; it never creates a parallel history store. */
export const getSeasonHonours = (facts: HistoryFact[], season: CompletedSeasonSnapshot) =>
  facts
    .filter(
      (fact) =>
        fact.season === Number(season.label.slice(0, 4)) &&
        honourLabels[fact.factType] !== undefined,
    )
    .map((fact) => honourLabels[fact.factType]!);

export const isPresentableCareerFact = (fact: HistoryFact) =>
  fact.narrativeImportance >= 65 &&
  (fact.tags.includes('milestone') || honourLabels[fact.factType] !== undefined);
