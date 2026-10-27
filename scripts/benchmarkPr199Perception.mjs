import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import {
  createFlightCatalogue,
  visibilityWindows,
  offeredAt,
  createSensor,
  sampleSensor,
  predictFlightBelief,
  beliefMotorObservation,
} from './pr199FlightLab.mjs';
import { planBallOrientedMovement } from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { flightBeliefSchema } from '../src/core/matchSimulation/ballFlightBelief.ts';
import { finish, identity, hash, options } from './pr199Evidence.mjs';
const start = performance.now(),
  cpu = process.cpuUsage(),
  source = identity();
const flights = createFlightCatalogue(),
  rows = [];
const levels = [20, 40, 60, 80, 100];
const configurations = [
  ...['FULL', 'NONE', 'CUE_ONLY'].flatMap((condition) =>
    [false, true].map((cues) => ({ condition, duration: 0.2, cues, attribute: null, level: 60 })),
  ),
  ...['EARLY', 'APEX', 'LATE', 'INTERMITTENT', 'INITIAL_OCCLUSION'].flatMap((condition) =>
    [0.05, 0.1, 0.2, 0.4, 0.8].flatMap((duration) =>
      [false, true].map((cues) => ({ condition, duration, cues, attribute: null, level: 60 })),
    ),
  ),
  ...['gameReading', 'concentration'].flatMap((attribute) =>
    levels.flatMap((level) =>
      ['EARLY', 'LATE', 'INTERMITTENT'].map((condition) => ({
        condition,
        duration: 0.2,
        cues: false,
        attribute,
        level,
      })),
    ),
  ),
];
for (const f of flights)
  for (const config of configurations) {
    const actor = globalThis.structuredClone(f.receiver);
    // Other ratings and the complete physical launch remain fixed in one-factor sweeps.
    if (config.attribute) actor.profile.attributes[config.attribute] = config.level;
    const windows = visibilityWindows(
      config.condition,
      config.duration,
      f.apex > 0.1 ? f.apex : 0.8,
    );
    const initialAt = f.state.time,
      cue = { ...f.cue, at: initialAt };
    const sensor = createSensor(actor, f.seed, config.cues ? cue : undefined);
    const errors = [],
      meetings = [];
    for (let tick = 0; tick < 160; tick++) {
      const truth = f.flight.rows[tick].ball,
        relative = tick * 0.025,
        at = initialAt + relative;
      sampleSensor(sensor, actor, truth, at, offeredAt(windows, relative));
      if (tick % 4 !== 0) continue;
      const estimate = predictFlightBelief(sensor.belief, at);
      const motion = estimate?.hasVelocityEstimate ? estimate : undefined;
      for (const ahead of [0, 0.2, 0.5, 1]) {
        const index = tick + Math.round(ahead / 0.025),
          actual = f.flight.rows[index]?.ball;
        const predicted = motion && predictFlightBelief(sensor.belief, at + ahead);
        if (!actual) continue;
        const speed = predicted ? Math.hypot(...Object.values(predicted.velocity)) : null;
        const actualSpeed = Math.hypot(...Object.values(actual.velocity));
        const dot = predicted
          ? Object.keys(actual.velocity).reduce(
              (sum, axis) => sum + actual.velocity[axis] * predicted.velocity[axis],
              0,
            )
          : null;
        errors.push({
          at: relative,
          ahead,
          age: estimate?.observationAge ?? null,
          motionAge: estimate?.velocityObservationAge ?? null,
          velocitySource: sensor.belief?.velocitySource ?? 'unknown',
          exposure: sensor.offered,
          observations: sensor.belief?.observations ?? 0,
          uncertainty: predicted?.uncertainty ?? null,
          confidence: predicted?.confidence ?? null,
          horizontal: predicted
            ? Math.hypot(
                predicted.position.x - actual.position.x,
                predicted.position.y - actual.position.y,
              )
            : null,
          height: predicted ? Math.abs(predicted.position.z - actual.position.z) : null,
          speedError: speed === null ? null : speed - actualSpeed,
          directionError:
            predicted && speed * actualSpeed > 1e-8
              ? Math.acos(Math.max(-1, Math.min(1, dot / (speed * actualSpeed))))
              : null,
          initialSpeed: Math.hypot(...Object.values(f.physicalInitial.velocity)),
          actual: actual.position,
          predicted: predicted?.position ?? null,
        });
      }
      const legacy = planBallOrientedMovement(
        actor,
        beliefMotorObservation(sensor.belief, at),
        at,
        actor.target,
        'receive',
      );
      const seconds = legacy.contactSeconds,
        actual = seconds === null ? null : f.flight.rows[tick + Math.round(seconds / 0.025)]?.ball;
      // Timing has an explicit physical event: first low-ball crossing of the observer's x
      // plane. A forecast without such a crossing has null timing error, never zero error.
      const plane = f.flight.rows.find(
        (r, i) =>
          i > 0 &&
          r.ball.position.z <= 0.65 &&
          (f.flight.rows[i - 1].ball.position.x - actor.position.x) *
            (r.ball.position.x - actor.position.x) <=
            0,
      );
      meetings.push({
        at: relative,
        observedAt: sensor.belief?.lastObservation?.at ?? null,
        point: legacy.nextContact,
        predictedAt: seconds === null ? null : relative + seconds,
        actualAtPredictedTime: actual?.position ?? null,
        horizontal:
          legacy.nextContact && actual
            ? Math.hypot(
                legacy.nextContact.x - actual.position.x,
                legacy.nextContact.y - actual.position.y,
              )
            : null,
        height: actual && legacy.nextContact ? actual.position.z : null,
        planeAt: plane?.at ?? null,
        timingError: plane && seconds !== null ? relative + seconds - plane.at : null,
        reason: legacy.reason,
      });
    }
    if (sensor.belief) flightBeliefSchema.parse(sensor.belief);
    if (config.condition === 'NONE' && !config.cues && sensor.belief)
      throw Error('No-information control acquired belief');
    const offered = windows.reduce(
      (sum, [a, b]) => sum + Math.max(0, Math.min(4, b) - Math.max(0, a)),
      0,
    );
    if (Math.abs(sensor.offered - offered) > 1e-6)
      throw Error('Offered exposure quantisation mismatch');
    rows.push({
      family: f.family,
      sample: f.sample,
      config,
      cueOffered: sensor.cueOffered,
      cueAcquired: sensor.cueAcquired,
      trajectoryAvailable: Boolean(sensor.belief?.velocity),
      everTrajectoryEstimate: sensor.everTrajectoryEstimate,
      windows,
      launchHash: f.launchHash,
      truthHash: f.flight.hash,
      actorHash: hash(actor),
      offeredSeconds: sensor.offered,
      attendedSeconds: sensor.attended,
      acquiredExposure: sensor.belief?.acquiredExposure ?? 0,
      observations: sensor.belief?.observations ?? 0,
      firstSight: sensor.firstSight === null ? null : sensor.firstSight - initialAt,
      firstUseful:
        sensor.belief?.firstUsefulAt === null || !sensor.belief
          ? null
          : sensor.belief.firstUsefulAt - initialAt,
      finalBelief: sensor.belief ?? null,
      acquisitions: sensor.acquired,
      errors,
      meetings,
      deflection: f.flight.contact,
      actualContact: null,
      actualControl: null,
      retainedOneSecond: null,
      executionScope:
        'Prediction-only fixed-body/isolated-flight experiment; physical outcomes measured in separate receiver/keeper cohorts',
    });
    if (rows.length % 172 === 0) console.log('PR199 perception', rows.length);
  }
finish(
  `perception-${options.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr199-perception-v1',
    source,
    method:
      '20 actual launched flights, 25ms canonical physics, fixed observer body, normal range/FOV and attribute-dependent acquisition cadence. Window timing changes only information; optical intervals use visible positions, unknown spin, no post-hoc trajectory repair. Ground APEX uses an explicitly nominal 0.8s anchor.',
    flights: flights.map(({ state, receiver, flight, ...f }) => ({
      ...f,
      stateHash: hash(state),
      receiverHash: hash(receiver),
      observer: {
        id: receiver.id,
        position: receiver.position,
        velocity: receiver.velocity,
        facing: receiver.facingAngle,
        attributes: receiver.profile.attributes,
      },
      truthHash: flight.hash,
      bounces: flight.rows.at(-1).ball.bounceCount,
      deflection: flight.contact,
    })),
    rows,
    summary: {
      trials: rows.length,
      eligibleAttempts: rows.length,
      noUsefulEstimate: rows.filter((r) => r.firstUseful === null).length,
      unknownPhysicalOutcomes: rows.length,
    },
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log('PR199 perception done', rows.length);
