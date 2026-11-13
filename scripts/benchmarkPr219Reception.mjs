import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { withHolisticDevelopment } from '../src/core/matchSimulation/holisticDevelopment.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { projectReceiverReadiness } from '../src/core/matchSimulation/receiverReadiness.ts';

const start = performance.now();
const cpu = process.cpuUsage();
const trials = [];
for (const seed of ['pr219-a', 'pr219-b', 'pr219-c'])
  for (const [scenario, speed, direction, momentum, pressure] of [
    ['frontal', 4, 0, 0, false],
    ['side', 4, Math.PI / 2, 0, false],
    ['side-away', 4, -Math.PI / 2, 0, false],
    ['running', 4, 0, 2.5, false],
    ['pressure', 4, 0, 0, true],
    ['fast', 18, 0, 0, false],
  ])
    for (const firstTouch of [25, 60, 95]) {
      const fixture = createKickFixture({ seed });
      const receiver = fixture.receiver;
      const passer = fixture.actor;
      const incoming = { x: Math.cos(direction), y: Math.sin(direction) };
      receiver.position = { x: 41, y: 34 };
      receiver.target = receiver.position;
      receiver.velocity = { x: momentum, y: 0 };
      receiver.facingAngle = -Math.PI / 2;
      receiver.profile.attributes.firstTouch = firstTouch;
      if (pressure) {
        fixture.opponent.position = { x: 40.4, y: 34.55 };
        fixture.opponent.facingAngle = Math.PI;
        fixture.opponent.velocity = { x: 0, y: -3 };
      }
      const input = withHolisticDevelopment(
        fixture.state,
        'state-value-v1',
        'holistic-stance-foot-dev-v2',
      );
      const actor = input.players.find((player) => player.id === receiver.id);
      const boot = actor.articulatedStance.right;
      input.playerAgencyEnabled = false;
      input.actionCooldown = 1;
      input.ball = {
        x: boot.x - 0.45 * incoming.x,
        y: boot.y - 0.45 * incoming.y,
        height: 0.11,
        velocity: { x: speed * incoming.x, y: speed * incoming.y, z: 0 },
        travelKind: 'pass',
        lastTouchPlayerId: passer.id,
      };
      const point = { x: boot.x, y: boot.y };
      const readiness = projectReceiverReadiness(input, actor, point, 0.45 / speed);
      input.receptionPreparation = {
        actorId: receiver.id,
        sourceActorId: passer.id,
        releasedAt: input.time - 0.5,
        awarenessAt: input.time - 0.25,
        expectedContactPoint: point,
        expectedArrivalTime: input.time + 0.45 / speed,
        movement: momentum ? 'continue_run' : 'wait',
        ballEpisode: 'pr219',
        readiness,
      };
      let state = input;
      const contacts = [];
      let retainedAt;
      for (let tick = 0; tick < 24 && !state.safetyHalt; tick++) {
        const previous = state;
        state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
        if (state.lastGroundContact && state.lastGroundContact !== previous.lastGroundContact)
          contacts.push(state.lastGroundContact);
        if (state.ball.ownerId === actor.id) retainedAt ??= state.time;
      }
      trials.push({
        seed,
        scenario,
        firstTouch,
        attributes: actor.profile.attributes,
        publishedBall: input.ball,
        receiver: actor.id,
        stance: actor.articulatedStance,
        readiness,
        contacts,
        retainedAt,
        terminalOwner: state.ball.ownerId,
        terminalBall: state.ball,
        safetyHalt: state.safetyHalt,
      });
    }
const summary = Object.fromEntries(
  Object.entries(Object.groupBy(trials, (trial) => trial.scenario)).map(([scenario, rows]) => [
    scenario,
    {
      opportunities: rows.length,
      receiverContacts: rows.filter((row) =>
        row.contacts.some((contact) => contact.actorId === row.receiver),
      ).length,
      receiverControl: rows.filter((row) => row.retainedAt !== undefined).length,
      receiverControlAt600ms: rows.filter((row) => row.terminalOwner === row.receiver).length,
      unresolved: rows.filter((row) => row.safetyHalt).length,
    },
  ]),
);
const receipt = {
  summary,
  trials,
  wallSeconds: (performance.now() - start) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
};
mkdirSync('.benchmark-artifacts/pr219', { recursive: true });
writeFileSync('.benchmark-artifacts/pr219/reception.json.gz', gzipSync(JSON.stringify(receipt)));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
