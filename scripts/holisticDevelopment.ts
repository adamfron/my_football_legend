import { z } from 'zod';
import {
  withIntegrationProfile,
  resolveIntegrationProfile,
} from '../src/core/matchSimulation/integrationProfile';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';
import {
  decisionPolicyIdSchema,
  type DecisionPolicyId,
} from '../src/core/matchSimulation/decisionPolicyConfig';

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
  return tacticalMatchStateSchema.parse(s) as unknown as TacticalMatchState;
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
  ) =>
    observations.push(
      activationObservationSchema.parse({
        mechanism,
        configured,
        eligible,
        invoked: witness ? true : null,
        physicallyExecuted: physical && witness ? true : null,
        outcomeObserved: Boolean(witness),
        fullyEvaluated: false,
        witness,
      }),
    );
  const advanced = after.time > before.time;
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
