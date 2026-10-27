import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { argumentsMap, finish, sourceIdentity, hash } from './pr197Evidence.mjs';
import { traceRequest, traceReleased } from './pr197Trace.mjs';
const args = argumentsMap(),
  version = args.get('version') ?? 'baseline-v1';
const identity = sourceIdentity();
const original = [],
  sameRelease = [],
  costs = [];
for (const [attacker, defender] of [
  [20, 20],
  [40, 40],
  [60, 60],
  [80, 80],
  [100, 100],
  [40, 80],
  [80, 40],
])
  for (const seed of ['pr195-development-0', 'pr195-development-1'])
    for (const mirror of [false, true]) {
      const fixture = createCalibrationFixture({
        scenario: 'long_pass',
        attacker,
        defender,
        seed,
        mirror,
      });
      if (args.has('defence')) fixture.state.experimentalDefensiveReception = true;
      if (args.has('height')) fixture.state.experimentalHeightAwarePassing = true;
      if (args.has('receiver')) fixture.state.experimentalReceiverAnticipation = true;
      const trial = traceRequest(fixture);
      original.push({ config: fixture.config, ...trial.row });
      costs.push(trial.milliseconds);
      if (attacker === 60 && defender === 60 && seed === 'pr195-development-0' && !mirror) {
        for (const factor of [
          'unchanged',
          'physical_defence',
          'bounded_receiver',
          'awareness_late',
          'first_touch_20',
          'first_touch_100',
          'facing_away',
          'moving_toward',
          'receiver_near_flight',
          'remote_one_defender',
          'remote_opposition',
        ]) {
          const s = globalThis.structuredClone(trial.released),
            r = s.players.find((p) => p.id === fixture.receiverId);
          if (factor === 'physical_defence') s.experimentalDefensiveReception = true;
          if (factor === 'bounded_receiver') s.experimentalReceiverAnticipation = true;
          if (factor === 'awareness_late') s.receptionPreparation.awarenessAt += 1;
          if (factor.startsWith('first_touch_'))
            r.profile.attributes.firstTouch = Number(factor.split('_').at(-1));
          if (factor === 'facing_away') r.facingAngle += Math.PI;
          if (factor === 'moving_toward') r.velocity = { x: -4, y: 0 };
          if (factor === 'receiver_near_flight') {
            r.position = {
              x: trial.row.freeFlightNearest.ball.position.x,
              y: trial.row.freeFlightNearest.ball.position.y,
            };
            r.target = { ...r.position };
          }
          if (factor === 'remote_one_defender' || factor === 'remote_opposition')
            for (const [i, p] of s.players
              .filter(
                (p) =>
                  p.team !== 'home' &&
                  (factor === 'remote_opposition' || p.id === fixture.defenderId),
              )
              .entries()) {
              p.position = { x: 100, y: 3 + i * 5.5 };
              p.target = { ...p.position };
              p.anchor = { ...p.position };
              p.neutralAnchor = { ...p.position };
            }
          if (hash(s.ball) !== trial.row.hashes.ball) throw Error('Same release changed launch');
          const { samples, ...trace } = traceReleased(s, trial.contract);
          void samples;
          sameRelease.push({ factor, launchHash: hash(s.ball), ...trace });
        }
      }
      console.log('original', original.length, attacker, defender, seed, mirror);
    }
finish(
  `docs/performance/pr197/long-pass-${version}.json.gz`,
  {
    schema: 'pr197-long-pass-v1',
    source: identity,
    method:
      'Exact original 28 inputs; all eleven opponents at 0.25s plus event frames; physical witnesses distinct from last-touch fallback; same-release branches change one post-release factor.',
    original,
    sameRelease,
  },
  {
    milliseconds: costs,
    totalMilliseconds: costs.reduce((a, b) => a + b, 0),
    memory: process.memoryUsage(),
  },
  args.has('check'),
);
