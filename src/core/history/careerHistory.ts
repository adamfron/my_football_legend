import type { CompletedSeasonSnapshot, HistoryFact } from '../../types/domain';

const honourLabels: Record<string, string> = {
  top_tier_champion: 'Mistrzostwo',
  division_winner: 'Zwycięstwo w lidze',
  domestic_cup_winner: 'Puchar kraju',
  top_scorer: 'Król strzelców',
  player_of_season: 'Piłkarz sezonu',
  ballon_dor: 'Złota Piłka',
};

/** Read-only query layer over canonical facts; it never creates a parallel history store. */
export const getSeasonHonours = (facts: HistoryFact[], season: CompletedSeasonSnapshot) => {
  const labels = facts
    .filter(
      (f) =>
        (f.data.seasonId === season.seasonId || f.season === Number(season.label.slice(0, 4))) &&
        f.clubs.includes(season.clubId) &&
        honourLabels[f.factType] !== undefined,
    )
    .map((f) => honourLabels[f.factType]!);
  // Safe legacy projection: the archived outcome already belongs to this club and season.
  if (season.seasonResult === 'champion' && (season.leagueTier ?? season.leagueLevel) === 1)
    labels.push('Mistrzostwo');
  if (
    season.seasonResult !== undefined &&
    season.clubFinish === 1 &&
    (season.leagueTier ?? season.leagueLevel) > 1
  )
    labels.push('Zwycięstwo w lidze');
  return [...new Set(labels)];
};

export const isPresentableCareerFact = (fact: HistoryFact) =>
  fact.narrativeImportance >= 65 &&
  (fact.tags.includes('milestone') || honourLabels[fact.factType] !== undefined);
