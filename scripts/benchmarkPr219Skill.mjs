import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { withHolisticDevelopment } from '../src/core/matchSimulation/holisticDevelopment.ts';
import {
  advanceLiveBallFlight,
  observedFlight,
} from '../src/core/matchSimulation/liveBallFlight.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';

const started = performance.now();
const cpu = process.cpuUsage();
const trials = [];
// Each edition and attribute level sees the same physical start for a given scenario/seed.
// Passing, strength, fitness, agility and optical conditions remain paired.
for (const seed of ['pr219-a', 'pr219-b', 'pr219-c'])
  for (const [scenario, vx, vy] of [
    ['stationary', 0, 0],
    ['approaching', -1.5, 0],
    ['receding', 1.5, 0],
    ['lateral', 0, 3],
    ['fast-approaching', -8, 0],
  ])
    for (const technique of [25, 45, 65, 80, 95])
      for (const observed of [false, true]) {
        const fixture = createKickFixture({ seed, technique });
        const actor = fixture.actor;
        actor.position = { x: fixture.state.ball.x - 0.42, y: fixture.state.ball.y + 0.12 };
        actor.target = actor.position;
        const base = withHolisticDevelopment(
          fixture.state,
          'state-value-v1',
          'holistic-stance-foot-dev-v2',
        );
        if (observed) base.experimentalObservedStrikePreparation = 'observed-low-pass-dev-v1';
        base.playerAgencyEnabled = false;
        base.ball = { ...base.ball, velocity: { x: vx, y: vy, z: 0 } };
        base.playerMovementIntent = {
          actorId: actor.id,
          type: 'hold_shape',
          target: actor.position,
          startedAt: base.time,
          expiresAt: base.time + 1,
        };
        const previous = advanceLiveBallFlight({
          ...base,
          time: base.time - 0.025,
          ball: { ...base.ball, x: base.ball.x - vx * 0.025, y: base.ball.y - vy * 0.025 },
        });
        previous.liveBallFlightRuntime.sensors[actor.id].nextAcquisitionAt = base.time;
        const input = advanceLiveBallFlight({
          ...base,
          liveBallFlightRuntime: previous.liveBallFlightRuntime,
        });
        const participant = input.players.find((player) => player.id === actor.id);
        let state = resolveMatchAction(input, fixture.action, 'human_selected');
        const pending = state.pendingStrike;
        for (let tick = 0; state.pendingStrike && tick < 8; tick++)
          state = stepTacticalMatch(state, 0.025);
        trials.push({
          seed,
          scenario,
          observed,
          technique,
          attributes: participant.profile.attributes,
          observation: observedFlight(input, participant),
          publishedBall: input.ball,
          stance: participant.articulatedStance,
          body: {
            position: participant.position,
            velocity: participant.velocity,
            facing: participant.facingAngle,
          },
          pending,
          resolution: state.lastStrikeResolution,
          outcome: state.lastStrikeResolution?.outcome ?? (pending ? 'pending' : 'declined'),
          safetyHalt: state.safetyHalt,
        });
      }
const summary = Object.fromEntries(
  Object.entries(
    Object.groupBy(
      trials,
      (trial) => `${trial.scenario}/${trial.observed ? 'observed' : 'baseline'}`,
    ),
  ).map(([key, rows]) => [
    key,
    Object.fromEntries(
      Object.entries(Object.groupBy(rows, (row) => row.outcome)).map(([outcome, cases]) => [
        outcome,
        cases.length,
      ]),
    ),
  ]),
);
const root = '.benchmark-artifacts/pr219';
mkdirSync(root, { recursive: true });
const wallSeconds = (performance.now() - started) / 1000;
writeFileSync(
  `${root}/skill.json`,
  JSON.stringify(
    {
      summary,
      trials,
      wallSeconds,
      cpu: process.cpuUsage(cpu),
      peakRSSKiB: process.resourceUsage().maxRSS,
    },
    null,
    2,
  ),
);
process.stdout.write(`${JSON.stringify({ summary, wallSeconds }, null, 2)}\n`);
