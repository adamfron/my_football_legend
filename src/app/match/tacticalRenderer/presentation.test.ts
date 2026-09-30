import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cameraViewSpan,
  applyCameraGesture,
  cameraOffsetSchema,
  offsetCameraPose,
  resetCameraOffset,
  resetViewPreferences,
  zoomFromWheel,
} from './cameraInteraction';
import { screenToGoalIntent } from './goalAiming';
import { shotAimIntentToGoalPoint, tacticalToWorld, updateTacticalCameraPose } from './model';
import { projectMatchKits, kitColorDistance } from './kits';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import {
  createTacticalMatch,
  resolveCanonicalShot,
  stepTacticalMatch,
  FIXED_MATCH_DT,
} from '../../../core/matchSimulation';

describe('cosmetic camera state', () => {
  it('gives orthographic modes distinct framing and fits overview at its default zoom', () => {
    for (const aspect of [0.6, 1, 2]) {
      const overview = cameraViewSpan('overview', aspect);
      expect(overview.horizontal).toBeGreaterThan(cameraViewSpan('action', aspect).horizontal);
      expect(cameraViewSpan('action', aspect).horizontal).toBeGreaterThan(
        cameraViewSpan('player_focus', aspect).horizontal,
      );
      // At 45 degrees the whole 105 x 68 pitch projects to <= 123 metres horizontally.
      expect(overview.horizontal / (0.75 + 0.35 * 1.5)).toBeGreaterThan(123);
    }
  });
  it('bounds wheel, orbit and pan, including line/page wheel units', () => {
    expect(zoomFromWheel(0.95, -200)).toBe(1);
    expect(zoomFromWheel(0.05, 200)).toBe(0);
    expect(zoomFromWheel(0.5, 1, 1)).toBe(zoomFromWheel(0.5, 16));
    expect(zoomFromWheel(0.5, 1, 2)).toBe(zoomFromWheel(0.5, 240));
    const orbit = applyCameraGesture(resetCameraOffset(), { kind: 'orbit', dx: 10000, dy: -10000 });
    const pan = applyCameraGesture(orbit, { kind: 'pan', dx: 10000, dy: -10000 });
    expect(cameraOffsetSchema.safeParse(pan).success).toBe(true);
    expect(orbit.elevation).toBe(0.3);
  });
  it.each(['overview', 'action', 'player_focus'] as const)(
    'resets %s and keeps its current tracking pivot',
    (preset) => {
      const preferences = resetViewPreferences({ preset, zoom: 1 });
      expect(preferences).toEqual({ preset, zoom: 0.35 });
      const base = updateTacticalCameraPose(preferences, { x: 80, y: 20 }, { x: 70, y: 40 });
      const manual = applyCameraGesture(resetCameraOffset(), { kind: 'orbit', dx: 110, dy: 30 });
      expect(offsetCameraPose(base, manual).lookAt).toEqual(base.lookAt);
      const reset = offsetCameraPose(base, resetCameraOffset());
      expect(reset.position.x).toBeCloseTo(base.position.x);
      expect(reset.position.y).toBeCloseTo(base.position.y);
      expect(reset.position.z).toBeCloseTo(base.position.z);
      const moved = updateTacticalCameraPose(preferences, { x: 90, y: 10 }, { x: 40, y: 20 });
      expect(offsetCameraPose(moved, manual).lookAt).toEqual(moved.lookAt);
    },
  );
});

const world = createCanonicalWorldDatabase();
const makeState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr141-projection',
      control: { mode: 'spectator' },
    }),
  );

describe('screen/world/goal/resolver agreement', () => {
  const rect = { left: 20, top: 30, width: 900, height: 600 };
  it('bounds aim outside the mouth and rejects a zero-size viewport', () => {
    const camera = new THREE.PerspectiveCamera(52, 1.5, 0.1, 180);
    camera.position.set(25, 5, 0);
    camera.lookAt(52.5, 1.22, 0);
    camera.updateMatrixWorld();
    const screen = new THREE.Vector3(52.5, 6, 12).project(camera);
    const pointer = {
      x: rect.left + ((screen.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - screen.y) * rect.height) / 2,
    };
    expect(screenToGoalIntent(camera, 'home', pointer, rect)).toEqual({
      horizontal: 1,
      vertical: 1,
    });
    expect(screenToGoalIntent(camera, 'home', pointer, { ...rect, width: 0 })).toBeUndefined();
  });
  it.each(['home', 'away'] as const)(
    'keeps the clicked goal side for %s from front, behind and oblique cameras',
    (team) => {
      const state = makeState();
      const shooter = state.players.find(
        (p) => p.team === team && p.profile.primaryPosition !== 'goalkeeper',
      )!;
      const goal = tacticalToWorld(shotAimIntentToGoalPoint(team, { horizontal: 0, vertical: 0 }));
      shooter.position = { x: team === 'home' ? 92 : 13, y: 34 };
      for (const [dx, dz] of [
        [-22, 0],
        [22, 0],
        [-18, 15],
        [18, -15],
      ]) {
        const camera = new THREE.PerspectiveCamera(52, rect.width / rect.height, 0.1, 180);
        camera.position.set(goal.x + dx!, 7, dz!);
        camera.lookAt(goal.x, 1.22, 0);
        camera.updateMatrixWorld();
        const points = [-0.7, 0.7]
          .map((horizontal) => {
            const canonical = shotAimIntentToGoalPoint(team, { horizontal, vertical: 0.55 });
            const screen = new THREE.Vector3(goal.x, canonical.height, canonical.y - 34).project(
              camera,
            );
            return { canonical, horizontal, screen };
          })
          .sort((a, b) => a.screen.x - b.screen.x);
        for (const [index, target] of points.entries()) {
          const intent = screenToGoalIntent(
            camera,
            team,
            {
              x: rect.left + ((target.screen.x + 1) * rect.width) / 2,
              y: rect.top + ((1 - target.screen.y) * rect.height) / 2,
            },
            rect,
          )!;
          expect(intent.horizontal).toBeCloseTo(target.horizontal);
          expect(intent.vertical).toBeCloseTo(0.55);
          const shot = resolveCanonicalShot(state, {
            type: 'shot',
            actorId: shooter.id,
            target: target.canonical,
            goalTarget: intent,
            intent: 'placed',
          });
          // Remove measured canonical execution error, not accuracy calibration.
          const intended = shotAimIntentToGoalPoint(team, {
            horizontal: shot.actualTarget.horizontal - shot.error.horizontal,
            vertical: shot.actualTarget.vertical - shot.error.vertical,
          });
          expect(intended.y).toBeCloseTo(target.canonical.y);
          expect(shot.goalPoint.y).toBeCloseTo(shotAimIntentToGoalPoint(team, shot.actualTarget).y);
          const projected = new THREE.Vector3(goal.x, intended.height, intended.y - 34).project(
            camera,
          );
          expect(
            index === 0 ? projected.x < points[1]!.screen.x : projected.x > points[0]!.screen.x,
          ).toBe(true);
        }
      }
    },
  );
  it('camera and kit projections leave canonical state and the next deterministic tick unchanged', () => {
    const state = makeState(),
      before = structuredClone(state);
    for (let i = 0; i < 20; i++) {
      offsetCameraPose(
        updateTacticalCameraPose({ preset: 'action', zoom: i / 20 }, state.ball),
        applyCameraGesture(resetCameraOffset(), { kind: 'orbit', dx: i * 10, dy: i }),
      );
      projectMatchKits(world.clubs[0]!, world.clubs[1]!);
    }
    expect(state).toEqual(before);
    expect(stepTacticalMatch(state, FIXED_MATCH_DT)).toEqual(
      stepTacticalMatch(before, FIXED_MATCH_DT),
    );
  });
});

describe('canonical club kit projection', () => {
  it('keeps distinct canonical colours and separates both keepers', () => {
    const home = {
      id: 'h',
      visualIdentity: { primaryColor: '#285f8f', secondaryColor: '#ffffff' },
    };
    const away = {
      id: 'a',
      visualIdentity: { primaryColor: '#a33135', secondaryColor: '#ffffff' },
    };
    const kits = projectMatchKits(home, away);
    expect(kits.home.primary).toBe(home.visualIdentity.primaryColor);
    expect(kits.away.primary).toBe(away.visualIdentity.primaryColor);
    expect(
      new Set([
        kits.home.primary,
        kits.away.primary,
        kits.home.goalkeeper.primary,
        kits.away.goalkeeper.primary,
      ]).size,
    ).toBe(4);
  });
  it('handles missing, invalid and white/white identities without rewriting clubs', () => {
    const white = {
      id: 'white',
      visualIdentity: { primaryColor: '#ffffff', secondaryColor: '#ffffff' },
    };
    const before = structuredClone(white);
    const kits = projectMatchKits(white, { ...white, id: 'other' });
    expect(kitColorDistance(kits.home.primary, kits.away.primary)).toBeGreaterThan(0.65);
    expect(white).toEqual(before);
    expect(projectMatchKits({ id: 'missing' }, white)).toEqual(
      projectMatchKits({ id: 'missing' }, white),
    );
    expect(
      projectMatchKits(
        { id: 'broken', visualIdentity: { primaryColor: 'bad', secondaryColor: '' } },
        white,
      ).home.primary,
    ).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
