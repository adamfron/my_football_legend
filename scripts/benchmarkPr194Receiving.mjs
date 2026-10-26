import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { createPerceptionFixture } from '../src/core/matchSimulation/perceptionLaboratory.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { distance, distanceToSegment } from '../src/core/matchSimulation/matchSpace.ts';
import { sampleTransition } from '../src/core/matchSimulation/transitionDiagnostics.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { hash, manifest, writeReceipt, retainPr194Source } from './pr194Evidence.mjs';
const cases = [
  'away_from_mark',
  'behind_press',
  'support_behind',
  'between_lines',
  'half_turn',
  'width',
  'half_space',
  'draw_defender',
  'third_man',
  'rest_defence',
];
const check = process.argv.includes('--check'),
  path = 'docs/performance/pr194/receiving-v4.json',
  source = manifest(),
  rows = [];
for (const name of cases)
  for (const mirror of [false, true])
    for (const enabled of [false, true]) {
      const f = createPerceptionFixture({
        id: name,
        seed: 'pr194-receiving-paired',
        condition: 'no_scan',
        mirror,
        positions: enabled,
        tempo: false,
      });
      let s = f.state;
      const primary = s.players.find((p) => p.id === f.receiverId),
        carrier = s.players.find((p) => p.id === f.sourceId);
      const actor =
        name === 'rest_defence'
          ? s.players.find((p) => p.team === 'home' && p.slot.position === 'center_back')
          : name === 'width' || name === 'third_man'
            ? s.players.find((p) => p.team === 'home' && p.slot.position === 'left_winger')
            : primary;
      const foe = s.players.find((p) => p.team === 'away' && p.slot.position === 'center_back');
      const place = (p, x, y) => {
        p.position = { x, y: mirror ? 68 - y : y };
        p.target = { ...p.position };
        p.anchor = { ...p.position };
        p.neutralAnchor = { ...p.position };
        p.velocity = { x: 0, y: 0 };
      };
      place(
        actor,
        58,
        name === 'width' ? 12 : name === 'half_space' || name === 'third_man' ? 23 : 34,
      );
      place(foe, 59, name === 'width' ? 12 : name === 'half_space' ? 24 : 35);
      if (name === 'behind_press' || name === 'support_behind') place(carrier, 64, 34);
      if (name === 'between_lines') {
        place(carrier, 46, 34);
        place(actor, 64, 34);
        place(foe, 60, 30);
      }
      if (name === 'width') actor.neutralAnchor.y = mirror ? 63 : 5;
      if (name === 'rest_defence') {
        actor.duty = 'defend';
        place(actor, 40, 34);
      }
      if (name === 'draw_defender')
        place(
          s.players.find((p) => p.id === f.supportId),
          64,
          34,
        );
      if (name === 'half_turn') actor.facingAngle = 0;
      if (name === 'third_man') {
        place(primary, 58, 34);
        actor.duty = 'attack';
      }
      s.ball = {
        ...playerContactGeometry(carrier).rightFoot,
        ownerId: carrier.id,
        lastTouchPlayerId: carrier.id,
        height: 0.11,
        velocity: { x: 0, y: 0, z: 0 },
      };
      const initial = globalThis.structuredClone(s),
        origin = { ...actor.position },
        start = s.time,
        samples = [];
      let requestedDelivery = false;
      for (let tick = 0; tick < 200; tick++) {
        if (name === 'third_man' && !requestedDelivery && s.time - start >= 1) {
          const receiver = s.players.find((p) => p.id === primary.id);
          s = resolveMatchAction(
            s,
            {
              type: 'pass',
              actorId: carrier.id,
              receiverId: receiver.id,
              target: { ...receiver.position },
              intent: 'support',
              delivery: 'ground',
            },
            'human_selected',
          );
          s = { ...s, playerAgencyEnabled: false };
          requestedDelivery = true;
        }
        s = step(s, 0.025);
        if (tick % 10 === 9)
          samples.push({
            ...sampleTransition(s),
            job: globalThis.structuredClone(s.activePerceptionRuntime?.positions[actor.id] ?? null),
          });
      }
      const final = s.players.find((p) => p.id === actor.id),
        finalSource = s.players.find((p) => p.id === carrier.id),
        foes = s.players.filter((p) => p.team !== actor.team);
      const geometry = (point) => ({
        markSpace: Math.min(...foes.map((p) => distance(point, p.position))),
        laneSpace: Math.min(
          ...foes.map((p) => distanceToSegment(p.position, finalSource.position, point)),
        ),
      });
      rows.push({
        name,
        mirror,
        enabled,
        actorId: actor.id,
        role: actor.slot.position,
        duty: actor.duty,
        initialHash: hash(initial),
        finalHash: hash(s),
        origin,
        final: { ...final.position },
        metresMoved: distance(origin, final.position),
        sameFinalWorldComparison: { origin: geometry(origin), actual: geometry(final.position) },
        samples,
      });
      console.log(name, mirror, enabled, 'moved', distance(origin, final.position).toFixed(2));
    }
if (check) {
  const old = JSON.parse(gunzipSync(readFileSync(path + '.gz')));
  if (hash(old.rows) !== hash(rows)) throw Error('Receiving replay drift');
} else {
  const result = {
    schema: 'mfl-pr194-receiving-v1',
    classification:
      'forty paired controlled canonical phases; geometry measurements are passive,not completed-pass or guaranteed-defender-follow evidence',
    source,
    sourceHash: hash(source),
    sourceArchive: retainPr194Source(source),
    rows,
  };
  const raw = JSON.stringify(result),
    bytes = gzipSync(raw);
  writeFileSync(path + '.gz', bytes, { flag: 'wx' });
  writeReceipt(path, {
    schema: 'mfl-pr194-receiving-pointer-v1',
    archive: { path: path + '.gz', sha256: hash(bytes), originalSha256: hash(raw) },
    count: rows.length,
    summary: rows.map(({ samples, ...r }) => ({
      ...r,
      receivingJobs: samples.filter((s) => s.job).length,
    })),
  });
}
console.log('PR194 receiving phases', check ? 'replay PASS' : 'recorded', rows.length);
