import type { CareerState, EventDecision, EventInstance, HistoryFact, PlayerAttributes } from '../../../types/domain';
import { COACH_ID, RIVAL_ID } from '../academyArc';
import { RandomGenerator } from '../../random/RandomGenerator';
import type { EventResolution, ResolutionTier } from '../resolveEventChoice';

const tiers: ResolutionTier[] = ['criticalFailure', 'failure', 'mixed', 'success', 'criticalSuccess'];
const weighted = (attrs: PlayerAttributes, keys: (keyof PlayerAttributes)[]) => keys.reduce((sum, key) => sum + attrs[key], 0) / keys.length;
const tierFor = (score: number): ResolutionTier => score < 42 ? 'criticalFailure' : score < 54 ? 'failure' : score < 66 ? 'mixed' : score < 82 ? 'success' : 'criticalSuccess';

export const forceTierForTest = (score: number) => tierFor(score);
export const testTier = (career: CareerState, event: EventInstance, decisionId: string, attrs: (keyof PlayerAttributes)[], difficulty = 62): ResolutionTier => {
  const rng = RandomGenerator.import(event.randomState).fork(decisionId);
  const context = (career.player.morale - 50) * 0.18 + (career.player.fitness - 50) * 0.16 + (career.historyFacts.some((fact) => fact.tags.includes('coach_first_impression')) ? 2 : 0);
  return tierFor(weighted(career.player.attributes, attrs) + context + rng.int(-18, 18) - (difficulty - 60));
};

const fact = (career: CareerState, event: EventInstance, decisionId: string, type: string, objectiveOutcome: string, tier: ResolutionTier, causes: string[] = []): HistoryFact => ({
  id: `fact_${event.definitionId}_${decisionId}`,
  factType: type,
  season: career.currentSeason,
  date: String(event.context.date ?? '2026-07-01'),
  actors: [career.player.id],
  targets: event.definitionId === 'academy_coach_introduction' ? [COACH_ID] : [RIVAL_ID],
  clubs: [career.currentClub.id],
  competitions: [],
  data: { decisionId, objectiveOutcome, resolutionTier: tier },
  causes,
  tags: ['academy_first_week', ...(event.definitionId === 'academy_first_scrimmage' ? ['first_scrimmage'] : event.definitionId === 'academy_coach_introduction' ? ['coach_first_impression'] : ['first_rival'])],
  visibility: 'partial',
  narrativeImportance: event.definitionId === 'academy_first_scrimmage' ? 70 : 55,
  emotionalTone: tier.includes('Failure') ? 'negative' : tier === 'mixed' ? 'bittersweet' : 'positive',
});

export const resolveCoachIntroduction = (career: CareerState, event: EventInstance, decision: EventDecision): EventResolution => {
  const map = { ask_team_needs: ['team_action', { trust: 6, respect: 2 }, 'team_oriented'], declare_senior_ambition: ['ambition', { respect: 6 }, 'ambitious'], humble_learning: ['learning', { trust: 5, professionalDependence: 3 }, 'mature'] } as const;
  const [out, rel, frame] = map[decision.id as keyof typeof map];
  return { tier: 'success', objectiveOutcome: out, moraleDelta: decision.id === 'declare_senior_ambition' ? 3 : 0, fitnessDelta: 0, reputationDelta: 0, relationshipChanges: { [COACH_ID]: rel }, interpretations: [{ observerId: COACH_ID, frame, relationshipChanges: rel, public: false }], fact: fact(career, event, decision.id, 'academy_first_impression', out, 'success'), nextEventId: 'academy_first_scrimmage' };
};

export const resolveFirstScrimmage = (career: CareerState, event: EventInstance, decision: EventDecision): EventResolution => {
  const attrs = decision.id === 'play_rival' ? ['vision', 'technique', 'composure'] : decision.id === 'organize_team' || decision.id === 'gk_short_shape' ? ['leadership', 'composure', 'vision'] : decision.id === 'gk_safe' ? ['composure'] : ['technique', 'pace', 'finishing'];
  const tier = decision.id === 'gk_safe' ? 'mixed' : testTier(career, event, decision.id, attrs as (keyof PlayerAttributes)[]);
  const good = tiers.indexOf(tier) >= 3; const bad = tiers.indexOf(tier) <= 1;
  const rel = decision.id === 'play_rival' ? { gratitude: good ? 10 : 2, trust: good ? 5 : 0, rivalry: 2 } : decision.id.includes('organize') || decision.id === 'gk_short_shape' || decision.id === 'gk_safe' ? { trust: 2, respect: 3 } : { rivalry: 8, resentment: bad ? 8 : 2, respect: good ? 6 : 0 };
  return { tier, objectiveOutcome: `${decision.id}_${tier}`, moraleDelta: good ? 4 : bad ? -4 : 0, fitnessDelta: decision.id === 'take_action' ? -7 : -3, reputationDelta: good ? 3 : bad ? -1 : 1, relationshipChanges: { [COACH_ID]: { respect: good ? 6 : bad ? -2 : 2, trust: decision.id.includes('organize') ? 4 : 0 }, [RIVAL_ID]: rel }, interpretations: [{ observerId: COACH_ID, frame: decision.id === 'take_action' ? 'brave' : 'team_oriented', relationshipChanges: {}, public: false }, { observerId: RIVAL_ID, frame: decision.id === 'take_action' ? 'selfish' : 'team_oriented', relationshipChanges: rel, public: false }], fact: fact(career, event, decision.id, 'academy_training_result', `${decision.id}_${tier}`, tier, career.historyFacts.filter((f) => f.factType === 'academy_first_impression').map((f) => f.id)), nextEventId: 'academy_rival_reaction' };
};

export const resolveRivalReaction = (career: CareerState, event: EventInstance, decision: EventDecision): EventResolution => {
  const rel = decision.id === 'share_credit' ? { trust: 8, gratitude: 8, liking: 5 } : decision.id === 'stress_rivalry' ? { respect: 7, rivalry: 9 } : { resentment: 12, trust: -6, liking: -5 };
  return { tier: 'success', objectiveOutcome: decision.id, moraleDelta: 0, fitnessDelta: 0, reputationDelta: 0, relationshipChanges: { [RIVAL_ID]: rel }, interpretations: [{ observerId: RIVAL_ID, frame: decision.id === 'dismiss_reaction' ? 'unreliable' : decision.id === 'stress_rivalry' ? 'ambitious' : 'mature', relationshipChanges: rel, public: false }], fact: fact(career, event, decision.id, 'academy_relationship_turn', decision.id, 'success', career.historyFacts.filter((f) => f.tags.includes('first_scrimmage')).map((f) => f.id)), nextEventId: 'academy_first_week_summary' };
};
