import { z } from 'zod';
import { createTransitionFixture } from './transitionLaboratory';
import { observeBoundedScene, boundedSceneSchema } from './boundedPerception';
import {
  constructBoundedCandidates,
  runBoundedPolicy,
  boundedCandidateSchema,
  boundedDecisionSchema,
} from './boundedDecision';
import { evaluatePassDecision, passDecisionQualitySchema } from './passDecision';
import { evaluateShootingOpportunity, shootingOpportunitySchema } from './shootingOpportunity';
import { enumerateCanonicalShootingOptions, canExecuteCanonicalShot } from './shootingOptions';
import { estimatePlayerArrivalTime, playerArrivalEstimateSchema } from './playerArrival';
import { estimateUsefulContact, contactRaceEstimateSchema } from './opportunityWindows';
import { resolveMatchAction, rankAvailableActionsForAI } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { playerContactGeometry, groundContactFactSchema } from './ballContactGeometry';
import { withBoundedObserver, boundedTraceSchema } from './boundedIntelligence';
import {
  tacticalMatchStateSchema,
  matchActionSchema,
  type MatchAction,
  type TacticalMatchState,
  type MatchPlayerState,
} from './matchState';
import { distance } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { ballContactSchema } from './ballFlight';

export const calibrationConfigSchema = z.object({
  scenario: z.enum([
    'safe_pass',
    'progressive_pass',
    'through_ball',
    'long_pass',
    'pressured_receiver',
    'moving_defender',
    'wrong_direction',
    'bad_pass',
    'stale_receiver',
    'good_shot',
    'poor_shot_outlet',
    'poor_shot_trapped',
    'incoming_difficult',
    'blocked_shot',
    'keeper_away',
    'rebound',
    'infeasible_contact',
    'safe_hold',
  ]),
  attacker: z.number().int().min(1).max(100).default(60),
  defender: z.number().int().min(1).max(100).default(60),
  seed: z.string().default('pr195-development-0'),
  mirror: z.boolean().default(false),
  seconds: z.number().positive().max(12).default(6),
});
export const calibrationSnapshotSchema = z.object({
  state: tacticalMatchStateSchema,
  scene: boundedSceneSchema,
  candidates: boundedCandidateSchema.array(),
  decision: boundedDecisionSchema,
  boundedDecisions: boundedDecisionSchema.array(),
  canonicalShots: matchActionSchema.array(),
  policyRankings: z.array(
    z.object({
      policy: z.string(),
      information: z.enum(['bounded_scene', 'legacy_full_world']),
      actions: z.array(z.object({ action: matchActionSchema, score: z.number() })),
    }),
  ),
});
/** Also accepts naturally encountered saved canonical states. Truth forecasts are separate
 * diagnostics and are never injected into scene/candidates or the acting policy. */
export const captureCalibrationSnapshot = (state: TacticalMatchState, actorId: string) => {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) throw Error('Missing calibration actor');
  const scene = observeBoundedScene(state, actor),
    candidates = constructBoundedCandidates(scene);
  const decision = runBoundedPolicy('opportunity-driven-v1', { scene, candidates });
  return calibrationSnapshotSchema.parse({
    state: structuredClone(state),
    scene,
    candidates,
    decision,
    boundedDecisions: (
      ['opportunity-driven-v1', 'hierarchical-intent-v1', 'contextual-judgment-v1'] as const
    ).map((policy) => runBoundedPolicy(policy, { scene, candidates })),
    canonicalShots: enumerateCanonicalShootingOptions(state, actorId),
    policyRankings: [
      'legacy-pr176',
      'risk-ablation-v1',
      'state-value-v1',
      'role-value-v1',
      'role-intent-v1',
      'phase-role-hybrid-v1',
    ].map((policy) => ({
      policy,
      information: 'legacy_full_world',
      actions: rankAvailableActionsForAI(
        { ...state, decisionPolicy: policy as NonNullable<TacticalMatchState['decisionPolicy']> },
        actorId,
      ).map((r) => ({ action: r.action, score: r.score })),
    })),
  });
};

export const createCalibrationFixture = (raw: z.input<typeof calibrationConfigSchema>) => {
  const config = calibrationConfigSchema.parse(raw);
  const f = createTransitionFixture({
    id: config.scenario,
    seed: config.seed,
    scenario: 'counterattack',
    attacker: config.attacker,
    defender: config.defender,
    transitions: false,
    clearances: false,
  });
  const s = f.state;
  s.experimentalBallRecovery = false;
  s.experimentalRestartPreparation = false;
  s.playerAgencyEnabled = false;
  delete s.humanPossessionEpisode;
  delete s.playerMovementIntent;
  delete s.ballCarrierIntent;
  delete s.boundedRuntime;
  const actor = s.players.find((p) => p.id === f.carrierId)!,
    receiver = s.players.find((p) => p.id === f.supportId)!,
    defender = s.players.find((p) => p.id === f.defenderId)!;
  const keeper = s.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper')!;
  const place = (p: MatchPlayerState, x: number, y: number, vx = 0, vy = 0) => {
    p.position = { x, y };
    p.velocity = { x: vx, y: vy };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
    p.facingAngle = angleForVector({ x: p.team === 'home' ? 1 : -1, y: 0 });
  };
  for (const [i, p] of s.players.entries()) {
    place(p, p.team === 'home' ? 15 + (i % 3) : 89 + (i % 3), 3 + (i % 8) * 8);
    p.profile.weakFootProficiency = p.team === 'home' ? config.attacker : config.defender;
  }
  place(actor, 40, 34);
  place(receiver, 52, 34);
  place(defender, 75, 45);
  place(keeper, 103, 34);
  let target = { ...receiver.position },
    intent: 'support' | 'progressive' | 'through' | 'direct' = 'support';
  if (
    ['progressive_pass', 'through_ball', 'moving_defender', 'wrong_direction'].includes(
      config.scenario,
    )
  ) {
    place(receiver, 60, 31, 2);
    target = { x: config.scenario === 'through_ball' ? 64 : 60, y: 31 };
    intent = config.scenario === 'through_ball' ? 'through' : 'progressive';
  }
  if (config.scenario === 'long_pass') {
    place(receiver, 82, 25);
    target = { ...receiver.position };
    intent = 'direct';
  }
  if (config.scenario === 'pressured_receiver') place(defender, 52.8, 34, -1);
  if (config.scenario === 'moving_defender') place(defender, 50, 37, 0, -3);
  if (config.scenario === 'wrong_direction') place(defender, 50, 37, 0, 3);
  if (config.scenario === 'bad_pass') {
    place(defender, 46, 34);
    target = { ...defender.position };
  }
  if (config.scenario === 'stale_receiver') {
    place(receiver, 33, 62);
    target = { x: 56, y: 34 };
    actor.facingAngle = Math.PI / 2;
  }
  const shooting = [
    'good_shot',
    'poor_shot_outlet',
    'poor_shot_trapped',
    'incoming_difficult',
    'blocked_shot',
    'keeper_away',
    'rebound',
    'infeasible_contact',
  ].includes(config.scenario);
  if (shooting) {
    place(
      actor,
      config.scenario.startsWith('poor') ? 72 : 92,
      config.scenario.startsWith('poor') ? 9 : 34,
    );
    place(receiver, actor.position.x - 9, actor.position.y + 5);
    if (config.scenario === 'poor_shot_trapped') {
      place(receiver, 24, 62);
      place(defender, actor.position.x + 0.8, actor.position.y + 0.5, -2);
    }
    if (config.scenario === 'blocked_shot' || config.scenario === 'rebound')
      place(defender, actor.position.x + 3, actor.position.y);
    if (config.scenario === 'keeper_away') place(keeper, 91, 55);
    target = { ...receiver.position };
  }
  s.ball = {
    ...playerContactGeometry(actor).rightFoot,
    height: 0.11,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
    velocity: { x: 0, y: 0, z: 0 },
  };
  s.ballOwnershipStartedAt = s.time - 2;
  s.onBallPreparation = {
    actorId: actor.id,
    gainedAt: s.time - 2,
    readyAt: s.time - 1,
    kind: 'immediate_control',
    incomingSpeed: 0,
  };
  s.actionCooldown = 0;
  if (config.scenario === 'incoming_difficult') {
    s.ball = {
      x: actor.position.x + 0.35,
      y: actor.position.y,
      height: 0.6,
      velocity: { x: -4, y: 0, z: -1 },
      travelKind: 'pass',
      lastTouchPlayerId: receiver.id,
    };
  }
  if (config.scenario === 'infeasible_contact') {
    s.ball.x = actor.position.x + 4;
    s.ball.height = 3.5;
  }
  if (config.mirror) {
    for (const p of s.players) {
      p.position.y = 68 - p.position.y;
      p.velocity.y *= -1;
      p.target.y = 68 - p.target.y;
      p.anchor.y = 68 - p.anchor.y;
      p.neutralAnchor.y = 68 - p.neutralAnchor.y;
      p.facingAngle = normalizeAngle(Math.PI - p.facingAngle);
      p.profile.dominantFoot = 'left';
    }
    s.ball.y = 68 - s.ball.y;
    if (s.ball.velocity) s.ball.velocity.y *= -1;
    target.y = 68 - target.y;
  }
  const shots = enumerateCanonicalShootingOptions(s, actor.id);
  const action: MatchAction =
    config.scenario === 'safe_hold'
      ? { type: 'hold', actorId: actor.id }
      : shooting
        ? (shots.find((a) => a.type === 'shot' && a.intent === 'driven') ?? {
            type: 'shot',
            actorId: actor.id,
            target: { x: 105, y: 34 },
            intent: 'driven',
            contact: 'settled',
          })
        : {
            type: 'pass',
            actorId: actor.id,
            receiverId: receiver.id,
            target,
            intent,
            delivery: config.scenario === 'long_pass' ? 'lofted' : 'ground',
          };
  tacticalMatchStateSchema.parse(s);
  return {
    state: s,
    action,
    actorId: actor.id,
    receiverId: receiver.id,
    defenderId: defender.id,
    config,
  };
};

export const calibrationObservationSchema = z.object({
  at: z.number(),
  ownerId: z.string().nullable(),
  ball: z.object({ x: z.number(), y: z.number(), height: z.number() }),
  receiverActive: z.boolean(),
  defenderActive: z.boolean(),
  receiverDistance: z.number().nullable(),
  defenderDistance: z.number().nullable(),
  defenderTargetDistance: z.number().nullable(),
  defenderReachable: z.boolean(),
  groundContact: groundContactFactSchema.nullable(),
  flightContact: ballContactSchema.nullable(),
  lastTouchPlayerId: z.string().nullable(),
  restart: z.string().nullable(),
  restartTeam: z.string().nullable(),
  shotId: z.string().nullable(),
  shotOutcome: z.string().nullable(),
  goalkeeperAction: z.string().nullable(),
});
export const calibrationResultSchema = z.object({
  snapshot: calibrationSnapshotSchema,
  action: matchActionSchema,
  selection: z.enum(['forced_experiment', 'natural_selected']),
  requestedAt: z.number(),
  horizonSeconds: z.number(),
  candidateExists: z.boolean(),
  candidateSameIntentExists: z.boolean(),
  contactPossibleAtRequest: z.boolean().nullable(),
  released: z.boolean(),
  truthForecast: z.object({
    pass: passDecisionQualitySchema.nullable(),
    shot: shootingOpportunitySchema.nullable(),
    defenderArrival: playerArrivalEstimateSchema,
    boundedDefenderArrival: contactRaceEstimateSchema,
  }),
  observations: calibrationObservationSchema.array(),
  traces: boundedTraceSchema.array(),
  final: tacticalMatchStateSchema,
});
/** Exactly one intervention. No ownership/contact grant or forced subsequent movement.
 * Every later tick runs both autonomous teams through the canonical 40 Hz entry. */
export const runCalibrationTrial = (
  initial: TacticalMatchState,
  action: MatchAction,
  receiverId: string,
  defenderId: string,
  seconds = 6,
  observer?: (sample: z.infer<typeof calibrationObservationSchema>) => void,
) => {
  if (!(seconds > 0 && seconds <= 12)) throw Error('Invalid calibration horizon');
  const snapshot = captureCalibrationSnapshot(initial, action.actorId),
    actor = initial.players.find((p) => p.id === action.actorId)!,
    receiver = initial.players.find((p) => p.id === receiverId)!,
    defender = initial.players.find((p) => p.id === defenderId)!;
  const target = 'target' in action ? action.target : initial.ball;
  const sceneDefender = snapshot.scene.visible.find((p) => p.id === defenderId);
  const truthForecast = {
    pass:
      action.type === 'pass'
        ? evaluatePassDecision(
            initial,
            actor,
            receiver,
            action.target,
            action.intent,
            action.delivery,
          )
        : null,
    shot:
      action.type === 'shot' || action.type === 'header'
        ? evaluateShootingOpportunity(initial, actor)
        : null,
    defenderArrival: estimatePlayerArrivalTime(initial, defender, target, 'intercept'),
    boundedDefenderArrival: estimateUsefulContact(
      sceneDefender ?? { position: defender.position, velocity: { x: 0, y: 0 } },
      target,
    ),
  };
  // If unseen, the extra arrival estimate is labelled truth-only by the receipt, never policy evidence.
  const observations: z.infer<typeof calibrationObservationSchema>[] = [],
    traces: z.infer<typeof boundedTraceSchema>[] = [];
  let s = structuredClone(initial);
  const record = () => {
    const d = s.players.find((p) => p.id === defenderId),
      r = s.players.find((p) => p.id === receiverId),
      feet = d ? playerContactGeometry(d) : null;
    const sample = calibrationObservationSchema.parse({
      at: s.time,
      ownerId: s.ball.ownerId ?? null,
      ball: { x: s.ball.x, y: s.ball.y, height: s.ball.height ?? 0.11 },
      receiverActive: Boolean(r),
      defenderActive: Boolean(d),
      receiverDistance: r ? distance(r.position, s.ball) : null,
      defenderDistance: d ? distance(d.position, s.ball) : null,
      defenderTargetDistance: d ? distance(d.position, target) : null,
      defenderReachable:
        Boolean(feet) &&
        (s.ball.height ?? 0.11) <= 0.5 &&
        Math.min(distance(feet!.leftFoot, s.ball), distance(feet!.rightFoot, s.ball)) <=
          feet!.footReach,
      groundContact: s.lastGroundContact ?? null,
      flightContact: s.lastBallContact ?? null,
      lastTouchPlayerId: s.ball.lastTouchPlayerId ?? null,
      restart: s.restart ? s.scenario : null,
      restartTeam: s.restart?.restartTeam ?? null,
      shotId: s.lastShot?.shotId ?? s.ball.shot?.shotId ?? null,
      shotOutcome: s.lastShot?.outcome ?? null,
      goalkeeperAction: s.lastShot?.goalkeeperAction ?? null,
    });
    observations.push(sample);
    observer?.(structuredClone(sample));
  };
  const contactPossibleAtRequest =
    action.type === 'shot' || action.type === 'header'
      ? canExecuteCanonicalShot(initial, action)
      : null;
  const key = (a: MatchAction) => [
    a.type,
    a.type === 'pass' ? a.receiverId : null,
    'intent' in a ? a.intent : null,
  ];
  const candidateSameIntentExists = snapshot.candidates.some(
    (c) => JSON.stringify(key(c.action)) === JSON.stringify(key(action)),
  );
  const candidateExists = snapshot.candidates.some(
    (c) =>
      c.action.type === action.type &&
      (action.type !== 'pass' ||
        (c.action.type === 'pass' && c.action.receiverId === action.receiverId)),
  );
  record();
  let released = false;
  withBoundedObserver(
    (t) => {
      traces.push(structuredClone(t));
    },
    () => {
      s = resolveMatchAction(s, structuredClone(action), 'autonomous_npc');
      released = Boolean(
        (s.lastPassDiagnostic?.passId &&
          s.lastPassDiagnostic.passId !== initial.lastPassDiagnostic?.passId) ||
          (s.ball.shot?.shotId && s.ball.shot.shotId !== initial.ball.shot?.shotId),
      );
      record();
      for (let tick = 0; tick < Math.round(seconds / 0.025); tick++) {
        s = step(s, 0.025);
        record();
        if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status ?? '')) break;
      }
    },
  );
  return calibrationResultSchema.parse({
    snapshot,
    action,
    selection: 'forced_experiment',
    requestedAt: initial.time,
    horizonSeconds: seconds,
    candidateExists,
    candidateSameIntentExists,
    contactPossibleAtRequest,
    released,
    truthForecast,
    observations,
    traces,
    final: s,
  });
};
