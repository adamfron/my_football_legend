// @vitest-environment node
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createPr214Scene } from '../../../../scripts/pr214Scenarios';
import { createPr224PassScene, selectPr224Body } from '../../../../scripts/pr224Scenarios';
import { withArticulatedBody } from '../../../core/matchSimulation/articulatedGait';
import { projectCanonicalPlayerPresentation } from '../../../core/matchSimulation/canonicalPresentation';
import { captureReplaySnapshot } from '../../../core/matchSimulation/matchReplay';
import { stepTacticalMatch } from '../../../core/matchSimulation/matchSimulation';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../../../core/matchSimulation/matchState';
import { PlayerModel, PlayerModelResources } from './playerModel';
import { DEFAULT_KITS, tacticalToWorld, interpolateFrame, type TacticalPlayer } from './model';
import { interpolatePresentationFrames, replaySnapshotToFrame } from './replay';

it.each([
  ['ordinary', 'right', 'contact'],
  ['weak-foot', 'left', 'contact'],
  ['advance', 'right', 'contact'],
  ['turn', 'right', 'contact'],
  ['miss', 'right', 'miss'],
] as const)('renders the complete physical pass cycle for %s', (name, foot, outcome) => {
  const { before, selected, actorId } = createPr224PassScene(name);
  const restore = (state: TacticalMatchState) =>
    tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(state)),
    ) as unknown as TacticalMatchState;
  const frame = (s: TacticalMatchState) => replaySnapshotToFrame(captureReplaySnapshot(s, 0));
  let previous = frame(before);
  let state = selectPr224Body(selected);
  let source = restore(state);
  const first = frame(state).players.find((p) => p.id === actorId)!;
  const resources = new PlayerModelResources();
  const model = new PlayerModel(first, DEFAULT_KITS.home, resources);
  let maximumError = 0;
  const stages = new Set<string>();
  const initialAction = state.pendingStrike!.id;
  for (let i = -1; i < 32; i++) {
    const current = i < 0 ? frame(before) : frame(state);
    const player = current.players.find((p) => p.id === actorId)!;
    const live = i < 0 ? before : state;
    expect(player.articulatedBody).toEqual(
      projectCanonicalPlayerPresentation(live, live.players.find((p) => p.id === actorId)!)
        .articulatedBody,
    );
    expect(player.articulatedBody).toBeDefined();
    const { geometry, root } = player.articulatedBody!;
    const world = tacticalToWorld(player);
    const toWorld = ({ x, y, z }: { x: number; y: number; z: number }) =>
      new THREE.Vector3(x - 52.5, z, y - 34);
    model.root.position.set(world.x, 0, world.z);
    model.root.rotation.y = player.facing ?? 0;
    model.update(player, current.timestampMs);
    for (const [joint, point] of [
      [model.root, root],
      [model.torso, geometry.pelvis],
      [model.leftHip, geometry.left.hip],
      [model.rightHip, geometry.right.hip],
      [model.leftKnee, geometry.left.knee],
      [model.rightKnee, geometry.right.knee],
      [model.leftAnkle, geometry.left.ankle],
      [model.rightAnkle, geometry.right.ankle],
      [model.leftBootContact, geometry.left.foot],
      [model.rightBootContact, geometry.right.foot],
    ] as const) {
      maximumError = Math.max(
        maximumError,
        joint.getWorldPosition(new THREE.Vector3()).distanceTo(toWorld(point)),
      );
    }
    if (current.timestampMs > previous.timestampMs) {
      const seek = interpolatePresentationFrames(
        previous,
        current,
        (previous.timestampMs + current.timestampMs) / 2,
      );
      expect(seek.players.find((p) => p.id === actorId)?.articulatedBody).toEqual(
        previous.players.find((p) => p.id === actorId)?.articulatedBody,
      );
    }
    previous = current;
    if (i < 0) continue;
    if (state.pendingStrike?.id === initialAction) stages.add(state.pendingStrike.phase);
    else if (state.recoveringFeet?.some((f) => f.actorId === actorId && f.foot === foot))
      stages.add('recovering');
    else if (player.articulatedBody?.support) stages.add('replanted');
    expect(state.safetyHalt).toBeUndefined();
    state = stepTacticalMatch(state, 0.025);
    source = restore(stepTacticalMatch(source, 0.025));
    expect(restore(state)).toEqual(source);
  }
  expect(stages).toEqual(new Set(['preparing', 'swinging', 'recovering', 'replanted']));
  expect(state.lastStrikeResolution).toMatchObject({ id: initialAction, outcome });
  if (outcome === 'contact') expect(state.lastStrikeResolution?.contact?.foot).toBe(foot);
  expect(maximumError).toBeLessThan(1e-10);
  resources.dispose();
});

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
