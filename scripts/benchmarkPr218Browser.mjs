/* global window, document, performance */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createPr214Scene } from './pr214Scenarios.ts';
import { withArticulatedBody } from '../src/core/matchSimulation/articulatedGait.ts';
import { projectCanonicalPlayerPresentation } from '../src/core/matchSimulation/canonicalPresentation.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const root = 'docs/performance/pr218/browser-stance-v2';
mkdirSync(root, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const report = {
  browser: browser.version(),
  source: JSON.parse(readFileSync('docs/performance/pr218/source.json')).fingerprint,
  viewports: [],
};
try {
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/my_football_legend/`);
    await page.getByRole('button', { name: 'Pojedynczy mecz [DEV]', exact: true }).click();
    assert.equal(await page.getByLabel('Fizyka meczu', { exact: true }).inputValue(), 'ordinary');
    const results = [];
    for (const [name, scene, ticks] of [
      ['standing', 'pair-reference', 0],
      ['moving', 'pair-reference', 2],
      ['prepared-pass', 'body-pass-third', 0],
    ]) {
      let state = withArticulatedBody(createPr214Scene(scene).initial);
      if (name === 'standing') {
        delete state.pendingStrike;
        delete state.defensiveChallenge;
      }
      for (let i = 0; i < ticks; i++) state = stepTacticalMatch(state, 0.025);
      const players = state.players.map((p) => ({
        id: p.id,
        team: p.team,
        x: p.position.x,
        y: p.position.y,
        facing: p.facingAngle,
        velocity: p.velocity,
        heightCm: p.profile.heightCm,
        weightKg: p.profile.weightKg,
        dominantFoot: p.profile.dominantFoot,
        ...projectCanonicalPlayerPresentation(state, p),
      }));
      const focus = players.find((p) => p.id === state.pendingStrike?.actorId) ?? players[0];
      const result = await page.evaluate(
        async ({ players, focus, at, width, height }) => {
          const THREE = await import(
            '/my_football_legend/node_modules/three/build/three.module.js'
          );
          const { PlayerModel, PlayerModelResources } = await import(
            '/my_football_legend/src/app/match/tacticalRenderer/playerModel.ts'
          );
          const { DEFAULT_KITS } = await import(
            '/my_football_legend/src/app/match/tacticalRenderer/model.ts'
          );
          if (window.pr218Renderer) {
            window.pr218Renderer.dispose();
            document.querySelector('canvas')?.remove();
          }
          document.body.innerHTML =
            '<style>body{margin:0;background:#263b30}aside{position:fixed;top:18px;left:0;width:100%;display:flex;color:white;font:600 20px system-ui}aside span{width:50%;text-align:center}</style><aside><span>PR217 — animacja</span><span>PR218 — geometria fizyczna</span></aside>';
          const renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
          });
          window.pr218Renderer = renderer;
          renderer.setSize(width, height);
          renderer.setPixelRatio(1);
          document.body.append(renderer.domElement);
          const resources = new PlayerModelResources(),
            scenes = [],
            rigs = [];
          for (const canonical of [false, true]) {
            const scene = new THREE.Scene();
            scene.background = new THREE.Color('#263b30');
            scene.add(new THREE.HemisphereLight('#fff4dd', '#44535c', 2.5));
            const light = new THREE.DirectionalLight('#ffffff', 3);
            light.position.set(-2, 4, 5);
            scene.add(light);
            const floor = new THREE.Mesh(
              new THREE.PlaneGeometry(12, 12),
              new THREE.MeshStandardMaterial({ color: '#487a49' }),
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(focus.x - 52.5, 0, focus.y - 34);
            scene.add(floor);
            const group = [];
            for (const player of players) {
              const shown = canonical
                ? player
                : { ...player, articulatedBody: undefined, gaitPhase: 1.1 };
              const rig = new PlayerModel(shown, DEFAULT_KITS[player.team], resources);
              rig.root.position.set(player.x - 52.5, 0, player.y - 34);
              rig.root.rotation.y = player.facing;
              rig.update(shown, at);
              scene.add(rig.root);
              group.push(rig);
            }
            scenes.push(scene);
            rigs.push(group);
          }
          const index = players.findIndex((p) => p.id === focus.id),
            physical = focus.articulatedBody.geometry;
          const parity = [];
          for (const [label, field, point] of [
            ['pelvis', 'torso', physical.pelvis],
            ['leftHip', 'leftHip', physical.left.hip],
            ['rightHip', 'rightHip', physical.right.hip],
            ['leftKnee', 'leftKnee', physical.left.knee],
            ['rightKnee', 'rightKnee', physical.right.knee],
            ['leftAnkle', 'leftAnkle', physical.left.ankle],
            ['rightAnkle', 'rightAnkle', physical.right.ankle],
            ['leftBoot', 'leftBootContact', physical.left.foot],
            ['rightBoot', 'rightBootContact', physical.right.foot],
          ]) {
            const wanted = new THREE.Vector3(point.x - 52.5, point.z, point.y - 34);
            parity.push({
              landmark: label,
              physical: point,
              before: rigs[0][index][field]
                .getWorldPosition(new THREE.Vector3())
                .distanceTo(wanted),
              after: rigs[1][index][field].getWorldPosition(new THREE.Vector3()).distanceTo(wanted),
            });
          }
          const cx = focus.x - 52.5,
            cz = focus.y - 34,
            camera = new THREE.PerspectiveCamera(35, width / 2 / height, 0.1, 100);
          camera.position.set(cx + 3.2, 2.7, cz + 4.5);
          camera.lookAt(cx, 0.9, cz);
          renderer.setScissorTest(true);
          for (let side = 0; side < 2; side++) {
            renderer.setViewport((side * width) / 2, 0, width / 2, height);
            renderer.setScissor((side * width) / 2, 0, width / 2, height);
            renderer.render(scenes[side], camera);
          }
          const costs = [];
          for (let side = 0; side < 2; side++) {
            const samples = [];
            for (let f = 0; f < 65; f++) {
              const begin = performance.now();
              for (let i = 0; i < players.length; i++)
                rigs[side][i].update(
                  side ? players[i] : { ...players[i], articulatedBody: undefined, gaitPhase: 1.1 },
                  at,
                );
              renderer.render(scenes[side], camera);
              if (f >= 5) samples.push(performance.now() - begin);
            }
            samples.sort((a, b) => a - b);
            costs.push({
              edition: side ? 'articulated' : 'cosmetic',
              players: players.length,
              medianSubmitMs: samples[30],
              p95SubmitMs: samples[57],
              drawCalls: renderer.info.render.calls,
              geometries: renderer.info.memory.geometries,
            });
          }
          // Redraw both complete comparison panels after timing.
          for (let side = 0; side < 2; side++) {
            renderer.setViewport((side * width) / 2, 0, width / 2, height);
            renderer.setScissor((side * width) / 2, 0, width / 2, height);
            renderer.render(scenes[side], camera);
          }
          return { parity, costs };
        },
        { players, focus, at: state.time * 1000, width, height },
      );
      assert.ok(result.parity.every((p) => p.after < 1e-9));
      await page.screenshot({ path: `${root}/${name}-${width}.png` });
      results.push({ name, ...result });
    }
    assert.deepEqual(errors, []);
    report.viewports.push({ width, height, errors, results });
    await page.close();
  }
} finally {
  writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await vite.close();
}
process.stdout.write(
  JSON.stringify(
    report.viewports.map((v) => ({
      width: v.width,
      results: v.results.map((r) => ({
        name: r.name,
        maxBefore: Math.max(...r.parity.map((p) => p.before)),
        maxAfter: Math.max(...r.parity.map((p) => p.after)),
        costs: r.costs,
      })),
    })),
    null,
    2,
  ) + '\n',
);
