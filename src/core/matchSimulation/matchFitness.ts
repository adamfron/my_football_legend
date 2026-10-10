import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

const unit = z.number().min(0).max(1);
const nonnegative = z.number().nonnegative().finite();
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Fixed-size evidence of completed physical work. Intent labels never spend energy. */
export const fitnessWorkloadSchema = z.object({
  seconds: nonnegative,
  distanceWalk: nonnegative,
  distanceJog: nonnegative,
  distanceRun: nonnegative,
  distanceSprint: nonnegative,
  sprintSeconds: nonnegative,
  sprintBursts: z.number().int().nonnegative(),
  accelerationImpulse: nonnegative,
  brakingImpulse: nonnegative,
  turningLoad: nonnegative,
  intensivePressSeconds: nonnegative,
  bodyContactLoad: nonnegative,
});
export type FitnessWorkload = z.infer<typeof fitnessWorkloadSchema>;
export const matchFitnessSchema = z
  .object({
    longTermCapacity: unit,
    burstReadiness: unit,
    exertionSpent: nonnegative,
    capacitySpent: nonnegative,
    burstSpent: nonnegative,
    capacityRecovered: nonnegative,
    burstRecovered: nonnegative,
    workload: fitnessWorkloadSchema,
    /** Integrated physical hazard, checked once per canonical second rather than each tick. */
    movementRiskExposure: nonnegative,
    assessedRiskExposure: nonnegative,
    lastInjuryContactId: z.string().optional(),
  })
  .refine((fitness) => fitness.burstReadiness <= fitness.longTermCapacity + 1e-9, {
    message: 'Burst readiness cannot exceed the current long-term capacity.',
    path: ['burstReadiness'],
  });
export type MatchFitness = z.infer<typeof matchFitnessSchema>;
export const createMatchFitness = (condition = 100): MatchFitness => ({
  longTermCapacity: clamp01(condition / 100),
  burstReadiness: clamp01(condition / 100),
  exertionSpent: 0,
  capacitySpent: 0,
  burstSpent: 0,
  capacityRecovered: 0,
  burstRecovered: 0,
  movementRiskExposure: 0,
  assessedRiskExposure: 0,
  workload: {
    seconds: 0,
    distanceWalk: 0,
    distanceJog: 0,
    distanceRun: 0,
    distanceSprint: 0,
    sprintSeconds: 0,
    sprintBursts: 0,
    accelerationImpulse: 0,
    brakingImpulse: 0,
    turningLoad: 0,
    intensivePressSeconds: 0,
    bodyContactLoad: 0,
  },
});

export const physicalWorkSampleSchema = z.object({
  dt: z.number().positive(),
  distance: nonnegative,
  speed: nonnegative,
  previousSpeed: nonnegative,
  /** Actual velocity-heading change. A stationary look/scan is not a demanding turn. */
  turnRadians: nonnegative,
  sprinting: z.boolean().optional(),
  sprintBurst: z.boolean().optional(),
  pressing: z.boolean().optional(),
  /** Actual compression/relative-momentum load, zero for unopposed shielding intent. */
  bodyContactLoad: unit.optional(),
});
export type PhysicalWorkSample = z.infer<typeof physicalWorkSampleSchema>;

/** Long reserve and immediate readiness have different rates and meanings. Stamina is the
 * existing conditioning attribute; there is no separate recovery/acceleration attribute to
 * invent. Pace determines the athlete's initial speed, never an energy-efficiency bonus. */
export const advanceMatchFitness = (
  player: MatchPlayerState,
  sample: PhysicalWorkSample,
): MatchFitness => {
  const previous = player.fitness ?? createMatchFitness();
  const { dt, speed, previousSpeed } = sample;
  const conditioning = player.profile.attributes.stamina / 100;
  const naturalSprintSpeed = 6.2 + (player.profile.attributes.pace / 100) * 3.3;
  const sprinting = sample.sprinting ?? speed >= naturalSprintSpeed * 0.82;
  const band = sprinting ? 'Sprint' : speed < 2.2 ? 'Walk' : speed < 4.2 ? 'Jog' : 'Run';
  const acceleration = Math.max(0, speed - previousSpeed);
  const braking = Math.max(0, previousSpeed - speed);
  const turning = sample.turnRadians * Math.min(speed, previousSpeed);
  const contact = (sample.bodyContactLoad ?? 0) * dt;
  const actualPress = Boolean(sample.pressing && speed >= 4.2 && sample.distance > 0);
  const movement =
    sample.distance * (sprinting ? 0.8 : speed >= 4.2 ? 0.4 : speed >= 2.2 ? 0.16 : 0.04);
  const impulse = acceleration * 0.7 + braking * 0.28 + turning * 0.18;
  const exertion = movement + impulse + contact * 2;
  const capacityCost = (exertion * 0.000045) / (0.55 + conditioning * 0.8);
  // Walking/standing can recover a little sustainable capacity. Jogging restores burst
  // readiness while retaining a small net long-term cost; two seconds never refill a player.
  const lowWork = clamp01(1 - speed / 4.2) * (1 - (sample.bodyContactLoad ?? 0));
  const capacityGain = Math.min(
    dt * 0.000012 * lowWork * (0.65 + conditioning * 0.65),
    Math.max(0, 1 - previous.longTermCapacity + capacityCost),
  );
  const capacity = clamp01(previous.longTermCapacity - capacityCost + capacityGain);
  const repeatedEffort =
    1 + (1 - previous.burstReadiness / Math.max(0.05, previous.longTermCapacity)) * 0.35;
  const burstCost =
    (sample.distance * (sprinting ? 0.0026 : speed >= 4.2 ? 0.00065 : 0.00008) +
      acceleration * 0.0026 +
      braking * 0.0011 +
      turning * 0.0007 +
      contact * 0.012) *
    repeatedEffort;
  const injuryRecovery = player.injury && player.injury.status !== 'discomfort' ? 0.65 : 1;
  const restoration =
    dt * 0.0105 * lowWork * (0.55 + conditioning * 0.65) * (0.3 + capacity * 0.7) * injuryRecovery;
  const readiness = Math.max(
    0,
    Math.min(capacity, previous.burstReadiness - burstCost + restoration),
  );
  const fatigue = 1 - readiness / Math.max(0.05, capacity);
  const sharpBrake = Math.max(0, braking / dt - 3) * braking;
  const sharpTurn = Math.max(0, sample.turnRadians / dt - 1.8) * turning;
  const demandingSpeed = Math.max(0, speed / naturalSprintSpeed - 0.72);
  // Hazard is integrated only after actual high-speed/awkward/contact work. No per-minute
  // injury roll and no hazard from low capacity by itself. Values are deliberately restrained.
  const riskExposure =
    (demandingSpeed * dt * 0.000003 +
      sharpBrake * 0.0000004 +
      sharpTurn * 0.0000005 +
      contact * 0.00001) *
    (1 + fatigue * 1.4 + (1 - capacity) * 0.8) *
    (player.injury ? 1.6 : 1);
  return {
    ...previous,
    longTermCapacity: capacity,
    burstReadiness: readiness,
    exertionSpent: previous.exertionSpent + exertion,
    capacitySpent: previous.capacitySpent + capacityCost,
    burstSpent: previous.burstSpent + burstCost,
    capacityRecovered: previous.capacityRecovered + capacityGain,
    burstRecovered:
      previous.burstRecovered +
      Math.max(0, Math.min(restoration, capacity - previous.burstReadiness + burstCost)),
    movementRiskExposure: previous.movementRiskExposure + riskExposure,
    workload: {
      ...previous.workload,
      seconds: previous.workload.seconds + dt,
      [`distance${band}`]: previous.workload[`distance${band}`] + sample.distance,
      sprintSeconds: previous.workload.sprintSeconds + (sprinting ? dt : 0),
      sprintBursts: previous.workload.sprintBursts + (sample.sprintBurst ? 1 : 0),
      accelerationImpulse: previous.workload.accelerationImpulse + acceleration,
      brakingImpulse: previous.workload.brakingImpulse + braking,
      turningLoad: previous.workload.turningLoad + turning,
      intensivePressSeconds: previous.workload.intensivePressSeconds + (actualPress ? dt : 0),
      bodyContactLoad: previous.workload.bodyContactLoad + contact,
    },
  };
};

export const fitnessPhysicalModifiersSchema = z.object({
  speed: z.number().positive().max(1),
  acceleration: z.number().positive().max(1),
  braking: z.number().positive().max(1),
  turning: z.number().positive().max(1),
  balanceRecovery: z.number().positive().max(1),
  shielding: z.number().positive().max(1),
  contactRecovery: z.number().min(1),
  bodyControlImpairment: unit,
});
export type FitnessPhysicalModifiers = z.infer<typeof fitnessPhysicalModifiersSchema>;
/** Readiness is relative to the available capacity: a conserving tired player can recover
 * enough for an isolated decisive burst. Permanent technical and mental attributes stay intact. */
export const deriveFitnessPhysicalModifiers = (
  player: MatchPlayerState,
): FitnessPhysicalModifiers => {
  const fitness = player.fitness;
  const capacityLoss = fitness ? 1 - fitness.longTermCapacity : 0;
  const readinessLoss = fitness
    ? 1 - fitness.burstReadiness / Math.max(0.05, fitness.longTermCapacity)
    : 0;
  const injury = player.injury?.status;
  const injuryScale =
    injury === 'discomfort' ? 0.96 : injury === 'playable' ? 0.84 : injury ? 0.05 : 1;
  const impairment = clamp01(capacityLoss * 0.18 + readinessLoss * 0.42 + (1 - injuryScale) * 0.6);
  return {
    speed: (1 - capacityLoss * 0.1 - readinessLoss * 0.14) * injuryScale,
    acceleration: (1 - capacityLoss * 0.18 - readinessLoss * 0.35) * injuryScale,
    braking: (1 - capacityLoss * 0.12 - readinessLoss * 0.24) * injuryScale,
    turning: (1 - capacityLoss * 0.12 - readinessLoss * 0.25) * injuryScale,
    balanceRecovery: (1 - capacityLoss * 0.15 - readinessLoss * 0.32) * injuryScale,
    shielding: (1 - capacityLoss * 0.12 - readinessLoss * 0.24) * injuryScale,
    contactRecovery: 1 + capacityLoss * 0.18 + readinessLoss * 0.45 + (1 - injuryScale) * 0.6,
    bodyControlImpairment: impairment,
  };
};

/** Only physically difficult execution receives extra uncertainty. A stationary settled pass
 * has zero demand, so fatigue cannot become a universal Passing/Finishing/Composure penalty. */
export const difficultActionPhysicalCost = (player: MatchPlayerState, physicalDemand: number) =>
  deriveFitnessPhysicalModifiers(player).bodyControlImpairment * clamp01(physicalDemand);

/** Add actual body-contact work without recounting movement time or low-intensity recovery. */
export const recordPhysicalContactFitness = (
  player: MatchPlayerState,
  load: number,
  seconds: number,
): MatchPlayerState => {
  if (load <= 0 || seconds <= 0) return player;
  const previous = player.fitness ?? createMatchFitness();
  const contact = clamp01(load) * seconds;
  const conditioning = player.profile.attributes.stamina / 100;
  const exertion = contact * 2;
  const capacityCost = (exertion * 0.000045) / (0.55 + conditioning * 0.8);
  const capacity = clamp01(previous.longTermCapacity - capacityCost);
  const fatigue = 1 - previous.burstReadiness / Math.max(0.05, previous.longTermCapacity);
  const burstCost = contact * 0.012 * (1 + fatigue * 0.35);
  return {
    ...player,
    fitness: {
      ...previous,
      longTermCapacity: capacity,
      burstReadiness: Math.max(0, Math.min(capacity, previous.burstReadiness - burstCost)),
      exertionSpent: previous.exertionSpent + exertion,
      capacitySpent: previous.capacitySpent + capacityCost,
      burstSpent: previous.burstSpent + burstCost,
      movementRiskExposure:
        previous.movementRiskExposure +
        contact * 0.00001 * (1 + fatigue * 1.4 + (1 - capacity) * 0.8),
      workload: {
        ...previous.workload,
        bodyContactLoad: previous.workload.bodyContactLoad + contact,
      },
    },
  };
};

/** Referee-held intervals still permit recovery and real repositioning. Bodies whose
 * ordinary/interval movement updater already recorded this tick are skipped. A held body
 * earns no invented sprint or braking impulse merely because its old velocity was retained. */
export const advanceMatchIntervalFitness = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
  dt: number,
): TacticalMatchState => {
  if (
    dt <= 0 ||
    next.status === 'half_time' ||
    next.status === 'full_time' ||
    next.status === 'abandoned'
  )
    return next;
  const previousPlayers = new Map(previous.players.map((player) => [player.id, player]));
  let changed = false;
  const players = next.players.map((player) => {
    const old = previousPlayers.get(player.id);
    if (
      !old ||
      (player.fitness?.workload.seconds ?? 0) > (old.fitness?.workload.seconds ?? 0) + 1e-9 ||
      player.injury?.status === 'unable' ||
      player.injury?.status === 'absence'
    )
      return player;
    const dx = player.position.x - old.position.x;
    const dy = player.position.y - old.position.y;
    const distance = Math.hypot(dx, dy);
    const speed = distance / dt;
    const previousSpeed = distance > 1e-8 ? Math.hypot(old.velocity.x, old.velocity.y) : 0;
    const turnRadians =
      speed > 0.1 && previousSpeed > 0.1
        ? Math.abs(
            Math.atan2(
              old.velocity.x * dy - old.velocity.y * dx,
              old.velocity.x * dx + old.velocity.y * dy,
            ),
          )
        : 0;
    const maximumSpeed =
      (6.2 + (player.profile.attributes.pace / 100) * 3.3) *
      deriveFitnessPhysicalModifiers(player).speed;
    changed = true;
    return {
      ...player,
      fitness: advanceMatchFitness(player, {
        dt,
        distance,
        speed,
        previousSpeed,
        turnRadians,
        sprinting: speed >= maximumSpeed * 0.82,
      }),
    };
  });
  return changed ? { ...next, players } : next;
};

/** Deterministic calendar recovery. Used by the career's existing dates, never wall-clock time. */
export const recoverConditionAfterDays = (
  condition: number,
  stamina: number,
  days: number,
  restricted = false,
) => {
  const rate = (0.65 + clamp01(stamina / 100) * 0.65) * (restricted ? 0.45 : 1);
  return Math.max(
    0,
    Math.min(
      100,
      100 - (100 - Math.max(0, Math.min(100, condition))) * Math.exp(-Math.max(0, days) * rate),
    ),
  );
};

/** The 15-minute interval is rest, not an extra 15 minutes of canonical match-clock play. */
export const recoverHalftimeFitness = (player: MatchPlayerState): MatchPlayerState => {
  const previous = player.fitness ?? createMatchFitness();
  const conditioning = player.profile.attributes.stamina / 100;
  const capacityGain = (1 - previous.longTermCapacity) * (0.035 + conditioning * 0.035);
  const capacity = Math.min(1, previous.longTermCapacity + capacityGain);
  const readiness = Math.min(
    capacity,
    previous.burstReadiness + (capacity - previous.burstReadiness) * (0.7 + conditioning * 0.2),
  );
  return {
    ...player,
    fitness: {
      ...previous,
      longTermCapacity: capacity,
      burstReadiness: readiness,
      capacityRecovered: previous.capacityRecovered + capacityGain,
      burstRecovered: previous.burstRecovered + readiness - previous.burstReadiness,
    },
  };
};
