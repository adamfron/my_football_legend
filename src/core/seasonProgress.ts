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
export const getSeasonProgress = (career: CareerState): SeasonProgress => {
  const start = `${career.currentSeason}-07-01`;
  const end = `${career.currentSeason + 1}-06-30`;
  const week = career.careerCalendar?.weeks[career.careerCalendar.currentWeekIndex];
  const candidates = [
    career.decisionPoint?.date,
    week?.startDate,
    career.careerCalendar?.availableThrough,
  ].filter((date): date is string => Boolean(date) && date! >= start && date! <= end);
  const currentDate = candidates.sort().at(-1) ?? start;
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
