import { RandomGenerator } from '../src/core/random/RandomGenerator.ts';
import { integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import {
  findFirstBallContact,
  resolveBallRebound,
} from '../src/core/matchSimulation/ballFlight.ts';
import {
  acquireFlightSighting,
  beliefFromKicker,
  predictFlightBelief,
  occludesFlight,
} from '../src/core/matchSimulation/ballFlightBelief.ts';
import { angleForVector, normalizeAngle } from '../src/core/matchSimulation/playerOrientation.ts';
import {
  resolveMatchAction,
  enumerateRestartActions,
} from '../src/core/matchSimulation/matchActions.ts';
import { applyRestartScenario } from '../src/core/matchSimulation/restartScenarios.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { familyFixture } from './pr198Fixtures.mjs';
import { hash, read } from './pr199Evidence.mjs';
export const physicalBall = (ball) => ({
  position: { x: ball.x, y: ball.y, z: ball.height ?? 0.11 },
  velocity: { x: ball.velocity?.x ?? 0, y: ball.velocity?.y ?? 0, z: ball.velocity?.z ?? 0 },
  airborne: ball.airborne ?? false,
  bounceCount: ball.bounceCount ?? 0,
  ...(ball.spin ? { spin: { ...ball.spin } } : {}),
});
export const cueFor = (state, id) => {
  const p = state.players.find((p) => p.id === id);
  return {
    at: state.time,
    position: { ...p.position },
    facing: p.facingAngle,
    approachVelocity: { ...p.velocity },
    preparing: state.onBallPreparation?.actorId === id,
  };
};
export const truthFlight = (initial, deflector) => {
  const rows = [{ at: 0, ball: physicalBall(initial) }];
  let ball = rows[0].ball,
    contact = null;
  for (let tick = 1; tick <= 200; tick++) {
    let next = integrateBallFlight(ball, 0.025);
    if (deflector && !contact) {
      const hit = findFirstBallContact({
        previous: ball.position,
        next: next.position,
        attackingTeam: 'home',
        candidates: [deflector],
      });
      if (hit?.playerId) {
        const impact = integrateBallFlight(ball, 0.025 * hit.segmentFraction);
        const response = resolveBallRebound('defender', impact.velocity, 'home', impact.spin, {
          surfaceNormal: hit.surfaceNormal,
        });
        next = integrateBallFlight(
          {
            ...impact,
            velocity: response.velocity,
            spin: response.spin,
            position: hit.point,
            airborne: response.airborne,
          },
          0.025 * (1 - hit.segmentFraction),
        );
        contact = {
          at: (tick - 1 + hit.segmentFraction) * 0.025,
          hit,
          incoming: impact.velocity,
          outgoing: response.velocity,
        };
      }
    }
    ball = next;
    rows.push({ at: tick * 0.025, ball });
  }
  return { rows, contact, hash: hash(rows) };
};
export const createFlightCatalogue = () => {
  const saved = read('docs/performance/pr198/releases-v1.json.gz').result.rows;
  return [0, 1].flatMap((sample) =>
    [
      'short_ground',
      'long_ground',
      'medium_loft',
      'long_loft',
      'cross_field',
      'moving_lead',
      'bouncing',
      'rotation',
      'inaccurate',
      'deflected',
    ].map((family) => {
      const baseFamily =
        {
          medium_loft: 'medium_ground',
          long_loft: 'long_lofted',
          bouncing: 'long_lofted',
          rotation: 'long_lofted',
          inaccurate: 'long_ground',
          deflected: 'medium_ground',
        }[family] ?? family;
      const e = saved.find(
        (e) =>
          e.family === baseFamily &&
          e.skill === (family === 'inaccurate' ? 20 : 60) &&
          e.sample === sample,
      );
      let state = e.state,
        cue = cueFor(familyFixture(baseFamily, e.skill, sample).state, e.contract.actorId);
      if (family === 'medium_loft') {
        const f = familyFixture('medium_ground', 60, sample);
        f.action.delivery = 'lofted';
        cue = cueFor(f.state, f.actorId);
        state = resolveMatchAction(globalThis.structuredClone(f.state), f.action, 'autonomous_npc');
        if (
          !state.lastPassDiagnostic ||
          state.lastPassDiagnostic.passId === f.state.lastPassDiagnostic?.passId
        )
          throw Error('Medium loft did not release');
      }
      if (family === 'rotation') {
        const f = createCalibrationFixture({
          scenario: 'good_shot',
          attacker: 60,
          defender: 60,
          mirror: sample === 1,
          seed: `pr199-rotation-${sample}`,
        });
        const prepared = applyRestartScenario(f.state, 'free_kick_close');
        const action = enumerateRestartActions(prepared).find(
          (a) => a.type === 'shot' && a.freeKickProfile === 'power_bend',
        );
        if (!action) throw Error('Rotating shot unavailable');
        cue = cueFor(prepared, action.actorId);
        state = resolveMatchAction(prepared, action, 'autonomous_npc');
        for (let tick = 0; tick < 320 && !state.ball.shot; tick++) state = step(state, 0.025);
        if (!state.ball.shot || Math.hypot(...Object.values(state.ball.spin ?? {})) < 20)
          throw Error('Rotating launch missing');
      }
      const ordinary = truthFlight(state.ball);
      const midpoint = ordinary.rows[24].ball.position;
      const deflector =
        family === 'deflected'
          ? {
              kind: 'defender',
              playerId: 'lab-fixed-deflector',
              centre: { x: midpoint.x, y: midpoint.y + 0.22, z: midpoint.z },
              radius: 0.28,
            }
          : undefined;
      const flight = deflector ? truthFlight(state.ball, deflector) : ordinary;
      if (deflector && !flight.contact) throw Error('Deflection not physically realised');
      const apexTick = flight.rows.reduce(
        (best, row, i) => (row.ball.position.z > flight.rows[best].ball.position.z ? i : best),
        0,
      );
      const receiver =
        family === 'rotation'
          ? state.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper')
          : state.players.find((p) => p.id === e.contract.receiverId);
      return {
        family,
        sample,
        seed: state.seed,
        state,
        receiver,
        cue,
        launchHash: hash(state.ball),
        physicalInitial: physicalBall(state.ball),
        flight,
        apex: apexTick * 0.025,
        deflector: deflector ?? null,
        method:
          family === 'bouncing'
            ? 'Real lofted release followed through canonical grass bounces'
            : family === 'deflected'
              ? 'Fixed finite defender sphere; canonical swept hit and rebound response'
              : 'Actual ordinary executor release; isolated canonical flight',
      };
    }),
  );
};
export const visibilityWindows = (condition, duration, apex = 0.8, end = 2.4) => {
  const d = duration;
  const tick = (t) => Math.round(t / 0.025) * 0.025;
  if (condition === 'FULL') return [[0, 5]];
  if (['NONE', 'CUE_ONLY'].includes(condition)) return [];
  if (condition === 'INITIAL_OCCLUSION') return [[0.4, 0.4 + d]];
  if (condition === 'EARLY') return [[0, d]];
  if (condition === 'APEX') {
    const start = tick(Math.max(0, apex - d / 2));
    return [[start, start + d]];
  }
  if (condition === 'LATE') return [[Math.max(0, end - d), end]];
  if (condition === 'INTERMITTENT') {
    const ticks = Math.round(d / 0.025),
      count = Math.min(4, ticks);
    return Array.from({ length: count }, (_, i) => [
      i * 0.3,
      i * 0.3 + (Math.floor(ticks / count) + Number(i < ticks % count)) * 0.025,
    ]);
  }
  throw Error('Unknown visibility condition');
};
export const offeredAt = (windows, relative) =>
  windows.some(([a, b]) => relative >= a - 1e-8 && relative < b - 1e-8);
export const createSensor = (actor, seed, cue) => {
  const distance = cue
    ? Math.hypot(cue.position.x - actor.position.x, cue.position.y - actor.position.y)
    : Infinity;
  const angle = cue
    ? Math.abs(
        normalizeAngle(
          angleForVector({
            x: cue.position.x - actor.position.x,
            y: cue.position.y - actor.position.y,
          }) - actor.facingAngle,
        ),
      )
    : Infinity;
  const cueAcquired = Boolean(cue && distance <= 36 && (distance < 7 || angle < 1.92));
  const belief = cueAcquired ? beliefFromKicker(cue) : undefined;
  return {
    belief,
    everTrajectoryEstimate: Boolean(belief?.velocity),
    cueOffered: Boolean(cue),
    cueAcquired,
    seed,
    id: actor.id,
    nextAt: -1,
    previousVisible: null,
    offered: 0,
    attended: 0,
    acquired: [],
    lastTickAt: null,
    firstSight: null,
  };
};
/** Research sensor adapter. Canonical truth is read only at an actually offered,
 * attended and unobstructed tick. Hidden ticks supply no position or derivative. */
export const sampleSensor = (
  sensor,
  actor,
  truth,
  at,
  offered,
  occluders = [],
  gaze = actor.facingAngle,
) => {
  const consecutive = sensor.lastTickAt !== null && Math.abs(at - sensor.lastTickAt - 0.025) < 1e-6;
  sensor.lastTickAt = at;
  if (offered) sensor.offered += 0.025;
  const d = Math.hypot(truth.position.x - actor.position.x, truth.position.y - actor.position.y);
  const angle = Math.abs(
    normalizeAngle(
      angleForVector({
        x: truth.position.x - actor.position.x,
        y: truth.position.y - actor.position.y,
      }) - gaze,
    ),
  );
  const visible =
    offered &&
    d <= 36 &&
    (d < 7 || angle < 1.92) &&
    !occluders.some((o) => occludesFlight({ ...actor.position, z: 1.65 }, truth.position, o));
  if (!visible) {
    sensor.previousVisible = null;
    return false;
  }
  sensor.attended += 0.025;
  const error = 0.02 + (1 - actor.profile.attributes.concentration / 100) * 0.08;
  const rng = RandomGenerator.fromSeed(
    `${sensor.seed}:pr199-sense:${sensor.id}:${Math.round(at * 40)}`,
  );
  const position = Object.fromEntries(
    ['x', 'y', 'z'].map((axis) => [axis, truth.position[axis] + (rng.float() - 0.5) * error]),
  );
  position.z = Math.max(0.11, position.z);
  const prior = sensor.previousVisible;
  sensor.previousVisible = { at, position };
  if (at < sensor.nextAt - 1e-8) return false;
  const sighting = {
    at,
    position,
    positionError: error,
    ...(consecutive && prior ? { motion: { from: prior.position, since: prior.at } } : {}),
  };
  sensor.belief = acquireFlightSighting(
    sensor.belief,
    sighting,
    actor.profile.attributes.gameReading,
  );
  sensor.everTrajectoryEstimate ||= Boolean(sensor.belief.velocity);
  sensor.nextAt =
    at +
    0.08 +
    (200 - actor.profile.attributes.gameReading - actor.profile.attributes.concentration) * 0.0007;
  sensor.firstSight ??= at;
  sensor.acquired.push({ sighting, belief: globalThis.structuredClone(sensor.belief) });
  return true;
};
export const beliefMotorObservation = (belief, at) => {
  // This adapter preserves actual evidence time. Legacy stale-observation gates remain
  // observable limitations; extrapolation is not relabelled as a new sighting.
  return {
    at: belief?.evidenceAt ?? at,
    nextAt: at + 0.1,
    ball: belief?.velocity
      ? {
          position: { ...belief.position },
          velocity: { ...belief.velocity },
          spin: { x: 0, y: 0, z: 0 },
          owner: null,
        }
      : null,
    others: [],
  };
};
export { predictFlightBelief };
