import type { CareerState, SeasonPhase } from '../types/domain';

const DAY = 86_400_000;
export interface SeasonProgress {
  currentDate: string;
  seasonStartDate: string;
  seasonEndDate: string;
  progress: number;
  careerSeasonNumber: number;
  seasonLabel: string;
  phase: SeasonPhase;
  weeksUntilSummerWindow?: number;
}
export const seasonLabelForYear = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
/** The simulation cursor. `availableThrough` is a content horizon, not elapsed time. */
export const getCareerCurrentDate = (career: CareerState): string => {
  if (career.activeMatch?.date) return career.activeMatch.date;
  if (career.decisionPoint?.date) return career.decisionPoint.date;
  const week = career.careerCalendar?.weeks[career.careerCalendar.currentWeekIndex];
  if (week) return week.completed ? week.endDate : week.startDate;
  if (career.leagueSeason?.completed) return career.leagueSeason.endDate;
  return `${career.currentSeason}-07-01`;
};
export const getSeasonProgress = (career: CareerState): SeasonProgress => {
  const start = `${career.currentSeason}-07-01`;
  const end = `${career.currentSeason + 1}-06-30`;
  const currentDate = getCareerCurrentDate(career);
  const elapsed =
    new Date(`${currentDate}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  const duration =
    new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const phase: SeasonPhase =
    career.careerPhase ??
    (career.careerSeasonNumber === 1
      ? 'academy'
      : currentDate < `${career.currentSeason}-08-01`
        ? 'preseason'
        : currentDate > `${career.currentSeason + 1}-05-31`
          ? 'summer_window'
          : 'regular_season');
  const weeks = Math.ceil(
    (new Date(`${career.currentSeason + 1}-06-01T00:00:00Z`).getTime() -
      new Date(`${currentDate}T00:00:00Z`).getTime()) /
      (7 * DAY),
  );
  return {
    currentDate,
    seasonStartDate: start,
    seasonEndDate: end,
    progress,
    careerSeasonNumber: career.careerSeasonNumber,
    seasonLabel: seasonLabelForYear(career.currentSeason),
    phase,
    ...(weeks > 0 && weeks <= 8 ? { weeksUntilSummerWindow: weeks } : {}),
  };
};
