import { createCareerState, generateStartingPlayerProfile, type CreatorInput } from '../core/playerCreator';
import { buildAcademySequence, ACADEMY_EVENT_POOL } from '../core/events/academyEventPool';
import { advanceCareerWeek, initializeCurrentCareerWeek } from '../core/careerWeeks';

const baseInput: CreatorInput = { firstName: 'Jan', lastName: 'Testowy', nationality: 'PL', age: 16, dominantFoot: 'right', position: 'central_midfielder', heightCm: 178, weightKg: 70, seed: 'simulation' };
const careerFor = (seed: string) => createCareerState(generateStartingPlayerProfile({ ...baseInput, seed }, seed, 0), seed);

export const simulateAcademyVariability = (samples = 500) => {
  const sequences = Array.from({ length: samples }, (_, index) => buildAcademySequence(careerFor(`academy-${index}`)));
  const counts = Object.fromEntries(ACADEMY_EVENT_POOL.map((event) => [event.eventDefinitionId, sequences.filter((sequence) => sequence.includes(event.eventDefinitionId)).length]));
  const signatures = sequences.map((sequence) => sequence.join('>'));
  const mostCommon = Object.entries(signatures.reduce<Record<string, number>>((all, value) => ({ ...all, [value]: (all[value] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const warnings = Object.entries(counts).flatMap(([id, count]) => count === 0 ? [`${id} never appeared`] : count / samples > .9 ? [`${id} appeared in over 90%`] : []);
  if ((mostCommon[0]?.[1] ?? 0) / samples > .5) warnings.push('Most careers have an identical sequence');
  return { samples, eventFrequency: counts, averageOptionalEvents: sequences.reduce((sum, sequence) => sum + sequence.length - 5, 0) / samples, mostCommonSequences: mostCommon, identicalSequencePercent: ((mostCommon[0]?.[1] ?? 0) / samples) * 100, warnings };
};

export const simulateCareerWeeks = (samples = 500, weekCount = 12) => {
  let weeks = 0, fixtures = 0, offFieldEvents = 0, quietWeeks = 0;
  for (let index = 0; index < samples; index += 1) {
    let career = careerFor(`loop-${index}`);
    career = { ...career, historyFacts: [...career.historyFacts, { id: `september-done-${index}`, factType: 'september_2026_completed', season: 2026, date: '2026-09-30', actors: [career.player.id], targets: [], clubs: [career.currentClub.id], competitions: [], data: {}, causes: [], tags: [], visibility: 'public', narrativeImportance: 60, emotionalTone: 'neutral' }] };
    career = initializeCurrentCareerWeek(career);
    for (let week = 0; week < weekCount; week += 1) {
      const current = career.careerCalendar!.weeks[career.careerCalendar!.currentWeekIndex]!;
      weeks++; fixtures += current.fixtureIds.length; offFieldEvents += current.scheduledEventIds.length; quietWeeks += current.scheduledEventIds.length === 0 ? 1 : 0;
      career = advanceCareerWeek(career);
    }
  }
  const warnings = [] as string[];
  if (offFieldEvents >= weeks * .8) warnings.push('Almost every week contains a major decision');
  if (offFieldEvents === 0) warnings.push('Careers contain no off-field events');
  return { careers: samples, weeks, fixtures, appearances: 0, averageMinutes: 0, offFieldEvents, quietWeeks, seniorAppearances: 0, academyAppearances: 0, milestones: 0, facts: weeks, ratingDistribution: {}, attributeGrowth: 0, playStyleUnlockRate: 0, repeatedConsecutiveVariantKeys: 0, warnings };
};
