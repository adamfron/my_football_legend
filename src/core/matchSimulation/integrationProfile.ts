import { z } from 'zod';
import {
  decisionPolicyIdSchema,
  DEFAULT_DECISION_POLICY,
  type DecisionPolicyId,
} from './decisionPolicyConfig';
import type { TacticalMatchState } from './matchState';
import {
  INTEGRATION_MECHANISMS,
  BOUNDED_RECEIVER_RECOVERY_MECHANISM,
  SITUATIONAL_AWARENESS_MECHANISM,
  PROSPECTIVE_MOVEMENT_MECHANISM,
  wholeProfilePromotionDecisionSchema,
} from './integrationMechanisms';
import { boundedExperimentSchema } from './boundedIntelligenceState';
import { activePerceptionConfigSchema } from './activePerceptionState';

export const integrationFeaturesSchema = z
  .object({
    experimentalCanonicalArrival: z.boolean(),
    experimentalDefensiveReception: z.boolean(),
    experimentalHeightAwarePassing: z.boolean(),
    experimentalReceiverAnticipation: z.boolean(),
    experimentalReceiverSynchronisation: z.boolean(),
    experimentalObservedLoftedPasses: z.boolean(),
    experimentalBoundedBallFlightBelief: z.boolean(),
    experimentalActivePerception: z.boolean(),
    experimentalReceivingPositions: z.boolean(),
    experimentalTeamTempo: z.boolean(),
    experimentalTransitionIntelligence: z.boolean(),
    experimentalStrategicClearances: z.boolean(),
    experimentalIncidentalGoals: z.boolean(),
    experimentalBallRecovery: z.boolean(),
    experimentalRestartPreparation: z.boolean(),
    // Stateful body-v1 is deliberately excluded: it cannot be selected by a Boolean alias.
    experimentalBodyContacts: z.literal(false),
  })
  .strict();
export type IntegrationFeatures = z.infer<typeof integrationFeaturesSchema>;
export const integrationProfileIdSchema = z.enum([
  'canonical-pr199',
  'historical-pr198-s',
  'realism-candidate-v0',
  'realism-candidate-no-belief-v0',
  'realism-candidate-no-defence-v0',
  'realism-candidate-no-height-v0',
  'realism-candidate-no-loft-v0',
  'realism-candidate-v1',
  'realism-candidate-no-recovery-v1',
  'situational-awareness-v1',
  'prospective-play-v1',
]);
export type IntegrationProfileId = z.infer<typeof integrationProfileIdSchema>;
export const boundedReceiverRecoverySchema = z.literal('hold-local-v1');
export const integrationSelectionSchema = z
  .object({
    id: integrationProfileIdSchema,
    version: z.literal(0),
    policy: decisionPolicyIdSchema,
    fingerprint: z.string().regex(/^ip0-[a-f0-9]{8}$/),
  })
  .strict();

const off = Object.fromEntries(
  Object.keys(integrationFeaturesSchema.shape).map((k) => [k, false]),
) as IntegrationFeatures;
const candidate = {
  ...off,
  experimentalDefensiveReception: true,
  experimentalHeightAwarePassing: true,
  experimentalObservedLoftedPasses: true,
  experimentalReceiverAnticipation: true,
  experimentalBoundedBallFlightBelief: true,
};
const historical = {
  ...off,
  experimentalDefensiveReception: true,
  experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true,
  experimentalReceiverSynchronisation: true,
  experimentalObservedLoftedPasses: true,
  experimentalBallRecovery: true,
  experimentalRestartPreparation: true,
  experimentalTransitionIntelligence: true,
  experimentalStrategicClearances: true,
  experimentalActivePerception: true,
  experimentalReceivingPositions: true,
  experimentalTeamTempo: true,
};
const settings: Record<IntegrationProfileId, IntegrationFeatures> = {
  'canonical-pr199': off,
  'historical-pr198-s': historical,
  'realism-candidate-v0': candidate,
  'realism-candidate-no-belief-v0': { ...candidate, experimentalBoundedBallFlightBelief: false },
  'realism-candidate-no-defence-v0': { ...candidate, experimentalDefensiveReception: false },
  'realism-candidate-no-height-v0': { ...candidate, experimentalHeightAwarePassing: false },
  'realism-candidate-no-loft-v0': { ...candidate, experimentalObservedLoftedPasses: false },
  'realism-candidate-v1': candidate,
  'realism-candidate-no-recovery-v1': candidate,
  'situational-awareness-v1': candidate,
  'prospective-play-v1': candidate,
};
// Configuration switches are fixed by the profile. Briefing/knowledge/coach data
// remain fixture inputs, bound by each run's initial-state hash.
const auxiliarySettings = {
  decisionAblation: 'none' as const,
  bounded: {
    patterns: true,
    planning: true,
    individuality: true,
    relativeOpportunities: true,
    opponentLearning: true,
    psychology: false,
  },
  active: activePerceptionConfigSchema.parse({ scanning: true, memory: true, preparation: true }),
};

export const validateIntegrationFeatures = (input: IntegrationFeatures) => {
  const f = integrationFeaturesSchema.parse(input);
  if (f.experimentalReceiverSynchronisation && !f.experimentalReceiverAnticipation)
    throw Error('Synchronisation requires receiver anticipation');
  if (f.experimentalBoundedBallFlightBelief && !f.experimentalReceiverAnticipation)
    throw Error('Bounded belief requires observed receiver motor consumer');
  if (f.experimentalBoundedBallFlightBelief && f.experimentalReceiverSynchronisation)
    throw Error('PR198 synchronisation is not validated with the live sensory adapter');
  return f;
};

/** Stable configuration checksum, not a security hash. Source SHA256 is recorded separately
 * in source-bound experiment archives. No platform APIs, RNG or hidden config inheritance. */
const checksum = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `ip0-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
export const resolveIntegrationProfile = (
  id: IntegrationProfileId,
  policy: DecisionPolicyId = DEFAULT_DECISION_POLICY,
) => {
  integrationProfileIdSchema.parse(id);
  decisionPolicyIdSchema.parse(policy);
  const features = validateIntegrationFeatures({ ...settings[id] });
  const pr203 = id === 'situational-awareness-v1' || id === 'prospective-play-v1';
  const pr201 = id.endsWith('-v1');
  const awareness = pr203 ? ('bounded-v1' as const) : undefined;
  const prospective = id === 'prospective-play-v1' ? ('two-pass-v1' as const) : undefined;
  const recovery = id === 'realism-candidate-v1' || pr203 ? ('hold-local-v1' as const) : undefined;
  const implementation = pr203
    ? 'pr203-prospective-play-v1'
    : pr201
      ? 'pr201-receiver-recovery-v1'
      : 'pr200-integration-v0-final';
  const boundedPolicy = [
    'opportunity-driven-v1',
    'hierarchical-intent-v1',
    'contextual-judgment-v1',
  ].includes(policy);
  const valuePolicy = !boundedPolicy;
  const inactive = Object.keys(features).filter(
    (k) =>
      features[k as keyof IntegrationFeatures] &&
      ((k === 'experimentalObservedLoftedPasses' && !boundedPolicy) ||
        (k === 'experimentalHeightAwarePassing' && !valuePolicy)),
  );
  return {
    id,
    version: 0 as const,
    policy,
    features,
    implementation,
    ...(recovery ? { receiverRecovery: recovery } : {}),
    ...(awareness ? { situationalAwareness: awareness } : {}),
    ...(prospective ? { prospectiveMovement: prospective } : {}),
    fingerprint: checksum(
      JSON.stringify({
        implementation,
        id,
        version: 0,
        policy,
        features,
        auxiliarySettings,
        ...(recovery ? { receiverRecovery: recovery } : {}),
        ...(awareness ? { situationalAwareness: awareness } : {}),
        ...(prospective ? { prospectiveMovement: prospective } : {}),
      }),
    ),
    auxiliarySettings: structuredClone(auxiliarySettings),
    inactive,
    mechanisms: [
      ...(pr203
        ? [
            { ...SITUATIONAL_AWARENESS_MECHANISM, selected: true, activeForPolicy: true },
            {
              ...PROSPECTIVE_MOVEMENT_MECHANISM,
              selected: Boolean(prospective),
              activeForPolicy: Boolean(prospective),
            },
          ]
        : []),
      ...INTEGRATION_MECHANISMS.map((m) => ({
        ...m,
        selected: features[m.flag as keyof IntegrationFeatures],
        activeForPolicy:
          features[m.flag as keyof IntegrationFeatures] && !inactive.includes(m.flag),
        lifecycle:
          id.startsWith('realism-candidate') && features[m.flag as keyof IntegrationFeatures]
            ? 'INTEGRATION_CANDIDATE'
            : m.lifecycle,
      })),
      ...(pr201
        ? [
            {
              ...BOUNDED_RECEIVER_RECOVERY_MECHANISM,
              selected: Boolean(recovery),
              activeForPolicy: Boolean(recovery),
            },
          ]
        : []),
    ],
    dependencies: [
      'single canonical 40Hz executor',
      ...(features.experimentalBoundedBallFlightBelief
        ? [
            'liveBallFlight sensory adapter',
            'all goalkeeper movement consumers isolated',
            'observed receiver anticipation',
          ]
        : []),
    ],
    mutuallyExclusive: [
      'bounded belief / unvalidated PR198 synchronisation',
      'profile / stateful body-v1',
    ],
    decision:
      id === 'canonical-pr199'
        ? 'CANONICAL'
        : wholeProfilePromotionDecisionSchema.parse('NOT_READY_FOR_PROMOTION'),
  };
};

/** Apply atomically to a new development match. Policy is an independent explicit dimension.
 * All experimental settings are written; cached observations from another route are discarded. */
export const withIntegrationProfile = (
  state: TacticalMatchState,
  id: IntegrationProfileId,
  policy: DecisionPolicyId = state.decisionPolicy ?? 'legacy-pr176',
): TacticalMatchState => {
  const resolved = resolveIntegrationProfile(id, policy);
  const { experimentalBodyContacts: _body, ...features } = resolved.features;
  void _body;
  const next = {
    ...state,
    ...features,
    decisionPolicy: policy,
    decisionAblation: auxiliarySettings.decisionAblation,
    boundedExperiment: boundedExperimentSchema.parse({
      ...state.boundedExperiment,
      ...auxiliarySettings.bounded,
    }),
    activePerceptionConfig: { ...auxiliarySettings.active },
    integrationProfile: {
      id,
      version: resolved.version,
      policy,
      fingerprint: resolved.fingerprint,
    },
    players: state.players.map((p) => {
      const { ballMotorObservation: _old, ...body } = p;
      void _old;
      return body;
    }),
  };
  delete next.experimentalBodyContacts;
  delete (next as TacticalMatchState).ballEnvironment;
  delete (next as TacticalMatchState).experimentalKickExecution;
  delete (next as TacticalMatchState).lastKickExecution;
  delete (next as TacticalMatchState).experimentalPendingStrike;
  delete (next as TacticalMatchState).pendingStrike;
  delete (next as TacticalMatchState).lastStrikeResolution;
  delete next.liveBallFlightRuntime;
  delete next.activePerceptionRuntime;
  delete next.keeperIntervention;
  delete (next as TacticalMatchState).situationalAwareness;
  delete (next as TacticalMatchState).prospectiveMovement;
  if (resolved.situationalAwareness)
    (next as TacticalMatchState).situationalAwareness = resolved.situationalAwareness;
  if (resolved.prospectiveMovement)
    (next as TacticalMatchState).prospectiveMovement = resolved.prospectiveMovement;
  if ('receiverRecovery' in resolved) {
    (next as TacticalMatchState).boundedReceiverRecovery = resolved.receiverRecovery;
  } else {
    delete (next as TacticalMatchState).boundedReceiverRecovery;
  }
  if (next.receptionPreparation) {
    next.receptionPreparation = { ...next.receptionPreparation };
    delete next.receptionPreparation.meetingPlan;
    delete next.receptionPreparation.observedContactPoint;
  }
  return next;
};

export const integrationStateErrors = (state: TacticalMatchState) => {
  if (state.prospectiveMovement && !state.situationalAwareness)
    return ['Prospective movement requires situational awareness'];
  if (state.situationalAwareness && !state.experimentalBoundedBallFlightBelief)
    return ['Situational awareness requires bounded ball-flight belief'];
  if (state.boundedReceiverRecovery && !state.experimentalBoundedBallFlightBelief)
    return ['Receiver recovery requires bounded ball-flight belief'];
  if (
    state.experimentalBoundedBallFlightBelief &&
    (!state.experimentalReceiverAnticipation || state.experimentalReceiverSynchronisation)
  )
    return ['Live bounded belief requires anticipation and excludes unvalidated synchronisation'];
  if (!state.integrationProfile) return [];
  if (state.ballEnvironment)
    return ['Ball environment is not declared by a historical integration profile'];
  if (state.experimentalKickExecution)
    return ['Kick execution is not declared by a historical integration profile'];
  if (state.experimentalPendingStrike || state.pendingStrike)
    return ['Pending strike is not declared by a historical integration profile'];
  const expected = resolveIntegrationProfile(
    state.integrationProfile.id,
    state.integrationProfile.policy,
  );
  return [
    ...(state.situationalAwareness !== expected.situationalAwareness ||
    state.prospectiveMovement !== expected.prospectiveMovement
      ? ['Situational/prospective settings differ from saved profile']
      : []),
    ...(state.boundedReceiverRecovery !== expected.receiverRecovery
      ? ['Receiver recovery differs from saved profile']
      : []),
    ...(state.decisionAblation !== auxiliarySettings.decisionAblation
      ? ['Undeclared decision ablation']
      : []),
    ...Object.entries(auxiliarySettings.bounded)
      .filter(
        ([k, v]) => state.boundedExperiment?.[k as keyof typeof auxiliarySettings.bounded] !== v,
      )
      .map(([k]) => `Undeclared bounded switch: ${k}`),
    ...Object.entries(auxiliarySettings.active)
      .filter(
        ([k, v]) =>
          state.activePerceptionConfig?.[k as keyof typeof auxiliarySettings.active] !== v,
      )
      .map(([k]) => `Undeclared active-perception switch: ${k}`),
    ...(state.decisionPolicy !== expected.policy ? ['Policy differs from saved profile'] : []),
    ...(state.integrationProfile.fingerprint !== expected.fingerprint
      ? ['Profile fingerprint drift']
      : []),
    ...Object.entries(expected.features)
      .filter(([k, v]) => (state[k as keyof IntegrationFeatures] ?? false) !== v)
      .map(([k]) => `Profile setting differs: ${k}`),
  ];
};
