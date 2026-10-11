import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVisualIdentity, deriveAppearance } from '../../../core/visualIdentity';
import { createPreviewModel } from '../../appearance/previewScene';
import { visualGalleryEntries } from '../../appearance/galleryExamples';
import { DEFAULT_KITS } from './model';
import { PlayerModel, PlayerModelResources } from './playerModel';

const profile = {
  id: 'recognisable-player',
  dateOfBirth: '2000-04-14',
  heightCm: 184,
  weightKg: 80,
  visualIdentity: createVisualIdentity('recognisable-player', undefined, {
    hairstyle: 'side_part',
  }),
};
const player = (appearance = deriveAppearance(profile, '2026-07-01')) => ({
  id: profile.id,
  team: 'home' as const,
  x: 42,
  y: 30,
  heightCm: profile.heightCm,
  weightKg: profile.weightKg,
  appearance,
});
const anatomy = (head: THREE.Group) =>
  head.children
    .filter((part) => ['cranium', 'jaw', 'chin', 'nose', 'mouth'].includes(part.name))
    .map((part) => ({
      name: part.name,
      scale: part.scale.toArray(),
      position: part.position.toArray(),
    }));

describe('shared visual DNA model', () => {
  it('portrait and pitch model use identical facial morphology and cosmetic configuration', () => {
    const appearance = deriveAppearance(profile, '2026-07-01');
    const resources = new PlayerModelResources();
    const pitch = new PlayerModel(player(appearance), DEFAULT_KITS.home, resources);
    const portrait = createPreviewModel(appearance, resources);
    expect(portrait.head.userData.visualIdentity).toEqual(pitch.head.userData.visualIdentity);
    expect(anatomy(portrait.head)).toEqual(anatomy(pitch.head));
    expect(pitch.head.getObjectByName('iris--1')).toBeDefined();
    expect(pitch.head.getObjectByName('side-part-fringe')).toBeDefined();
    resources.dispose();
  });

  it('haircut changes the visible hair without changing face bones, body dimensions or picker', () => {
    const resources = new PlayerModelResources();
    const before = new PlayerModel(player(), DEFAULT_KITS.home, resources);
    const after = new PlayerModel(
      player(deriveAppearance(profile, '2026-07-01', { hairstyle: 'long' })),
      DEFAULT_KITS.home,
      resources,
    );
    expect(anatomy(after.head)).toEqual(anatomy(before.head));
    expect(after.head.getObjectByName('long-hair-back')).toBeDefined();
    expect(after.head.getObjectByName('side-part-fringe')).toBeUndefined();
    expect(after.body.scale).toEqual(before.body.scale);
    expect(after.picker.geometry).toBe(before.picker.geometry);
    expect(after.leftHand.position).toEqual(before.leftHand.position);
    resources.dispose();
  });

  it('manual facial proportions affect real geometry and retain unrelated features', () => {
    const resources = new PlayerModelResources();
    const original = deriveAppearance(profile, '2026-07-01');
    const narrow = new PlayerModel(
      player(
        deriveAppearance(
          {
            ...profile,
            visualIdentity: {
              ...profile.visualIdentity,
              faceGenome: { ...original.baseFace, jawWidth: 0, noseWidth: 0 },
            },
          },
          '2026-07-01',
        ),
      ),
      DEFAULT_KITS.home,
      resources,
    );
    const wide = new PlayerModel(
      player(
        deriveAppearance(
          {
            ...profile,
            visualIdentity: {
              ...profile.visualIdentity,
              faceGenome: { ...original.baseFace, jawWidth: 1, noseWidth: 1 },
            },
          },
          '2026-07-01',
        ),
      ),
      DEFAULT_KITS.home,
      resources,
    );
    expect(wide.head.getObjectByName('jaw')!.scale.x).toBeGreaterThan(
      narrow.head.getObjectByName('jaw')!.scale.x,
    );
    expect(wide.head.getObjectByName('nose')!.scale.x).toBeGreaterThan(
      narrow.head.getObjectByName('nose')!.scale.x,
    );
    expect(wide.head.getObjectByName('iris-1')!.position).toEqual(
      narrow.head.getObjectByName('iris-1')!.position,
    );
    resources.dispose();
  });

  it('canonical height and weight affect the visible silhouette while presentation keeps skeletal contact joints', () => {
    const resources = new PlayerModelResources();
    const small = createPreviewModel(
      deriveAppearance({ ...profile, heightCm: 163, weightKg: 57 }, '2026-07-01'),
      resources,
    );
    const large = createPreviewModel(
      deriveAppearance({ ...profile, heightCm: 197, weightKg: 94 }, '2026-07-01'),
      resources,
    );
    expect(large.body.scale.y).toBeGreaterThan(small.body.scale.y);
    expect(large.body.scale.x).toBeGreaterThan(small.body.scale.x);
    const feminine = createPreviewModel(
      deriveAppearance(profile, '2026-07-01', { presentation: 'feminine' }),
      resources,
    );
    const masculine = createPreviewModel(
      deriveAppearance(profile, '2026-07-01', { presentation: 'masculine' }),
      resources,
    );
    expect(feminine.body.scale).toEqual(masculine.body.scale);
    for (const joint of [
      'leftHip',
      'rightHip',
      'leftArm',
      'rightArm',
      'leftHand',
      'rightHand',
    ] as const)
      expect(feminine[joint].position).toEqual(masculine[joint].position);
    expect(feminine.picker.geometry).toBe(masculine.picker.geometry);
    resources.dispose();
  });

  it('constructing and posing does not write to a frozen projection and resources stay bounded', () => {
    const resources = new PlayerModelResources();
    const projected = player();
    const freeze = (value: object) => {
      Object.values(value).forEach((part) => {
        if (part && typeof part === 'object') freeze(part);
      });
      Object.freeze(value);
    };
    freeze(projected);
    const snapshot = JSON.stringify(projected);
    const model = new PlayerModel(projected, DEFAULT_KITS.home, resources);
    model.update(projected, 600);
    expect(JSON.stringify(projected)).toBe(snapshot);
    for (let index = 0; index < 1000; index++) {
      createPreviewModel(
        deriveAppearance({ id: `npc-${index}`, age: 16 + (index % 60) }, '2026-07-01'),
        resources,
      );
      resources.material(index * 997);
    }
    expect(resources.counts.geometries).toBe(4);
    expect(resources.counts.materials).toBeLessThanOrEqual(PlayerModelResources.MAX_MATERIALS + 1);
    const geometryDispose = vi.spyOn(resources.sphere, 'dispose');
    const materialDispose = vi.spyOn(resources.material('#ffffff'), 'dispose');
    resources.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(resources.counts.materials).toBe(1);
  });

  it('acceptance gallery contains the same aging identity, hair edit, unrelated NPCs and body styles', () => {
    const entries = visualGalleryEntries();
    const base = entries[0]!.appearance;
    for (const index of [1, 2, 3, 4, 7, 8, 9, 10, 11])
      expect(entries[index]!.appearance.baseFace).toEqual(base.baseFace);
    expect(entries[3]!.appearance.greyFraction).toBeGreaterThan(base.greyFraction);
    expect(entries[4]!.appearance.cosmetics.hairstyle).not.toBe(
      entries[1]!.appearance.cosmetics.hairstyle,
    );
    expect(entries[5]!.appearance.baseFace).not.toEqual(entries[6]!.appearance.baseFace);
    expect(entries[7]!.appearance.heightCm).toBeLessThan(entries[8]!.appearance.heightCm);
    expect(entries[9]!.appearance.cosmetics.presentation).toBe('masculine');
    expect(entries[10]!.appearance.cosmetics.presentation).toBe('feminine');
  });
});
