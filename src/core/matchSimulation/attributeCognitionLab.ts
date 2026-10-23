import { z } from 'zod';
import type { PlayerAttributes } from '../../types/domain';
import { createCognitionFixture } from './tacticalCognitionLab';
import { playerContactGeometry } from './ballContactGeometry';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { integrateBallFlight, type PhysicalBall } from './ballPhysics';
import { evaluateAerialContact } from './aerialPlay';
import { intersectLabPlane, labVectorSchema } from './footballLabObjects';
import { deriveGoalkeeperApproach } from './goalkeeperPositioning';
import { arbitrateGoalkeeperClaim } from './goalkeeperClaim';
import { distance } from './matchSpace';
import { perceptionLatency, canReleaseControlledAction } from './decisionReadiness';
import { preparationMarginForAction } from './onBallPreparation';
import { enumerateCanonicalShootingOptions } from './shootingOptions';

export const diagnosticAttributeSchema = z.enum([
  'heading',
  'composure',
  'oneOnOnes',
  'goalkeeperSweeping',
  'positioning',
  'gameReading',
  'concentration',
  'leadership',
  'determination',
  'aggression',
  'ambition',
  'professionalism',
  'setPieces',
  'technique',
  'dribbling',
  'firstTouch',
  'agility',
]);
const DT = 0.025;
export const directedContactConfigSchema = z.object({
  seed: z.string(),
  attribute: diagnosticAttributeSchema,
  band: z.number().min(1).max(100),
  contact: z.enum(['header', 'foot', 'free_kick']),
  speed: z.number().min(0).max(18).default(8),
  height: z.number().min(0.11).max(3).default(1.8),
  pressure: z.boolean().default(false),
  angle: z.number().min(-0.8).max(0.8).default(0),
});
export const directedContactResultSchema = z.object({
  config: directedContactConfigSchema,
  eligibleAt: z.number().nullable(),
  executedAt: z.number().nullable(),
  reached: z.boolean(),
  targetError: z.number().nullable(),
  onTarget: z.boolean(),
  crossing: labVectorSchema.nullable(),
  launch: labVectorSchema.nullable(),
  contactHeight: z.number().nullable(),
  pressure: z.number(),
  reason: z.string(),
});
/** Moving-ball reach and intentional placement are separate observations. The same
 * aerial eligibility, action resolver and ball integrator as the match own contact/flight. */
export const runDirectedContactTrial = (raw: z.input<typeof directedContactConfigSchema>) => {
  const c = directedContactConfigSchema.parse(raw),
    f = createCognitionFixture('counter_support', c.seed);
  let s = f.state;
  const actor = s.players.find((p) => p.id === f.sourceId)!;
  actor.profile = structuredClone(actor.profile);
  actor.profile.attributes[c.attribute as keyof PlayerAttributes] = c.band;
  actor.position = { x: 88, y: 34 };
  actor.target = { ...actor.position };
  actor.velocity = { x: 0, y: 0 };
  actor.facingAngle = Math.PI / 2 + c.angle;
  const defender = s.players.find((p) => p.id === f.opponentId)!;
  // A marker at the side supplies relevant pressure without occluding the target plane.
  defender.position = c.pressure ? { x: 88.6, y: 35.1 } : { x: 70, y: 50 };
  s.currentPressure = c.pressure ? 0.8 : 0;
  s.players = [actor, defender];
  s.actionCooldown = 0;
  delete s.onBallPreparation;
  let incoming: PhysicalBall = {
    position: { x: 86.2, y: 34, z: c.height },
    velocity: { x: c.speed, y: Math.sin(c.angle) * c.speed * 0.15, z: 1.5 },
    airborne: true,
    bounceCount: 0,
  };
  let eligibleAt: number | null = null,
    executedAt: number | null = null,
    crossing: z.infer<typeof labVectorSchema> | null = null,
    launch: z.infer<typeof labVectorSchema> | null = null,
    contactHeight: number | null = null;
  if (c.contact === 'header') {
    for (let tick = 0; tick < 60; tick++) {
      incoming = integrateBallFlight(incoming, DT);
      s = {
        ...s,
        time: 10 + (tick + 1) * DT,
        ball: {
          ...incoming.position,
          height: incoming.position.z,
          velocity: incoming.velocity,
          airborne: incoming.airborne,
          lastTouchPlayerId: defender.id,
        },
      };
      if (!evaluateAerialContact(actor, s.ball, 0)) continue;
      eligibleAt = (tick + 1) * DT;
      contactHeight = incoming.position.z;
      // Canonical aerial nomination at an actual eligible body, as in extendedPhysicalLab.
      s = resolveMatchAction(
        { ...s, ball: { ...s.ball, ownerId: actor.id } },
        {
          type: 'header',
          actorId: actor.id,
          intent: 'header_shot',
          target: { x: 105, y: 34 },
          goalTarget: { horizontal: 0, vertical: 0.4 / 2.44 },
        },
        'dev_ai_selected',
      );
      if (s.ball.shot && !s.ball.ownerId) executedAt = eligibleAt;
      break;
    }
  } else {
    s.ball = { ...playerContactGeometry(actor).rightFoot, ownerId: actor.id, height: 0.11 };
    if (c.contact === 'free_kick') {
      s.scenario = 'free_kick_close';
      s.restart = {
        origin: 'dev_fixture',
        phase: 'kick_preparation',
        executing: true,
        startedAt: 8,
        takerId: actor.id,
        targets: {},
        roles: {},
        executionChoices: ['direct_shot'],
        restartTeam: 'home',
      };
    }
    eligibleAt = 0;
    contactHeight = 0.11;
    s = resolveMatchAction(
      s,
      {
        type: 'shot',
        actorId: actor.id,
        intent: 'placed',
        contact: 'settled',
        target: { x: 105, y: 34 },
        goalTarget: { horizontal: 0, vertical: 0.4 / 2.44 },
        ...(c.contact === 'free_kick' ? { freeKickProfile: 'controlled_curl' as const } : {}),
      },
      'dev_ai_selected',
    );
    if (s.ball.travelKind === 'shot' && !s.ball.ownerId) executedAt = 0;
  }
  if (executedAt !== null && s.ball.velocity) {
    launch = { ...s.ball.velocity, z: s.ball.velocity.z ?? 0 };
    let ball: PhysicalBall = {
      position: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0.11 },
      velocity: launch,
      spin: s.ball.spin ?? { x: 0, y: 0, z: 0 },
      airborne: true,
      bounceCount: 0,
    };
    for (let tick = 0; tick < 240; tick++) {
      const next = integrateBallFlight(ball, DT);
      const crossed = intersectLabPlane(ball.position, next.position, {
        position: { x: 105, y: 34, z: 0.4 },
        normal: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 0, z: 1 },
      });
      if (crossed) {
        crossing = crossed.point;
        break;
      }
      ball = next;
    }
  }
  return directedContactResultSchema.parse({
    config: c,
    eligibleAt,
    executedAt,
    reached: eligibleAt !== null,
    crossing,
    launch,
    contactHeight,
    pressure: s.ball.shot?.pressure ?? s.currentPressure,
    targetError: crossing ? Math.hypot(crossing.y - 34, crossing.z - 0.4) : null,
    onTarget: Boolean(crossing && Math.abs(crossing.y - 34) < 3.66 && crossing.z < 2.44),
    reason:
      executedAt === null
        ? eligibleAt === null
          ? 'unreachable_ball'
          : 'action_not_released'
        : crossing
          ? 'target_plane_crossed'
          : 'short_of_plane',
  });
};

export const keeperEncounterConfigSchema = z.object({
  seed: z.string(),
  exercise: z.enum(['closing', 'sweep']),
  attribute: diagnosticAttributeSchema,
  band: z.number().min(1).max(100),
  releaseAfter: z.number().min(0).max(1.5).default(0.6),
  intent: z.enum(['driven', 'placed', 'chip']).default('placed'),
  lateral: z.number().min(-5).max(5).default(1.5),
  passTargetX: z.number().min(84).max(98).default(94),
});
export const keeperEncounterResultSchema = z.object({
  config: keeperEncounterConfigSchema,
  shotReleasedAt: z.number().nullable(),
  keeperMovementAt: z.number().nullable(),
  keeperMetres: z.number().nonnegative(),
  approach: z.boolean(),
  meaningfulSweep: z.boolean(),
  sweepReason: z.string().nullable(),
  outcome: z.string(),
  scheduledShotOutcome: z.string().nullable(),
  finalOwner: z.string().nullable(),
  samples: z
    .array(
      z.object({
        at: z.number(),
        keeper: z.object({ x: z.number(), y: z.number() }),
        ball: labVectorSchema,
      }),
    )
    .max(180),
});
/** An actual attacker-keeper approach and timed shot, or a physical through delivery.
 * Missed release/claims/unsafe reads remain results. No predicted ETA is called a save. */
export const runKeeperEncounter = (raw: z.input<typeof keeperEncounterConfigSchema>) => {
  const c = keeperEncounterConfigSchema.parse(raw),
    f = createCognitionFixture('counter_support', c.seed);
  let s = f.state;
  const attacker = s.players.find((p) => p.id === f.runnerIds[0])!,
    source = s.players.find((p) => p.id === f.sourceId)!,
    keeper = s.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper')!;
  keeper.profile = structuredClone(keeper.profile);
  keeper.profile.attributes[c.attribute as keyof PlayerAttributes] = c.band;
  keeper.position = { x: 101, y: 34 };
  keeper.target = { ...keeper.position };
  keeper.velocity = { x: 0, y: 0 };
  keeper.facingAngle = -Math.PI / 2;
  attacker.position = {
    x: c.exercise === 'closing' ? 87.5 : c.passTargetX - 10,
    y: 34 + c.lateral,
  };
  attacker.target = { x: 103, y: 34 + c.lateral };
  attacker.velocity = { x: 2, y: 0 };
  attacker.facingAngle = Math.PI / 2;
  source.position = { x: 77, y: 34 };
  source.velocity = { x: 0, y: 0 };
  source.target = { ...source.position };
  // Distant players retain legal identities; they cannot supply instant cover.
  for (const p of s.players.filter((p) => ![attacker.id, keeper.id, source.id].includes(p.id))) {
    p.position = { x: 45, y: 5 + p.slotIndex * 2 };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
  }
  if (c.exercise === 'sweep') {
    const defenders = s.players.filter(
      (p) => p.team === 'away' && p.slot.position === 'center_back',
    );
    defenders.forEach((p, i) => {
      p.position = { x: 96 - i * 3, y: i ? 12 : 54 };
      p.target = { ...p.position };
      p.anchor = { ...p.position };
    });
  }
  s.possessionTeam = 'home';
  s.ballOwnershipStartedAt = 8;
  delete s.onBallPreparation;
  const owner = c.exercise === 'closing' ? attacker : source;
  s.ball = {
    ...playerContactGeometry(owner).rightFoot,
    height: 0.11,
    ownerId: owner.id,
    lastTouchPlayerId: owner.id,
  };
  s.currentActorId = owner.id;
  let meaningfulSweep = false,
    sweepReason: string | null = null;
  const approach = Boolean(deriveGoalkeeperApproach(s, keeper));
  if (c.exercise === 'closing')
    s = resolveMatchAction(
      s,
      {
        type: 'carry',
        actorId: attacker.id,
        target: { x: 103, y: 34 + c.lateral },
        movementMode: 'dribble',
      },
      'dev_ai_selected',
    );
  else {
    s = resolveMatchAction(
      s,
      {
        type: 'pass',
        actorId: source.id,
        receiverId: attacker.id,
        target: { x: c.passTargetX, y: 34 + c.lateral },
        requestedSpace: { x: c.passTargetX, y: 34 + c.lateral },
        intent: 'through',
        delivery: 'ground',
      },
      'dev_ai_selected',
    );
    const claim = arbitrateGoalkeeperClaim(
      s,
      keeper,
      { x: c.passTargetX, y: 34 + c.lateral },
      s.lastPassDiagnostic?.ballArrivalEstimate ?? 1,
    );
    meaningfulSweep = claim.meaningfulChoice;
    sweepReason = claim.reason;
  }
  // Apparatus schedules the intended shot; suppress competing on-ball AI until release.
  s = { ...s, actionCooldown: 20 };
  let shotReleasedAt: number | null = null,
    scheduledShotId: string | null = null,
    keeperMovementAt: number | null = null,
    attempted = false;
  const samples = [];
  for (let tick = 0; tick < 160; tick++) {
    const elapsed = s.time - 10;
    if (c.exercise === 'closing' && !attempted && elapsed >= c.releaseAfter - 1e-8) {
      attempted = true;
      const next = resolveMatchAction(
        s,
        {
          type: 'shot',
          actorId: attacker.id,
          intent: c.intent,
          contact: 'settled',
          target: { x: 105, y: 34 + c.lateral },
          goalTarget: { horizontal: c.lateral / 3.66, vertical: 0.4 / 2.44 },
        },
        'dev_ai_selected',
      );
      if (
        next.ball.shot &&
        !next.ball.ownerId &&
        next.ball.shot.shooterId === attacker.id &&
        next.ball.shot.releasedAt === s.time
      ) {
        shotReleasedAt = elapsed;
        scheduledShotId = next.ball.shot.shotId;
      }
      s = next;
    }
    s = stepTacticalMatchAfterDecisionProbe(s, DT);
    const k = s.players.find((p) => p.id === keeper.id)!;
    if (keeperMovementAt === null && distance(k.position, keeper.position) > 0.03)
      keeperMovementAt = s.time - 10;
    samples.push({
      at: s.time - 10,
      keeper: { ...k.position },
      ball: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0.11 },
    });
    if (s.postGoal || s.restart || s.ball.ownerId === keeper.id || s.lastShot?.outcome) break;
  }
  return keeperEncounterResultSchema.parse({
    config: c,
    shotReleasedAt,
    keeperMovementAt,
    keeperMetres: distance(s.players.find((p) => p.id === keeper.id)!.position, keeper.position),
    approach,
    meaningfulSweep,
    sweepReason,
    outcome:
      s.lastShot?.outcome ??
      (s.ball.ownerId === keeper.id ? 'keeper_control' : s.restart ? 'restart' : 'unresolved'),
    scheduledShotOutcome:
      scheduledShotId && s.lastShot?.shotId === scheduledShotId
        ? (s.lastShot.outcome ?? null)
        : null,
    finalOwner: s.ball.ownerId ?? null,
    samples,
  });
};

export const decisionTimingConfigSchema = z.object({
  seed: z.string(),
  mode: z.enum(['motor', 'prepared', 'deliberate']),
  familiarity: z.number().min(0).max(1),
  preparationSeconds: z.number().min(0).max(1.5),
  closingOpponent: z.boolean(),
});
export const decisionTimingResultSchema = z.object({
  config: decisionTimingConfigSchema,
  observedAt: z.number(),
  recognisedAt: z.number(),
  intentionAt: z.number().nullable(),
  bodyPreparedAt: z.number(),
  releasedAt: z.number().nullable(),
  initialShotAvailable: z.boolean(),
  cancelledAt: z.number().nullable(),
  cancellationReason: z.string().nullable(),
  episodeOutcome: z.string(),
  intendedOutcome: z.string().nullable(),
  samples: z
    .array(
      z.object({
        at: z.number(),
        ownsBall: z.boolean(),
        contactReady: z.boolean(),
        preparationMargin: z.number(),
        shotAvailable: z.boolean(),
      }),
    )
    .max(160),
});
/** Prescribed transient decision episode, sharing the live preparation/contact gates.
 * The response schedule is a research intervention; no reaction constants enter live AI. */
export const runDecisionTimingTrial = (raw: z.input<typeof decisionTimingConfigSchema>) => {
  const c = decisionTimingConfigSchema.parse(raw),
    f = createCognitionFixture('counter_support', c.seed);
  let s = f.state;
  const actor = s.players.find((p) => p.id === f.sourceId)!;
  actor.position = { x: 88, y: 34 };
  actor.target = { ...actor.position };
  actor.velocity = { x: 0, y: 0 };
  const defender = s.players.find((p) => p.id === f.opponentId)!;
  defender.position = c.closingOpponent ? { x: 90.2, y: 34.5 } : { x: 70, y: 50 };
  defender.target = { ...actor.position };
  defender.velocity = c.closingOpponent ? { x: -2, y: 0 } : { x: 0, y: 0 };
  defender.facingAngle = -Math.PI / 2;
  for (const p of s.players.filter(
    (p) => p.id !== actor.id && p.id !== defender.id && p.slot.position !== 'goalkeeper',
  )) {
    p.position = { x: 40, y: 5 + p.slotIndex * 2 };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
  }
  s.ball = {
    ...playerContactGeometry(actor).rightFoot,
    ownerId: actor.id,
    height: 0.11,
    lastTouchPlayerId: actor.id,
  };
  s.onBallPreparation = {
    actorId: actor.id,
    gainedAt: 10,
    readyAt: 10 + c.preparationSeconds,
    kind: 'settling',
    incomingSpeed: 0,
  };
  s.actionCooldown = 20;
  s.ballOwnershipStartedAt = 10;
  const recognisedAt =
    10 +
    (c.mode === 'motor'
      ? 0.08
      : c.mode === 'prepared'
        ? perceptionLatency(actor) + (1 - c.familiarity) * 0.6
        : perceptionLatency(actor) + 0.5);
  const intended = enumerateCanonicalShootingOptions(s, actor.id).find(
    (a) => a.type === 'shot' && a.intent === 'placed',
  );
  let intentionAt: number | null = null,
    intendedShotId: string | null = null,
    releasedAt: number | null = null,
    cancelledAt: number | null = null,
    cancellationReason: string | null = null;
  const samples = [];
  for (let tick = 0; tick < 160; tick++) {
    const currentActor = s.players.find((p) => p.id === actor.id)!;
    const ownsBall = s.ball.ownerId === actor.id,
      contactReady = canReleaseControlledAction(s, currentActor);
    const preparationMargin = intended ? preparationMarginForAction(s, currentActor, intended) : 0;
    const shotAvailable = enumerateCanonicalShootingOptions(s, actor.id).some(
      (a) => a.type === 'shot' && a.intent === 'placed',
    );
    samples.push({ at: s.time, ownsBall, contactReady, preparationMargin, shotAvailable });
    if (releasedAt === null && cancelledAt === null && s.time >= recognisedAt - 1e-8) {
      if (!intended || !ownsBall) {
        cancelledAt = s.time;
        cancellationReason = intended ? 'control_lost_before_release' : 'no_initial_shot';
      } else {
        intentionAt ??= s.time;
        if (contactReady && preparationMargin >= 0 && shotAvailable) {
          const next = resolveMatchAction(s, intended, 'dev_ai_selected');
          if (
            next.ball.shot &&
            !next.ball.ownerId &&
            next.ball.shot.shooterId === actor.id &&
            next.ball.shot.releasedAt === s.time
          ) {
            releasedAt = s.time;
            intendedShotId = next.ball.shot.shotId;
          }
          s = next;
        }
      }
    }
    s = stepTacticalMatchAfterDecisionProbe(s, DT);
    if (s.lastShot?.outcome || s.postGoal || s.restart) break;
  }
  if (releasedAt === null && cancelledAt === null) {
    cancelledAt = s.time;
    cancellationReason = 'window_expired_without_physical_release';
  }
  return decisionTimingResultSchema.parse({
    config: c,
    observedAt: 10,
    recognisedAt,
    intentionAt,
    bodyPreparedAt: 10 + c.preparationSeconds,
    releasedAt,
    initialShotAvailable: Boolean(intended),
    cancelledAt,
    cancellationReason,
    episodeOutcome: s.lastShot?.outcome ?? (releasedAt === null ? 'not_released' : 'unresolved'),
    intendedOutcome:
      intendedShotId && s.lastShot?.shotId === intendedShotId ? (s.lastShot.outcome ?? null) : null,
    samples,
  });
};
