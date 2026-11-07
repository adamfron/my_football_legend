// @vitest-environment node
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createPr214Scene } from '../../../../scripts/pr214Scenarios';
import { withArticulatedBody } from '../../../core/matchSimulation/articulatedGait';
import { projectCanonicalPlayerPresentation } from '../../../core/matchSimulation/canonicalPresentation';
import { captureReplaySnapshot } from '../../../core/matchSimulation/matchReplay';
import { PlayerModel, PlayerModelResources } from './playerModel';
import { DEFAULT_KITS, tacticalToWorld, interpolateFrame, type TacticalPlayer } from './model';
import { interpolatePresentationFrames, replaySnapshotToFrame } from './replay';

it('places real Three.js pelvis, hips, knees, ankles and boot landmarks at physical world positions', () => {
  for (const heightCm of [165, 180, 195])
    for (const facing of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const state = withArticulatedBody(createPr214Scene('pair-reference').initial);
      delete state.pendingStrike;
      const p = state.players[0]!;
      p.profile = { ...p.profile, heightCm };
      p.facingAngle = facing;
      const visible: TacticalPlayer = {
        id: p.id,
        team: p.team,
        x: p.position.x,
        y: p.position.y,
        facing,
        heightCm,
        weightKg: p.profile.weightKg,
        ...projectCanonicalPlayerPresentation(state, p),
      };
      const resources = new PlayerModelResources(),
        model = new PlayerModel(visible, DEFAULT_KITS.home, resources);
      const world = tacticalToWorld(visible);
      model.root.position.set(world.x, 0, world.z);
      model.root.rotation.y = facing;
      model.update(visible, state.time * 1000);
      model.root.updateWorldMatrix(true, true);
      const g = visible.articulatedBody!.geometry;
      for (const [joint, point] of [
        [model.torso, g.pelvis],
        [model.leftHip, g.left.hip],
        [model.rightHip, g.right.hip],
        [model.leftKnee, g.left.knee],
        [model.rightKnee, g.right.knee],
        [model.leftAnkle, g.left.ankle],
        [model.rightAnkle, g.right.ankle],
        [model.leftBootContact, g.left.foot],
        [model.rightBootContact, g.right.foot],
      ] as const) {
        const actual = joint.getWorldPosition(new THREE.Vector3());
        expect(
          actual.distanceTo(new THREE.Vector3(point.x - 52.5, point.z, point.y - 34)),
        ).toBeLessThan(1e-10);
      }
      // Speed/time/cosmetic cues cannot move a canonical contacting surface.
      const before = model.leftBootContact.getWorldPosition(new THREE.Vector3());
      model.update(
        {
          ...visible,
          gaitPhase: 1.7,
          gaitSpeed: 9,
          cue: { kind: 'shot', atMs: state.time * 1000 },
        },
        state.time * 1000 + 100,
      );
      expect(
        model.leftBootContact.getWorldPosition(new THREE.Vector3()).distanceTo(before),
      ).toBeLessThan(1e-10);
      resources.dispose();
    }
});

it('carries authoritative joints through recorded replay and holds sparse snapshots on seek', () => {
  const state = withArticulatedBody(createPr214Scene('pair-reference').initial);
  const snapshot = captureReplaySnapshot(state, 0),
    frame = replaySnapshotToFrame(snapshot);
  expect(frame.players[0]!.articulatedBody).toEqual(snapshot.players[0]!.articulatedBody);
  const next = {
    ...frame,
    timestampMs: frame.timestampMs + 200,
    players: frame.players.map((p) => ({ ...p, x: p.x + 0.1 })),
  };
  const middle = interpolatePresentationFrames(frame, next, frame.timestampMs + 100);
  expect(middle.players[0]).toEqual(frame.players[0]);
  expect(middle.ball).toEqual(frame.ball);
  expect(
    interpolateFrame(
      { id: 'physical-replay', frames: [frame, next], durationMs: next.timestampMs },
      frame.timestampMs + 100,
    ),
  ).toBe(frame);
  expect(interpolatePresentationFrames(frame, next, next.timestampMs)).toBe(next);
  expect(snapshot.players[0]!.articulatedBody).toEqual(frame.players[0]!.articulatedBody);
});
