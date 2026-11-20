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
import { createPr224LimbScene, createPr224PassScene, selectPr224Body } from './pr224Scenarios.ts';
import { withFullBodySkeleton } from '../src/core/matchSimulation/fullBodySkeleton.ts';
import { defaultBodyMorphology } from '../src/core/matchSimulation/bodyMorphology.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const pr225 = process.argv.includes('--pr225');
const pr224 = pr225 || process.argv.includes('--pr224');
const root = pr225
  ? 'docs/performance/pr225-browser'
  : pr224
    ? 'docs/performance/pr224-browser'
    : 'docs/performance/pr218/browser-stance-v2';
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
  source: pr225
    ? 'full-body-skeleton-dev-v1'
    : pr224
      ? 'composed-leg-contact-dev-v1'
      : JSON.parse(readFileSync('docs/performance/pr218/source.json')).fingerprint,
  viewports: [],
};
try {
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    let page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/my_football_legend/`);
    await page.getByRole('button', { name: 'Pojedynczy mecz [DEV]', exact: true }).click();
    assert.equal(await page.getByLabel('Fizyka meczu', { exact: true }).inputValue(), 'ordinary');
    if (pr225) {
      await page.getByRole('radio', { name: 'Obserwuj mecz', exact: true }).check();
      await page
        .getByLabel('Fizyka meczu', { exact: true })
        .selectOption('holistic-full-body-dev-v1');
      await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
      await page.getByLabel('Wykonywana fizyka meczu', { exact: true }).waitFor();
      assert.ok(
        (await page.getByLabel('Wykonywana fizyka meczu', { exact: true }).textContent()).includes(
          'holistic-full-body-dev-v1',
        ),
      );
      await page.screenshot({ path: `${root}/single-match-lab-${width}.png` });
      await page.close();
      page = await browser.newPage({ viewport: { width, height } });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/my_football_legend/`);
      await page.getByRole('button', { name: 'Pojedynczy mecz [DEV]', exact: true }).click();
      assert.equal(await page.getByLabel('Fizyka meczu', { exact: true }).inputValue(), 'ordinary');
    }
    const results = [];
    const cases = pr224
      ? [
          ['pass-swing', createPr224PassScene('ordinary').selected, 3],
          ['pass-recovery', createPr224PassScene('weak-foot').selected, 5],
          ['recovering-shin', createPr224LimbScene('right', 'recovering'), 1],
          ...(pr225 ? [['morphology', createPr224PassScene('ordinary').selected, 0]] : []),
        ]
      : [
          ['standing', 'pair-reference', 0],
          ['moving', 'pair-reference', 2],
          ['prepared-pass', 'body-pass-third', 0],
        ];
    for (const [name, scene, ticks] of cases) {
      let state = pr224
        ? selectPr224Body(globalThis.structuredClone(scene))
        : withArticulatedBody(createPr214Scene(scene).initial);
      let reference = pr224 ? globalThis.structuredClone(scene) : undefined;
      if (pr225) {
        reference = selectPr224Body(reference);
        state = withFullBodySkeleton(state);
        if (name === 'morphology') {
          const m = defaultBodyMorphology();
          m.left.thigh = 0.23;
          m.left.shank = 0.24;
          m.left.kneeAlignment = 0.1;
          m.right.kneeAlignment = -0.1;
          m.left.footLength = 0.11;
          m.right.footLength = 0.19;
          m.right.footWidth = 0.08;
          m.left.upperArm = 0.15;
          m.right.forearm = 0.18;
          m.shoulderWidth = 0.32;
          state = withFullBodySkeleton(state, { [state.pendingStrike.actorId]: m });
        }
      }
      if (name === 'standing') {
        delete state.pendingStrike;
        delete state.defensiveChallenge;
      }
      for (let i = 0; i < ticks; i++) {
        state = stepTacticalMatch(state, 0.025);
        if (reference) reference = stepTacticalMatch(reference, 0.025);
      }
      const project = (s) =>
        s.players.map((p) => ({
          id: p.id,
          team: p.team,
          x: p.position.x,
          y: p.position.y,
          facing: p.facingAngle,
          velocity: p.velocity,
          heightCm: p.profile.heightCm,
          weightKg: p.profile.weightKg,
          dominantFoot: p.profile.dominantFoot,
          ...projectCanonicalPlayerPresentation(s, p),
        }));
      const players = project(state);
      const previousPlayers = reference && project(reference);
      const actorId =
        state.lastBallContact?.playerId ??
        state.pendingStrike?.actorId ??
        state.lastStrikeResolution?.actorId;
      const focus = players.find((p) => p.id === actorId) ?? players[0];
      const result = await page.evaluate(
        async ({ players, previousPlayers, balls, contact, focus, at, width, height, pr225 }) => {
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
          const labels = pr225
            ? ['PR224/E', 'PR225 — szkielet całego ciała']
            : previousPlayers
              ? ['PR223/D', 'PR224/E']
              : ['PR217 — animacja', 'PR218 — geometria fizyczna'];
          document.body.innerHTML = `<style>body{margin:0;background:#263b30}aside{position:fixed;top:18px;left:0;width:100%;display:flex;color:white;font:600 20px system-ui}aside span{width:50%;text-align:center}</style><aside><span>${labels[0]}</span><span>${labels[1]}</span></aside>`;
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
          const world = (p) => new THREE.Vector3(p.x - 52.5, p.z ?? p.height ?? 0.11, p.y - 34);
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
            const side = canonical ? 1 : 0;
            const visible = canonical ? players : (previousPlayers ?? players);
            for (const player of visible) {
              const shown =
                canonical || previousPlayers
                  ? player
                  : { ...player, articulatedBody: undefined, gaitPhase: 1.1 };
              const rig = new PlayerModel(shown, DEFAULT_KITS[player.team], resources);
              rig.root.position.set(player.x - 52.5, 0, player.y - 34);
              rig.root.rotation.y = player.facing;
              rig.update(shown, at);
              scene.add(rig.root);
              group.push(rig);
            }
            if (balls) {
              const ball = new THREE.Mesh(
                new THREE.SphereGeometry(0.11),
                new THREE.MeshStandardMaterial({ color: '#f8f5e7' }),
              );
              ball.position.copy(world(balls[side]));
              scene.add(ball);
            }
            if (canonical && contact) {
              const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.023),
                new THREE.MeshBasicMaterial({ color: '#ffc14f' }),
              );
              marker.position.copy(world(contact.leg.point));
              scene.add(marker);
              const axis = new THREE.BufferGeometry().setFromPoints([
                world(contact.leg.from),
                world(contact.leg.to),
              ]);
              scene.add(new THREE.Line(axis, new THREE.LineBasicMaterial({ color: '#ffc14f' })));
            }
            scenes.push(scene);
            rigs.push(group);
          }
          const index = players.findIndex((p) => p.id === focus.id),
            physical = focus.articulatedBody.geometry;
          const parity = [];
          for (const [label, field, point] of [
            ...(pr225 ? [] : [['pelvis', 'torso', physical.pelvis]]),
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
          if (pr225)
            for (const segment of focus.fullBodySkeleton.segments) {
              const node = rigs[1][index].canonicalSegments.get(segment.id),
                q = segment.world.rotation;
              parity.push({
                landmark: segment.id,
                physical: segment.world.position,
                before: 0,
                after: node
                  .getWorldPosition(new THREE.Vector3())
                  .distanceTo(world(segment.world.position)),
                rotationError:
                  1 -
                  Math.abs(
                    node
                      .getWorldQuaternion(new THREE.Quaternion())
                      .dot(new THREE.Quaternion(-q.x, -q.z, -q.y, q.w)),
                  ),
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
                  side
                    ? players[i]
                    : (previousPlayers?.[i] ?? {
                        ...players[i],
                        articulatedBody: undefined,
                        gaitPhase: 1.1,
                      }),
                  at,
                );
              renderer.render(scenes[side], camera);
              if (f >= 5) samples.push(performance.now() - begin);
            }
            samples.sort((a, b) => a - b);
            const fresh = [];
            if (pr225 && side)
              for (let f = 0; f < 35; f++) {
                const begin = performance.now();
                for (let i = 0; i < players.length; i++)
                  rigs[side][i].update(
                    { ...players[i], fullBodySkeleton: { ...players[i].fullBodySkeleton } },
                    at,
                  );
                renderer.render(scenes[side], camera);
                if (f >= 5) fresh.push(performance.now() - begin);
              }
            fresh.sort((a, b) => a - b);
            costs.push({
              edition: previousPlayers ? labels[side] : side ? 'articulated' : 'cosmetic',
              players: players.length,
              medianSubmitMs: samples[30],
              p95SubmitMs: samples[57],
              ...(fresh.length
                ? { medianNewPoseSubmitMs: fresh[15], p95NewPoseSubmitMs: fresh[28] }
                : {}),
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
        {
          players,
          previousPlayers,
          focus,
          at: state.time * 1000,
          width,
          height,
          pr225,
          balls: reference && [reference.ball, state.ball],
          contact: state.lastBallContact?.leg ? state.lastBallContact : undefined,
        },
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
