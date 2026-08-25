import type { CareerState, EventDecision, EventInstance } from '../../../types/domain';
import type { EventResolution } from '../resolveEventChoice';
import {
  resolveCoachIntroduction,
  resolveFirstScrimmage,
  resolveRivalReaction,
} from './firstWeekResolvers';
import {
  resolveFinalAssessment,
  resolveRivalExtraSession,
  resolveSecondWeekSummary,
  resolveSelectionAnnouncement,
  resolveSelectionResponse,
  resolveWeekTwoFeedback,
} from './secondWeekResolvers';
import { resolvePostSelectionEvent } from './postSelectionResolvers';
export type EventResolver = (
  career: CareerState,
  event: EventInstance,
  decision: EventDecision,
) => EventResolution;
export const resolverRegistry: Record<string, EventResolver> = {
  academy_coach_introduction: resolveCoachIntroduction,
  academy_first_scrimmage: resolveFirstScrimmage,
  academy_rival_reaction: resolveRivalReaction,
  academy_week_two_feedback: resolveWeekTwoFeedback,
  academy_rival_extra_session: resolveRivalExtraSession,
  academy_final_assessment: resolveFinalAssessment,
  academy_selection_announcement: resolveSelectionAnnouncement,
  academy_selection_response: resolveSelectionResponse,
  academy_second_week_summary: resolveSecondWeekSummary,
  senior_dressing_room_arrival: resolvePostSelectionEvent,
  senior_first_training: resolvePostSelectionEvent,
  senior_trial_role_decision: resolvePostSelectionEvent,
  development_plan_meeting: resolvePostSelectionEvent,
  rival_promoted_reaction: resolvePostSelectionEvent,
  development_plan_assessment: resolvePostSelectionEvent,
  academy_extra_match_preparation: resolvePostSelectionEvent,
  academy_extra_match: resolvePostSelectionEvent,
  academy_extra_match_role_decision: resolvePostSelectionEvent,
};
export const getEventResolver = (definitionId: string) => resolverRegistry[definitionId];
