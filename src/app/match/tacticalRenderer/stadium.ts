import * as THREE from 'three';
import { z } from 'zod';
import { PITCH_LENGTH, PITCH_WIDTH, type KitPresentation } from './model';

export const stadiumDetailSchema = z.enum(['minimal', 'standard']);
export type StadiumDetail = z.infer<typeof stadiumDetailSchema>;
export const stadiumConfigurationSchema = z.object({
  identity: z.string(),
  archetype: z.enum(['community', 'compact', 'bowl']),
  tiers: z.number().int().min(3).max(8),
  coveredSides: z.number().int().min(1).max(4),
  openCorners: z.boolean(),
  seatColor: z.string(),
  trimColor: z.string(),
  crowdDensity: z.number().min(0).max(1),
  tunnelSide: z.enum(['north', 'south']),
  floodlights: z.enum(['corner', 'roof']),
  boardStyle: z.enum(['striped', 'solid']),
});
export type StadiumConfiguration = z.infer<typeof stadiumConfigurationSchema>;

/** Cosmetic identity hash, deliberately unrelated to the simulation seed or its RNG. */
export const stadiumIdentityHash = (identity: string) => {
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
};
export const deriveStadiumConfiguration = (
  homeClubId: string,
  kit: Pick<KitPresentation, 'primary' | 'accent'>,
): StadiumConfiguration => {
  const hash = stadiumIdentityHash(homeClubId);
  const archetype = (['community', 'compact', 'bowl'] as const)[hash % 3]!;
  return stadiumConfigurationSchema.parse({
    identity: homeClubId,
    archetype,
    tiers: archetype === 'community' ? 3 : archetype === 'compact' ? 5 : 7,
    coveredSides: archetype === 'community' ? 1 : archetype === 'compact' ? 2 : 4,
    openCorners: archetype !== 'bowl',
    seatColor: kit.primary,
    trimColor: kit.accent,
    crowdDensity: 0.46 + ((hash >>> 5) % 32) / 100,
    tunnelSide: hash & 16 ? 'north' : 'south',
    floodlights: archetype === 'bowl' ? 'roof' : 'corner',
    boardStyle: hash & 32 ? 'striped' : 'solid',
  });
};

/** Static modular scenery; no collider, model picking region or animated crowd. */
export class StadiumModel {
  readonly root = new THREE.Group();
  readonly detail = new THREE.Group();
  readonly configuration: StadiumConfiguration;
  readonly crowdInstances: number;
  private readonly resources: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };

  constructor(configuration: StadiumConfiguration, detail: StadiumDetail = 'standard') {
    this.configuration = stadiumConfigurationSchema.parse(configuration);
    this.root.name = 'cosmetic-stadium';
    this.root.userData.decoration = true;
    this.detail.name = 'optional-stadium-detail';
    this.root.add(this.detail);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
    const concrete = new THREE.MeshStandardMaterial({ color: 0x747e7b, roughness: 1 });
    const seats = new THREE.MeshStandardMaterial({
      color: configuration.seatColor,
      roughness: 0.9,
    });
    const trim = new THREE.MeshStandardMaterial({ color: configuration.trimColor, roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: 0xc7cec7, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x27342f, roughness: 1 });
    const crowdMaterial = new THREE.MeshBasicMaterial({ color: 0xe1d0b7 });
    this.resources = {
      geometries: [box, cylinder],
      materials: [concrete, seats, trim, roof, dark, crowdMaterial],
    };
    const block = (
      parent: THREE.Group,
      material: THREE.Material,
      size: [number, number, number],
      position: [number, number, number],
      geometry: THREE.BufferGeometry = box,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(...size);
      mesh.position.set(...position);
      mesh.userData.decoration = true;
      parent.add(mesh);
      return mesh;
    };
    // All scenery remains beyond the real 105 × 68 m painted pitch.
    block(this.root, dark, [PITCH_LENGTH + 30, 0.05, PITCH_WIDTH + 30], [0, -0.04, 0]);
    const crowd: [number, number, number][] = [];
    const tierDepth = 1.75;
    for (let side = 0; side < 4; side++) {
      const alongX = side < 2;
      const sign = side % 2 === 0 ? 1 : -1;
      const length = alongX ? PITCH_LENGTH + 4 : PITCH_WIDTH + 4;
      const edge = (alongX ? PITCH_WIDTH : PITCH_LENGTH) / 2 + 8;
      for (let tier = 0; tier < configuration.tiers; tier++) {
        const distance = edge + tier * tierDepth;
        const height = 0.7 + tier * 0.8;
        const position: [number, number, number] = alongX
          ? [0, height / 2, sign * distance]
          : [sign * distance, height / 2, 0];
        block(
          this.root,
          concrete,
          alongX ? [length, height, tierDepth] : [tierDepth, height, length],
          position,
        );
        block(
          this.detail,
          seats,
          alongX ? [length, 0.1, 0.6] : [0.6, 0.1, length],
          alongX ? [0, height + 0.05, sign * distance] : [sign * distance, height + 0.05, 0],
        );
        for (let index = 0; index < Math.floor(length / 1.1); index++) {
          const sample =
            stadiumIdentityHash(`${configuration.identity}:${side}:${tier}:${index}`) / 0xffffffff;
          if (sample > configuration.crowdDensity) continue;
          const along = -length / 2 + index * 1.1 + 0.6;
          crowd.push(
            alongX
              ? [along, height + 0.48, sign * distance]
              : [sign * distance, height + 0.48, along],
          );
        }
      }
      if (side < configuration.coveredSides) {
        const y = configuration.tiers * 0.8 + 2.7;
        const distance = edge + ((configuration.tiers - 1) * tierDepth) / 2;
        const canopy = block(
          this.detail,
          roof,
          alongX
            ? [length + 2, 0.18, configuration.tiers * tierDepth + 3]
            : [configuration.tiers * tierDepth + 3, 0.18, length + 2],
          alongX ? [0, y, sign * distance] : [sign * distance, y, 0],
        );
        // Small roof rise is architecture only, never a source of camera cuts.
        if (alongX) canopy.rotation.x = sign * 0.1;
        else canopy.rotation.z = -sign * 0.1;
        for (const along of [-length / 2 + 3, length / 2 - 3])
          block(
            this.detail,
            trim,
            [0.22, y, 0.22],
            alongX ? [along, y / 2, sign * (distance + 3)] : [sign * (distance + 3), y / 2, along],
          );
      }
      // Flat perimeter boards leave the sidelines and touchline picking available.
      for (let index = 0; index < 8; index++) {
        const along = -length / 2 + ((index + 0.5) * length) / 8;
        block(
          this.root,
          configuration.boardStyle === 'striped' && index % 2 ? seats : trim,
          alongX ? [length / 8 - 0.2, 0.65, 0.12] : [0.12, 0.65, length / 8 - 0.2],
          alongX ? [along, 0.33, sign * (edge - 3)] : [sign * (edge - 3), 0.33, along],
        );
      }
    }
    if (!configuration.openCorners)
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          block(
            this.root,
            concrete,
            [8, configuration.tiers * 0.55, 8],
            [x * 61, configuration.tiers * 0.275, z * 43],
          );
    const tunnelZ = (configuration.tunnelSide === 'south' ? 1 : -1) * (PITCH_WIDTH / 2 + 8);
    block(this.root, dark, [4.2, 2.6, 5], [0, 1.3, tunnelZ]);
    // Canonical substitutes stage at the north touchline (y < 0).
    // Benches and technical areas are ground-level and stay outside the playing area.
    for (const x of [-12, 12]) {
      block(this.root, trim, [6, 0.35, 0.65], [x, 0.4, -PITCH_WIDTH / 2 - 4]);
      block(this.detail, roof, [6.5, 0.12, 2.2], [x, 2.1, -PITCH_WIDTH / 2 - 4]);
      block(this.root, roof, [8, 0.03, 0.08], [x, 0.04, -PITCH_WIDTH / 2 - 1.5]);
    }
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const poleHeight =
          configuration.floodlights === 'corner' ? 17 : configuration.tiers * 0.8 + 5;
        block(
          this.detail,
          concrete,
          [0.16, poleHeight, 0.16],
          [x * 64, poleHeight / 2, z * 46],
          cylinder,
        );
        block(this.detail, roof, [2.8, 0.65, 0.45], [x * 64, poleHeight, z * 46]);
      }
    this.crowdInstances = crowd.length;
    const people = new THREE.InstancedMesh(box, crowdMaterial, crowd.length);
    people.name = 'static-crowd-silhouette';
    people.userData.decoration = true;
    const transform = new THREE.Object3D();
    crowd.forEach((position, index) => {
      transform.position.set(...position);
      transform.scale.set(0.36, 0.65, 0.25);
      transform.updateMatrix();
      people.setMatrixAt(index, transform.matrix);
    });
    this.detail.add(people);
    this.setDetail(detail);
  }

  setDetail(detail: StadiumDetail) {
    this.detail.visible = detail === 'standard';
  }

  /** Used when replacing scenery. Renderer disposal otherwise collects shared resources once. */
  dispose() {
    this.resources.geometries.forEach((geometry) => geometry.dispose());
    this.resources.materials.forEach((material) => material.dispose());
  }
}
