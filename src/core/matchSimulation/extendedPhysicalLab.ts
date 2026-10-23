import { z } from 'zod';
import { footballerProfileSchema } from '../../schemas/domainSchemas';
import type { FootballerProfile } from '../../types/domain';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { tacticalMatchStateSchema } from './matchState';
import {
  footballSkillTrialConfigSchema,
  makeLabState,
  runFootballSkillTrial,
} from './footballPerformanceLab';
import {
  footSurfaceSchema,
  executeFootContact,
  footContactExecutionSchema,
  type FootContactExecution,
  multiContactMoveSchema,
} from './footContact';
import { integrateCanonicalMovement } from './canonicalMovement';
import {
  advanceMatchFitness,
  createMatchFitness,
  matchFitnessSchema,
  fitnessWorkloadSchema,
} from './matchFitness';
import { deriveMovementCapability, projectSprintEpisode } from './locomotion';
import {
  advanceControlledBall,
  deriveBallContactAccess,
  deriveShieldBodyContest,
  ballContactAccessSchema,
  shieldBodyContestSchema,
} from './ballContactGeometry';
import { advanceBallAcquisition } from './ballAcquisition';
import { angleForVector } from './playerOrientation';
import { beginVerticalJump, verticalJumpSchema } from './bodyMechanics';
import { evaluateAerialContact } from './aerialPlay';
import { resolveMatchAction } from './matchActions';
import {
  beginDefensiveChallenge,
  resolveDefensiveChallenge,
  challengeDiagnosticSchema,
} from './defensiveChallenges';
import { BALL_RADIUS } from './ballFlight';
import { integrateBallFlight, ballSpinSchema, type PhysicalBall } from './ballPhysics';
import { physicalPointSchema, distance } from './matchSpace';
import {
  advanceLabBall,
  intersectLabPlane,
  measureLabOpening,
  labHoopSchema,
  labVectorSchema,
} from './footballLabObjects';
import { createFormationBenchmarkMatch } from './benchmarkFixtures';
import { resolveCanonicalShot } from './shotResolver';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { deriveGoalkeeperApproach } from './goalkeeperPositioning';
import { projectGoalkeeperIntervention } from './goalkeeperIntervention';
import { arbitrateGoalkeeperClaim } from './goalkeeperClaim';

const DT = 0.025;
const vector = labVectorSchema;
export const contactTrialConfigSchema = z.object({
  surface: footSurfaceSchema,
  foot: z.enum(['left', 'right']).default('right'),
  velocity: vector.default({ x: 6, y: 0, z: 0 }),
  spin: ballSpinSchema.default({ x: 0, y: 0, z: 0 }),
  offset: physicalPointSchema.default({ x: 0.25, y: 0 }),
  height: z.number().min(0.11).default(0.11),
  facingAngle: z.number().default(Math.PI / 2),
  bodyVelocity: physicalPointSchema.default({ x: 0, y: 0 }),
  desiredVelocity: vector.default({ x: 0, y: 0, z: 0 }),
  balance: z.number().min(0).max(1).default(1),
  preparationSeconds: z.number().nonnegative().default(0.25),
  pressure: z.number().min(0).max(1).default(0),
});
export const contactTrialResultSchema = z.object({
  input: z.object({
    config: contactTrialConfigSchema,
    player: footballerProfileSchema,
    seed: z.string(),
  }),
  contact: footContactExecutionSchema,
  trajectory: z.array(
    z.object({ at: z.number(), position: vector, velocity: vector, spin: ballSpinSchema }),
  ),
});
export const runFootContactTrial = (
  config: z.input<typeof contactTrialConfigSchema>,
  profile: FootballerProfile,
  seed: string,
) => {
  const c = contactTrialConfigSchema.parse(config),
    p = footballerProfileSchema.parse(structuredClone(profile));
  let s = makeLabState(
    p,
    footballSkillTrialConfigSchema.parse({
      id: 'contact',
      drill: 'receive',
      facingAngle: c.facingAngle,
      initialVelocity: c.bodyVelocity,
    }),
    seed,
  );
  s = {
    ...s,
    ball: {
      x: 20 + c.offset.x,
      y: 34 + c.offset.y,
      height: c.height,
      velocity: c.velocity,
      spin: c.spin,
    },
  };
  const contact = executeFootContact(s, s.players[0]!, {
    intended: c.surface,
    foot: c.foot,
    desiredVelocity: c.desiredVelocity,
    balance: c.balance,
    preparationSeconds: c.preparationSeconds,
    contactSeconds: 0.08,
    pressure: c.pressure,
  });
  let ball: PhysicalBall = {
    position: contact.point,
    velocity: contact.outgoingVelocity,
    spin: contact.outgoingSpin,
    airborne: c.height > BALL_RADIUS,
    bounceCount: 0,
  };
  const trajectory = [];
  for (let tick = 0; tick <= 40; tick++) {
    trajectory.push({
      at: tick * DT,
      position: { ...ball.position },
      velocity: { ...ball.velocity },
      spin: { ...(ball.spin ?? { x: 0, y: 0, z: 0 }) },
    });
    ball = integrateBallFlight(ball, DT);
  }
  return contactTrialResultSchema.parse({
    input: { config: c, player: p, seed },
    contact,
    trajectory,
  });
};

/** All experimental body controllers use this same match integrator and completed-work cost.
 * Only objectives differ. There is no per-repetition speed penalty or defender teleport.
 */
const moveAthlete = (
  p: MatchPlayerState,
  target: { x: number; y: number },
  speed: number,
  at: number,
): MatchPlayerState => {
  const m = integrateCanonicalMovement(p, {
    target,
    targetSpeed: speed,
    desiredFacingAngle:
      distance(p.position, target) > 0.01
        ? angleForVector({ x: target.x - p.position.x, y: target.y - p.position.y })
        : p.facingAngle,
    dt: DT,
    balance: 1,
    structural: false,
    receivingMomentum: false,
  });
  const actual = Math.hypot(m.velocity.x, m.velocity.y),
    previous = Math.hypot(p.velocity.x, p.velocity.y);
  const turn =
    previous > 0.1 && actual > 0.1
      ? Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (p.velocity.x * m.velocity.x + p.velocity.y * m.velocity.y) / (previous * actual),
            ),
          ),
        )
      : 0;
  const sprint = projectSprintEpisode(p, actual / m.capability.maximumSprintSpeed, at, DT);
  const next: MatchPlayerState = {
    ...p,
    position: m.position,
    velocity: m.velocity,
    facingAngle: m.facingAngle,
    plantBalance: m.plantBalance,
    ...(m.verticalJump ? { verticalJump: m.verticalJump } : {}),
    fitness: advanceMatchFitness(p, {
      dt: DT,
      distance: distance(p.position, m.position),
      speed: actual,
      previousSpeed: previous,
      turnRadians: turn,
      sprinting: sprint.actualSprinting,
      sprintBurst: sprint.countBurst,
    }),
  };
  delete next.sprintStartedAt;
  delete next.sprintRecoveryStartedAt;
  if (sprint.sprintStartedAt !== undefined) next.sprintStartedAt = sprint.sprintStartedAt;
  if (sprint.sprintRecoveryStartedAt !== undefined)
    next.sprintRecoveryStartedAt = sprint.sprintRecoveryStartedAt;
  next.sprintBurstCounted = sprint.sprintBurstCounted;
  return next;
};

export const feintTrialConfigSchema = z.object({
  move: multiContactMoveSchema.default('elastico'),
  defender: z.enum(['none', 'commit', 'delay', 'fast', 'wrong_facing', 'cover']).default('commit'),
  separation: z.number().positive().default(2.4),
  foot: z.enum(['left', 'right']).default('right'),
  initialOffset: physicalPointSchema.default({ x: 0.2, y: -0.17 }),
});
export const feintTrialResultSchema = z.object({
  input: z.object({
    config: feintTrialConfigSchema,
    player: footballerProfileSchema,
    seed: z.string(),
  }),
  contacts: z.array(footContactExecutionSchema),
  completedMove: z.boolean(),
  escaped: z.boolean(),
  failure: z.string().nullable(),
  defenderCommitment: z.number().nullable(),
  challengeOutcomes: z.array(z.string()),
  samples: z.array(
    z.object({
      at: z.number(),
      attacker: physicalPointSchema,
      ball: vector,
      defenders: z.array(physicalPointSchema),
      owner: z.string().nullable(),
      balance: z.number(),
    }),
  ),
});
export const runFeintTrial = (
  config: z.input<typeof feintTrialConfigSchema>,
  profile: FootballerProfile,
  seed: string,
) => {
  const c = feintTrialConfigSchema.parse(config),
    p = footballerProfileSchema.parse(structuredClone(profile));
  let s = makeLabState(
    p,
    footballSkillTrialConfigSchema.parse({
      id: 'feint',
      drill: 'slalom',
      route: [{ x: 32, y: 34 }],
    }),
    seed,
  );
  const attackerId = p.id;
  s.ball = { ...s.ball, x: 20 + c.initialOffset.x, y: 34 + c.initialOffset.y };
  if (c.defender !== 'none') {
    const defender = structuredClone(s.players[0]!);
    defender.id = 'reactive-defender';
    defender.profile = { ...defender.profile, id: defender.id };
    defender.team = 'away';
    defender.profile.attributes = {
      ...defender.profile.attributes,
      pace: c.defender === 'fast' ? 95 : c.defender === 'wrong_facing' ? 25 : 65,
      agility: c.defender === 'delay' ? 90 : 65,
      gameReading: c.defender === 'delay' ? 90 : 45,
    };
    defender.position = { x: 20 + c.separation, y: 34 };
    defender.facingAngle = c.defender === 'wrong_facing' ? Math.PI / 2 : -Math.PI / 2;
    s.players.push(defender);
    if (c.defender === 'cover')
      s.players.push({
        ...structuredClone(defender),
        id: 'cover-defender',
        position: { x: 24.8, y: 34.2 },
      });
  }
  s = resolveMatchAction(
    s,
    {
      type: 'carry',
      actorId: p.id,
      target: { x: 32, y: 34 },
      movementMode: 'dribble',
      skillMove: c.move,
      foot: c.foot,
    },
    'dev_ai_selected',
  );
  let commitment: number | null = null,
    escaped = false,
    completedMove = false;
  const contacts: FootContactExecution[] = [],
    samples = [],
    challengeOutcomes: string[] = [];
  const commitments = new Map<string, { target: { x: number; y: number }; until: number }>();
  const observations: { at: number; x: number; y: number; vx: number; vy: number }[] = [];
  for (let tick = 0; tick < 160; tick++) {
    s = { ...s, time: tick * DT };
    observations.push({
      at: s.time,
      x: s.ball.x,
      y: s.ball.y,
      vx: s.ball.velocity?.x ?? 0,
      vy: s.ball.velocity?.y ?? 0,
    });
    let actor = s.players.find((p) => p.id === attackerId)!;
    const intent = s.ballCarrierIntent!;
    s.ballCarrierIntent = {
      ...intent,
      executionMode: tick < 12 ? 'tight_dribble' : 'burst',
      touchDistance: tick < 12 ? 0.38 : 1.35,
      localTarget: intent.target,
    };
    const target =
      tick < 7
        ? actor.position
        : s.ball.ownerId === actor.id
          ? intent.target
          : { x: s.ball.x, y: s.ball.y };
    actor = moveAthlete(
      actor,
      target,
      tick < 7 ? 0 : deriveMovementCapability(actor).maximumSprintSpeed,
      s.time,
    );
    const defenders = s.players
      .filter((p) => p.id !== attackerId)
      .map((d) => {
        const reaction = 0.12 + (1 - d.profile.attributes.gameReading / 100) * 0.22;
        let plan = commitments.get(d.id);
        if (s.time >= reaction + DT && (!plan || s.time >= plan.until)) {
          // Finite sensory latency: react to an already observed movement, with no move/phase read.
          const seen = observations[Math.max(0, Math.floor((s.time - reaction + 1e-8) / DT))]!;
          const horizon = c.defender === 'delay' ? 0.04 : 0.3;
          const observed = { x: seen.x + seen.vx * horizon, y: seen.y + seen.vy * horizon };
          plan = { target: observed, until: s.time + (c.defender === 'delay' ? 0.1 : 0.32) };
          commitments.set(d.id, plan);
          if (commitment === null) commitment = s.time;
        }
        return moveAthlete(
          d,
          plan?.target ?? d.position,
          plan ? deriveMovementCapability(d).runSpeed : 0,
          s.time,
        );
      });
    s = { ...s, players: [actor, ...defenders] };
    if (s.ball.ownerId === attackerId) {
      const next = advanceControlledBall(s, actor, DT);
      s = next.state;
      if (next.looseVelocity) {
        delete s.ball.ownerId;
        s.ball.looseSince = s.time;
      }
    } else {
      const b = integrateBallFlight(
        {
          position: { x: s.ball.x, y: s.ball.y, z: BALL_RADIUS },
          velocity: { x: s.ball.velocity?.x ?? 0, y: s.ball.velocity?.y ?? 0, z: 0 },
          ...(s.ball.spin ? { spin: s.ball.spin } : {}),
          airborne: false,
          bounceCount: 0,
        },
        DT,
      );
      s.ball = {
        ...s.ball,
        x: b.position.x,
        y: b.position.y,
        velocity: b.velocity,
        ...(b.spin ? { spin: b.spin } : {}),
      };
      const claim = advanceBallAcquisition(s, actor, 2.2);
      s = claim.state;
      if (claim.securedPlayerId) s = { ...s, ball: { ...s.ball, ownerId: actor.id } };
    }
    const fact = s.lastGroundContact?.surfaceContact;
    if (fact && fact.at === s.time) contacts.push(structuredClone(fact));
    completedMove ||= s.controlledBallContact?.multiContact?.status === 'completed';
    for (const d of defenders)
      if (s.ball.ownerId === attackerId && distance(d.position, s.ball) < 1.25) {
        if (!s.defensiveChallenge)
          s = beginDefensiveChallenge(
            s,
            { type: 'challenge', actorId: d.id, opponentId: attackerId, technique: 'standing' },
            'autonomous_routine',
          );
        const resolution = resolveDefensiveChallenge(s);
        s = resolution.state;
        if (resolution.diagnostic) {
          challengeOutcomes.push(resolution.diagnostic.outcome);
          if (resolution.diagnostic.outcome === 'clean_win') s.ball = { ...s.ball, ownerId: d.id };
          if (resolution.looseVelocity) {
            delete s.ball.ownerId;
            s.ball.velocity = { ...resolution.looseVelocity, z: 0 };
            s.ball.looseSince = s.time;
          }
        }
      }
    samples.push({
      at: s.time,
      attacker: { ...actor.position },
      ball: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? BALL_RADIUS },
      defenders: defenders.map((d) => ({ ...d.position })),
      owner: s.ball.ownerId ?? null,
      balance: s.controlledBallContact?.balance ?? actor.plantBalance?.balance ?? 1,
    });
    if (actor.position.x > 20 + c.separation + 2 && s.ball.ownerId === attackerId) {
      escaped = true;
      break;
    }
    if (s.ball.ownerId && s.ball.ownerId !== attackerId) break;
  }
  return feintTrialResultSchema.parse({
    input: { config: c, player: p, seed },
    contacts,
    completedMove,
    escaped,
    failure: escaped
      ? null
      : s.ball.ownerId && s.ball.ownerId !== attackerId
        ? 'defender_won'
        : !completedMove
          ? 'move_unavailable_or_late'
          : 'evasion_failed',
    defenderCommitment: commitment,
    challengeOutcomes,
    samples,
  });
};

export const jumpTrialConfigSchema = z.object({
  armAssistance: z.boolean().default(false),
  approachSpeed: z.number().min(0).max(7).default(0),
  afterTurn: z.boolean().default(false),
  ballArrivalSeconds: z.number().positive().default(0.65),
  ballHeight: z.number().positive().default(2.3),
});
export const jumpTrialResultSchema = z.object({
  input: z.object({
    config: jumpTrialConfigSchema,
    player: footballerProfileSchema,
    seed: z.string(),
  }),
  jump: verticalJumpSchema,
  takeoffSeconds: z.number().nullable(),
  contactSeconds: z.number().nullable(),
  contactHeight: z.number().nullable(),
  headerExecuted: z.boolean(),
  headerVelocity: vector.nullable(),
  maximumHeadingReach: z.number(),
  fitnessAfter: matchFitnessSchema,
  samples: z.array(
    z.object({
      at: z.number(),
      height: z.number(),
      velocity: z.number(),
      headHeight: z.number(),
      ball: vector,
      eligible: z.boolean(),
    }),
  ),
});
export const runJumpTrial = (
  config: z.input<typeof jumpTrialConfigSchema>,
  profile: FootballerProfile,
  seed: string,
) => {
  const c = jumpTrialConfigSchema.parse(config),
    p = footballerProfileSchema.parse(structuredClone(profile));
  const s = makeLabState(
    p,
    footballSkillTrialConfigSchema.parse({
      id: 'jump',
      drill: 'receive',
      initialVelocity: { x: c.approachSpeed, y: 0 },
    }),
    seed,
  );
  let actor = s.players[0]!;
  if (c.afterTurn)
    for (let i = 0; i < 12; i++)
      actor = moveAthlete(actor, { x: 16, y: 34 }, c.approachSpeed, i * DT);
  actor = {
    ...actor,
    verticalJump: beginVerticalJump(actor, {
      armAssistance: c.armAssistance,
      approach: c.approachSpeed > 0,
    })!,
  };
  let ball: PhysicalBall = {
    position: {
      x: actor.position.x + c.approachSpeed * c.ballArrivalSeconds * 0.5,
      y: 34,
      z: c.ballHeight + 1.5,
    },
    velocity: { x: 0, y: 0, z: -1 },
    airborne: true,
    bounceCount: 0,
  };
  const samples = [];
  let contactSeconds: number | null = null,
    contactHeight: number | null = null;
  let headerExecuted = false,
    headerVelocity: z.infer<typeof vector> | null = null;
  for (let tick = 0; tick < 120; tick++) {
    actor = moveAthlete(
      actor,
      { x: actor.position.x + 1, y: 34 },
      c.approachSpeed * 0.5,
      tick * DT,
    );
    ball = integrateBallFlight(ball, DT);
    const eligibility = evaluateAerialContact(
      actor,
      { ...ball.position, height: ball.position.z },
      0,
    );
    if (eligibility && contactSeconds === null) {
      contactSeconds = (tick + 1) * DT;
      contactHeight = ball.position.z;
      // The ordinary aerial lifecycle temporarily nominates the actual eligible head
      // as the action owner. It does not grant settled ground possession.
      const header = resolveMatchAction(
        {
          ...s,
          time: (tick + 1) * DT,
          players: [actor],
          ball: {
            x: ball.position.x,
            y: ball.position.y,
            height: ball.position.z,
            velocity: ball.velocity,
            airborne: true,
            ownerId: actor.id,
            lastTouchPlayerId: actor.id,
          },
        },
        {
          type: 'header',
          actorId: actor.id,
          target: { x: actor.position.x + 15, y: 34 },
          intent: 'header_clearance',
        },
        'dev_ai_selected',
      );
      if (header.ball.velocity && !header.ball.ownerId) {
        headerExecuted = true;
        headerVelocity = { ...header.ball.velocity, z: header.ball.velocity.z ?? 0 };
        ball = {
          ...ball,
          velocity: headerVelocity,
          ...(header.ball.spin ? { spin: header.ball.spin } : {}),
        };
      }
    }
    const jump = actor.verticalJump!;
    samples.push({
      at: (tick + 1) * DT,
      height: jump.height,
      velocity: jump.velocity,
      headHeight: p.heightCm / 100 + jump.height,
      ball: { ...ball.position },
      eligible: Boolean(eligibility),
    });
    if (jump.phase === 'ready') break;
  }
  const jump = actor.verticalJump!;
  return jumpTrialResultSchema.parse({
    input: { config: c, player: p, seed },
    jump,
    takeoffSeconds: jump.takeoffAt,
    contactSeconds,
    contactHeight,
    headerExecuted,
    headerVelocity,
    maximumHeadingReach: p.heightCm / 100 + jump.maximumHeight + BALL_RADIUS,
    fitnessAfter: actor.fitness,
    samples,
  });
};

export const hoopTrialConfigSchema = z.object({
  hoop: labHoopSchema,
  ball: z.object({ position: vector, velocity: vector, spin: ballSpinSchema }),
  maximumSeconds: z.number().positive().max(15).default(6),
});
export const hoopTrialResultSchema = z.object({
  input: hoopTrialConfigSchema,
  hit: z.boolean(),
  rimContact: z.boolean(),
  crossing: z
    .object({
      at: z.number(),
      point: vector,
      u: z.number(),
      v: z.number(),
      missDistance: z.number(),
    })
    .nullable(),
  maximumHeight: z.number(),
  lateralCurvature: z.number(),
  predictionError: z.number().nullable(),
  samples: z.array(z.object({ at: z.number(), position: vector, spin: ballSpinSchema })),
});
export const runHoopTrial = (config: z.input<typeof hoopTrialConfigSchema>) => {
  const c = hoopTrialConfigSchema.parse(config);
  let ball: PhysicalBall = { ...c.ball, airborne: true, bounceCount: 0 },
    prediction: PhysicalBall = structuredClone(ball);
  let hit = false,
    rimContact = false,
    crossing: z.infer<typeof hoopTrialResultSchema>['crossing'] = null,
    predictionPoint: { x: number; y: number; z: number } | undefined;
  let maximumHeight = ball.position.z,
    lateralCurvature = 0;
  const samples = [];
  for (let tick = 0; tick < c.maximumSeconds / DT; tick++) {
    const at = tick * DT,
      next = advanceLabBall(ball, DT, [c.hoop], at);
    rimContact ||= next.contacts.some((k) => k.kind === 'hoop');
    for (const segment of next.segments) {
      const x = intersectLabPlane(segment.from, segment.to, c.hoop);
      if (x && crossing === null) {
        const measured = measureLabOpening(c.hoop, x);
        crossing = {
          at: segment.at + segment.dt * x.fraction,
          point: x.point,
          u: x.u,
          v: x.v,
          missDistance: Math.max(0, measured.errorMetres + BALL_RADIUS - c.hoop.innerDiameter / 2),
        };
        hit = measured.hit && !rimContact;
      }
    }
    const predicted = integrateBallFlight(prediction, DT),
      px = intersectLabPlane(prediction.position, predicted.position, c.hoop);
    if (px && !predictionPoint) predictionPoint = px.point;
    prediction = predicted;
    ball = next.ball;
    maximumHeight = Math.max(maximumHeight, ball.position.z);
    const dx = ball.position.x - c.ball.position.x;
    const straightY =
      c.ball.position.y +
      (c.ball.velocity.x === 0 ? 0 : (dx * c.ball.velocity.y) / c.ball.velocity.x);
    lateralCurvature = Math.max(lateralCurvature, Math.abs(ball.position.y - straightY));
    samples.push({
      at: at + DT,
      position: { ...ball.position },
      spin: { ...(ball.spin ?? { x: 0, y: 0, z: 0 }) },
    });
    if (crossing && predictionPoint) break;
    if (!ball.airborne && Math.hypot(ball.velocity.x, ball.velocity.y) < 0.05) break;
  }
  return hoopTrialResultSchema.parse({
    input: c,
    hit: hit && !rimContact,
    rimContact,
    crossing,
    maximumHeight,
    lateralCurvature,
    predictionError:
      crossing && predictionPoint
        ? Math.hypot(
            crossing.point.x - predictionPoint.x,
            crossing.point.y - predictionPoint.y,
            crossing.point.z - predictionPoint.z,
          )
        : null,
    samples,
  });
};

export const repeatedSprintConfigSchema = z.object({
  metres: z.enum(['10', '20', '20+20']).default('20'),
  restSeconds: z.number().min(0).max(60).default(10),
  ball: z.boolean().default(false),
});
export const repeatedSprintResultSchema = z.object({
  input: z.object({
    config: repeatedSprintConfigSchema,
    player: footballerProfileSchema,
    seed: z.string(),
  }),
  repetitions: z.array(
    z.object({
      repetition: z.number().int(),
      status: z.enum(['completed', 'failed', 'incomplete']),
      seconds: z.number().nullable(),
      distance: z.number().nullable(),
      positiveKineticWorkJoules: z.number(),
      brakingSeconds: z.number().nonnegative(),
      workload: fitnessWorkloadSchema,
      fitnessBefore: matchFitnessSchema,
      fitnessAfter: matchFitnessSchema,
      afterRest: matchFitnessSchema,
      touches: z.number().nullable(),
      lostControl: z.number().nullable(),
    }),
  ),
  bestSeconds: z.number().nullable(),
  meanSeconds: z.number().nullable(),
  fitnessAfter: matchFitnessSchema,
});
export const runRepeatedSprintTrial = (
  config: z.input<typeof repeatedSprintConfigSchema>,
  profile: FootballerProfile,
  seed: string,
) => {
  const c = repeatedSprintConfigSchema.parse(config),
    p = structuredClone(profile);
  let fitness = createMatchFitness();
  const repetitions = [];
  for (let rep = 0; rep < 6; rep++) {
    const turning = c.metres === '20+20',
      metres = c.metres === '10' ? 10 : 20;
    const drill = c.ball ? 'slalom' : turning ? 'turn' : 'sprint';
    const route = turning
      ? [
          { x: 20 + metres, y: 34 },
          { x: 20, y: 34 },
        ]
      : [{ x: 20 + metres, y: 34 }];
    const r = runFootballSkillTrial(
      {
        id: `repeat-${rep}`,
        drill,
        distance: metres,
        route: drill === 'sprint' ? [] : route,
        fitness,
        // A carry checkpoint must accommodate the actual foot/body separation.
        // This is a nominal-distance control drill, distinct from the player-only timing gate.
        checkpointRadius: c.ball ? 1.1 : 0.4,
        facingAngle: Math.PI / 2,
        maximumSeconds: 35,
        objects:
          drill === 'sprint'
            ? [
                {
                  id: 'finish',
                  kind: 'gate',
                  subject: 'player',
                  position: { x: 20 + metres, y: 34, z: 1 },
                  normal: { x: 1, y: 0, z: 0 },
                  width: 4,
                  height: 2,
                },
              ]
            : [],
      },
      p,
      `${seed}:${rep}`,
    );
    fitness = r.fitnessAfter;
    let restActor = makeLabState(
      p,
      footballSkillTrialConfigSchema.parse({ id: 'rest', drill: 'sprint', fitness }),
      seed,
    ).players[0]!;
    const finalSample = r.samples.at(-1)!;
    restActor = {
      ...restActor,
      position: r.finalPlayer,
      velocity: finalSample.velocity,
      facingAngle: finalSample.facingAngle,
    };
    let brakingTicks = 0;
    const stopTarget = { ...restActor.position };
    while (Math.hypot(restActor.velocity.x, restActor.velocity.y) > 0.05 && brakingTicks < 160) {
      restActor = moveAthlete(restActor, stopTarget, 0, brakingTicks * DT);
      brakingTicks++;
    }
    fitness = restActor.fitness!;
    for (let tick = 0; tick < Math.round(c.restSeconds / DT); tick++) {
      restActor.fitness = fitness;
      fitness = advanceMatchFitness(restActor, {
        dt: DT,
        distance: 0,
        speed: 0,
        previousSpeed: 0,
        turnRadians: 0,
        sprinting: false,
        sprintBurst: false,
      });
    }
    repetitions.push({
      repetition: rep + 1,
      status: r.status,
      seconds: r.finishSeconds,
      distance: r.metrics.distanceMetres,
      positiveKineticWorkJoules: r.metrics.positiveKineticWorkJoules ?? 0,
      brakingSeconds: brakingTicks * DT,
      workload: r.fitnessAfter.workload,
      fitnessBefore: r.fitnessBefore,
      fitnessAfter: r.fitnessAfter,
      afterRest: structuredClone(fitness),
      touches: r.metrics.touches,
      lostControl: r.metrics.lostControlEvents,
    });
  }
  const times = repetitions.flatMap((r) => (r.seconds === null ? [] : [r.seconds]));
  return repeatedSprintResultSchema.parse({
    input: { config: c, player: p, seed },
    repetitions,
    bestSeconds: times.length ? Math.min(...times) : null,
    meanSeconds: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    fitnessAfter: fitness,
  });
};

export const physicalContestTrialResultSchema = z.object({
  input: tacticalMatchStateSchema,
  access: ballContactAccessSchema,
  body: shieldBodyContestSchema,
  outcome: challengeDiagnosticSchema.nullable(),
  samples: z.array(
    z.object({
      at: z.number(),
      carrier: physicalPointSchema,
      defender: physicalPointSchema,
      ball: physicalPointSchema,
      balance: z.number().min(0).max(1),
    }),
  ),
});
/** Controlled legal/illegal challenge contexts call the ordinary finite challenge resolver. */
export const runPhysicalContest = (
  state: TacticalMatchState,
  defenderId: string,
  carrierId: string,
  technique: 'standing' | 'committed' | 'slide' | 'tactical',
) => {
  let s = structuredClone(state);
  const carrier = s.players.find((p) => p.id === carrierId)!,
    defender = s.players.find((p) => p.id === defenderId)!;
  const access = deriveBallContactAccess(s, defender, carrier),
    body = deriveShieldBodyContest(s, carrier);
  s = beginDefensiveChallenge(
    s,
    { type: 'challenge', actorId: defenderId, opponentId: carrierId, technique },
    'dev_ai_selected',
  );
  const samples = [];
  let outcome = null;
  for (let tick = 0; tick < 60; tick++) {
    s = { ...s, time: state.time + tick * DT };
    const owner = s.players.find((p) => p.id === carrierId)!;
    const control = advanceControlledBall(s, owner, DT);
    s = control.state;
    const d = s.players.find((p) => p.id === defenderId)!;
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === d.id
          ? moveAthlete(
              p,
              { x: s.ball.x, y: s.ball.y },
              deriveMovementCapability(p).runSpeed,
              s.time,
            )
          : p,
      ),
    };
    const resolution = resolveDefensiveChallenge(s);
    s = resolution.state;
    samples.push({
      at: s.time,
      carrier: { ...owner.position },
      defender: { ...s.players.find((p) => p.id === d.id)!.position },
      ball: { x: s.ball.x, y: s.ball.y },
      balance: s.controlledBallContact?.balance ?? 1,
    });
    if (resolution.diagnostic) {
      outcome = resolution.diagnostic;
      break;
    }
  }
  return physicalContestTrialResultSchema.parse({
    input: structuredClone(state),
    access,
    body,
    outcome,
    samples,
  });
};

export const goalkeeperTrialConfigSchema = z.object({
  exercise: z.enum([
    'reaction',
    'low',
    'high',
    'angle',
    'one_on_one',
    'cross',
    'parry_recovery',
    'throw',
    'kick',
  ]),
  speed: z.number().min(3).max(35).default(18),
  lateral: z.number().min(-6).max(6).default(1.8),
  height: z.number().min(0.11).max(4).default(0.35),
  distance: z.number().min(6).max(40).default(16),
  interference: z.boolean().default(false),
});
export const goalkeeperTrialResultSchema = z.object({
  input: z.object({
    config: goalkeeperTrialConfigSchema,
    player: footballerProfileSchema,
    seed: z.string(),
  }),
  outcome: z.string(),
  reactionDelay: z.number().nullable(),
  firstMovementSeconds: z.number().nullable(),
  handling: z.string().nullable(),
  claimReason: z.string().nullable(),
  releaseVelocity: vector.nullable(),
  releaseSpin: ballSpinSchema.nullable(),
  releasePoint: vector.nullable(),
  distributionError: z.number().nullable(),
  secondBallOutcome: z.string().nullable(),
  samples: z.array(
    z.object({
      at: z.number(),
      keeper: physicalPointSchema,
      ball: vector,
      owner: z.string().nullable(),
    }),
  ),
});
/** Launcher deliveries and complete keeper continuations use normal match ticks, collision,
 * catch/parry, restarts and recovery. The keeper observes the live delivery, not launch intent.
 */
export const runGoalkeeperTrial = (
  config: z.input<typeof goalkeeperTrialConfigSchema>,
  profile: FootballerProfile,
  seed: string,
) => {
  const c = goalkeeperTrialConfigSchema.parse(config),
    p = footballerProfileSchema.parse(structuredClone(profile));
  let s = createFormationBenchmarkMatch({ opponent: '4-3-3', attributes: 60, seed }).state;
  s.time = 10;
  delete s.restart;
  s.scenario = 'open_play';
  s.actionCooldown = 0;
  s.playerAgencyEnabled = false;
  const shooter = s.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!;
  const keeper = s.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper')!;
  keeper.profile = {
    ...keeper.profile,
    attributes: { ...p.attributes },
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    dominantFoot: p.dominantFoot,
    weakFootProficiency: p.weakFootProficiency,
  };
  keeper.goalkeeperRole = true;
  for (const [i, player] of s.players.entries()) {
    player.position = { x: 15 + i, y: 5 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  }
  shooter.position = { x: 105 - c.distance, y: 34 };
  shooter.target = { ...shooter.position };
  shooter.facingAngle = Math.PI / 2;
  keeper.position = { x: 101, y: 34 };
  keeper.target = { ...keeper.position };
  keeper.facingAngle = -Math.PI / 2;
  s.ball = {
    x: shooter.position.x + 0.2,
    y: 34,
    height: BALL_RADIUS,
    ownerId: shooter.id,
    lastTouchPlayerId: shooter.id,
  };
  s.possessionTeam = 'home';
  s.currentActorId = shooter.id;
  const samples: z.infer<typeof goalkeeperTrialResultSchema>['samples'] = [];
  let reactionDelay: number | null = null,
    firstMovementSeconds: number | null = null,
    claimReason: string | null = null;
  let releaseVelocity: z.infer<typeof vector> | null = null,
    releaseSpin: z.infer<typeof ballSpinSchema> | null = null,
    releasePoint: z.infer<typeof vector> | null = null;
  let distributionError: number | null = null,
    secondBallOutcome: string | null = null,
    outcome = 'no_intervention',
    handling: string | null = null;
  const start = s.time;
  if (c.exercise === 'throw' || c.exercise === 'kick') {
    s.possessionTeam = 'away';
    s.ball = {
      x: 101,
      y: 34,
      ownerId: keeper.id,
      lastTouchPlayerId: keeper.id,
      heldByKeeperId: keeper.id,
    };
    const target = { x: 101 - c.distance, y: 34 + c.lateral };
    {
      const receiver = s.players.find((p) => p.team === 'away' && p.id !== keeper.id)!;
      receiver.position = target;
      s = resolveMatchAction(
        s,
        {
          type: 'pass',
          actorId: keeper.id,
          receiverId: receiver.id,
          target,
          intent: 'direct',
          delivery: 'lofted',
          distribution: c.exercise,
        },
        'dev_ai_selected',
      );
      if (s.ball.velocity) {
        releaseVelocity = { ...s.ball.velocity, z: s.ball.velocity.z ?? 0 };
        releaseSpin = s.ball.spin ?? { x: 0, y: 0, z: 0 };
        releasePoint = { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? BALL_RADIUS };
      }
    }
    if (releaseVelocity && releasePoint) {
      let ball: PhysicalBall = {
        position: releasePoint,
        velocity: releaseVelocity,
        spin: releaseSpin ?? { x: 0, y: 0, z: 0 },
        airborne: true,
        bounceCount: 0,
      };
      for (let tick = 0; tick < 240; tick++) {
        const next = integrateBallFlight(ball, DT);
        const plane = {
          position: { ...target, z: 0.5 },
          normal: { x: -1, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 1 },
        };
        const crossing = intersectLabPlane(ball.position, next.position, plane);
        samples.push({
          at: tick * DT,
          keeper: { ...keeper.position },
          ball: { ...next.position },
          owner: null,
        });
        if (crossing) {
          distributionError = Math.hypot(crossing.u, crossing.v);
          break;
        }
        ball = next;
      }
      outcome = distributionError === null ? 'short_distribution' : 'target_plane_crossed';
    } else outcome = 'no_release';
  } else {
    const angleOnly = c.exercise === 'angle' || c.exercise === 'one_on_one';
    if (!angleOnly) {
      const shot = resolveCanonicalShot(s, {
        type: 'shot',
        actorId: shooter.id,
        target: { x: 105, y: 34 + c.lateral },
        intent: 'driven',
        contact: 'settled',
      });
      const velocity = {
        x: c.speed,
        y: (c.lateral * c.speed) / c.distance,
        z: c.exercise === 'high' ? 4.5 : 0,
      };
      s.ball = {
        x: shooter.position.x,
        y: 34,
        height: c.height,
        velocity,
        spin: { x: 0, y: 0, z: 0 },
        airborne: c.height > 0.11,
        shot,
        flightTime: 0,
        travelKind: c.exercise === 'cross' ? 'pass' : 'shot',
        lastTouchPlayerId: shooter.id,
        from: { ...shooter.position },
        target: { x: 106, y: 34 + c.lateral },
      };
      if (c.exercise === 'cross') {
        delete s.ball.shot;
        s.ball.intendedReceiverId = shooter.id;
      }
      reactionDelay = projectGoalkeeperIntervention(s)?.reactionDelay ?? null;
      claimReason = arbitrateGoalkeeperClaim(
        s,
        keeper,
        { x: 101, y: 34 + c.lateral },
        c.distance / c.speed,
      ).reason;
    } else {
      shooter.position.x = 85;
      s.ball.x = 85.2;
      s.ball.ownerId = shooter.id;
      s = resolveMatchAction(
        s,
        {
          type: 'carry',
          actorId: shooter.id,
          target: { x: 103, y: 34 + c.lateral },
          movementMode: 'sprint',
        },
        'dev_ai_selected',
      );
      claimReason = deriveGoalkeeperApproach(s, keeper)?.reason ?? null;
    }
    if (c.interference) {
      const challenger = s.players.find((p) => p.team === 'home' && p.id !== shooter.id)!;
      challenger.position = { x: 99, y: 34 + c.lateral };
      challenger.target = { ...challenger.position };
    }
    let secondReleased = false,
      secondShotId: string | undefined;
    for (let tick = 0; tick < 160; tick++) {
      s = stepTacticalMatchAfterDecisionProbe(s, DT);
      const k = s.players.find((p) => p.id === keeper.id);
      if (!k) {
        outcome = 'keeper_unavailable';
        break;
      }
      if (firstMovementSeconds === null && distance(k.position, keeper.position) > 0.03)
        firstMovementSeconds = s.time - start;
      samples.push({
        at: s.time - start,
        keeper: { ...k.position },
        ball: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? BALL_RADIUS },
        owner: s.ball.ownerId ?? null,
      });
      if (s.lastShot?.goalkeeperAction) handling = s.lastShot.goalkeeperAction;
      if (s.lastShot?.outcome) outcome = s.lastShot.outcome;
      if (s.ball.ownerId === keeper.id) outcome = 'keeper_control';
      if (c.exercise === 'angle')
        outcome = distance(k.position, keeper.position) > 0.4 ? 'angle_reduced' : 'no_advance';
      if (c.exercise === 'cross' && s.ball.ownerId === keeper.id) outcome = 'cross_claimed';
      if (
        c.exercise === 'parry_recovery' &&
        !secondReleased &&
        (handling === 'parry' || handling === 'parry_away') &&
        s.time - start > 1.1
      ) {
        secondReleased = true;
        // The apparatus launches a NEW ball. Preserve the keeper's actual pose and fitness,
        // while ending the first ball's possible out-of-play restart context.
        const { restart: _firstRestart, postGoal: _firstGoal, ...nextDelivery } = s;
        void [_firstRestart, _firstGoal];
        s = {
          ...nextDelivery,
          scenario: 'open_play',
          decisionIndex: s.decisionIndex + 1,
          actionCooldown: 0,
        };
        secondBallOutcome = 'unresolved_second_delivery';
        const second = resolveCanonicalShot(
          { ...s, ball: { x: 92, y: 34, ownerId: shooter.id } },
          {
            type: 'shot',
            actorId: shooter.id,
            target: { x: 105, y: 33 },
            intent: 'driven',
            contact: 'settled',
          },
        );
        secondShotId = second.shotId;
        s.ball = {
          x: 92,
          y: 34,
          height: 0.35,
          velocity: { x: 18, y: -1.4, z: 0 },
          spin: { x: 0, y: 0, z: 0 },
          airborne: true,
          shot: second,
          flightTime: 0,
          travelKind: 'shot',
          from: { x: 92, y: 34 },
          lastTouchPlayerId: shooter.id,
          target: { x: 106, y: 33 },
        };
      }
      if (secondReleased && s.lastShot && s.lastShot.shotId === secondShotId)
        secondBallOutcome = s.lastShot.outcome ?? null;
      if (
        c.exercise !== 'parry_recovery' &&
        !angleOnly &&
        (s.lastShot?.outcome || s.ball.ownerId === keeper.id || s.restart)
      )
        break;
    }
  }
  return goalkeeperTrialResultSchema.parse({
    input: { config: c, player: p, seed },
    outcome,
    reactionDelay,
    firstMovementSeconds,
    handling,
    claimReason,
    releaseVelocity,
    releaseSpin,
    releasePoint,
    distributionError,
    secondBallOutcome,
    samples,
  });
};
