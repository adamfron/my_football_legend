import type { z } from 'zod';
import type { CareerState, HistoryFact, Person } from '../../types/domain';
import { openingMonthRoleSchema } from '../../schemas/domainSchemas';
import {
  polishAcademyFirstNames,
  polishAcademyLastNames,
} from '../../content/names/polishAcademyNames';
import { RandomGenerator } from '../random/RandomGenerator';
import { COACH_ID, RIVAL_ID, makeEventInstance, neutralRelationship } from './academyArc';
import type { SelectionOutcome } from './resolvers/secondWeekResolvers';

export type OpeningMonthRole = z.infer<typeof openingMonthRoleSchema>;
export const SENIOR_COACH_ID = 'person_tomasz_radecki';
export const SENIOR_CAPTAIN_ID = 'person_senior_captain';
export const POST_PATH_COMPLETED = 'post_selection_path_completed';
const invited = (outcome: SelectionOutcome) =>
  outcome === 'player_invited' || outcome === 'both_invited';
const latestSelection = (career: CareerState) =>
  [...career.historyFacts].reverse().find((fact) => fact.factType === 'academy_selection_result');
export const selectionOutcomeFor = (career: CareerState) =>
  latestSelection(career)?.data.selectionOutcome as SelectionOutcome | undefined;

export const generateSeniorCoach = (career: CareerState): Person => ({
  id: SENIOR_COACH_ID,
  firstName: 'Tomasz',
  lastName: 'Radecki',
  role: 'senior_head_coach',
  nationality: 'PL',
  age: 47,
  personality: ['pragmatyczny', 'wymagający', 'bezpośredni'],
  clubId: career.currentClub.id,
  persistence: 'career',
  relationshipParameters: neutralRelationship(),
  faceSeed: `${career.currentClub.id}:tomasz-radecki`,
  narrativeTags: ['senior_staff'],
});
export const generateSeniorCaptain = (career: CareerState): Person => {
  const rng = RandomGenerator.fromSeed(`${career.seed}:${career.currentClub.id}:senior-captain`);
  const firstName = rng.pick(polishAcademyFirstNames);
  const lastName = rng.pick(polishAcademyLastNames);
  const group =
    career.player.primaryPosition === 'goalkeeper'
      ? 'center_back'
      : ['center_back', 'full_back'].includes(career.player.primaryPosition)
        ? 'defensive_midfielder'
        : ['winger', 'striker'].includes(career.player.primaryPosition)
          ? 'attacking_midfielder'
          : 'center_back';
  return {
    id: SENIOR_CAPTAIN_ID,
    firstName,
    lastName,
    role: 'senior_captain',
    nationality: 'PL',
    age: rng.int(28, 34),
    personality: rng
      .shuffle(['spokojny', 'odpowiedzialny', 'bezpośredni', 'wspierający'])
      .slice(0, rng.int(2, 3)),
    clubId: career.currentClub.id,
    persistence: 'local',
    relationshipParameters: neutralRelationship(),
    faceSeed: `${career.seed}:captain:${firstName}:${lastName}`,
    narrativeTags: ['senior_team', `position_${group}`],
  };
};
const ensureSeniorPeople = (career: CareerState) => {
  const people = [...career.significantPeople];
  const relationships = { ...career.relationships };
  for (const person of [generateSeniorCoach(career), generateSeniorCaptain(career)])
    if (!people.some((p) => p.id === person.id)) {
      people.push(person);
      relationships[person.id] = neutralRelationship();
    }
  return { ...career, significantPeople: people, relationships };
};
export const postSelectionEventSequence = (outcome: SelectionOutcome): string[] =>
  invited(outcome)
    ? ['senior_dressing_room_arrival', 'senior_first_training', 'senior_trial_role_decision']
    : outcome === 'rival_invited_player_plan'
      ? ['development_plan_meeting', 'rival_promoted_reaction', 'development_plan_assessment']
      : [
          'academy_extra_match_preparation',
          'academy_extra_match',
          'academy_extra_match_role_decision',
        ];
export const initializePostSelectionPath = (career: CareerState): CareerState => {
  const outcome = selectionOutcomeFor(career);
  if (
    !outcome ||
    career.activeEvent ||
    career.historyFacts.some((f) => f.factType === POST_PATH_COMPLETED)
  )
    return career;
  const next = invited(outcome) ? ensureSeniorPeople(career) : career;
  const sequence = postSelectionEventSequence(outcome);
  const completedEvents = new Set(
    next.historyFacts
      .filter((f) => f.tags.includes('post_selection'))
      .map((f) => String(f.data.eventId ?? '')),
  );
  const eventId = sequence.find((id) => !completedEvents.has(id));
  return eventId ? { ...next, activeEvent: makeEventInstance(next, eventId) } : next;
};
export const roleStatus = (role: unknown) =>
  ({
    senior_training_rotation: 'Regularnie trenuje z pierwszym zespołem',
    senior_trial_extended: 'Pozostaje na okresie próbnym u seniorów',
    weekly_senior_access: 'Łączy akademię z cotygodniowym treningiem seniorów',
    academy_leader: 'Stał się jednym z liderów akademii',
    individual_development_plan: 'Realizuje indywidualny plan rozwoju',
    academy_match_opportunity: 'Czeka na kolejną szansę w ważnym meczu akademii',
  })[String(role)] ?? 'Zawodnik akademii';
export const assignedRole = (career: CareerState): OpeningMonthRole | undefined => {
  const value = [...career.historyFacts]
    .reverse()
    .find((f) => f.factType === 'opening_month_role_assigned')?.data.role;
  return openingMonthRoleSchema.safeParse(value).success ? (value as OpeningMonthRole) : undefined;
};
export const makePathFact = (
  career: CareerState,
  factType: string,
  data: Record<string, unknown>,
  importance = 75,
): HistoryFact => ({
  id: `fact_${factType}`,
  factType,
  season: career.currentSeason,
  date: String(career.activeEvent?.context.date ?? '2026-07-17'),
  actors: [career.player.id],
  targets: [COACH_ID, RIVAL_ID].filter((id) => career.significantPeople.some((p) => p.id === id)),
  clubs: [career.currentClub.id],
  competitions: [],
  data,
  causes: career.historyFacts.slice(-8).map((f) => f.id),
  tags: ['post_selection', factType],
  visibility: 'partial',
  narrativeImportance: importance,
  emotionalTone: 'bittersweet',
});
