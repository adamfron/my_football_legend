import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../../../core/matchSimulation/matchSimulation';
import { StadiumModel, deriveStadiumConfiguration } from './stadium';
import { PlayerModelResources, PlayerModel } from './playerModel';
import { PresentationFrameProjector } from './frameProjection';
import { TechnicalAreaModel } from './technicalArea';
import { DEFAULT_KITS, tacticalFrameSchema } from './model';
import { derivePlayerPose } from './animation';

const world = createCanonicalWorldDatabase();
const session = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr170-cosmetic-invariance',
  control: { mode: 'spectator' },
});
describe('PR170 bounded atmosphere', () => {
  it('batches each archetype, keeps two geometry resources and varies audience colours', () => {
    for (const archetype of ['community', 'compact', 'bowl'] as const) {
      const config = deriveStadiumConfiguration(
        world.clubs.find(
          (club) => deriveStadiumConfiguration(club.id, DEFAULT_KITS.home).archetype === archetype,
        )!.id,
        DEFAULT_KITS.home,
      );
      const model = new StadiumModel(config),
        geometries = new Set(),
        meshes: THREE.Mesh[] = [];
      model.root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshes.push(object);
          geometries.add(object.geometry);
          expect(object.userData.decoration).toBe(true);
        }
      });
      expect(geometries.size).toBe(2);
      expect(meshes.length).toBeLessThanOrEqual(24);
      expect(meshes.every((mesh) => mesh instanceof THREE.InstancedMesh)).toBe(true);
      expect(model.crowdInstances).toBeLessThan(2500);
      const crowd = model.root.getObjectByName('static-crowd-silhouette') as THREE.InstancedMesh;
      expect(crowd.count).toBe(model.crowdInstances);
      expect(new Set(Array.from(crowd.instanceColor!.array)).size).toBeGreaterThan(6);
      const before = crowd.instanceMatrix.array.slice();
      const player = {
        id: 'real-scorer',
        team: 'home' as const,
        x: 20,
        y: 20,
        goalResponse: {
          goalId: 'confirmed-goal',
          role: 'scorer' as const,
          phase: 'celebration' as const,
          startedAtMs: 1000,
          reactionUntilMs: 3000,
        },
      };
      model.updateCrowd({ timestampMs: 999, players: [player], ball: { x: 50, y: 34 } });
      expect(crowd.instanceMatrix.array).toEqual(before);
      model.updateCrowd({ timestampMs: 1300, players: [player], ball: { x: 50, y: 34 } });
      const changed = Array.from(crowd.instanceMatrix.array).filter(
        (value, index) => value !== before[index],
      ).length;
      expect(changed).toBeGreaterThan(0);
      expect(changed).toBeLessThanOrEqual(96);
      model.updateCrowd({ timestampMs: 4000, players: [], ball: { x: 50, y: 34 } });
      expect(crowd.instanceMatrix.array).toEqual(before);
      model.dispose();
    }
  });
  it('projects only actual bench identities, removes active/staged people and keeps all decoration outside picking', () => {
    const state = createTacticalMatch(session),
      before = structuredClone(state),
      projector = new PresentationFrameProjector(session.presentation);
    const frame = projector.frame(state),
      ids = new Set(state.players.map((player) => player.id));
    expect(frame.technicalArea!.length).toBeGreaterThan(0);
    expect(frame.technicalArea!.every(({ player }) => !ids.has(player.id))).toBe(true);
    for (const { player } of frame.technicalArea!)
      expect(state.bench?.[player.team].some((entry) => entry.id === player.id)).toBe(true);
    expect(tacticalFrameSchema.safeParse(frame).success).toBe(true);
    const resources = new PlayerModelResources(),
      technical = new TechnicalAreaModel(resources.box, DEFAULT_KITS);
    technical.update(frame, true);
    const objects: THREE.Object3D[] = [];
    technical.root.traverse((object) => objects.push(object));
    expect(objects.every((object) => !object.userData.playerId)).toBe(true);
    expect(objects.filter((object) => object instanceof THREE.InstancedMesh)).toHaveLength(1);
    technical.update({ ...frame, technicalArea: [] }, true);
    expect((technical.root.children[0] as THREE.InstancedMesh).count).toBe(0);
    expect(state).toEqual(before);
    resources.dispose();
  });
  it('toggles faceted materials with stable face, bounded resources and a classic fallback', () => {
    const frame = new PresentationFrameProjector().frame(createTacticalMatch(session)),
      player = frame.players[0]!,
      resources = new PlayerModelResources();
    const model = new PlayerModel(player, DEFAULT_KITS.home, resources),
      before = structuredClone(model.head.userData.visualIdentity),
      color = player.goalkeeper ? DEFAULT_KITS.home.goalkeeper.primary : DEFAULT_KITS.home.primary;
    const material = resources.material(color),
      counts = resources.counts;
    resources.setShading('faceted');
    expect(material.flatShading).toBe(true);
    resources.setShading('classic');
    expect(material.flatShading).toBe(false);
    expect(model.head.userData.visualIdentity).toEqual(before);
    expect(resources.counts).toEqual(counts);
    resources.dispose();
  });
  it('replays identical full canonical state through minimal/standard, shading and cosmetic camera configurations', () => {
    const outputs: string[] = [];
    for (const detail of ['minimal', 'standard'] as const)
      for (const shading of ['classic', 'faceted'] as const)
        for (const camera of ['overview', 'overhead']) {
          let state = createTacticalMatch(session);
          state.playerAgencyEnabled = false;
          const stadium = new StadiumModel(
              deriveStadiumConfiguration(`${camera}-home`, DEFAULT_KITS.home),
              detail,
            ),
            resources = new PlayerModelResources(),
            projector = new PresentationFrameProjector();
          resources.setShading(shading);
          stadium.setCameraCutaway(camera === 'overview' ? 100 : 0, camera === 'overview' ? 80 : 0);
          for (let index = 0; index < 160; index++) {
            state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
            if (index % 4 === 0) {
              const before = JSON.stringify(state),
                frame = projector.frame(state);
              stadium.updateCrowd(frame);
              frame.players.forEach((player) => derivePlayerPose(player, frame.timestampMs));
              expect(JSON.stringify(state)).toBe(before);
            }
          }
          outputs.push(JSON.stringify(state));
          stadium.dispose();
          resources.dispose();
        }
    expect(new Set(outputs).size).toBe(1);
  });
});
