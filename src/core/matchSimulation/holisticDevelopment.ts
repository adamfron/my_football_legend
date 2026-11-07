import { z } from 'zod';
import type { ExecutionConsumer } from './executionWitness';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import { withIntegrationProfile, resolveIntegrationProfile } from './integrationProfile';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { decisionPolicyIdSchema, type DecisionPolicyId } from './decisionPolicyConfig';

/** A development fixture recipe over existing selectors, not a new profile API.
 * Remove the historical label BEFORE selecting undeclared development editions;
 * the ordinary saved-state schema remains the acceptance authority. */
export const holisticRecipeSchema = z.object({
  id: z.literal('holistic-physical-dev-v1'),
  experimental: z.literal(true),
  base: z.literal('realism-candidate-v1'),
  policy: decisionPolicyIdSchema,
  groundContact: z.literal('event-v1'),
  kickExecution: z.literal('contact-v1'),
  pendingStrike: z.literal('low-pass-dev-v1'),
  timeline: z.literal('standing-contact-dev-v1'),
  playerBody: z.literal('upright-cluster-dev-v1'),
});
export const holisticRecipe = (policy: DecisionPolicyId = 'state-value-v1') =>
  holisticRecipeSchema.parse({
    id: 'holistic-physical-dev-v1',
    experimental: true,
    base: 'realism-candidate-v1',
    policy,
    groundContact: 'event-v1',
    kickExecution: 'contact-v1',
    pendingStrike: 'low-pass-dev-v1',
    timeline: 'standing-contact-dev-v1',
    playerBody: 'upright-cluster-dev-v1',
  });
export const withHolisticDevelopment = (
  input: TacticalMatchState,
  policy: DecisionPolicyId = 'state-value-v1',
): TacticalMatchState => {
  const r = holisticRecipe(policy);
  const s = withIntegrationProfile(structuredClone(input), r.base, policy);
  delete s.integrationProfile;
  s.ballEnvironment = { rollingResistanceMultiplier: 1, groundContact: r.groundContact };
  s.experimentalKickExecution = r.kickExecution;
  s.experimentalPendingStrike = r.pendingStrike;
  s.experimentalContactTimeline = r.timeline;
  s.experimentalPlayerBodyImpulse = r.playerBody;
  s.executionWitnesses = {};
  return tacticalMatchStateSchema.parse(s) as unknown as TacticalMatchState;
};

export const HOLISTIC_LIMITATION =
  'Tryb ograniczony: wspólna oś kontaktu obejmuje niskie podania, prowadzenie, przyjęcia i interwencje stojąc poza strefą bramkarza. Zderzenia wyprostowanych ciał mają wspólną chronologię; komponent może liczyć najwyżej pięć ciał. Bramkarze i wysokie zagrania zachowują dotychczasowe ścieżki. Podparcie stóp i upadanie pozostają prototypami. Pełny mecz holistyczny wymaga osobnej weryfikacji.';

/** Derive the display/export identity from executing selectors, never the UI label. */
export const effectiveHolisticRecipe = (s: TacticalMatchState) => {
  const r = holisticRecipe(s.decisionPolicy);
  const base = resolveIntegrationProfile(r.base, r.policy);
  return !s.integrationProfile &&
    !s.experimentalArticulatedBody &&
    s.experimentalKickExecution === r.kickExecution &&
    s.experimentalPendingStrike === r.pendingStrike &&
    s.experimentalContactTimeline === r.timeline &&
    s.experimentalPlayerBodyImpulse === r.playerBody &&
    s.ballEnvironment?.groundContact === r.groundContact &&
    s.ballEnvironment.rollingResistanceMultiplier === 1 &&
    !s.situationalAwareness &&
    !s.prospectiveMovement &&
    s.decisionAblation === base.auxiliarySettings.decisionAblation &&
    Object.entries(base.auxiliarySettings.active).every(
      ([key, value]) =>
        s.activePerceptionConfig?.[
          key as keyof NonNullable<TacticalMatchState['activePerceptionConfig']>
        ] === value,
    ) &&
    Object.entries(base.auxiliarySettings.bounded).every(
      ([key, value]) =>
        s.boundedExperiment?.[key as keyof NonNullable<TacticalMatchState['boundedExperiment']>] ===
        value,
    ) &&
    Object.entries(base.features).every(
      ([key, value]) => Boolean(s[key as keyof TacticalMatchState]) === value,
    ) &&
    s.boundedReceiverRecovery === base.receiverRecovery
    ? r
    : undefined;
};

const invocationConsumers: Record<string, ExecutionConsumer> = {
  'pending-strike': 'pending-low-pass',
  'upright-contact': 'body-cluster',
  'shared-standing-contact': 'contact-interval',
  'kick-execution': 'physical-kick',
  'ground-contact': 'ground-contact',
  'bounded-flight-belief': 'bounded-flight-belief',
  experimentalDefensiveReception: 'defensive-reception',
  experimentalReceiverAnticipation: 'receiver-anticipation',
  boundedReceiverRecovery: 'receiver-recovery',
  experimentalHeightAwarePassing: 'height-aware-passing',
  'controlled-reception': 'controlled-reception',
  'policy-b': 'policy-b',
  'ordinary-loose-ball': 'ordinary-loose-ball',
};

export const activationObservationSchema = z.object({
  mechanism: z.string(),
  configured: z.boolean(),
  eligible: z.boolean(),
  invoked: z.boolean().nullable(),
  physicallyExecuted: z.boolean().nullable(),
  outcomeObserved: z.boolean(),
  fullyEvaluated: z.literal(false),
  witness: z.string().nullable(),
});
/** Read-only positive execution witnesses. Null means the persisted state cannot
 * identify invocation; lack of a witness is never converted into a passing test. */
export const observeHolisticActivation = (
  before: TacticalMatchState,
  after: TacticalMatchState,
) => {
  const observations: z.infer<typeof activationObservationSchema>[] = [];
  const add = (
    mechanism: string,
    configured: boolean,
    eligible: boolean,
    witness: string | null,
    physical: boolean,
  ) => {
    const consumer = invocationConsumers[mechanism];
    const current = consumer ? after.executionWitnesses?.[consumer] : undefined;
    const prior = consumer ? before.executionWitnesses?.[consumer] : undefined;
    const invoked = current && current.invoked > (prior?.invoked ?? 0);
    const executed = current && current.executed > (prior?.executed ?? 0);
    observations.push(
      activationObservationSchema.parse({
        mechanism,
        configured,
        eligible,
        invoked: witness || invoked ? true : null,
        physicallyExecuted: executed || (physical && witness) ? true : null,
        outcomeObserved: Boolean(witness),
        fullyEvaluated: false,
        witness: witness ?? (invoked ? `${current.source}:${current.at}:${current.invoked}` : null),
      }),
    );
  };
  const advanced = after.time > before.time;
  add(
    'policy-b',
    before.decisionPolicy === 'state-value-v1',
    Boolean(before.ball.ownerId),
    null,
    false,
  );
  add(
    'ordinary-loose-ball',
    Boolean(before.experimentalPlayerBodyImpulse),
    ownsOrdinaryLowBallInterval(before, 0.025),
    null,
    false,
  );
  add(
    'controlled-reception',
    Boolean(before.experimentalDefensiveReception),
    !before.ball.ownerId,
    null,
    false,
  );
  const strike = after.lastStrikeResolution;
  const freshStrike = strike && strike.id !== before.lastStrikeResolution?.id;
  add(
    'pending-strike',
    Boolean(before.experimentalPendingStrike),
    Boolean(before.pendingStrike),
    freshStrike ? `${strike.id}:${strike.at}:${strike.outcome}` : null,
    strike?.outcome === 'contact',
  );
  const clusters = advanced ? (after.multiBodyResolutions ?? []) : [];
  add(
    'upright-contact',
    Boolean(before.experimentalPlayerBodyImpulse),
    Boolean(before.pendingStrike || before.defensiveChallenge?.physicalAttempt),
    clusters.length ? `${after.time}:${clusters.map((c) => c.reason).join(',')}` : null,
    clusters.some(
      (c) => c.impulses.length > 0 || c.boundaryImpulse.x !== 0 || c.boundaryImpulse.y !== 0,
    ),
  );
  const challenge = after.lastChallenge;
  const freshChallenge = challenge?.id !== before.lastChallenge?.id && challenge?.physical;
  add(
    'shared-standing-contact',
    Boolean(before.experimentalContactTimeline),
    Boolean(before.pendingStrike || before.defensiveChallenge?.physicalAttempt),
    freshChallenge
      ? `${challenge.id}:${challenge.physical!.kind}`
      : freshStrike
        ? `${strike.id}:${strike.at}`
        : clusters.length
          ? `${after.time}:cluster`
          : null,
    Boolean(freshChallenge && challenge?.physical?.contact?.available) ||
      (freshStrike && strike?.outcome === 'contact') ||
      false,
  );
  const kick = after.lastKickExecution;
  const freshKick = kick && JSON.stringify(kick) !== JSON.stringify(before.lastKickExecution);
  add(
    'kick-execution',
    Boolean(before.experimentalKickExecution),
    Boolean(before.ball.ownerId),
    freshKick ? `${after.time}:${kick.family}` : null,
    Boolean(kick?.contact.available),
  );
  const bounce = advanced && (after.ball.bounceCount ?? 0) > (before.ball.bounceCount ?? 0);
  add(
    'ground-contact',
    before.ballEnvironment?.groundContact === 'event-v1',
    advanced && Boolean(before.ball.velocity),
    bounce ? `${after.time}:bounce:${after.ball.bounceCount}` : null,
    true,
  );
  const flight = after.liveBallFlightRuntime;
  add(
    'bounded-flight-belief',
    Boolean(before.experimentalBoundedBallFlightBelief),
    advanced,
    flight && flight.at !== before.liveBallFlightRuntime?.at
      ? `${flight.at}:sensors:${Object.keys(flight.sensors).length}`
      : null,
    false,
  );
  for (const m of resolveIntegrationProfile(
    'realism-candidate-v1',
    before.decisionPolicy ?? 'state-value-v1',
  ).mechanisms.filter(
    (m) => m.selected && !['experimentalBoundedBallFlightBelief'].includes(m.flag),
  ))
    add(
      m.flag,
      Boolean(before[m.flag as keyof TacticalMatchState]),
      m.activeForPolicy,
      null,
      m.physicalExecution,
    );
  return observations;
};
