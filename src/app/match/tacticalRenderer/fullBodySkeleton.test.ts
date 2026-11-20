// @vitest-environment node
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createPr224PassScene, selectPr224Body } from '../../../../scripts/pr224Scenarios';
import { withFullBodySkeleton } from '../../../core/matchSimulation/fullBodySkeleton';
import { defaultBodyMorphology } from '../../../core/matchSimulation/bodyMorphology';
import { captureReplaySnapshot } from '../../../core/matchSimulation/matchReplay';
import { stepTacticalMatch } from '../../../core/matchSimulation/matchSimulation';
import { PlayerModel, PlayerModelResources } from './playerModel';
import { replaySnapshotToFrame, interpolatePresentationFrames } from './replay';
import { DEFAULT_KITS } from './model';

it.each(['ordinary', 'weak-foot', 'turn', 'advance', 'miss'] as const)(
  'matches all segment world transforms throughout %s and seeking',
  (name) => {
    let state = withFullBodySkeleton(selectPr224Body(createPr224PassScene(name).selected));
    const actorId = state.pendingStrike!.actorId;
    const first = replaySnapshotToFrame(captureReplaySnapshot(state, 0));
    const resources = new PlayerModelResources(),
      rig = new PlayerModel(
        first.players.find((p) => p.id === actorId)!,
        DEFAULT_KITS.home,
        resources,
      );
    let previous = first;
    for (let i = 0; i < 32; i++) {
      const current = replaySnapshotToFrame(captureReplaySnapshot(state, 0));
      const p = current.players.find((p) => p.id === actorId)!;
      rig.root.position.set(p.x - 52.5, 0, p.y - 34);
      rig.root.rotation.y = p.facing ?? 0;
      rig.update(p, current.timestampMs);
      rig.root.updateWorldMatrix(true, true);
      for (const s of p.fullBodySkeleton!.segments) {
        const node = rig.canonicalSegments.get(s.id)!,
          world = node.getWorldPosition(new THREE.Vector3());
        expect(
          world.distanceTo(
            new THREE.Vector3(
              s.world.position.x - 52.5,
              s.world.position.z,
              s.world.position.y - 34,
            ),
          ),
        ).toBeLessThan(1e-10);
        const q = s.world.rotation;
        expect(
          Math.abs(
            node
              .getWorldQuaternion(new THREE.Quaternion())
              .dot(new THREE.Quaternion(-q.x, -q.z, -q.y, q.w)),
          ),
        ).toBeCloseTo(1, 11);
      }
      for (const [side, node] of [
        ['left', rig.leftBootContact],
        ['right', rig.rightBootContact],
      ] as const) {
        const a = p.fullBodySkeleton!.feet[side].bootContact;
        expect(
          node
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(new THREE.Vector3(a.x - 52.5, a.z, a.y - 34)),
        ).toBeLessThan(1e-10);
      }
      const held = interpolatePresentationFrames(
        previous,
        current,
        (previous.timestampMs + current.timestampMs) / 2,
      );
      if (i) expect(held.players).toEqual(previous.players);
      previous = current;
      state = stepTacticalMatch(state, 0.025);
    }
    resources.dispose();
  },
);

it('uses individual upper proportions and restores the historical rig without accumulated transforms', () => {
  const old = selectPr224Body(createPr224PassScene('ordinary').selected),
    m = defaultBodyMorphology();
  const id = old.players[0]!.id;
  m.left.upperArm = 0.14;
  m.right.upperArm = 0.2;
  m.shoulderWidth = 0.32;
  const state = withFullBodySkeleton(old, { [id]: m }),
    full = replaySnapshotToFrame(captureReplaySnapshot(state, 0)).players[0]!;
  const legacy = replaySnapshotToFrame(captureReplaySnapshot(old, 0)).players[0]!;
  const resources = new PlayerModelResources(),
    rig = new PlayerModel(full, DEFAULT_KITS.home, resources),
    control = new PlayerModel(legacy, DEFAULT_KITS.home, resources);
  for (const model of [rig, control]) {
    model.root.position.set(full.x - 52.5, 0, full.y - 34);
    model.root.rotation.y = full.facing ?? 0;
  }
  rig.update(full, 0);
  rig.update(legacy, 0);
  control.update(legacy, 0);
  for (const key of [
    'torso',
    'head',
    'leftArm',
    'rightArm',
    'leftElbow',
    'rightElbow',
    'leftHand',
    'rightHand',
    'leftBootContact',
    'rightBootContact',
  ] as const)
    expect(
      rig[key]
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(control[key].getWorldPosition(new THREE.Vector3())),
    ).toBeLessThan(1e-10);
  resources.dispose();
});
