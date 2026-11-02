import { z } from 'zod';
import {
  INTEGRATION_MECHANISMS,
  BOUNDED_RECEIVER_RECOVERY_MECHANISM,
  SITUATIONAL_AWARENESS_MECHANISM,
  PROSPECTIVE_MOVEMENT_MECHANISM,
} from '../src/core/matchSimulation/integrationMechanisms.ts';
import { resolveIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import { files, hash, normalized } from './pr199Evidence.mjs';
import { read } from './pr214Evidence.mjs';
const row = z.object({
  id: z.string(),
  implementation: z.string(),
  consumer: z.string(),
  origin: z.number().int(),
  dependencies: z.string().array(),
  editions: z.string().array(),
  exclusions: z.string().array(),
  policies: z.string(),
  actions: z.string(),
  limitations: z.string(),
  evidence: z.string().array(),
  fullMatchEvidence: z.string().nullable(),
  localValidated: z.boolean(),
  selected: z.boolean(),
  readyForPolicyB: z.boolean(),
  empiricalCalibrationRequired: z.boolean(),
  live: z.boolean(),
  status: z.enum([
    'LOCAL_VALIDATED',
    'INTEGRATION_READY',
    'INTEGRATION_BLOCKED',
    'DIAGNOSTIC_ONLY',
  ]),
  sourceLocations: z.string().array(),
});
export const holisticInventory = () => {
  const selected = resolveIntegrationProfile('realism-candidate-v1', 'state-value-v1')
    .mechanisms.filter((m) => m.selected)
    .map((m) => m.flag);
  const sources = files('src/core/matchSimulation')
    .filter((p) => !p.includes('.test.'))
    .map((p) => [p, normalized(p)]);
  const records = [
    ...INTEGRATION_MECHANISMS,
    BOUNDED_RECEIVER_RECOVERY_MECHANISM,
    SITUATIONAL_AWARENESS_MECHANISM,
    PROSPECTIVE_MOVEMENT_MECHANISM,
  ].map((m) =>
    row.parse({
      id: m.flag,
      implementation: m.entry,
      consumer: m.consumer,
      origin: m.origin,
      dependencies: m.dependencies,
      editions:
        m.flag === 'prospectiveMovement'
          ? ['two-pass-v1', 'two-pass-continuity-dev-v1', 'observed-ball-contact-dev-v1']
          : m.flag === 'boundedReceiverRecovery'
            ? ['hold-local-v1']
            : ['existing-selector'],
      exclusions:
        m.flag === 'experimentalReceiverSynchronisation'
          ? ['experimentalBoundedBallFlightBelief']
          : m.flag === 'experimentalBodyContacts'
            ? ['historical integration profiles']
            : [],
      policies: m.policies,
      actions: m.consumer,
      limitations: m.negative,
      evidence: [m.evidence],
      fullMatchEvidence:
        m.origin <= 201
          ? `docs/performance/pr${m.origin}/ (historical development scope; see original report)`
          : null,
      localValidated: true,
      selected: selected.includes(m.flag),
      readyForPolicyB: selected.includes(m.flag) && m.policies !== 'bounded',
      empiricalCalibrationRequired: true,
      live: true,
      status:
        selected.includes(m.flag) && m.policies !== 'bounded'
          ? 'INTEGRATION_READY'
          : 'INTEGRATION_BLOCKED',
      sourceLocations: sources.filter(([, t]) => t.includes(m.flag)).map(([p]) => p),
    }),
  );
  const extra = [
    [
      'kick-execution',
      207,
      'kickExecution.executePhysicalKick',
      'matchActions eligible settled pass / shot release',
      ['finite foot capability'],
      ['contact-v1'],
      ['pending release has priority on the same low pass'],
      'all',
      'settled inside ground pass; placed/driven shot',
      'Narrow shot dispersion; preparation/retention regressions; loft/cross/first-time/keeper excluded',
      'docs/performance/pr207/summary.json',
      true,
      true,
    ],
    [
      'ground-contact',
      208,
      'ballPhysics.integrateBallFlight',
      'canonical integrator and physical forecasts',
      [],
      ['legacy-v1', 'event-v1'],
      ['historical named profiles reject event-v1'],
      'all',
      'rolling / descending ground impact / remaining flight',
      'Material/rolling assumptions uncalibrated; cognitive beliefs retain their approximation',
      'docs/performance/pr208/summary.json',
      true,
      true,
    ],
    [
      'temporal-strike-laboratory',
      209,
      'temporalFootStrike.executeTemporalStrike',
      'laboratory only; shared primitive feeds pending strike',
      [],
      ['temporal-contact-dev-v1'],
      ['direct live mini-match execution'],
      'laboratory',
      'low inside-foot pass primitive',
      'Not a live selector; four historical unresolved searches retained',
      'docs/PR209_MOVING_BALL_STRIKE_AND_BOUNCE_RECEPTION.md',
      false,
      false,
    ],
    [
      'human-readiness',
      210,
      'playerDecision.projectPlayerAgency',
      'ordinary menu / physical release readiness / whole-world pause',
      ['finite foot access'],
      ['current canonical'],
      [],
      'human',
      'owned contact; carry pursuit; incoming preparation; movement intervention',
      'No exact unavailable historical user save; no new universal action physics',
      'docs/performance/pr210/after.json.gz',
      true,
      true,
    ],
    [
      'pending-strike',
      211,
      'pendingStrike + pendingStrikeInterval',
      'canonical committed low-pass lifecycle',
      ['event-v1'],
      ['low-pass-dev-v1'],
      ['historical named profiles'],
      'all',
      'owned low inside-foot ground pass only',
      'Other releases remain instantaneous; preparation calibration incomplete',
      'docs/performance/pr211/canonical-final-v4.json.gz',
      true,
      true,
    ],
    [
      'shared-standing-contact',
      212,
      'sharedContactTimeline + pendingStrikeInterval',
      'earliest prepared/defensive foot, passive body, expiry, boundary',
      ['low-pass-dev-v1', 'event-v1'],
      ['standing-contact-dev-v1'],
      ['historical named profiles'],
      'all',
      'standing inside-foot poke; pending low pass',
      'Slide/committed/keeper active contact not migrated; same actor once/interval',
      'docs/performance/pr212/canonical-final-v3.json.gz',
      true,
      true,
    ],
    [
      'upright-contact',
      213,
      'playerBodyContact + multiBodyContact',
      'canonical pending/standing interval body response',
      ['standing-contact-dev-v1', 'low-pass-dev-v1', 'event-v1'],
      ['upright-pair-dev-v1', 'upright-cluster-dev-v1'],
      ['pair and cluster are alternative editions'],
      'all',
      '2–4 upright outfield torso cores; player movement edges',
      'Cluster origin PR214; only existing pending/standing intervals; >4, deep overlap, tangent unresolved; clinch coupling unclosed',
      'docs/performance/pr214/summary-final-v3.json',
      true,
      false,
    ],
  ];
  for (const [
    id,
    origin,
    implementation,
    consumer,
    dependencies,
    editions,
    exclusions,
    policies,
    actions,
    limitations,
    evidence,
    live,
    ready,
  ] of extra)
    records.push(
      row.parse({
        id,
        origin,
        implementation,
        consumer,
        dependencies,
        editions,
        exclusions,
        policies,
        actions,
        limitations,
        evidence: [evidence],
        fullMatchEvidence:
          id === 'human-readiness' ? 'docs/performance/pr210/interactive-smoke.json' : null,
        localValidated: true,
        selected: live,
        readyForPolicyB: ready,
        empiricalCalibrationRequired: id !== 'human-readiness',
        live,
        status: !live ? 'DIAGNOSTIC_ONLY' : ready ? 'INTEGRATION_READY' : 'INTEGRATION_BLOCKED',
        sourceLocations: sources
          .filter(([, t]) => t.includes(String(implementation).split(/[.+ ]/)[0]))
          .map(([p]) => p),
      }),
    );
  const progress = read('docs/match-engine/REALISM_PROGRESS.json');
  const alternatives = [
    {
      mechanism: 'prospectiveMovement',
      edition: 'two-pass-v1',
      origin: 203,
      successor: 'two-pass-continuity-dev-v1',
      limitation: 'downstream control losses',
    },
    {
      mechanism: 'prospectiveMovement',
      edition: 'two-pass-continuity-dev-v1',
      origin: 204,
      successor: 'observed-ball-contact-dev-v1',
      limitation: 'observed contact parity losses',
    },
    {
      mechanism: 'upright-contact',
      edition: 'upright-pair-dev-v1',
      origin: 213,
      successor: 'upright-cluster-dev-v1 (scoped)',
      limitation: 'third body / player edge unresolved',
    },
    {
      mechanism: 'ground-contact',
      edition: 'legacy-v1',
      origin: 178,
      successor: 'event-v1',
      limitation: 'shallow upward sign discontinuity',
    },
  ];
  return {
    schema: 'pr214-holistic-inventory-v1',
    records,
    historicalAlternatives: alternatives,
    counts: {
      experimentalAndAgencyFamilies: records.length,
      liveFamilies: records.filter((m) => m.live).length,
      historicalAlternativeEditions: alternatives.length,
      locallyValidatedFamilies: records.filter((m) => m.localValidated).length,
      compatiblePolicyBDevelopmentFamilies: records.filter((m) => m.readyForPolicyB).length,
      blockedFamilies: records.filter((m) => m.status === 'INTEGRATION_BLOCKED').length,
      policySpecificFamilies: records.filter((m) => m.policies !== 'all').length,
      requiringCalibration: records.filter((m) => m.empiricalCalibrationRequired).length,
    },
    canonicalSharedConsumers: [
      'canonicalMovement / locomotion / lowerBodyGeometry',
      'finite foot carry / first touch / control',
      'ball flight / passive body / frame',
      'goalkeeper positioning / active intervention / protected handling',
      'aerialContest / high-ball technique / heading',
      'matchRules / offside / pitchBoundary / restarts',
      'matchFitness / movement workload',
      'matchInjuries / medical / career availability',
      'policy B / tactical and defensive selection',
    ],
    diagnostics: [
      'PR202 CI preservation (infrastructure, no football mechanism)',
      'PR206 recognition-to-preparation mediation (negative experiment, no new selectable implementation)',
      'covariance/error ellipses',
      'disruption/outcome ledgers',
      'sealed independent confirmation',
    ],
    registry: {
      total: progress.total,
      dimensions: progress.dimensions,
      sha256: hash(normalized('docs/match-engine/REALISM_PROGRESS.json')),
    },
  };
};
