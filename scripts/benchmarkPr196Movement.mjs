import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import {
  estimatePlayerArrivalTime,
  projectCanonicalArrival,
} from '../src/core/matchSimulation/playerArrival.ts';
import { estimateUsefulContact } from '../src/core/matchSimulation/opportunityWindows.ts';
import { integrateCanonicalMovement } from '../src/core/matchSimulation/canonicalMovement.ts';
import { projectLocomotion, projectSprintEpisode } from '../src/core/matchSimulation/locomotion.ts';
import {
  createMatchFitness,
  advanceMatchFitness,
} from '../src/core/matchSimulation/matchFitness.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { angleForVector, normalizeAngle } from '../src/core/matchSimulation/playerOrientation.ts';
import { hash, receipt, sourceForReplay } from './pr196Evidence.mjs';

const cases = {
  toward: [4, 0, Math.PI / 2],
  away: [-4, 0, -Math.PI / 2],
  across: [0, 4, 0],
  standing: [0, 0, Math.PI / 2],
  standing_away: [0, 0, -Math.PI / 2],
  accelerating: [1, 0, Math.PI / 2],
  braking: [8, 0, Math.PI / 2],
  turn90: [4, 0, 0],
  turn180: [4, 0, -Math.PI / 2],
  fatigue: [-3, 0, -Math.PI / 2],
  recovering: [0, 3, 0],
  tracking_other_runner: [0, -4, Math.PI],
};
const rows = [];
for (const skill of [20, 40, 60, 80, 100])
  for (const [name, [vx, vy, facing]] of Object.entries(cases))
    for (const metres of [4, 8, 15])
      for (const mirror of [false, true]) {
        const f = createCalibrationFixture({ scenario: 'moving_defender', defender: skill });
        let p = globalThis.structuredClone(f.state.players.find((p) => p.id === f.defenderId));
        p.velocity = { x: vx, y: mirror ? -vy : vy };
        p.facingAngle = mirror ? normalizeAngle(Math.PI - facing) : facing;
        p.fitness = createMatchFitness(name === 'fatigue' ? 55 : 100);
        if (name === 'fatigue') p.fitness.burstReadiness = 0.15;
        if (name === 'recovering') p.plantBalance = { balance: 0.4, load: 0.7, support: 'both' };
        const target = { x: p.position.x + metres, y: p.position.y };
        const state = {
          ...f.state,
          playerMovementIntent: {
            actorId: p.id,
            type: 'attack_space',
            target,
            startedAt: f.state.time,
            expiresAt: f.state.time + 10,
          },
        };
        const initial = globalThis.structuredClone(p),
          old = estimatePlayerArrivalTime(state, p, target, 'intercept'),
          corrected = projectCanonicalArrival(state, p, target, 'intercept'),
          bounded = estimateUsefulContact(
            { position: p.position, velocity: p.velocity, facing: p.facingAngle },
            target,
          );
        let actual = null,
          contactReady = null,
          turnSeconds = 0,
          minimumBalance = 1;
        for (let tick = 0; tick <= 400; tick++) {
          const at = tick * 0.025;
          if (distance(p.position, target) <= 0.8) actual ??= at;
          const feet = playerContactGeometry(p);
          if (
            Math.min(distance(feet.leftFoot, target), distance(feet.rightFoot, target)) <=
            feet.footReach
          )
            contactReady ??= at;
          if (actual !== null && contactReady !== null) break;
          if (tick === 400) break;
          const projected = projectLocomotion({ ...state, time: f.state.time + at }, p, target);
          const desiredFacingAngle = angleForVector({
            x: target.x - p.position.x,
            y: target.y - p.position.y,
          });
          const m = integrateCanonicalMovement(p, {
            target,
            targetSpeed: projected.targetSpeed,
            desiredFacingAngle,
            dt: 0.025,
            balance: 1,
            structural: false,
          });
          if (Math.abs(normalizeAngle(desiredFacingAngle - p.facingAngle)) > Math.PI / 6)
            turnSeconds += 0.025;
          minimumBalance = Math.min(minimumBalance, m.plantBalance.balance);
          const speed = Math.hypot(m.velocity.x, m.velocity.y),
            sprint = projectSprintEpisode(
              p,
              speed / m.capability.maximumSprintSpeed,
              f.state.time + at,
              0.025,
            );
          const turn =
            m.previousSpeed > 0.1 && speed > 0.1
              ? Math.acos(
                  Math.max(
                    -1,
                    Math.min(
                      1,
                      (p.velocity.x * m.velocity.x + p.velocity.y * m.velocity.y) /
                        (m.previousSpeed * speed),
                    ),
                  ),
                )
              : 0;
          p = {
            ...p,
            position: m.position,
            velocity: m.velocity,
            facingAngle: m.facingAngle,
            plantBalance: m.plantBalance,
            sprintStartedAt: sprint.sprintStartedAt,
            sprintRecoveryStartedAt: sprint.sprintRecoveryStartedAt,
            sprintBurstCounted: sprint.sprintBurstCounted,
            fitness: advanceMatchFitness(p, {
              dt: 0.025,
              distance: distance(p.position, m.position),
              speed,
              previousSpeed: m.previousSpeed,
              turnRadians: turn,
              sprinting: sprint.actualSprinting,
              sprintBurst: sprint.countBurst,
              pressing: projected.reason === 'press_commit',
            }),
          };
        }
        rows.push({
          skill,
          name,
          metres,
          mirror,
          partition: metres === 8 ? 'development' : 'held_out_development',
          initial,
          target,
          old: old.estimatedTime,
          corrected: corrected.estimatedTime,
          bounded,
          actual,
          contactReady,
          turnSeconds,
          minimumBalance,
          finalHash: hash(p),
        });
      }
const metrics = (xs, field) => {
  const errors = xs.filter((r) => r.actual !== null).map((r) => r[field] - r.actual),
    sorted = errors.map(Math.abs).sort((a, b) => a - b),
    n = errors.length;
  return {
    n,
    censored: xs.length - n,
    bias: errors.reduce((a, b) => a + b, 0) / n,
    mae: sorted.reduce((a, b) => a + b, 0) / n,
    medianAbsolute: sorted[Math.floor(n / 2)],
    p95Absolute: sorted[Math.floor(n * 0.95)],
    maxAbsolute: sorted.at(-1),
  };
};
const summary = Object.fromEntries(
  ['development', 'held_out_development'].map((p) => [
    p,
    Object.fromEntries(
      ['old', 'corrected'].map((model) => [
        model,
        metrics(
          rows.filter((r) => r.partition === p),
          model,
        ),
      ]),
    ),
  ]),
);
receipt(
  'docs/performance/pr196/movement-v5.json.gz',
  {
    schema: 'pr196-movement-v5',
    sourceArchive: sourceForReplay(
      'docs/performance/pr196/movement-v5.json.gz',
      process.argv.includes('--check'),
    ),
    information: 'privileged engineering forecast; bounded common prior reported separately',
    limitations: [
      'prescribed objective; not tactical anticipation',
      'foot access is sampled ground geometry, not contact',
      'corrected forecast freezes fitness; actual movement integrates fitness and sprint episodes',
      'recovery case tests support balance, not a completed challenge lifecycle',
    ],
    rows,
    summary,
  },
  process.argv.includes('--check'),
);
console.log(JSON.stringify({ trials: rows.length, summary }));
