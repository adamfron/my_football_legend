import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import { BALL_RADIUS } from '../src/core/matchSimulation/ballFlight.ts';
import { composedLegGap } from '../src/core/matchSimulation/composedLegContact.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { MULTI_BODY } from '../src/core/matchSimulation/multiBodyContact.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { TEMPORAL_STRIKE } from '../src/core/matchSimulation/temporalFootTrajectory.ts';

const dt = 0.025;
const previous = JSON.parse(
  readFileSync('docs/performance/pr227-grounded-recovery-match-windows.json'),
).cases.find((c) => c.fixture === 'independent');
const source = previous.haltSnapshot;
const bytes = readFileSync(source.path);
assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
const input = tacticalMatchStateSchema.parse(JSON.parse(gunzipSync(bytes)));
const { state, events } = captureReceptionStep(() => stepTacticalMatch(input, dt), {
  mechanics: true,
  contactWork: true,
});
const find = (suffix) => events.filter(({ source }) => source.endsWith(suffix));
const pressured = find('composedLimbWork').filter(({ detail }) => detail.plantedShinPressure);
assert.ok(pressured.length > 0);
const actorId = pressured[0].actorId;
const swing = find('rebasePlayer').filter(
  (event) => event.actorId === actorId && event.detail.swingYield,
);
const player = (frame) => frame.players.find((p) => p.id === actorId);
const clearances = (frame) => {
  const { geometry } = projectArticulatedBody(frame, player(frame));
  const ball = { ...frame.ball, z: frame.ball.height };
  return Object.fromEntries(
    ['left', 'right'].map((foot) => {
      const boot = geometry[foot].foot;
      return [
        foot,
        {
          shin: composedLegGap(geometry, `${foot}_shin`, ball),
          boot:
            Math.hypot(ball.x - boot.x, ball.y - boot.y, ball.z - boot.z) -
            BALL_RADIUS -
            TEMPORAL_STRIKE.footRadius,
        },
      ];
    }),
  );
};
const gaps = clearances(state);
assert.ok(Object.values(gaps).every((foot) => foot.shin > 0 && foot.boot > 0));
assert.equal(state.time, input.time + dt);
assert.equal(state.safetyHalt, undefined);
assert.deepEqual(player(state).articulatedStance.right, player(input).articulatedStance.right);
assert.equal(player(state).articulatedStance.support, 'right');
const next = stepTacticalMatch(state, dt);
let end = next;
for (let tick = 2; tick < 26; tick++) end = stepTacticalMatch(end, dt);
assert.equal(end.safetyHalt, undefined);
const timeline = find('intervalRace').map(({ detail: d }) => ({
  elapsed: d.elapsed,
  ...(d.event ? { kind: d.event.kind, key: d.event.key, after: d.event.at } : { clear: true }),
}));
assert.equal(timeline.at(-1).clear, true);
assert.ok(timeline.length - 1 <= MULTI_BODY.events);
const cases = {
  source,
  previousHalt: previous.safetyHalt,
  actorId,
  sharedEvents: timeline.length - 1,
  sharedEventLimit: MULTI_BODY.events,
  peakGeometrySamples: Math.max(
    ...find('composedLegSearch').map(({ detail }) => detail.geometrySamples),
  ),
  timeline,
  pressure: pressured.map(({ at, detail: d }) => {
    const recoil = swing.find((event) => event.at === at)?.detail.swingYield;
    if (recoil) assert.ok(recoil.energy <= -d.account.contactFrameWork / 4 + 1e-12);
    return {
      atInTick: d.atInTick,
      from: d.account.surfaces[0].leg.foot,
      support: d.plantedShinPressure.support,
      pressure: d.pressure,
      restitution: d.parameters.restitution,
      normalImpulse: d.account.surfaces[0].normalImpulse,
      outgoingNormal: d.account.surfaces[0].outgoingNormal,
      contactFrameWork: d.account.contactFrameWork,
      residual: d.account.residual,
      recoil,
    };
  }),
  atTickEnd: { time: state.time, gaps, ball: state.ball },
  atNextTickEnd: { time: next.time, gaps: clearances(next) },
  after650ms: { time: end.time, ball: end.ball, halt: end.safetyHalt ?? null },
};
const archive = 'docs/performance/pr227-independent-contact.json';
const serialized = JSON.stringify(cases, null, 2) + '\n';
if (process.argv.includes('--record')) writeFileSync(archive, serialized);
else if (process.argv.includes('--check'))
  assert.deepEqual(JSON.parse(serialized), JSON.parse(readFileSync(archive)));
else process.stdout.write(serialized);
