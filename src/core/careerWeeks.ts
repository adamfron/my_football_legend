import type { CareerState, CareerWeek, Fixture, HistoryFact, MonthlyCheckpoint, PlayerFormBand } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { assignedRole } from './events/postSelectionPath';

const DAY = 86_400_000;
export const CAREER_LOOP_START = '2026-10-01';
export const CAREER_LOOP_END = '2026-12-31';
export const REGULAR_SEASON_EVENT_POOL = [
  'extra_training_offer', 'recovery_needed', 'side_job_offer', 'development_purchase',
  'language_learning', 'dietitian_contact', 'competitor_conversation', 'coach_minutes_tension',
] as const;
export const QUIET_WEEK_VARIANTS = [
  'week.training_focus', 'week.role_unchanged', 'week.patient_work', 'week.recovery_and_tactics',
  'week.coach_observation',
] as const;

const iso = (date: Date) => date.toISOString().slice(0, 10);
// Avoid timezone-sensitive calendar arithmetic.
const plusDays = (date: string, days: number) => iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY));

const opponentNames = ['Gryf Łęgi', 'Unia Zalesie', 'Błękitni Port', 'Sparta Mokre', 'Mazur Cichy', 'Victoria Polana', 'Wicher Dębice', 'Orzeł Łany', 'Nadwiślanin', 'Start Brzezina', 'Kolejarz Północ', 'Pogoń Dolina'];
export const generateFixtureSchedule = (seed: string, seasonId = '2026-27'): Fixture[] => {
  const rng = RandomGenerator.fromSeed(`${seed}:fixtures:${seasonId}`);
  return Array.from({ length: 13 }, (_, weekIndex) => ({ weekIndex, date: plusDays(CAREER_LOOP_START, weekIndex * 7 + 2) }))
    .filter(({ weekIndex }) => weekIndex !== 5 && rng.float() > 0.08)
    .map(({ weekIndex, date }, index) => ({
      id: `fixture_${seasonId}_${weekIndex + 1}`, seasonId, date, competition: 'league' as const,
      opponent: { id: `opponent_${seasonId}_${index}`, name: opponentNames[index % opponentNames.length]!, strength: rng.int(46, 67), style: rng.pick(['wysoki pressing', 'niski blok', 'bezpośrednia gra', 'cierpliwe posiadanie']), strengths: [rng.pick(['stałe fragmenty', 'intensywność', 'gra skrzydłami', 'druga piłka'])], weaknesses: [rng.pick(['przestrzeń za obroną', 'wolny powrót', 'gra pod presją', 'obrona dośrodkowań'])] },
      venue: weekIndex % 2 === 0 ? 'home' as const : 'away' as const, importance: 40,
      matchImportance: 'routine' as const,
    }));
};

export const getPlayerForm = (career: CareerState): { value: number; band: PlayerFormBand } => {
  const recent = (career.matchHistory ?? []).slice(-5);
  const value = recent.length ? recent.reduce((sum, appearance, index) => sum + ((appearance.rating ?? 6) - 6) * (index + 1) + Math.min(2, appearance.minutes / 45), 0) / recent.length : 0;
  return { value, band: value >= 3 ? 'excellent' : value >= 1.5 ? 'good' : value >= 0 ? 'steady' : value >= -1.5 ? 'uneven' : 'poor' };
};

export const shouldScheduleOffFieldEvent = (career: CareerState, week: CareerWeek): boolean => {
  const previous = career.careerCalendar?.weeks.filter((item) => item.weekIndex < week.weekIndex && item.scheduledEventIds.length).at(-1);
  const gap = previous ? week.weekIndex - previous.weekIndex : week.weekIndex + 3;
  if (gap < 2) return false;
  const chance = gap >= 4 ? 0.8 : gap === 3 ? 0.42 : 0.12;
  return RandomGenerator.fromSeed(`${career.seed}:off-field:${week.id}`).bool(chance);
};

const selectVariant = (career: CareerState, weekId: string) => {
  const recent = career.recentVariantKeys ?? [];
  const available = QUIET_WEEK_VARIANTS.filter((key) => !recent.includes(key));
  return RandomGenerator.fromSeed(`${career.seed}:variant:${weekId}`).pick(available.length ? available : QUIET_WEEK_VARIANTS);
};

export const initializeCurrentCareerWeek = (career: CareerState): CareerState => {
  if (career.careerCalendar || !career.historyFacts.some((fact) => fact.factType === 'september_2026_completed')) return career;
  const fixtures = generateFixtureSchedule(career.seed);
  const weeks: CareerWeek[] = Array.from({ length: 13 }, (_, weekIndex) => {
    const startDate = plusDays(CAREER_LOOP_START, weekIndex * 7);
    const fixtureIds = fixtures.filter((fixture) => fixture.date >= startDate && fixture.date <= plusDays(startDate, 6)).map((fixture) => fixture.id);
    return { id: `week_2026_${weekIndex + 1}`, seasonId: '2026-27', weekIndex, startDate, endDate: plusDays(startDate, 6), phase: 'regular_season', fixtureIds, scheduledEventIds: [], completedEventIds: [], completed: false };
  });
  const calendar = { seasonId: '2026-27', currentWeekIndex: 0, weeks, fixtures, monthlyCheckpoints: [], availableThrough: CAREER_LOOP_END };
  const base = { ...career, careerCalendar: calendar };
  return initializeWeekContent(base, 0);
};

const initializeWeekContent = (career: CareerState, index: number): CareerState => {
  const calendar = career.careerCalendar;
  const week = calendar?.weeks[index];
  if (!calendar || !week || week.completed || week.summaryVariantKey) return career;
  const scheduledEventIds = shouldScheduleOffFieldEvent(career, week)
    ? [RandomGenerator.fromSeed(`${career.seed}:regular-event:${week.id}`).pick(REGULAR_SEASON_EVENT_POOL)] : [];
  const updated = { ...week, scheduledEventIds, summaryVariantKey: selectVariant(career, week.id) };
  return { ...career, careerCalendar: { ...calendar, weeks: calendar.weeks.map((item, i) => i === index ? updated : item) } };
};

export const getCurrentCareerWeek = (career: CareerState) => career.careerCalendar?.weeks[career.careerCalendar.currentWeekIndex];
export const getCurrentFixture = (career: CareerState) => {
  const week = getCurrentCareerWeek(career);
  return career.careerCalendar?.fixtures.find((fixture) => week?.fixtureIds.includes(fixture.id));
};

const checkpoint = (career: CareerState, month: string): MonthlyCheckpoint => {
  const matches = (career.matchHistory ?? []).filter((match) => match.date.startsWith(month));
  const ratings = matches.flatMap((match) => match.rating === undefined ? [] : [match.rating]);
  const highlight = career.historyFacts.filter((fact) => fact.date.startsWith(month)).sort((a, b) => b.narrativeImportance - a.narrativeImportance)[0];
  return { id: `checkpoint_${month}`, month, appearances: matches.length, minutes: matches.reduce((s, m) => s + m.minutes, 0), goals: matches.reduce((s, m) => s + m.goals, 0), assists: matches.reduce((s, m) => s + m.assists, 0), ...(ratings.length ? { averageRating: ratings.reduce((a, b) => a + b, 0) / ratings.length } : {}), form: getPlayerForm(career).band, role: assignedRole(career) ?? 'academy_squad', ...(highlight ? { highlightFactId: highlight.id } : {}) };
};

export const completeCareerWeek = (career: CareerState): CareerState => {
  const calendar = career.careerCalendar;
  const week = getCurrentCareerWeek(career);
  if (!calendar || !week || week.completed || (career.activeMatch && !career.activeMatch.completed)) return career;
  const completed = { ...week, completed: true, completedEventIds: week.scheduledEventIds };
  const facts: HistoryFact[] = career.historyFacts.some((f) => f.id === `fact_${week.id}`) ? career.historyFacts : [...career.historyFacts, { id: `fact_${week.id}`, factType: 'career_week_completed', season: career.currentSeason, date: week.endDate, actors: [career.player.id], targets: [], clubs: [career.currentClub.id], competitions: [], data: { fixtureIds: week.fixtureIds, eventIds: week.scheduledEventIds, variantKey: week.summaryVariantKey }, causes: [], tags: ['regular_week'], visibility: 'partial', narrativeImportance: 12, emotionalTone: 'neutral' }];
  const recentVariantKeys = [...(career.recentVariantKeys ?? []), week.summaryVariantKey!].slice(-3);
  return { ...career, activeMatch: undefined, historyFacts: facts, recentVariantKeys, careerCalendar: { ...calendar, weeks: calendar.weeks.map((item) => item.id === week.id ? completed : item) } };
};

export const advanceCareerWeek = (career: CareerState): CareerState => {
  const completedCareer = completeCareerWeek(career);
  const calendar = completedCareer.careerCalendar;
  const current = getCurrentCareerWeek(completedCareer);
  if (!calendar || !current?.completed || calendar.currentWeekIndex >= calendar.weeks.length - 1) return completedCareer;
  const nextIndex = calendar.currentWeekIndex + 1;
  let checkpoints = calendar.monthlyCheckpoints;
  const next = calendar.weeks[nextIndex]!;
  const currentMonth = current.startDate.slice(0, 7);
  if (next.startDate.slice(0, 7) !== currentMonth && !checkpoints.some((item) => item.month === currentMonth)) checkpoints = [...checkpoints, checkpoint(completedCareer, currentMonth)];
  return initializeWeekContent({ ...completedCareer, careerCalendar: { ...calendar, currentWeekIndex: nextIndex, monthlyCheckpoints: checkpoints } }, nextIndex);
};
