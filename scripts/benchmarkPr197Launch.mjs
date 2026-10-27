import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { interpretPassExecution } from '../src/core/matchSimulation/passExecution.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { physicalBall, traceRequest } from './pr197Trace.mjs';
import { sourceIdentity, argumentsMap, finish, hash } from './pr197Evidence.mjs';
const args = argumentsMap(),
  version = args.get('version') ?? 'v1',
  identity = sourceIdentity(),
  start = performance.now();
const rows = [],
  flight = [];
for (const metres of [7, 20, 42, 55])
  for (const delivery of ['ground', 'lofted'])
    for (const factor of [
      'passing',
      'technique',
      'gameReading',
      'composure',
      'orientation',
      'weak_foot',
      'fatigue',
      'pressure',
    ])
      for (const band of [20, 40, 60, 80, 100])
        for (let sample = 0; sample < 12; sample++) {
          const f = createCalibrationFixture({
            scenario: 'safe_pass',
            attacker: 80,
            defender: 60,
            seed: `pr197-launch-${sample}`,
          });
          const a = f.state.players.find((p) => p.id === f.actorId),
            r = f.state.players.find((p) => p.id === f.receiverId);
          r.position = { x: a.position.x + metres, y: 34 };
          r.target = { ...r.position };
          f.action.target = { ...r.position };
          f.action.delivery = delivery;
          if (['passing', 'technique', 'gameReading', 'composure'].includes(factor))
            a.profile.attributes[factor] = band;
          if (factor === 'orientation') a.facingAngle = Math.PI / 2 + (1 - band / 100) * Math.PI;
          if (factor === 'weak_foot') a.profile.weakFootProficiency = band;
          if (factor === 'fatigue') {
            a.fitness.longTermCapacity = band / 100;
            a.fitness.burstReadiness = band / 100;
          }
          if (factor === 'pressure') {
            const d = f.state.players.find((p) => p.id === f.defenderId);
            d.position = { x: a.position.x + 0.7 + band / 10, y: 34 };
          }
          const execution = interpretPassExecution(
            f.state,
            a,
            f.action.target,
            f.action.intent,
            delivery,
            {
              ...(factor === 'weak_foot'
                ? { foot: a.profile.dominantFoot === 'right' ? 'left' : 'right' }
                : {}),
            },
          );
          rows.push({
            metres,
            delivery,
            factor,
            band,
            sample,
            inputHash: hash(f.state),
            quality: execution.quality,
            type: execution.type,
            intended: execution.intendedTarget,
            physical: execution.physicalTarget,
            aimError: distance(execution.intendedTarget, execution.physicalTarget),
          });
          if (sample === 0 && factor === 'passing') {
            const plan = derivePassLaunchPlan(
                f.state,
                a,
                r,
                f.action.target,
                f.action.intent,
                delivery,
              ),
              released = resolveMatchAction(globalThis.structuredClone(f.state), f.action);
            const free = projectFutureBallTrajectory(physicalBall(released), 8, 0.025);
            const nearest = free.reduce((a, b) =>
              distance(a.ball.position, f.action.target) <
              distance(b.ball.position, f.action.target)
                ? a
                : b,
            );
            const trial = traceRequest(f);
            flight.push({
              metres,
              delivery,
              band,
              inputHash: hash(f.state),
              plan,
              actualLaunch: released.ball,
              freeFlightNearest: nearest,
              freeFlightTargetMiss: distance(nearest.ball.position, f.action.target),
              actualDiagnostic: released.lastPassDiagnostic,
              flight: trial.row.flight,
              outcome: trial.row.outcome,
              samplesHash: trial.row.hashes.samples,
            });
          }
        }
finish(
  `docs/performance/pr197/launch-${version}.json.gz`,
  {
    schema: 'pr197-launch-v1',
    source: identity,
    method:
      'One varied attribute/body constraint at a time, other passing attributes 80, defender 60. Twelve deterministic launch seeds; 40 canonical live/free-flight comparisons. No coefficient fitting.',
    rows,
    flight,
  },
  {
    milliseconds: performance.now() - start,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  },
  args.has('check'),
);
console.log('launch rows', rows.length, 'live flight traces', flight.length);
