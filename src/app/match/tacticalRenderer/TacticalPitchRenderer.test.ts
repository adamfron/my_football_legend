// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.fn();
const setSize = vi.fn();
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class Renderer {
    domElement = document.createElement('canvas');
    outputColorSpace = '';
    setPixelRatio = vi.fn();
    setSize = setSize;
    render = render;
    dispose = vi.fn();
  }
  return { ...actual, WebGLRenderer: Renderer };
});

import { TacticalPitchRenderer } from './TacticalPitchRenderer';
import * as THREE from 'three';
import type { TacticalFrame } from './model';
import { createTacticalDiagnosticFixture } from './diagnosticOverlay';
import { BALL_RADIUS } from '../../../core/matchSimulation/ballFlight';
import { PlayerModel } from './playerModel';
import type { CanonicalActionEvent } from '../../../core/matchSimulation/actionEvents';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  matchStateToFrame,
  stepTacticalMatch,
} from '../../../core/matchSimulation/matchSimulation';

let resizeCallback: () => void;
class TestResizeObserver {
  constructor(callback: () => void) {
    resizeCallback = callback;
  }
  observe() {}
  disconnect() {}
}

const frame: TacticalFrame = { timestampMs: 0, players: [], ball: { x: 52, y: 34 } };

describe('TacticalPitchRenderer viewport lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('devicePixelRatio', 1);
  });

  it('waits for initial layout and paints the stored frame when dimensions become valid', () => {
    const host = document.createElement('div');
    document.body.append(host);
    let width = 0,
      height = 0;
    Object.defineProperties(host, {
      clientWidth: { get: () => width },
      clientHeight: { get: () => height },
    });
    const diagnostics: (string | undefined)[] = [];
    const renderer = new TacticalPitchRenderer(host, frame, (value) => diagnostics.push(value));
    expect(renderer.lifecycle).toBe('waiting_for_layout');
    expect(render).not.toHaveBeenCalled();
    width = 800;
    height = 500;
    resizeCallback();
    expect(renderer.lifecycle).toBe('ready');
    expect(render).toHaveBeenCalledTimes(1);
    expect(diagnostics).toContain('Renderer waiting_for_layout');
  });

  it('repaints the latest frame after an ordinary resize', () => {
    const host = document.createElement('div');
    document.body.append(host);
    let width = 800;
    Object.defineProperties(host, {
      clientWidth: { get: () => width },
      clientHeight: { get: () => 500 },
    });
    new TacticalPitchRenderer(host, frame);
    expect(render).toHaveBeenCalledTimes(1);
    width = 900;
    resizeCallback();
    expect(setSize).toHaveBeenLastCalledWith(900, 500, false);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('can explicitly repaint a paused presentation without advancing a frame', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const renderer = new TacticalPitchRenderer(host, frame);
    expect(render).toHaveBeenCalledTimes(1);
    renderer.redraw();
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('preserves complete canonical results when rendering motion arrows and paused redraws', () => {
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const world = createCanonicalWorldDatabase();
    let headless = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'pr150-render-parity',
        control: { mode: 'spectator' },
      }),
    );
    let watched = structuredClone(headless);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const renderer = new TacticalPitchRenderer(host, matchStateToFrame(watched));
    for (let tick = 0; tick < 2400; tick++) {
      headless = stepTacticalMatch(headless, FIXED_MATCH_DT);
      watched = stepTacticalMatch(watched, FIXED_MATCH_DT);
      if (tick % 40 === 0) {
        const snapshot = structuredClone(watched);
        const observedFrame = { ...matchStateToFrame(watched), showMotionVectors: true };
        const beforeFrame = structuredClone(observedFrame);
        renderer.render(observedFrame);
        renderer.redraw();
        expect(observedFrame).toEqual(beforeFrame);
        expect(watched).toEqual(snapshot);
      }
    }
    renderer.dispose();
    canvasContext.mockRestore();
    expect(watched).toEqual(headless);
    expect(headless.statistics!.players.some((player) => player.passesAttempted > 0)).toBe(true);
  });
  it('isolates middle-button gestures, cancellation and reset from football frames', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const snapshot = structuredClone(frame);
    const renderer = new TacticalPitchRenderer(host, frame);
    const canvas = renderer.getCanvas();
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    const pointer = (type: string, button: number, x: number, shiftKey = false) => {
      const event = new MouseEvent(type, {
        button,
        clientX: x,
        clientY: 150,
        shiftKey,
        cancelable: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      canvas.dispatchEvent(event);
      return event;
    };
    expect(pointer('pointerdown', 1, 100).defaultPrevented).toBe(true);
    pointer('pointermove', 1, 140);
    pointer('pointermove', 1, 180, true);
    pointer('pointercancel', 1, 180);
    expect(renderer.consumeCameraClick()).toBe(true);
    pointer('pointerdown', 0, 180);
    expect(renderer.consumeCameraClick()).toBe(false);
    renderer.resetView();
    expect(frame).toEqual(snapshot);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    renderer.dispose();
    const calls = render.mock.calls.length;
    pointer('pointerdown', 1, 100);
    pointer('pointermove', 1, 140);
    expect(render.mock.calls.length).toBe(calls);
  });
  it('maps the expanded interception marker to the existing canonical ball target', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const input = { ...frame, ball: { x: 30, y: 30 }, interceptionTarget: { x: 52.5, y: 34 } };
    const renderer = new TacticalPitchRenderer(host, input);
    renderer.getCanvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 500 }) as DOMRect;
    expect(renderer.pick(413, 250)).toEqual({ kind: 'ball', point: { x: 30, y: 30 } });
    renderer.dispose();
  });

  it('picks a legal defender outside the old 22px envelope across zoom, orbit and touchlines', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('devicePixelRatio', 3);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const input: TacticalFrame = {
      ...frame,
      ball: { x: 44, y: 3 },
      players: [{ id: 'defender', team: 'away', x: 52.5, y: 3, facing: 0 }],
    };
    const before = structuredClone(input);
    const renderer = new TacticalPitchRenderer(host, input);
    const canvas = renderer.getCanvas();
    canvas.getBoundingClientRect = () =>
      ({ left: 120, top: 40, width: 800, height: 500 }) as DOMRect;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    for (const preset of ['overview', 'action', 'player_focus'] as const)
      for (const zoom of [0, 0.5, 1]) {
        renderer.setCameraPreferences({ preset, zoom }, 'defender');
        for (let count = 0; animationFrames.length && count < 100; count++)
          animationFrames.shift()!(count * 16);
        for (const orbit of [0, 35]) {
          const pointer = (type: string, x: number, y: number) => {
            const event = new MouseEvent(type, { button: 1, clientX: x, clientY: y });
            Object.defineProperty(event, 'pointerId', { value: 1 });
            canvas.dispatchEvent(event);
          };
          pointer('pointerdown', 100, 100);
          pointer('pointermove', 100 + orbit, 100 + orbit / 2);
          pointer('pointerup', 100 + orbit, 100 + orbit / 2);
          const scene = render.mock.lastCall![0] as THREE.Scene;
          const camera = render.mock.lastCall![1] as THREE.Camera;
          const actor = scene.children.find((object) => object.userData.playerId === 'defender')!;
          const projected = actor.position
            .clone()
            .add(new THREE.Vector3(0, 0.9, 0))
            .project(camera);
          const x = 120 + (projected.x + 1) * 400,
            y = 40 + (1 - projected.y) * 250;
          expect(x + 29).toBeGreaterThanOrEqual(120);
          expect(x + 29).toBeLessThanOrEqual(920);
          expect(y).toBeGreaterThanOrEqual(40);
          expect(y).toBeLessThanOrEqual(540);
          expect(renderer.pick(x + 29, y, undefined, ['defender'])).toEqual({
            kind: 'player',
            playerId: 'defender',
          });
          expect(renderer.pick(x + 55, y, undefined, ['defender'])).not.toEqual({
            kind: 'player',
            playerId: 'defender',
          });
        }
      }
    expect(input).toEqual(before);
    renderer.dispose();
    context.mockRestore();
    vi.unstubAllGlobals();
  });

  it('selects the nearest allowed player in a crowd and excludes unrelated overlapping pickers', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const input: TacticalFrame = {
      ...frame,
      ball: { x: 20, y: 20 },
      players: [
        { id: 'legal-a', team: 'away', x: 52.5, y: 34 },
        { id: 'legal-b', team: 'away', x: 53.2, y: 34 },
        { id: 'unrelated', team: 'home', x: 53.2, y: 34 },
      ],
    };
    const renderer = new TacticalPitchRenderer(host, input);
    renderer.getCanvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 500 }) as DOMRect;
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const camera = render.mock.lastCall![1] as THREE.Camera;
    const actor = scene.children.find((object) => object.userData.playerId === 'legal-b')!;
    const projected = actor.position
      .clone()
      .add(new THREE.Vector3(0, 0.9, 0))
      .project(camera);
    const x = (projected.x + 1) * 400,
      y = (1 - projected.y) * 250;
    expect(renderer.pick(x, y, undefined, ['legal-a', 'legal-b'])).toEqual({
      kind: 'player',
      playerId: 'legal-b',
    });
    expect(renderer.pick(x, y, undefined, ['legal-a'])).toEqual({
      kind: 'player',
      playerId: 'legal-a',
    });
    expect(renderer.pick(x, y, undefined, [])?.kind).not.toBe('player');
    renderer.dispose();
    context.mockRestore();
  });

  it('renders canonical feedback through the real pitch path and expires it at frame time', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const event: CanonicalActionEvent = {
      id: 'canonical-heavy',
      sequence: 1,
      at: 1,
      actorId: 'absent-player',
      team: 'home',
      kind: 'heavy_touch',
      position: { x: 52.5, y: 34 },
      outcome: 'heavy_touch',
      cause: 'physical_first_touch',
    };
    const input = { ...frame, timestampMs: 1000, actionEvents: [event] };
    const renderer = new TacticalPitchRenderer(host, input);
    const label = host.querySelector<HTMLElement>('[data-action-event-id="canonical-heavy"]')!;
    expect(label.textContent).toBe('CIĘŻKIE PRZYJĘCIE');
    expect(label.style.left).toMatch(/px$/);
    expect(label.style.top).toMatch(/px$/);
    const initialX = label.style.left;
    renderer.setCameraPreferences({ preset: 'action', zoom: 0.35 });
    expect(label.style.left).not.toBe(initialX);
    expect(input.actionEvents[0]).toBe(event);
    renderer.render({ ...input, timestampMs: 2100 });
    expect(host.querySelector('[data-action-event-id]')).toBeNull();
    renderer.dispose();
    expect(host.querySelector('.canonical-action-feedback')).toBeNull();
  });

  it('removes a dismissed actor and picker, restores historical replay, and disposes the cache', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const before: TacticalFrame = {
      ...frame,
      timestampMs: 1000,
      ball: { x: 20, y: 20 },
      players: [{ id: 'dismissed', team: 'home', x: 52.5, y: 34, facing: Math.PI / 2 }],
    };
    const renderer = new TacticalPitchRenderer(host, before);
    renderer.getCanvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 500 }) as DOMRect;
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const actor = scene.children.find((object) => object.userData.playerId === 'dismissed')!;
    expect(actor).toBeDefined();
    const camera = render.mock.lastCall![1] as THREE.Camera;
    const projected = actor.position.clone().project(camera);
    const x = (projected.x + 1) * 400,
      y = (1 - projected.y) * 250;
    expect(renderer.pick(x, y, undefined, ['dismissed'])).toEqual({
      kind: 'player',
      playerId: 'dismissed',
    });
    renderer.render({ ...before, timestampMs: 1025, players: [] });
    expect(actor.parent).toBeNull();
    expect(scene.children.some((object) => object.userData.playerId === 'dismissed')).toBe(false);
    expect(renderer.pick(x, y, undefined, ['dismissed'])).not.toEqual({
      kind: 'player',
      playerId: 'dismissed',
    });
    renderer.render(before);
    expect(actor.parent).toBe(scene);
    expect(renderer.pick(x, y, undefined, ['dismissed'])).toEqual({
      kind: 'player',
      playerId: 'dismissed',
    });
    renderer.render({ ...before, timestampMs: 1025, players: [] });
    const geometry = actor.children.find((object) => object instanceof THREE.Mesh) as THREE.Mesh;
    const dispose = vi.spyOn(geometry.geometry, 'dispose');
    renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    context.mockRestore();
  });

  it('keeps legal boundary-ball geometry/picking and staged/departing bodies at exact recorded coordinates', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 900 },
      clientHeight: { get: () => 600 },
    });
    const input: TacticalFrame = {
      timestampMs: 12000,
      players: [
        {
          id: 'outgoing',
          team: 'home',
          x: 45,
          y: 1.2,
          facing: 0,
          velocity: { x: 1, y: -0.5 },
          participation: 'departing',
        },
        { id: 'incoming', team: 'home', x: 52.5, y: -0.5, participation: 'staged' },
        {
          id: 'thrower',
          team: 'away',
          x: 20,
          y: 0,
          preparation: 'throw',
          canonicalBallPlacement: false,
        },
      ],
      ball: { x: 45.0816, y: -0.0324, ownerId: 'thrower', height: 0 },
    };
    const original = structuredClone(input);
    const renderer = new TacticalPitchRenderer(host, input);
    renderer.setCameraPreferences({ preset: 'overhead', zoom: 0.35 });
    renderer.getCanvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 900, height: 600 }) as DOMRect;
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const camera = render.mock.lastCall![1] as THREE.Camera;
    const sphere = scene.children.find(
      (item) =>
        item.userData.ball &&
        item instanceof THREE.Mesh &&
        item.geometry instanceof THREE.SphereGeometry &&
        item.geometry.parameters.radius === BALL_RADIUS,
    ) as THREE.Mesh;
    expect(sphere.position.x).toBeCloseTo(input.ball.x - 52.5);
    expect(sphere.position.z).toBeCloseTo(input.ball.y - 34);
    expect(sphere.position.y).toBe(BALL_RADIUS);
    const projected = sphere.position.clone().project(camera);
    expect(renderer.pick((projected.x + 1) * 450, (1 - projected.y) * 300)).toEqual({
      kind: 'ball',
      point: { x: input.ball.x, y: expect.closeTo(input.ball.y) },
    });
    for (const player of input.players) {
      const mesh = scene.children.find((item) => item.userData.playerId === player.id)!;
      expect(mesh.position.toArray()).toEqual([player.x - 52.5, 0, player.y - 34]);
    }
    expect(input).toEqual(original);
    renderer.dispose();
    context.mockRestore();
  });

  it('enables grouped diagnostics and camera/scenery controls without changing the frozen frame or picking', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 900 },
      clientHeight: { get: () => 600 },
    });
    const input = createTacticalDiagnosticFixture();
    const original = structuredClone(input);
    const freeze = (value: unknown) => {
      if (value && typeof value === 'object') {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
    };
    freeze(input);
    const renderer = new TacticalPitchRenderer(host, input, undefined, undefined, undefined, {
      homeClubId: 'pro_1',
    });
    expect(host.querySelector('[data-tactical-diagnostic-id]')).toBeNull();
    renderer.setCameraPreferences({ preset: 'overhead', zoom: 0.35 });
    renderer.setDiagnostics({
      movement: true,
      shape: true,
      identity: true,
      assignments: true,
      contacts: true,
      fitness: true,
      ball: true,
    });
    expect(host.querySelector('[data-tactical-diagnostic-id="carrier"]')?.textContent).toContain(
      '7 kontaktów',
    );
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const camera = render.mock.lastCall![1] as THREE.Camera;
    renderer.getCanvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 900, height: 600 }) as DOMRect;
    const actor = scene.children.find((item) => item.userData.playerId === 'pivot')!;
    const screen = actor.position
      .clone()
      .add(new THREE.Vector3(0, 0.9, 0))
      .project(camera);
    // Neither scenery nor overlay geometry is part of the football picker collection.
    const scenery = new THREE.Mesh(new THREE.BoxGeometry(5, 20, 5), new THREE.MeshBasicMaterial());
    scenery.position.copy(actor.position);
    scenery.userData.decoration = true;
    scene.add(scenery);
    expect(renderer.pick((screen.x + 1) * 450, (1 - screen.y) * 300, undefined, ['pivot'])).toEqual(
      { kind: 'player', playerId: 'pivot' },
    );
    renderer.setStadiumDetail('minimal');
    renderer.setCameraMode('goal_replay');
    renderer.setReplayCamera('actors');
    renderer.setReplayCamera('overview');
    renderer.setCameraMode('tactical');
    renderer.setDiagnostics({
      movement: false,
      shape: false,
      identity: false,
      assignments: false,
      contacts: false,
      fitness: false,
      ball: false,
    });
    expect(host.querySelector('[data-tactical-diagnostic-id]')).toBeNull();
    expect(input).toEqual(original);
    const metrics = renderer.getPresentationMetrics();
    expect(metrics.activeAnimatedModels).toBe(input.players.length);
    expect(metrics.stadiumDetail).toBe('minimal');
    expect(metrics.drawCalls).toBeNull(); // Mocked WebGL cannot measure GPU draw calls or FPS.
    const snapshot = renderer.exportPresentationScene();
    expect(snapshot.scene).not.toBe(scene);
    expect(snapshot.camera).not.toBe(camera);
    renderer.dispose();
    context.mockRestore();
  });

  it('defers initial rendering when presentation starts inactive and restores a fresh frame', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 900 },
      clientHeight: { get: () => 600 },
    });
    const input = createTacticalDiagnosticFixture();
    const renderer = new TacticalPitchRenderer(host, input, undefined, undefined, undefined, {
      active: false,
    });
    expect(render).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
    renderer.setDiagnostics({ identity: true });
    renderer.setStadiumDetail('minimal');
    renderer.setCameraPreferences({ preset: 'overhead', zoom: 0.5 });
    resizeCallback();
    renderer.redraw();
    expect(render).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
    const fresh = {
      ...input,
      timestampMs: 12500,
      players: input.players.map((player) => ({ ...player, x: player.x + 1 })),
    };
    const original = structuredClone(fresh);
    renderer.setPresentationActive(true, fresh);
    expect(render).toHaveBeenCalledTimes(1);
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const actor = scene.children.find((object) => object.userData.playerId === 'carrier')!;
    expect(actor.position.x).toBe(fresh.players[0]!.x - 52.5);
    expect(scene.getObjectByName('optional-stadium-detail')?.visible).toBe(false);
    expect(host.querySelector('[data-tactical-diagnostic-id="carrier"]')).not.toBeNull();
    expect(fresh).toEqual(original);
    renderer.dispose();
    context.mockRestore();
  });

  it('cancels background zoom and defers every scene/pose/WebGL update from controls, resize and recovery', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 900 },
      clientHeight: { get: () => 600 },
    });
    const input = createTacticalDiagnosticFixture();
    const renderer = new TacticalPitchRenderer(host, input);
    renderer.setCameraPreferences({ preset: 'overview', zoom: 0.9 });
    const queuedZoom = callbacks.at(-1)!;
    renderer.setPresentationActive(false);
    expect(cancel).toHaveBeenCalledWith(1);
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const actor = scene.children.find((object) => object.userData.playerId === 'carrier')!;
    const oldPosition = actor.position.clone();
    const detail = scene.getObjectByName('optional-stadium-detail')!;
    const poseUpdates = vi.spyOn(PlayerModel.prototype, 'update');
    const sceneUpdates = vi.spyOn(scene, 'updateMatrixWorld');
    const projectionUpdates = vi.spyOn(
      THREE.OrthographicCamera.prototype,
      'updateProjectionMatrix',
    );
    render.mockClear();
    setSize.mockClear();
    const rafCount = raf.mock.calls.length;
    const metrics = renderer.getPresentationMetrics();
    const fresh = {
      ...input,
      timestampMs: 13000,
      players: input.players.map((player) => ({ ...player, x: player.x + 2 })),
    };
    const original = structuredClone(fresh);
    renderer.render(fresh, true);
    renderer.setDiagnostics({ identity: true, contacts: true });
    renderer.setStadiumDetail('minimal');
    renderer.setCameraMode('goal_replay');
    renderer.setReplayCamera('actors');
    renderer.setCameraMode('shot_aim', 'carrier', 'home');
    renderer.setGoalAimMarker({ horizontal: 0.3, vertical: 0.6 });
    renderer.resetView();
    renderer.setCameraPreferences({ preset: 'overhead', zoom: 0.8 }, 'carrier');
    renderer.redraw();
    resizeCallback();
    renderer.recover();
    // A callback already dequeued before cancellation is harmless too.
    queuedZoom(100);
    expect(renderer.pick(100, 100)).toBeUndefined();
    expect(renderer.pickGoalAim(100, 100)).toBeUndefined();
    expect(render).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
    expect(poseUpdates).not.toHaveBeenCalled();
    expect(sceneUpdates).not.toHaveBeenCalled();
    expect(projectionUpdates).not.toHaveBeenCalled();
    expect(raf).toHaveBeenCalledTimes(rafCount);
    expect(actor.position).toEqual(oldPosition);
    expect(detail.visible).toBe(true);
    expect(renderer.getPresentationMetrics().renderSamples).toBe(metrics.renderSamples);
    expect(fresh).toEqual(original);
    renderer.setPresentationActive(true, fresh, false);
    expect(render).toHaveBeenCalled();
    expect(setSize).toHaveBeenCalledTimes(1);
    expect(poseUpdates).toHaveBeenCalled();
    expect(actor.position.x).toBe(fresh.players[0]!.x - 52.5);
    expect(detail.visible).toBe(false);
    expect(fresh).toEqual(original);
    renderer.dispose();
    poseUpdates.mockRestore();
    sceneUpdates.mockRestore();
    projectionUpdates.mockRestore();
    context.mockRestore();
    vi.unstubAllGlobals();
  });
});
