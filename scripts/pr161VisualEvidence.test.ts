// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { TacticalPitchRenderer } from '../src/app/match/tacticalRenderer/TacticalPitchRenderer';
import {
  DEFAULT_KITS,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type TacticalPlayer,
} from '../src/app/match/tacticalRenderer/model';
import { PlayerModel, PlayerModelResources } from '../src/app/match/tacticalRenderer/playerModel';
import { createTacticalDiagnosticFixture } from '../src/app/match/tacticalRenderer/diagnosticOverlay';
import { deriveStadiumConfiguration } from '../src/app/match/tacticalRenderer/stadium';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { createOpenPlayMatchFixture as createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { PresentationFrameProjector } from '../src/app/match/tacticalRenderer/frameProjection';

vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      outputColorSpace = '';
      setPixelRatio() {}
      setSize() {}
      render() {}
      dispose() {}
    },
  };
});

const output = process.env.MFL_PR161_VISUAL_OUTPUT;
// Full stadium SVG expansion and timing samples are an opt-in evidence export.
// CI exercises the real scenes/rigs without benchmarking or expanding the crowd.
const renderSamples = output ? 300 : 2;
const expectPlayerRoots = (scene: THREE.Scene, players: TacticalPlayer[]) => {
  const roots = scene.children.filter(
    (object) => object instanceof THREE.Group && object.userData.playerId,
  );
  expect(roots).toHaveLength(players.length);
  for (const player of players) {
    const root = roots.find((object) => object.userData.playerId === player.id)!;
    expect(root).toBeDefined();
    expect(root.position.x).toBeCloseTo(player.x - PITCH_LENGTH / 2);
    expect(root.position.z).toBeCloseTo(player.y - PITCH_WIDTH / 2);
  }
};
const renderSvg = (scene: THREE.Scene, camera: THREE.Camera, name: string, title: string) => {
  // SVGRenderer has no instancing support: expand only in this detached export.
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.PlaneGeometry)
      object.renderOrder = -1000;
    if (object instanceof THREE.LineSegments && object.geometry.hasAttribute('color')) {
      const points = object.geometry.getAttribute('position');
      const colors = object.geometry.getAttribute('color');
      const count = Math.min(points.count, object.geometry.drawRange.count);
      for (let index = 0; index + 1 < count; index += 2) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3().fromBufferAttribute(points, index),
            new THREE.Vector3().fromBufferAttribute(points, index + 1),
          ]),
          new THREE.LineBasicMaterial({
            color: new THREE.Color().fromBufferAttribute(colors, index),
          }),
        );
        line.renderOrder = 1000;
        object.parent!.add(line);
      }
      object.visible = false;
    } else if (object instanceof THREE.Line) object.renderOrder = 1000;
    if (!(object instanceof THREE.InstancedMesh)) return;
    const parent = object.parent!;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < object.count; index++) {
      object.getMatrixAt(index, matrix);
      const mesh = new THREE.Mesh(object.geometry, object.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.multiplyMatrices(object.matrix, matrix);
      parent.add(mesh);
    }
    object.visible = false;
  });
  const svg = new SVGRenderer();
  svg.setSize(1280, 720);
  svg.setQuality('high');
  svg.render(scene, camera);
  const element = svg.domElement;
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '-640');
  background.setAttribute('y', '-360');
  background.setAttribute('width', '1280');
  background.setAttribute('height', '720');
  background.setAttribute(
    'fill',
    scene.background instanceof THREE.Color ? scene.background.getStyle() : '#24403b',
  );
  element.prepend(background);
  const caption = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  caption.setAttribute('x', '-610');
  caption.setAttribute('y', '-330');
  caption.setAttribute('font-size', '17');
  caption.setAttribute('fill', '#ffffff');
  caption.textContent = title;
  element.append(caption);
  expect(element.querySelectorAll('path').length).toBeGreaterThan(100);
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, `${name}.svg`), element.outerHTML);
  }
};

describe('PR161 reproducible software scene evidence', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it(
    'preserves both stadium archetypes and honest tactical landmarks in exportable renderer scenes',
    () => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          disconnect() {}
        },
      );
      vi.stubGlobal('devicePixelRatio', 1);
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const fixture = createTacticalDiagnosticFixture();
      const world = createCanonicalWorldDatabase();
      const canonical = new PresentationFrameProjector().frame(
        createTacticalMatch(
          createSingleMatchSession(world, {
            homeClubId: world.clubs[0]!.id,
            awayClubId: world.clubs[1]!.id,
            seed: 'pr161-stadium-view',
            control: { mode: 'spectator' },
          }),
        ),
      );
      const reports = [];
      expect(canonical.players).toHaveLength(22);
      expect(fixture.players).toHaveLength(8);
      for (const archetype of ['community', 'bowl'] as const) {
        let id = '';
        for (let index = 0; index < 100; index++) {
          const candidate = `pr161-stadium-${index}`;
          if (deriveStadiumConfiguration(candidate, DEFAULT_KITS.home).archetype === archetype) {
            id = candidate;
            break;
          }
        }
        expect(id).not.toBe('');
        const host = document.createElement('div');
        Object.defineProperties(host, {
          clientWidth: { value: 1280 },
          clientHeight: { value: 720 },
        });
        document.body.append(host);
        const renderer = new TacticalPitchRenderer(
          host,
          canonical,
          undefined,
          DEFAULT_KITS,
          undefined,
          { homeClubId: id },
        );
        try {
          renderer.setCameraPreferences({ preset: 'overview', zoom: 0 });
          vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
          renderer.setCameraPreferences({ preset: 'overview', zoom: 0 });
          vi.runAllTimers();
          vi.useRealTimers();
          let exported = renderer.exportPresentationScene();
          expectPlayerRoots(exported.scene, canonical.players);
          const metrics = renderer.getPresentationMetrics();
          expect(metrics.stadiumArchetype).toBe(archetype);
          expect(metrics.activeAnimatedModels).toBe(22);
          expect(metrics.crowdInstances).toBeGreaterThan(0);
          expect(metrics.crowdInstances).toBeLessThan(2500);
          expect(metrics.sharedGeometries).toBeLessThan(metrics.sceneMeshes);
          expect(exported.scene.getObjectByName('cosmetic-stadium')?.userData.decoration).toBe(
            true,
          );
          const crowd = exported.scene.getObjectByName('static-crowd-silhouette')!;
          expect(crowd).toBeInstanceOf(THREE.InstancedMesh);
          expect((crowd as THREE.InstancedMesh).count).toBe(metrics.crowdInstances);
          if (output)
            renderSvg(
              exported.scene,
              exported.camera,
              `stadium-${archetype}`,
              `PR161 | ${archetype} | real scene / SVG software render`,
            );
          for (let tick = 0; tick < renderSamples; tick++)
            renderer.render({ ...canonical, timestampMs: canonical.timestampMs + tick * 16.667 });
          expect(renderer.getPresentationMetrics().renderSamples - metrics.renderSamples).toBe(
            renderSamples,
          );
          reports.push({ scene: 'canonical-22-body', ...renderer.getPresentationMetrics() });
          if (archetype === 'community') {
            renderer.render(fixture);
            renderer.setCameraPreferences({ preset: 'overhead', zoom: 0.5 });
            renderer.setDiagnostics({
              movement: true,
              shape: true,
              assignments: true,
              contacts: true,
              ball: true,
            });
            exported = renderer.exportPresentationScene();
            expectPlayerRoots(exported.scene, fixture.players);
            const lines = exported.scene.getObjectByName('read-only-tactical-diagnostics')!;
            expect(lines).toBeInstanceOf(THREE.LineSegments);
            expect(lines.visible).toBe(true);
            expect((lines as THREE.LineSegments).geometry.drawRange.count).toBeGreaterThan(0);
            expect(
              host.querySelector('[data-tactical-diagnostic-id="carrier"]')?.textContent,
            ).toContain('7 kontaktów');
            if (output)
              renderSvg(
                exported.scene,
                exported.camera,
                'tactical-diagnostic',
                'PR161 | synthetic diagnostic | yellow: movement, blue: anchor, purple: tactical',
              );
          }
          for (let tick = 0; tick < renderSamples; tick++)
            renderer.render({ ...fixture, timestampMs: fixture.timestampMs + tick * 16.667 });
          expect(renderer.getPresentationMetrics().activeAnimatedModels).toBe(8);
          expectPlayerRoots(renderer.exportPresentationScene().scene, fixture.players);
          reports.push({
            scene: 'diagnostic-8-body-cumulative',
            ...renderer.getPresentationMetrics(),
          });
        } finally {
          renderer.dispose();
          host.remove();
        }
      }
      if (output)
        writeFileSync(
          resolve(output, 'renderer-metrics.json'),
          JSON.stringify(
            {
              method:
                'Real CPU scene updates with mocked WebGL; draw calls / GPU / FPS unmeasured.',
              reports,
            },
            null,
            2,
          ),
        );
    },
    output ? 30_000 : 5_000,
  );

  it('exports the actual articulated rig poses without moving any fixture root for animation', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#24403b');
    scene.add(new THREE.AmbientLight('#ffffff', 0.9));
    const light = new THREE.DirectionalLight('#ffffff', 0.7);
    light.position.set(0, 8, 10);
    scene.add(light);
    const resources = new PlayerModelResources();
    const poses: [string, Partial<TacticalPlayer>][] = [
      ['idle', {}],
      ['sprint', { velocity: { x: 0, y: 7 }, acceleration: { x: 0, y: 3 } }],
      [
        'contact',
        { contact: { lastAtMs: 10000, lastRegion: 'left_foot', retained: true, physicalCount: 3 } },
      ],
      [
        'failed-control',
        {
          contact: {
            lastAtMs: 10000,
            nextFailed: true,
            retained: false,
            physicalCount: 7,
            balance: 0.3,
          },
          angularVelocity: 2.2,
        },
      ],
      [
        'contain',
        { defensive: { intent: 'contain' }, movementMode: 'shuffle', velocity: { x: 1.5, y: 0 } },
      ],
      [
        'parry',
        {
          goalkeeper: true,
          goalkeeperIntervention: {
            kind: 'parry',
            atMs: 10000,
            height: 1.5,
            target: { x: 0, y: 1 },
          },
        },
      ],
      [
        'miss',
        {
          goalkeeper: true,
          goalkeeperIntervention: {
            kind: 'failed_save',
            atMs: 10000,
            height: 1.5,
            target: { x: 0, y: 1 },
          },
        },
      ],
      [
        'high-catch',
        { goalkeeper: true, goalkeeperIntervention: { kind: 'catch', atMs: 10000, height: 2 } },
      ],
      [
        'goal-scorer',
        {
          goalResponse: {
            goalId: 'recorded-goal',
            role: 'scorer',
            phase: 'celebration',
            startedAtMs: 9900,
            reactionUntilMs: 11000,
            scorerId: 'goal-scorer',
            urgent: false,
          },
        },
      ],
      [
        'urgent-retriever',
        {
          velocity: { x: 0, y: 5 },
          goalResponse: {
            goalId: 'recorded-goal',
            role: 'retriever',
            phase: 'urgent_retrieval',
            startedAtMs: 9900,
            retrieverId: 'urgent-retriever',
            urgent: true,
          },
        },
      ],
    ];
    poses.forEach(([id, additions], index) => {
      const player: TacticalPlayer = {
        id,
        team: 'home',
        x: index * 2.2,
        y: 0,
        facing: 0,
        ...additions,
      };
      const model = new PlayerModel(player, DEFAULT_KITS.home, resources);
      model.root.position.set(index * 2.2, 0, 0);
      const before = model.root.position.clone();
      model.update(player, 10020);
      expect(model.root.position.equals(before)).toBe(true);
      scene.add(model.root);
    });
    const camera = new THREE.OrthographicCamera(-12.6, 12.6, 7.1, -7.1, 0.1, 100);
    camera.position.set(10, 4, 18);
    camera.lookAt(10, 0.8, 0);
    camera.updateMatrixWorld();
    renderSvg(
      scene,
      camera,
      'articulated-poses',
      'PR161 | synthetic: idle / sprint / contact / failed / contain / parry / miss / catch / goal / retrieve',
    );
  });
});
