/* global structuredClone */
// Standalone evidence harness. Run from the repository root with the TS loader.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';
import { URL } from 'node:url';
import { createServer } from 'vite';
import { createPr214Scene } from '../../../scripts/pr214Scenarios.ts';
import { stepArticulatedGaitPrototype } from '../../../scripts/pr216GaitPrototype.ts';
import {
  withArticulatedBody,
  initializeArticulatedPlayer,
} from '../../../src/core/matchSimulation/articulatedGait.ts';
import {
  beginVerticalJump,
  advanceVerticalJump,
} from '../../../src/core/matchSimulation/bodyMechanics.ts';
import { projectCanonicalPlayerPresentation } from '../../../src/core/matchSimulation/canonicalPresentation.ts';
import { deriveLowerBodyGeometry } from '../../../src/core/matchSimulation/lowerBodyGeometry.ts';
import { canonicalStrikeFoot } from '../../../src/core/matchSimulation/pendingStrike.ts';
import { stepTacticalMatch } from '../../../src/core/matchSimulation/matchSimulation.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const root = 'docs/performance/pr218';
const source = JSON.parse(readFileSync(`${root}/source.json`));
const raw = JSON.parse(gunzipSync(readFileSync(`${root}/laboratory-v2.json.gz`)));
assert.equal(raw.source.fingerprint, source.fingerprint);
const rows = [];
const base = () => {
  const s = withArticulatedBody(createPr214Scene('pair-reference').initial);
  delete s.pendingStrike;
  delete s.defensiveChallenge;
  return s;
};
const add = (name, state, p) => {
  const old = { ...p, articulatedStance: undefined };
  const oldGeometry = deriveLowerBodyGeometry(old);
  const presentation = projectCanonicalPlayerPresentation(state, p);
  assert.ok(presentation.articulatedBody, `${name}: valid physical posture required`);
  const pending = state.pendingStrike?.actorId === p.id ? state.pendingStrike : undefined;
  const foot = pending?.plan.foot ?? p.lowerBodyPose.activeLeg;
  const oldContact = canonicalStrikeFoot(pending, old, old, foot, state.time, 0.025, 0).position;
  rows.push({
    name,
    time: state.time,
    root: p.position,
    facing: p.facingAngle,
    oldGeometry,
    oldContact,
    visible: {
      id: p.id,
      team: p.team,
      x: p.position.x,
      y: p.position.y,
      facing: p.facingAngle,
      velocity: p.velocity,
      heightCm: p.profile.heightCm,
      weightKg: p.profile.weightKg,
      dominantFoot: p.profile.dominantFoot,
      ...presentation,
    },
  });
};
let s = base();
s.players[0].velocity = { x: 0, y: 0 };
add('standing', s, s.players[0]);
for (const name of ['jog', 'sprint']) {
  const scene = raw.scenes.find(
    (r) => r.name === name && r.heightCm === 180 && r.surface === 'firm-grass-dev-v1',
  );
  const p = scene.blocker?.before ?? scene.terminal;
  s = base();
  s.time = 10 + (scene.blocker?.at ?? 4);
  add(name, s, p);
}
for (const name of ['braking', 'turn90']) {
  let p = raw.scenes.find(
    (r) =>
      r.name === (name === 'braking' ? 'brake' : 'turn90') &&
      r.heightCm === 180 &&
      r.surface === 'firm-grass-dev-v1',
  ).input;
  for (let i = 0; i < 68; i++) {
    const turned = name === 'turn90' && i >= 60;
    p = stepArticulatedGaitPrototype(
      p,
      { x: p.position.x + (turned ? 40 : 0), y: p.position.y + (turned ? 0 : 40) },
      name === 'braking' ? (i < 60 ? 7 : 0) : 5,
      0.025,
      turned ? Math.PI / 2 : 0,
    ).player;
  }
  s = base();
  s.time = 11.7;
  add(name, s, p);
}
const carry = raw.regressions.find((r) => r.enabled && r.name === 'body-reference').terminal;
assert.ok(carry.ballCarrierIntent && carry.controlledBallContact);
add(
  'carrying',
  carry,
  carry.players.find((p) => p.id === carry.ball.ownerId),
);
s = structuredClone(
  raw.regressions.find((r) => r.enabled && r.name === 'body-reference').nativeInput,
);
for (let i = 0; i < 80; i++) {
  const old = s.lastGroundContact;
  s = stepTacticalMatch(s, 0.025);
  if (s.lastGroundContact && s.lastGroundContact !== old) {
    add(
      'receiving-contact',
      s,
      s.players.find((p) => p.id === s.lastGroundContact.actorId),
    );
    break;
  }
}
assert.ok(rows.some((r) => r.name === 'receiving-contact'));
s = withArticulatedBody(createPr214Scene('body-pass-third').initial);
add(
  'passing-preparation',
  s,
  s.players.find((p) => p.id === s.pendingStrike.actorId),
);
s = base();
let p = { ...s.players[0], articulatedStance: undefined };
let jump = beginVerticalJump(p, { approach: false, armAssistance: false });
assert.ok(jump);
for (let i = 0; i < 16; i++) jump = advanceVerticalJump(jump, 0.025);
assert.ok(jump.height > 0);
p = initializeArticulatedPlayer({ ...p, verticalJump: jump });
s.time = 10.4;
add('jump-neutral-reconstruction', s, p);
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/my_football_legend/`);
  const measured = await page.evaluate(async (rows) => {
    const THREE = await import('/my_football_legend/node_modules/three/build/three.module.js');
    const { PlayerModel, PlayerModelResources } = await import(
      '/my_football_legend/src/app/match/tacticalRenderer/playerModel.ts'
    );
    const { DEFAULT_KITS } = await import(
      '/my_football_legend/src/app/match/tacticalRenderer/model.ts'
    );
    return rows.map((row) => {
      const resources = new PlayerModelResources(),
        out = {
          name: row.name,
          root: row.root,
          facing: row.facing,
          oldContact: row.oldContact,
          old: [],
          canonical: [],
        };
      for (const canonical of [false, true]) {
        const player = canonical
          ? row.visible
          : {
              ...row.visible,
              articulatedBody: undefined,
              articulatedPoseUnavailable: undefined,
              gaitPhase: 1.1,
            };
        const rig = new PlayerModel(player, DEFAULT_KITS[player.team], resources);
        rig.root.position.set(player.x - 52.5, 0, player.y - 34);
        rig.root.rotation.y = player.facing;
        rig.update(player, row.time * 1000);
        const g = canonical ? player.articulatedBody.geometry : row.oldGeometry;
        for (const [name, joint, point] of [
          ['pelvis', rig.torso, g.pelvis],
          ['leftHip', rig.leftHip, g.left.hip],
          ['rightHip', rig.rightHip, g.right.hip],
          ['leftKnee', rig.leftKnee, g.left.knee],
          ['rightKnee', rig.rightKnee, g.right.knee],
          ['leftAnkle', rig.leftAnkle, g.left.ankle],
          ['rightAnkle', rig.rightAnkle, g.right.ankle],
          ['leftBoot', rig.leftBootContact, g.left.foot],
          ['rightBoot', rig.rightBootContact, g.right.foot],
        ]) {
          const v = joint.getWorldPosition(new THREE.Vector3());
          out[canonical ? 'canonical' : 'old'].push({
            name,
            physical: point,
            rendered: { x: v.x + 52.5, y: v.z + 34, z: v.y },
            error: v.distanceTo(new THREE.Vector3(point.x - 52.5, point.z, point.y - 34)),
          });
        }
      }
      resources.dispose();
      return out;
    });
  }, rows);
  assert.equal(measured.length, 9);
  assert.ok(measured.every((r) => r.canonical.every((p) => p.error < 1e-9)));
  const receipt = {
    source: source.fingerprint,
    harnessSha256: createHash('sha256')
      .update(readFileSync(new URL(import.meta.url)))
      .digest('hex'),
    browser: browser.version(),
    scope:
      'Nine source-backed snapshots; jump is a neutral airborne reconstruction, not a landing integration proof',
    rows: measured,
  };
  writeFileSync(`${root}/landmark-audit.json`, JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(
    JSON.stringify(
      measured.map((r) => ({
        name: r.name,
        oldMaximum: Math.max(...r.old.map((p) => p.error)),
        newMaximum: Math.max(...r.canonical.map((p) => p.error)),
      })),
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await vite.close();
}
