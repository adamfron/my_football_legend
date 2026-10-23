import { z } from 'zod';
import { footballerProfileSchema } from '../../schemas/domainSchemas';
import type { FootballerProfile } from '../../types/domain';
import { RandomGenerator, hashRandomSeed } from '../random/RandomGenerator';
import { FORMATIONS } from '../footballerWorld';
import {
  matchActionSchema,
  type MatchAction,
  type MatchPlayerState,
  type TacticalMatchState,
} from './matchState';
import { physicalPointSchema, distance, distanceToSegment } from './matchSpace';
import {
  footSurfaceSchema,
  footContactExecutionSchema,
  type FootContactExecution,
} from './footContact';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { integrateCanonicalMovement } from './canonicalMovement';
import {
  deriveMovementCapability,
  projectSprintEpisode,
  sprintSpeedAt,
  projectLocomotion,
} from './locomotion';
import { advanceMatchFitness, createMatchFitness, matchFitnessSchema } from './matchFitness';
import { FIXED_MATCH_DT, applyCanonicalBallControl } from './matchSimulation';
import { advanceControlledBall, playerContactGeometry } from './ballContactGeometry';
import { advanceBallAcquisition } from './ballAcquisition';
import { deriveCarryExecution } from './carryExecution';
import { deriveCarryPursuit } from './carryPursuit';
import { deriveOnBallPreparation, preparationMarginForAction } from './onBallPreparation';
import { resolveMatchAction, rankAvailableActionsForAI } from './matchActions';
import { derivePassLaunchPlan } from './passLaunchPlan';
import { deriveShotExecutionErrorProfile } from './shotResolver';
import { derivePassDifficulty } from './passExecution';
import { assessFirstTouch } from './firstTouch';
import { projectReceiverReadiness } from './receiverReadiness';
import { deriveShotExecutionProfile } from './shootingOptions';
import { estimatePlayerArrivalTime } from './playerArrival';
import { BALL_RADIUS } from './ballFlight';
import { projectFutureBallTrajectory, integrateBallFlight, type PhysicalBall } from './ballPhysics';
import {
  trainingObjectSchema,
  labVectorSchema,
  labContactSchema,
  advanceLabBall,
  intersectLabPlane,
  measureLabOpening,
  type LabVector,
} from './footballLabObjects';

const ballSchema = z.object({
  position: labVectorSchema,
  velocity: labVectorSchema,
  spin: labVectorSchema,
  airborne: z.boolean(),
  bounceCount: z.number().int().nonnegative(),
});
export const footballSkillTrialConfigSchema = z
  .object({
    id: z.string().min(1),
    drill: z.enum(['sprint', 'turn', 'slalom', 'pass', 'rebound', 'receive', 'shot']),
    mode: z.enum(['prescribed', 'autonomous', 'manual']).default('prescribed'),
    protocol: z
      .enum(['custom_physics', 'adapted_mfl', 'published_geometry'])
      .default('custom_physics'),
    maximumSeconds: z.number().positive().max(300).default(60),
    distance: z.number().positive().max(60).default(20),
    movingStart: z.number().min(0).max(10).default(0),
    position: physicalPointSchema.default({ x: 20, y: 34 }),
    facingAngle: z.number().default(Math.PI / 2),
    initialVelocity: physicalPointSchema.optional(),
    fitness: matchFitnessSchema.optional(),
    initialBall: ballSchema.optional(),
    objects: z.array(trainingObjectSchema).max(100).default([]),
    route: z.array(physicalPointSchema).max(100).default([]),
    checkpointRadius: z.number().positive().max(2).default(1.1),
    turnDirection: z.enum(['left', 'right']).default('left'),
    foot: z.enum(['dominant', 'weak', 'unrestricted']).default('unrestricted'),
    contactSurface: footSurfaceSchema.optional(),
    firstTime: z.boolean().default(false),
    delivery: z.enum(['ground', 'lofted']).default('ground'),
    shotTechnique: z.enum(['placed', 'driven', 'chip']).default('placed'),
    targetId: z.string().optional(),
    targetHeight: z.number().min(0).max(2.44).default(0.4),
    collisionBudget: z.number().int().nonnegative().default(100),
    lostBallDistance: z.number().positive().default(12),
    commands: z
      .array(z.object({ at: z.number().nonnegative(), action: matchActionSchema }))
      .default([]),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.objects.map((o) => o.id)).size !== c.objects.length)
      ctx.addIssue({ code: 'custom', message: 'Object IDs must be unique' });
    if (
      c.targetId &&
      !c.objects.some((o) => o.id === c.targetId && ['target', 'hoop', 'goal'].includes(o.kind))
    )
      ctx.addIssue({ code: 'custom', message: 'targetId must identify an opening' });
    if ((c.drill === 'slalom' || c.drill === 'turn') && !c.route.length)
      ctx.addIssue({ code: 'custom', message: 'A physical route is required' });
  });
export type FootballSkillTrialConfig = z.infer<typeof footballSkillTrialConfigSchema>;
export const labSampleSchema = z.object({
  at: z.number(),
  player: physicalPointSchema,
  ball: labVectorSchema,
  velocity: physicalPointSchema,
  speed: z.number(),
  acceleration: z.number(),
  facingAngle: z.number(),
  separation: z.number(),
  capacity: z.number(),
  readiness: z.number(),
  checkpoint: z.number().int(),
  owner: z.boolean(),
});
export const labEventSchema = z.object({
  at: z.number(),
  kind: z.string(),
  objectId: z.string().optional(),
  point: labVectorSchema.optional(),
  values: z
    .record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()]))
    .default({}),
});
export const labPredictionSchema = z.object({
  source: z.string(),
  definition: z.string(),
  unit: z.string(),
  predicted: z.number(),
  predictedSigma: z.number().nonnegative().optional(),
  observed: z.number().nullable(),
  error: z.number().nullable(),
  comparable: z.boolean(),
  context: z.string(),
});
export const footballSkillTrialResultSchema = z.object({
  schema: z.literal('mfl-football-skill-trial-v1'),
  stepSeconds: z.literal(0.025),
  seed: z.string(),
  inputHash: z.string(),
  input: z.object({ config: footballSkillTrialConfigSchema, player: footballerProfileSchema }),
  status: z.enum(['completed', 'failed', 'incomplete']),
  failure: z.string().nullable(),
  elapsedSeconds: z.number(),
  finishSeconds: z.number().nullable(),
  ticks: z.number().int().nonnegative(),
  metrics: z.record(z.string(), z.number().nullable()),
  units: z.record(z.string(), z.string()),
  events: z.array(labEventSchema),
  contacts: z.array(labContactSchema),
  footContacts: z.array(footContactExecutionSchema).default([]),
  samples: z.array(labSampleSchema),
  decisions: z.array(
    z.object({
      at: z.number(),
      alternatives: z.array(
        z.object({
          action: matchActionSchema,
          score: z.number(),
          forecast: z.string(),
          predicted: z.record(z.string(), z.number()),
        }),
      ),
      chosen: matchActionSchema,
    }),
  ),
  predictions: z.array(labPredictionSchema),
  fitnessBefore: matchFitnessSchema,
  fitnessAfter: matchFitnessSchema,
  finalPlayer: physicalPointSchema,
  finalBall: ballSchema,
});
export type FootballSkillTrialResult = z.infer<typeof footballSkillTrialResultSchema>;
export type LabSample = z.infer<typeof labSampleSchema>;
const toPhysical = (s: TacticalMatchState): PhysicalBall => ({
  position: { x: s.ball.x, y: s.ball.y, z: Math.max(BALL_RADIUS, s.ball.height ?? BALL_RADIUS) },
  velocity: { x: s.ball.velocity?.x ?? 0, y: s.ball.velocity?.y ?? 0, z: s.ball.velocity?.z ?? 0 },
  spin: s.ball.spin ?? { x: 0, y: 0, z: 0 },
  airborne: s.ball.airborne ?? false,
  bounceCount: s.ball.bounceCount ?? 0,
});
const withPhysical = (s: TacticalMatchState, b: PhysicalBall): TacticalMatchState => ({
  ...s,
  ball: {
    ...s.ball,
    x: b.position.x,
    y: b.position.y,
    height: b.position.z,
    velocity: b.velocity,
    spin: b.spin ?? { x: 0, y: 0, z: 0 },
    airborne: b.airborne,
    bounceCount: b.bounceCount,
  },
});
const footFor = (c: FootballSkillTrialConfig, p: FootballerProfile) =>
  c.foot === 'unrestricted'
    ? undefined
    : c.foot === 'dominant'
      ? p.dominantFoot
      : p.dominantFoot === 'left'
        ? 'right'
        : 'left';
export const makeLabAthlete = (
  profile: FootballerProfile,
  c: FootballSkillTrialConfig,
): MatchPlayerState => ({
  id: profile.id,
  profile,
  team: 'home',
  slotIndex: 6,
  slot: FORMATIONS['4-3-3'][6]!,
  duty: 'support',
  position: { ...c.position },
  target: { ...c.position },
  velocity: c.initialVelocity ?? { x: c.movingStart, y: 0 },
  facingAngle: c.facingAngle,
  anchor: { ...c.position },
  neutralAnchor: { ...c.position },
  idealTarget: { ...c.position },
  meanPosition: { ...c.position },
  samples: 1,
  fitness: structuredClone(c.fitness ?? createMatchFitness()),
});
export const makeLabState = (
  profile: FootballerProfile,
  c: FootballSkillTrialConfig,
  seed: string,
): TacticalMatchState => {
  const athlete = makeLabAthlete(profile, c),
    feet = playerContactGeometry(athlete),
    foot = footFor(c, profile);
  const contact = foot
    ? feet[foot === 'left' ? 'leftFoot' : 'rightFoot']
    : { x: c.position.x + 0.2, y: c.position.y };
  let state: TacticalMatchState = {
    seed,
    time: 0,
    decisionIndex: 0,
    status: 'first_half',
    players: [athlete],
    teams: {
      home: {
        side: 'home',
        clubId: 'lab-home',
        formation: '4-3-3',
        style: 'balanced',
        phase: 'positional_attack',
        phaseElapsed: 0,
      },
      away: {
        side: 'away',
        clubId: 'lab-away',
        formation: '4-3-3',
        style: 'balanced',
        phase: 'defensive_block',
        phaseElapsed: 0,
      },
    },
    ball: {
      ...contact,
      height: BALL_RADIUS,
      ownerId: profile.id,
      lastTouchPlayerId: profile.id,
      velocity: { x: 0, y: 0, z: 0 },
    },
    possessionTeam: 'home',
    timeSincePossessionChanged: 0,
    actionCooldown: 0,
    ballOwnershipStartedAt: 0,
    ballEpisode: 0,
    score: { home: 0, away: 0 },
    currentPressure: 0,
    scenario: 'open_play',
    playerAgencyEnabled: false,
  };
  if (c.initialBall) {
    state = withPhysical(state, c.initialBall);
    delete state.ball.ownerId;
  }
  if (c.drill === 'receive' || c.firstTime) {
    delete state.ball.ownerId;
    state.ball.travelKind = 'pass';
    state.ball.lastTouchPlayerId = 'lab-launcher';
  }
  return state;
};

/** A supplied callback observes a detached sample. It cannot affect physics, RNG or input state.
 * All modes submit the ordinary MatchAction family to the same physical release path. */
export const runFootballSkillTrial = (
  rawConfig: z.input<typeof footballSkillTrialConfigSchema>,
  playerProfile: FootballerProfile,
  seed: string,
  observer?: (sample: LabSample) => void,
): FootballSkillTrialResult => {
  const c = footballSkillTrialConfigSchema.parse(rawConfig),
    profile = footballerProfileSchema.parse(structuredClone(playerProfile));
  const input = { config: c, player: profile };
  const inputHash = `fnv1a32:${hashRandomSeed(JSON.stringify({ input, seed })).toString(16).padStart(8, '0')}`;
  let state = makeLabState(profile, c, seed),
    checkpoint = 0,
    finishSeconds: number | null = null,
    failure: string | null = null;
  let status: FootballSkillTrialResult['status'] = 'incomplete',
    released = 0,
    returning = false,
    received = false,
    controlledAt: number | null = null;
  let distanceCovered = 0,
    peakSpeed = 0,
    timeToPeak = 0,
    peakSeparation = 0,
    touches = 0,
    lost = 0,
    recoveries = 0,
    collisions = 0,
    leftTouches = 0,
    rightTouches = 0;
  let lastTouchAt = -1,
    lastOwner = Boolean(state.ball.ownerId),
    releaseAt: number | null = null,
    turnAt: number | null = null,
    turnEnd: number | null = null;
  let preparationAt: number | null = null,
    launchSpeed: number | null = null,
    arrivalAt: number | null = null,
    arrivalSpeed: number | null = null,
    targetError: number | null = null;
  const fitnessBefore = structuredClone(state.players[0]!.fitness!),
    samples: LabSample[] = [],
    events: FootballSkillTrialResult['events'] = [],
    contacts: FootballSkillTrialResult['contacts'] = [],
    decisions: FootballSkillTrialResult['decisions'] = [],
    predictions: FootballSkillTrialResult['predictions'] = [];
  let autonomousAction: MatchAction | undefined;
  const footContacts: FootContactExecution[] = [];
  let manualAction: MatchAction | undefined;
  const launched = new Set<string>(),
    crossings = new Set<string>(),
    rng = RandomGenerator.fromSeed(`${seed}:apparatus`);
  const event = (
    kind: string,
    values: FootballSkillTrialResult['events'][number]['values'] = {},
    at = state.time,
    objectId?: string,
    point?: LabVector,
  ) =>
    events.push({
      at,
      kind,
      values,
      ...(objectId ? { objectId } : {}),
      ...(point ? { point } : {}),
    });
  const target =
    c.objects.find((o) => o.id === c.targetId) ??
    c.objects.find((o) => o.kind === 'target' || o.kind === 'goal' || o.kind === 'hoop');
  const finish = (at: number) => {
    status = 'completed';
    finishSeconds = at;
  };
  const sample = (acceleration: number) => {
    const p = state.players[0]!,
      b = toPhysical(state),
      speed = Math.hypot(p.velocity.x, p.velocity.y);
    const value: LabSample = {
      at: state.time,
      player: { ...p.position },
      ball: { ...b.position },
      velocity: { ...p.velocity },
      speed,
      acceleration,
      facingAngle: p.facingAngle,
      separation: distance(p.position, b.position),
      capacity: p.fitness!.longTermCapacity,
      readiness: p.fitness!.burstReadiness,
      checkpoint,
      owner: state.ball.ownerId === p.id,
    };
    samples.push(value);
    observer?.(structuredClone(value));
  };
  const recordOpenings = (
    segments: { from: LabVector; to: LabVector; at: number; dt: number; initial: PhysicalBall }[],
  ) => {
    for (const segment of segments)
      for (const object of c.objects) {
        if (
          !['gate', 'target', 'hoop', 'goal'].includes(object.kind) ||
          (object.kind === 'gate' && object.subject !== 'ball')
        )
          continue;
        if (
          object.kind !== 'gate' &&
          object.kind !== 'target' &&
          object.kind !== 'hoop' &&
          object.kind !== 'goal'
        )
          continue;
        const hit = intersectLabPlane(segment.from, segment.to, object);
        const key = `${released}:${object.id}:${hit?.direction}`;
        if (!hit || crossings.has(key)) continue;
        crossings.add(key);
        const measured = measureLabOpening(object, hit),
          at = segment.at + segment.dt * hit.fraction;
        const crossingBall = integrateBallFlight(segment.initial, segment.dt * hit.fraction);
        const crossingSpeed = Math.hypot(
          crossingBall.velocity.x,
          crossingBall.velocity.y,
          crossingBall.velocity.z,
        );
        event(
          'ball_plane',
          {
            speedMetresPerSecond: crossingSpeed,
            heightMetres: hit.point.z,
            spinX: crossingBall.spin?.x ?? 0,
            spinY: crossingBall.spin?.y ?? 0,
            spinZ: crossingBall.spin?.z ?? 0,
            u: hit.u,
            v: hit.v,
            errorMetres: measured.errorMetres,
            hit: measured.hit && !contacts.some((contact) => contact.objectId === object.id),
            release: released,
            direction: hit.direction,
            zones: measured.zoneIds?.join(',') ?? '',
          },
          at,
          object.id,
          hit.point,
        );
        if (object.id === target?.id && hit.direction === 'positive') {
          targetError = measured.errorMetres;
          arrivalAt = at;
          arrivalSpeed = crossingSpeed;
          if (c.drill === 'pass' || c.drill === 'shot' || (c.drill === 'rebound' && released === 2))
            finish(at);
        }
      }
  };
  const release = (p: MatchPlayerState, requested?: MatchAction) => {
    if (!target || !('normal' in target)) return false;
    const required = footFor(c, profile),
      feet = playerContactGeometry(p),
      actual = assessFirstTouch(
        state,
        p,
        state.ball,
        target.position,
        c.drill === 'shot' ? 'shot' : 'pass',
      );
    if (
      !actual.feasible ||
      (required && actual.region !== `${required}_foot`) ||
      (required &&
        distance(feet[required === 'left' ? 'leftFoot' : 'rightFoot'], state.ball) > feet.footReach)
    )
      return false;
    const receiver: MatchPlayerState = {
      ...structuredClone(p),
      id: 'lab-planning-receiver',
      // Fixed arrival-planning context, removed before physical integration. No receiver scoring.
      profile: {
        ...structuredClone(p.profile),
        id: 'lab-planning-receiver',
        attributes: Object.fromEntries(
          Object.keys(p.profile.attributes).map((key) => [key, 60]),
        ) as unknown as FootballerProfile['attributes'],
        heightCm: 180,
        weightKg: 75,
        weakFootProficiency: 60,
        traits: [],
      },
      position: { x: target.position.x, y: target.position.y },
      target: { x: target.position.x, y: target.position.y },
      velocity: { x: 0, y: 0 },
      facingAngle: -Math.PI / 2,
    };
    let planning = { ...state, players: [p, receiver] };
    let action: MatchAction =
      c.drill === 'shot'
        ? {
            type: 'shot',
            actorId: p.id,
            target: { x: 105, y: 34 },
            intent: c.shotTechnique,
            contact: c.firstTime ? 'first_time' : 'settled',
            goalTarget: {
              horizontal: Math.max(-1, Math.min(1, (target.position.y - 34) / 3.66)),
              vertical: c.targetHeight / 2.44,
            },
          }
        : {
            type: 'pass',
            ...(required ? { foot: required } : {}),
            actorId: p.id,
            receiverId: receiver.id,
            target: { x: target.position.x, y: target.position.y },
            intent: 'direct',
            delivery: c.delivery,
            firstTime: c.firstTime && released === 0,
            deliveryPlan: derivePassLaunchPlan(
              planning,
              p,
              receiver,
              target.position,
              'direct',
              c.delivery,
            ),
          };
    if (requested)
      action = requested.type === 'pass' ? { ...requested, receiverId: receiver.id } : requested;
    if (
      c.mode === 'autonomous' &&
      autonomousAction &&
      ['hold', 'carry'].includes(autonomousAction.type)
    )
      return false;
    if (c.mode === 'autonomous' && autonomousAction) action = autonomousAction;
    if (c.mode === 'manual' && requested && requested.type !== 'pass' && requested.type !== 'shot')
      return false;
    if (c.mode === 'autonomous' && !requested && !autonomousAction) {
      const ranked = rankAvailableActionsForAI(planning, p.id);
      if (!ranked.length) return false;
      // A drill supplies its objective, while ordinary ranking/execution still owns quality.
      // The target is a physical opening; match territorial utility alone does not describe it.
      const objective =
        c.drill === 'pass' || c.drill === 'rebound'
          ? ranked.filter((r) => r.action.type === 'pass' && r.action.receiverId === receiver.id)
          : ranked;
      action = (objective[0] ?? ranked[0])!.action;
      decisions.push({
        at: state.time,
        alternatives: ranked.map((r) => ({
          action: r.action,
          score: r.score,
          predicted:
            r.action.type === 'pass'
              ? {
                  targetErrorSigmaMetres: derivePassDifficulty(
                    planning,
                    p,
                    r.action.target,
                    r.action.intent,
                    r.action.delivery ?? 'ground',
                  ).uncertaintyMetres,
                }
              : r.action.type === 'shot'
                ? {
                    horizontalSigma: deriveShotExecutionErrorProfile(planning, r.action)
                      .horizontalSigma,
                    verticalSigma: deriveShotExecutionErrorProfile(planning, r.action)
                      .verticalSigma,
                  }
                : {},
          forecast:
            r.action.type === 'pass'
              ? 'Canonical pass completion includes a receiver; not geometric target accuracy'
              : 'Canonical utility; not a probability',
        })),
        chosen: action,
      });
      autonomousAction = action;
      if (action.type === 'hold' || action.type === 'carry') {
        const executed = resolveMatchAction(planning, action, 'dev_ai_selected');
        state = { ...executed, players: executed.players.filter((a) => a.id === p.id) };
        event('autonomous_execution', { action: action.type });
        return false;
      }
    }
    if (action.type === 'pass' && required) action = { ...action, foot: required };
    if (preparationAt === null) preparationAt = state.time;
    const seconds =
      action.type === 'shot'
        ? deriveShotExecutionProfile(planning, action).preparationSeconds
        : action.type === 'pass' && action.firstTime
          ? 0
          : Math.max(0, -preparationMarginForAction(planning, p, action));
    if (action.type === 'shot' ? state.time - preparationAt + 1e-8 < seconds : seconds > 1e-8)
      return false;
    let kickSigma: number | undefined;
    const shotForecast =
      action.type === 'shot' ? deriveShotExecutionErrorProfile(planning, action) : undefined;
    if (action.type === 'pass') {
      const d = derivePassDifficulty(
        planning,
        p,
        action.target,
        action.intent,
        action.delivery ?? 'ground',
        { firstTime: Boolean(action.firstTime), ...(action.foot ? { foot: action.foot } : {}) },
      );
      kickSigma = d.uncertaintyMetres;
      event('pass_difficulty', { sigmaMetres: d.uncertaintyMetres, ability: d.ability });
    }
    planning = resolveMatchAction(planning, action, 'dev_ai_selected');
    if (planning.decisionIndex === state.decisionIndex) return false;
    state = { ...planning, players: planning.players.filter((a) => a.id === p.id) };
    released++;
    if (c.mode === 'autonomous' && c.drill === 'rebound') autonomousAction = undefined;
    if (c.mode === 'manual') manualAction = undefined;
    releaseAt = state.time;
    const actualPreparation = state.time - preparationAt;
    preparationAt = null;
    launchSpeed = Math.hypot(
      state.ball.velocity?.x ?? 0,
      state.ball.velocity?.y ?? 0,
      state.ball.velocity?.z ?? 0,
    );
    event(
      'release',
      {
        release: released,
        speed: launchSpeed,
        technique:
          state.ball.executionType ?? (action.type === 'shot' ? action.intent : action.type),
        foot: action.type === 'pass' && action.foot ? `${action.foot}_foot` : actual.region,
        spinX: state.ball.spin?.x ?? 0,
        spinY: state.ball.spin?.y ?? 0,
        spinZ: state.ball.spin?.z ?? 0,
        initialKickErrorMetres:
          state.lastPassDiagnostic?.physicalTarget && state.lastPassDiagnostic.intendedTarget
            ? distance(
                state.lastPassDiagnostic.physicalTarget,
                state.lastPassDiagnostic.intendedTarget,
              )
            : null,
        preparationSeconds: actualPreparation,
      },
      state.time,
      undefined,
      toPhysical(state).position,
    );
    if (actual.region === 'left_foot') leftTouches++;
    else rightTouches++;
    touches++;
    const diagnostic = state.lastPassDiagnostic;
    if (
      action.type === 'pass' &&
      kickSigma !== undefined &&
      diagnostic?.physicalTarget &&
      diagnostic.intendedTarget
    ) {
      const dx = diagnostic.intendedTarget.x - p.position.x,
        dy = diagnostic.intendedTarget.y - p.position.y,
        length = Math.max(0.001, Math.hypot(dx, dy));
      const observed =
        ((diagnostic.physicalTarget.y - diagnostic.intendedTarget.y) * dx -
          (diagnostic.physicalTarget.x - diagnostic.intendedTarget.x) * dy) /
        length;
      predictions.push({
        source: 'derivePassDifficulty',
        definition: 'Signed lateral sampled kick aim error before flight',
        unit: 'm',
        predicted: 0,
        predictedSigma: kickSigma,
        observed,
        error: observed,
        comparable: true,
        context: `release ${released}; same kick geometry, excludes receiver and flight`,
      });
    }
    if (action.type === 'shot' && shotForecast && state.ball.shot) {
      const observed = state.ball.shot.error.horizontal * 3.66;
      predictions.push({
        source: 'deriveShotExecutionErrorProfile',
        definition: 'Signed lateral sampled shot aim error before flight',
        unit: 'm',
        predicted: 0,
        predictedSigma: shotForecast.horizontalSigma * 3.66,
        observed,
        error: observed,
        comparable: true,
        context: `release ${released}; half-width units converted to metres; excludes flight and frame`,
      });
    }
    const flight = toPhysical(state);
    let previous = flight.position;
    for (const forecast of projectFutureBallTrajectory(flight, 10, 0.025)) {
      const hit = intersectLabPlane(previous, forecast.ball.position, target);
      if (hit) {
        predictions.push({
          source: 'ballPhysics.projectFutureBallTrajectory',
          definition: 'Unobstructed ball target-plane radial error',
          unit: 'm',
          predicted: Math.hypot(hit.u, hit.v),
          observed: null,
          error: null,
          comparable: !c.objects.some((o) => o.kind === 'wall'),
          context: `release ${released}; identical initial physical ball`,
        });
        break;
      }
      previous = forecast.ball.position;
    }
    return true;
  };
  const p0 = state.players[0]!;
  if (c.drill === 'sprint')
    predictions.push({
      source: 'estimatePlayerArrivalTime',
      definition: 'Arrival-envelope ETA to point; plane crossing is a different termination',
      unit: 's',
      predicted: estimatePlayerArrivalTime(
        state,
        p0,
        { x: c.position.x + c.distance, y: c.position.y },
        'intercept',
      ).estimatedTime,
      observed: null,
      error: null,
      comparable: false,
      context: 'No numeric calibration across incompatible endpoint definitions',
    });
  sample(0);
  for (
    let tick = 0;
    tick < Math.ceil(c.maximumSeconds / FIXED_MATCH_DT) && finishSeconds === null && !failure;
    tick++
  ) {
    const dt = Math.min(FIXED_MATCH_DT, c.maximumSeconds - state.time);
    if (dt < FIXED_MATCH_DT - 1e-9) break;
    const before = state.players[0]!,
      previousPosition = { ...before.position },
      previousSpeed = Math.hypot(before.velocity.x, before.velocity.y);
    let physicalAt = state.time;
    for (const object of [...c.objects].sort(
      (a, b) =>
        (a.kind === 'launcher' ? a.releaseAt : 0) - (b.kind === 'launcher' ? b.releaseAt : 0),
    ))
      if (
        object.kind === 'launcher' &&
        !launched.has(object.id) &&
        object.releaseAt < state.time + dt - 1e-9
      ) {
        if (object.releaseAt > physicalAt) {
          const prefix = advanceLabBall(
            toPhysical(state),
            object.releaseAt - physicalAt,
            c.objects,
            physicalAt,
          );
          state = withPhysical(state, prefix.ball);
          contacts.push(...prefix.contacts);
          recordOpenings(prefix.segments);
        }
        physicalAt = object.releaseAt;
        const spread = () => object.dispersion * (rng.float() * 2 - 1);
        state = withPhysical(state, {
          position: { ...object.position },
          velocity: {
            x: object.velocity.x + spread(),
            y: object.velocity.y + spread(),
            z: object.velocity.z + spread(),
          },
          spin: { ...object.spin },
          airborne: object.position.z > BALL_RADIUS || object.velocity.z > 0,
          bounceCount: 0,
        });
        delete state.ball.ownerId;
        state.ball.travelKind = 'pass';
        state.ball.lastTouchPlayerId = 'lab-launcher';
        launched.add(object.id);
        event(
          'launcher_release',
          {
            vx: state.ball.velocity!.x,
            vy: state.ball.velocity!.y,
            vz: state.ball.velocity!.z ?? 0,
            spinX: object.spin.x,
            spinY: object.spin.y,
            spinZ: object.spin.z,
          },
          object.releaseAt,
          object.id,
          toPhysical(state).position,
        );
      }
    const commands = c.commands.filter(
      (command) => command.at >= state.time - 1e-9 && command.at < state.time + dt - 1e-9,
    );
    if (commands.length) {
      manualAction = commands.at(-1)!.action;
      if (c.mode === 'manual' && manualAction.type === 'hold') {
        state = resolveMatchAction(state, manualAction, 'human_selected');
        event('manual_hold');
        manualAction = undefined;
      }
    }
    const manual = manualAction;
    if (c.mode === 'manual' && manual?.type === 'carry' && !state.ballCarrierIntent)
      state = resolveMatchAction(state, manual, 'human_selected');
    let goal = { ...before.position },
      speed = 0,
      desiredFacing = before.facingAngle;
    const routeActive =
      c.drill === 'turn' ||
      c.drill === 'slalom' ||
      (c.drill === 'shot' && c.route.length > checkpoint) ||
      (c.drill === 'rebound' && received && released === 1);
    if (c.drill === 'sprint') {
      goal = { x: c.position.x + c.distance + 10, y: c.position.y };
      speed = sprintSpeedAt(
        deriveMovementCapability(before),
        state.time - (before.sprintStartedAt ?? state.time),
      );
    } else if (routeActive) {
      goal = c.route[checkpoint] ?? before.position;
      if (c.drill === 'turn' && checkpoint < c.route.length)
        goal = { ...goal, x: goal.x + (checkpoint % 2 === 0 ? 0.4 : -0.4) };
      speed = deriveMovementCapability(before).maximumSprintSpeed;
    } else if (
      (c.drill === 'receive' && state.ball.ownerId !== before.id) ||
      (c.drill === 'rebound' && returning && state.ball.ownerId !== before.id)
    ) {
      goal = { x: state.ball.x, y: state.ball.y };
      speed = deriveMovementCapability(before).runSpeed;
    }
    if (c.mode === 'manual') {
      const carry = manual?.type === 'carry' ? manual : state.ballCarrierIntent;
      if (carry) {
        goal = carry.target;
        speed = deriveMovementCapability(before).runSpeed;
      } else {
        goal = before.position;
        speed = 0;
      }
    }
    if (autonomousAction?.type === 'carry') {
      goal = autonomousAction.target;
      speed = deriveMovementCapability(before).runSpeed;
    }
    const carrying =
      (c.mode === 'manual' && manual?.type === 'carry') ||
      autonomousAction?.type === 'carry' ||
      c.drill === 'slalom' ||
      (c.drill === 'shot' && checkpoint < c.route.length) ||
      (c.drill === 'rebound' && received && released === 1 && checkpoint < c.route.length);
    if (carrying) {
      state.ballCarrierIntent = {
        actorId: before.id,
        type: 'carry',
        ...(c.contactSurface ? { contactSurface: c.contactSurface } : {}),
        target: goal,
        startedAt: 0,
        estimatedArrival: 0,
        startPosition: c.position,
        closestPointReached: before.position,
        humanSelected: false,
        movementMode: 'dribble',
        lastProgressAt: state.time,
        expiresAt: c.maximumSeconds + 1,
      };
      const execution = deriveCarryExecution(state, before, state.ballCarrierIntent);
      state.ballCarrierIntent = {
        ...state.ballCarrierIntent,
        executionMode: execution.mode,
        localTarget: execution.localTarget,
        touchDistance: execution.touchDistance,
        pursuingBall: execution.pursuingBall,
      };
      goal = execution.localTarget;
      speed = projectLocomotion(state, before, goal).targetSpeed;
      if (!state.ball.ownerId) {
        goal = deriveCarryPursuit(state, before)?.target ?? { x: state.ball.x, y: state.ball.y };
        speed = deriveMovementCapability(before).runSpeed;
      }
    }
    const requiredCarryFoot = carrying ? footFor(c, profile) : undefined;
    if (requiredCarryFoot && state.ball.ownerId === before.id) {
      const foot =
        playerContactGeometry(before)[requiredCarryFoot === 'left' ? 'leftFoot' : 'rightFoot'];
      if (distance(foot, state.ball) > 0.82) {
        const d = Math.max(0.01, distance(before.position, state.ball));
        goal = {
          x: state.ball.x - ((state.ball.x - before.position.x) / d) * 0.4,
          y: state.ball.y - ((state.ball.y - before.position.y) / d) * 0.4,
        };
        speed = deriveMovementCapability(before).jogSpeed;
      }
    }
    if (c.drill === 'slalom' || (c.drill === 'rebound' && received)) {
      // Objective adapter: brake before a tight corner and route the BODY around obstacles.
      // A reachable-foot pursuit must not send the body through a cone to reach its ball.
      const capability = deriveMovementCapability(before);
      for (const o of c.objects)
        if ((o.kind === 'cone' || o.kind === 'pole') && o.collision) {
          const clearance = distance(before.position, o.position) - o.radius - 0.34;
          speed = Math.min(
            speed,
            Math.sqrt(2 * capability.acceleration * Math.max(0.1, clearance)) * 0.62,
          );
          const safeRadius = o.radius + 0.34 + 0.28;
          if (
            distanceToSegment(o.position, before.position, goal) < safeRadius &&
            distance(before.position, goal) > 0.2
          ) {
            const dx = goal.x - before.position.x,
              dy = goal.y - before.position.y,
              d = Math.max(0.01, Math.hypot(dx, dy));
            const route = c.route[checkpoint] ?? goal;
            const side = (route.x - o.position.x) * -dy + (route.y - o.position.y) * dx;
            const sign =
              Math.abs(side) > 1e-8
                ? Math.sign(side)
                : Math.sign(before.position.y - o.position.y) || 1;
            goal = {
              x: o.position.x + (-dy / d) * safeRadius * sign + (dx / d) * safeRadius * 0.7,
              y: o.position.y + (dx / d) * safeRadius * sign + (dy / d) * safeRadius * 0.7,
            };
          }
        }
    }
    if (distance(before.position, goal) > 0.05)
      desiredFacing = angleForVector({
        x: goal.x - before.position.x,
        y: goal.y - before.position.y,
      });
    if (
      c.drill === 'turn' &&
      checkpoint > 0 &&
      Math.abs(normalizeAngle(desiredFacing - before.facingAngle)) > 3
    )
      desiredFacing =
        before.facingAngle + (c.turnDirection === 'left' ? 1 : -1) * (Math.PI - 0.001);
    const releaseStage =
      (c.drill === 'pass' && !released) ||
      (c.drill === 'shot' && !released && checkpoint === c.route.length) ||
      (c.drill === 'rebound' &&
        (released === 0 || (released === 1 && received && checkpoint === c.route.length)));
    if (releaseStage && target) {
      const required = footFor(c, profile);
      desiredFacing = required
        ? angleForVector({
            x: state.ball.x - before.position.x,
            y: state.ball.y - before.position.y,
          }) + (required === 'left' ? 0.65 : -0.65)
        : angleForVector({
            x: target.position.x - before.position.x,
            y: target.position.y - before.position.y,
          });
      if (state.ball.ownerId && distance(before.position, state.ball) > 0.65) {
        const d = distance(before.position, state.ball);
        goal = {
          x: state.ball.x - ((state.ball.x - before.position.x) / d) * 0.4,
          y: state.ball.y - ((state.ball.y - before.position.y) / d) * 0.4,
        };
        speed = 0.85;
      }
    }
    let moved = integrateCanonicalMovement(before, {
      target: goal,
      targetSpeed: speed,
      desiredFacingAngle: desiredFacing,
      dt,
      balance: 1,
      structural: false,
      receivingMomentum: false,
    });
    // Static training obstacles use a swept body capsule, not a route-completion score penalty.
    for (const o of c.objects)
      if ((o.kind === 'cone' || o.kind === 'pole') && o.collision) {
        const radius = o.radius + 0.34,
          dx = moved.position.x - previousPosition.x,
          dy = moved.position.y - previousPosition.y;
        const f = Math.max(
          0,
          Math.min(
            1,
            ((o.position.x - previousPosition.x) * dx + (o.position.y - previousPosition.y) * dy) /
              Math.max(1e-12, dx * dx + dy * dy),
          ),
        );
        const nearest = { x: previousPosition.x + dx * f, y: previousPosition.y + dy * f };
        if (distance(nearest, o.position) < radius) {
          moved = { ...moved, position: previousPosition, velocity: { x: 0, y: 0 } };
          collisions++;
          event('player_obstacle', { collision: collisions }, state.time, o.id);
        }
      }
    const actualSpeed = Math.hypot(moved.velocity.x, moved.velocity.y),
      travelled = distance(previousPosition, moved.position);
    const turnRadians =
      previousSpeed > 0.1 && actualSpeed > 0.1
        ? Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                (before.velocity.x * moved.velocity.x + before.velocity.y * moved.velocity.y) /
                  (previousSpeed * actualSpeed),
              ),
            ),
          )
        : 0;
    const episode = projectSprintEpisode(
      before,
      actualSpeed / moved.capability.maximumSprintSpeed,
      state.time,
      dt,
    );
    let athlete: MatchPlayerState = {
      ...before,
      plantBalance: moved.plantBalance,
      ...(moved.verticalJump ? { verticalJump: moved.verticalJump } : {}),
      position: moved.position,
      velocity: moved.velocity,
      target: goal,
      facingAngle: moved.facingAngle,
      turnRate: Math.abs(normalizeAngle(moved.facingAngle - before.facingAngle)) / dt,
      fitness: advanceMatchFitness(before, {
        dt,
        distance: travelled,
        speed: actualSpeed,
        previousSpeed,
        turnRadians,
        sprinting: episode.actualSprinting,
        sprintBurst: episode.countBurst,
      }),
      sprintBurstCounted: episode.sprintBurstCounted,
    };
    delete athlete.sprintStartedAt;
    delete athlete.sprintRecoveryStartedAt;
    if (episode.sprintStartedAt !== undefined) athlete.sprintStartedAt = episode.sprintStartedAt;
    if (episode.sprintRecoveryStartedAt !== undefined)
      athlete.sprintRecoveryStartedAt = episode.sprintRecoveryStartedAt;
    state = { ...state, players: [athlete] };
    distanceCovered += travelled;
    if (actualSpeed > peakSpeed) {
      peakSpeed = actualSpeed;
      timeToPeak = state.time + dt;
    }
    if (carrying && state.ball.ownerId === athlete.id) {
      const beforeControl = toPhysical(state);
      const advanced = advanceControlledBall(state, athlete, dt, footFor(c, profile));
      state = advanced.state;
      if (advanced.looseVelocity) {
        delete state.ball.ownerId;
        state.ball.looseSince = state.time;
        lost++;
        event('lost_control');
      }
      if (state.lastGroundContact?.executed && state.lastGroundContact.at > lastTouchAt) {
        lastTouchAt = state.lastGroundContact.at;
        touches++;
        const foot = state.lastGroundContact.region;
        if (foot === 'left_foot') leftTouches++;
        if (foot === 'right_foot') rightTouches++;
        event('touch', { foot, quality: state.lastGroundContact.quality ?? 0 });
        if (state.lastGroundContact.surfaceContact)
          footContacts.push(structuredClone(state.lastGroundContact.surfaceContact));
      }
      // Reintegrate the actual contact impulse from its actual starting point through apparatus.
      const contact = state.lastGroundContact;
      const initialVelocity =
        contact?.executed && contact.at === state.time
          ? { ...contact.outgoingVelocity, z: contact.surfaceContact?.outgoingVelocity.z ?? 0 }
          : beforeControl.velocity;
      const obstacle = advanceLabBall(
        {
          ...beforeControl,
          velocity: initialVelocity,
          spin: (contact?.executed && contact.at === state.time
            ? contact.surfaceContact?.outgoingSpin
            : beforeControl.spin) ?? { x: 0, y: 0, z: 0 },
          airborne: beforeControl.airborne,
        },
        dt,
        c.objects,
        state.time,
      );
      state = withPhysical(state, obstacle.ball);
      if (obstacle.contacts.length) {
        contacts.push(...obstacle.contacts);
        collisions += obstacle.contacts.length;
      }
      recordOpenings(obstacle.segments);
    } else {
      const physical = advanceLabBall(
        toPhysical(state),
        physicalAt === state.time ? dt : dt - (physicalAt - state.time),
        c.objects,
        physicalAt,
      );
      state = withPhysical(state, physical.ball);
      contacts.push(...physical.contacts);
      for (const contact of physical.contacts) {
        event(
          'ball_obstacle',
          {
            incomingSpeed: Math.hypot(contact.incoming.x, contact.incoming.y, contact.incoming.z),
            kind: contact.kind,
          },
          contact.at,
          contact.objectId,
          contact.point,
        );
        if (c.objects.find((o) => o.id === contact.objectId)?.kind === 'wall') returning = true;
        else collisions++;
      }
      recordOpenings(physical.segments);
    }
    state = { ...state, time: (tick + 1) * FIXED_MATCH_DT };
    athlete = state.players[0]!;
    for (const object of c.objects)
      if (object.kind === 'gate' && object.subject === 'player') {
        const hit = intersectLabPlane(
          { ...previousPosition, z: 0.9 },
          { ...athlete.position, z: 0.9 },
          object,
        );
        if (hit && measureLabOpening(object, hit).hit) {
          event(
            'player_gate',
            { direction: hit.direction },
            state.time - dt + hit.fraction * dt,
            object.id,
            hit.point,
          );
          if (c.drill === 'sprint' && object.id === 'finish')
            finish(state.time - dt + hit.fraction * dt);
        }
      }
    if (c.drill === 'sprint' && !c.objects.some((o) => o.kind === 'gate' && o.id === 'finish')) {
      const hit = intersectLabPlane(
        { ...previousPosition, z: 0 },
        { ...athlete.position, z: 0 },
        {
          position: { x: c.position.x + c.distance, y: c.position.y, z: 0 },
          normal: { x: 1, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 1 },
        },
      );
      if (hit) finish(state.time - dt + hit.fraction * dt);
    }
    if (routeActive && checkpoint < c.route.length) {
      const waypoint = c.route[checkpoint]!,
        playerArrived =
          c.drill === 'turn'
            ? checkpoint % 2 === 0
              ? athlete.position.x >= waypoint.x
              : athlete.position.x <= waypoint.x
            : distance(athlete.position, waypoint) <= c.checkpointRadius;
      const ballArrived = !carrying || distance(state.ball, waypoint) <= c.checkpointRadius;
      if (playerArrived && ballArrived) {
        const routeAt =
          c.drill === 'turn' && Math.abs(athlete.position.x - previousPosition.x) > 1e-9
            ? state.time -
              dt +
              dt *
                Math.max(
                  0,
                  Math.min(
                    1,
                    (waypoint.x - previousPosition.x) / (athlete.position.x - previousPosition.x),
                  ),
                )
            : state.time;
        event('checkpoint', { index: checkpoint }, routeAt);
        checkpoint++;
        if (checkpoint === (c.drill === 'turn' ? 1 : Math.ceil(c.route.length / 2))) {
          turnAt = routeAt;
          event('turn_start');
        }
        if (turnAt !== null && checkpoint > Math.ceil(c.route.length / 2) && turnEnd === null)
          turnEnd = state.time;
        if (checkpoint === c.route.length && (c.drill === 'turn' || c.drill === 'slalom'))
          finish(routeAt);
      }
    }
    const receptionDue =
      (c.drill === 'receive' && !received) || (c.drill === 'rebound' && returning && !received);
    if (receptionDue) {
      const assessment = assessFirstTouch(state, athlete, state.ball, athlete.position, 'cushion');
      if (assessment.feasible) {
        state.receptionPreparation = {
          ...(c.contactSurface ? { contactSurface: c.contactSurface } : {}),
          sourceActorId: 'lab-launcher',
          releasedAt: 0,
          ballEpisode: `${seed}:delivery`,
          readiness: projectReceiverReadiness(state, athlete, state.ball, state.time),
          actorId: athlete.id,
          movement: 'wait',
          expectedContactPoint: { x: state.ball.x, y: state.ball.y },
          expectedArrivalTime: state.time,
          awarenessAt: 0,
        };
        state = applyCanonicalBallControl(state, athlete.id);
        if (state.lastGroundContact?.surfaceContact?.at === state.time)
          footContacts.push(structuredClone(state.lastGroundContact.surfaceContact));
        received = true;
        event('reception', {
          quality: state.lastReceptionOutcome?.quality?.score ?? assessment.quality,
          kind: state.lastReceptionOutcome?.kind ?? 'control',
          incomingSpeed: assessment.relativeSpeed,
          spinSpeed: assessment.spinSpeed,
          surface: state.lastGroundContact?.surfaceContact?.executed ?? 'unavailable',
          surfaceQuality: state.lastGroundContact?.surfaceContact?.quality ?? null,
          initialRetained: Boolean(state.ball.ownerId),
        });
        touches++;
        if (assessment.region === 'left_foot') leftTouches++;
        else rightTouches++;
        if (state.ball.ownerId) {
          controlledAt = state.time;
          event('secured_control');
          if (c.drill === 'receive') finish(state.time);
        }
      }
    }
    if (!state.ball.ownerId && (carrying || received) && !state.ball.travelKind) {
      const claim = advanceBallAcquisition(state, athlete, 2.2);
      state = claim.state;
      if (claim.failedVelocity)
        state.ball = { ...state.ball, velocity: { ...claim.failedVelocity, z: 0 } };
      if (claim.securedPlayerId) {
        state = applyCanonicalBallControl(state, athlete.id);
        recoveries++;
        touches++;
        const recoveredFoot = assessFirstTouch(
          state,
          athlete,
          state.ball,
          athlete.position,
          'cushion',
        ).region;
        if (recoveredFoot === 'left_foot') leftTouches++;
        else rightTouches++;
        controlledAt = state.time;
        event('recovered_control');
        if (c.drill === 'receive') finish(state.time);
      }
    }
    const readyToRelease =
      (c.drill === 'pass' && !released) ||
      (c.drill === 'shot' && !released && checkpoint === c.route.length) ||
      (c.drill === 'rebound' &&
        (released === 0 || (released === 1 && received && checkpoint === c.route.length)));
    if (readyToRelease && (c.mode !== 'manual' || manual)) {
      if (!state.onBallPreparation && state.ball.ownerId)
        state.onBallPreparation = deriveOnBallPreparation(state, athlete);
      release(athlete, manual);
    }
    if (lastOwner && !state.ball.ownerId && carrying) event('separation');
    if (!lastOwner && state.ball.ownerId && carrying) event('reclaim');
    lastOwner = Boolean(state.ball.ownerId);
    const separation = distance(athlete.position, state.ball);
    if (carrying) peakSeparation = Math.max(peakSeparation, separation);
    if (carrying && separation > c.lostBallDistance) {
      failure = 'ball_out_of_recovery_range';
      status = 'failed';
    }
    if (
      released > 0 &&
      (c.drill === 'pass' || c.drill === 'shot') &&
      finishSeconds === null &&
      Math.hypot(
        state.ball.velocity?.x ?? 0,
        state.ball.velocity?.y ?? 0,
        state.ball.velocity?.z ?? 0,
      ) < 0.05
    ) {
      failure = 'ball_stopped_before_target';
      status = 'failed';
    }
    if (collisions > c.collisionBudget) {
      failure = 'obstacle_collision_budget';
      status = 'failed';
    }
    if (autonomousAction?.type === 'hold' && state.time - (decisions[0]?.at ?? 0) >= 1.6) {
      event('autonomous_hold_completed');
      failure = 'autonomous_objective_unfulfilled';
    }
    if (
      autonomousAction?.type === 'carry' &&
      distance(athlete.position, autonomousAction.target) < 0.65 &&
      distance(state.ball, autonomousAction.target) < 1.1
    ) {
      event('autonomous_carry_completed');
      failure = 'autonomous_objective_unfulfilled';
    }
    sample((actualSpeed - previousSpeed) / dt);
  }
  if (status === 'incomplete' && !failure) failure = 'physical_timeout';
  if (failure?.startsWith('autonomous')) status = 'incomplete';
  for (const prediction of predictions) {
    if (prediction.source === 'ballPhysics.projectFutureBallTrajectory' && contacts.length)
      prediction.comparable = false;
    if (prediction.source === 'ballPhysics.projectFutureBallTrajectory' && targetError !== null) {
      prediction.observed = targetError;
      prediction.error = prediction.comparable ? targetError - prediction.predicted : null;
    }
    if (prediction.unit === 's') prediction.observed = finishSeconds;
  }
  const firstTurn =
    turnAt === null
      ? []
      : samples.filter((s) => s.at >= Math.max(0, turnAt! - 1.5) && s.at <= turnAt! + 2);
  const minTurn = firstTurn.reduce<LabSample | undefined>(
    (best, s) => (!best || s.speed < best.speed ? s : best),
    undefined,
  );
  const beforeTurn = turnAt === null ? [] : samples.filter((s) => s.at <= turnAt!);
  const incoming = beforeTurn.reduce<LabSample | undefined>(
    (best, s) => (!best || s.speed >= best.speed ? s : best),
    undefined,
  );
  const reverse =
    turnAt === null
      ? undefined
      : samples.find(
          (s) =>
            s.at > turnAt! &&
            s.velocity.x < -0.1 &&
            Math.abs(normalizeAngle(s.facingAngle + Math.PI / 2)) < 0.3,
        );
  const regained =
    minTurn && incoming
      ? samples.find(
          (s) => s.at > minTurn.at && s.velocity.x < 0 && s.speed >= incoming.speed * 0.9,
        )
      : undefined;
  const brakingSamples =
    incoming && minTurn ? samples.filter((s) => s.at >= incoming.at && s.at <= minTurn.at) : [];
  const brakingDistance = brakingSamples.reduce(
    (sum, s, i) => sum + (i ? distance(brakingSamples[i - 1]!.player, s.player) : 0),
    0,
  );
  const timing505 = events.filter((e) => e.kind === 'player_gate' && e.objectId === '505-timing');
  const firstPass = events.find(
    (e) =>
      e.kind === 'ball_plane' &&
      e.objectId === target?.id &&
      e.values.release === 1 &&
      e.values.direction === 'positive',
  );
  const secondPass = events.find(
    (e) =>
      e.kind === 'ball_plane' &&
      e.objectId === target?.id &&
      e.values.release === 2 &&
      e.values.direction === 'positive',
  );
  const releaseEvent = events.filter((e) => e.kind === 'release').at(-1);
  const receptionEvent = events.find((e) => e.kind === 'reception');
  const result = {
    schema: 'mfl-football-skill-trial-v1' as const,
    stepSeconds: 0.025 as const,
    seed,
    inputHash,
    input,
    status,
    failure,
    elapsedSeconds: state.time,
    finishSeconds,
    ticks: samples.length - 1,
    metrics: {
      distanceMetres: distanceCovered,
      peakSpeedMetresPerSecond: peakSpeed,
      timeToPeakSeconds: timeToPeak,
      peakSeparationMetres: peakSeparation,
      touches,
      leftTouches,
      rightTouches,
      lostControlEvents: lost,
      recoveries,
      collisions,
      missedCheckpoints: c.route.length - checkpoint,
      touchFrequencyHertz: touches / Math.max(0.025, state.time),
      routeLengthMetres: c.route.reduce(
        (sum, p, i) => sum + distance(i ? c.route[i - 1]! : c.position, p),
        0,
      ),
      pathEfficiency: c.route.length
        ? c.route.reduce((sum, p, i) => sum + distance(i ? c.route[i - 1]! : c.position, p), 0) /
          Math.max(0.01, distanceCovered)
        : null,
      controlledMetresPerSecond:
        samples
          .slice(1)
          .reduce((sum, s, i) => sum + (s.owner ? distance(samples[i]!.player, s.player) : 0), 0) /
        Math.max(0.025, state.time),
      contactsPerMetre: touches / Math.max(0.01, distanceCovered),
      positiveKineticWorkJoules: samples
        .slice(1)
        .reduce(
          (sum, s, i) =>
            sum +
            0.5 *
              profile.weightKg *
              Math.max(0, s.speed * s.speed - samples[i]!.speed * samples[i]!.speed),
          0,
        ),
      firstReachableContactSeconds: events.find((e) => e.kind === 'reception')?.at ?? null,
      firstAttemptedContactSeconds: events.find((e) => e.kind === 'reception')?.at ?? null,
      firstContactQuality:
        receptionEvent && typeof receptionEvent.values.quality === 'number'
          ? receptionEvent.values.quality
          : null,
      laterRecoverySeconds: events.find((e) => e.kind === 'recovered_control')?.at ?? null,
      turnSeconds: turnAt !== null && turnEnd !== null ? turnEnd - turnAt : null,
      preparationSeconds:
        typeof releaseEvent?.values.preparationSeconds === 'number'
          ? releaseEvent.values.preparationSeconds
          : null,
      initialKickErrorMetres:
        typeof releaseEvent?.values.initialKickErrorMetres === 'number'
          ? releaseEvent.values.initialKickErrorMetres
          : null,
      incomingSpeedMetresPerSecond: incoming?.speed ?? null,
      brakingDistanceMetres: minTurn ? brakingDistance : null,
      minimumTurnSpeedMetresPerSecond: minTurn?.speed ?? null,
      bodyTurnDurationSeconds: reverse && turnAt !== null ? reverse.at - turnAt : null,
      reaccelerationSeconds: regained && minTurn ? regained.at - minTurn.at : null,
      timed505Seconds: timing505.length === 2 ? timing505[1]!.at - timing505[0]!.at : null,
      heavyTouches: state.contactControlTelemetry?.heavyTouches ?? 0,
      firstPassErrorMetres:
        typeof firstPass?.values.errorMetres === 'number' ? firstPass.values.errorMetres : null,
      secondPassErrorMetres:
        typeof secondPass?.values.errorMetres === 'number' ? secondPass.values.errorMetres : null,
      receptionQuality:
        typeof receptionEvent?.values.quality === 'number' ? receptionEvent.values.quality : null,
      timeToControlSeconds: controlledAt,
      releaseSeconds: releaseAt,
      launchSpeedMetresPerSecond: launchSpeed,
      targetErrorMetres: targetError,
      arrivalSeconds: arrivalAt,
      arrivalSpeedMetresPerSecond: arrivalSpeed,
      flightSeconds: arrivalAt !== null && releaseAt !== null ? arrivalAt - releaseAt : null,
    },
    units: {
      time: 's',
      position: 'm',
      speed: 'm/s',
      acceleration: 'm/s^2',
      spin: 'rad/s',
      fitness: 'fraction',
      touchFrequency: 'Hz',
    },
    events,
    contacts,
    footContacts,
    samples,
    decisions,
    predictions,
    fitnessBefore,
    fitnessAfter: state.players[0]!.fitness!,
    finalPlayer: state.players[0]!.position,
    finalBall: { ...toPhysical(state), spin: toPhysical(state).spin ?? { x: 0, y: 0, z: 0 } },
  };
  return footballSkillTrialResultSchema.parse(result);
};
