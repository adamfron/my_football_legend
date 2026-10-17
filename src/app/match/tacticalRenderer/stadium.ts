import * as THREE from 'three';
import { z } from 'zod';
import { PITCH_LENGTH, PITCH_WIDTH, type KitPresentation, type TacticalFrame } from './model';

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

/** Static modular scenery and bounded cosmetic crowd reactions; no collider or picking region. */
export class StadiumModel {
  readonly root = new THREE.Group();
  readonly detail = new THREE.Group();
  readonly configuration: StadiumConfiguration;
  readonly crowdInstances: number;
  private readonly crowdBodies: THREE.InstancedMesh;
  private readonly crowdHeads: THREE.InstancedMesh;
  private readonly crowdPositions: [number, number, number][];
  private readonly crowdScales: number[] = [];
  private readonly reactionIndices: number[] = [];
  private readonly crowdTransform = new THREE.Object3D();
  private lastCrowdStep = -1;
  private crowdReacting = false;
  private readonly canopies: { side: number; mesh: THREE.InstancedMesh }[] = [];
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
    const crowdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
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
      const length =
        (alongX ? PITCH_LENGTH + 4 : PITCH_WIDTH + 4) *
        (configuration.archetype === 'community' && side > 0 ? 0.68 : 1);
      const tiers =
        configuration.archetype === 'community'
          ? side === 0
            ? configuration.tiers
            : 1
          : configuration.archetype === 'compact'
            ? configuration.tiers - (side > 1 ? 2 : side)
            : configuration.tiers - (alongX ? 0 : 1);
      const edge = (alongX ? PITCH_WIDTH : PITCH_LENGTH) / 2 + 8;
      for (let tier = 0; tier < tiers; tier++) {
        const distance = edge + tier * tierDepth;
        const height = 0.7 + tier * 0.8;
        const position: [number, number, number] = alongX
          ? [0, height / 2, sign * distance]
          : [sign * distance, height / 2, 0];
        const seating = block(
          this.root,
          concrete,
          alongX ? [length, height, tierDepth] : [tierDepth, height, length],
          position,
        );
        seating.name = `stand-${side}-tier-${tier}`;
        block(
          this.detail,
          seats,
          alongX ? [length, 0.1, 0.6] : [0.6, 0.1, length],
          alongX ? [0, height + 0.05, sign * distance] : [sign * distance, height + 0.05, 0],
        );
        // Section breaks and contrasting aisles remain visible from the tactical camera.
        for (let section = 0; section < 5; section++) {
          const along = -length / 2 + ((section + 0.5) * length) / 5;
          block(
            this.detail,
            section % 2 ? trim : seats,
            alongX ? [length / 5 - 1.5, 0.18, 0.55] : [0.55, 0.18, length / 5 - 1.5],
            alongX
              ? [along, height + 0.17, sign * (distance + 0.4)]
              : [sign * (distance + 0.4), height + 0.17, along],
          );
        }
        for (let index = 0; index < Math.floor(length / 1.1); index++) {
          const sample =
            stadiumIdentityHash(`${configuration.identity}:${side}:${tier}:${index}`) / 0xffffffff;
          if (sample > configuration.crowdDensity) continue;
          const along = -length / 2 + index * 1.1 + 0.6;
          if ((along + length / 2) % (length / 5) < 1.5) continue;
          crowd.push(
            alongX
              ? [along, height + 0.48, sign * distance]
              : [sign * distance, height + 0.48, along],
          );
        }
      }
      if (side < configuration.coveredSides) {
        const y = tiers * 0.8 + 2.7;
        const distance = edge + ((tiers - 1) * tierDepth) / 2;
        const canopy = block(
          this.detail,
          roof,
          alongX
            ? [length + 2, 0.18, tiers * tierDepth + 3]
            : [tiers * tierDepth + 3, 0.18, length + 2],
          alongX ? [0, y, sign * distance] : [sign * distance, y, 0],
        );
        canopy.userData.roofSide = side;
        // Small roof rise is architecture only, never a source of camera cuts.
        if (alongX) canopy.rotation.x = sign * 0.1;
        else canopy.rotation.z = -sign * 0.1;
        block(
          this.detail,
          trim,
          alongX ? [length + 2, 0.5, 0.24] : [0.24, 0.5, length + 2],
          alongX ? [0, y - 0.2, sign * (edge - 1.4)] : [sign * (edge - 1.4), y - 0.2, 0],
        );
        for (const along of [-length * 0.3, 0, length * 0.3]) {
          const brace = block(
            this.detail,
            dark,
            [0.14, 1.8, 0.14],
            alongX
              ? [along, y - 0.9, sign * (distance + 2.7)]
              : [sign * (distance + 2.7), y - 0.9, along],
          );
          if (alongX) brace.rotation.x = sign * 0.5;
          else brace.rotation.z = -sign * 0.5;
        }
        for (const along of [-length / 2 + 3, length / 2 - 3])
          block(
            this.detail,
            trim,
            [0.22, y, 0.22],
            alongX ? [along, y / 2, sign * (distance + 3)] : [sign * (distance + 3), y / 2, along],
          );
      }
      // Club-coloured supporter banners, no real commercial branding or texture downloads.
      for (const along of [-length * 0.3, length * 0.3]) {
        block(
          this.detail,
          seats,
          alongX ? [8, 0.9, 0.1] : [0.1, 0.9, 8],
          alongX ? [along, 1.3, sign * (edge - 1)] : [sign * (edge - 1), 1.3, along],
        );
        block(
          this.detail,
          trim,
          alongX ? [6, 0.16, 0.12] : [0.12, 0.16, 6],
          alongX ? [along, 1.3, sign * (edge - 1.1)] : [sign * (edge - 1.1), 1.3, along],
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
    for (const x of [-2.3, 2.3]) block(this.detail, trim, [0.3, 3, 5.4], [x, 1.5, tunnelZ]);
    block(this.detail, roof, [4.9, 0.3, 5.4], [0, 3, tunnelZ]);
    // Canonical substitutes stage at the north touchline (y < 0).
    // Benches and technical areas are ground-level and stay outside the playing area.
    for (const x of [-12, 12]) {
      block(this.root, trim, [6, 0.35, 0.65], [x, 0.4, -PITCH_WIDTH / 2 - 4]);
      block(this.detail, roof, [6.5, 0.12, 2.2], [x, 2.1, -PITCH_WIDTH / 2 - 4]);
      block(this.root, roof, [8, 0.03, 0.08], [x, 0.04, -PITCH_WIDTH / 2 - 1.5]);
      block(this.detail, dark, [6.3, 1.6, 0.12], [x, 1.05, -PITCH_WIDTH / 2 - 4.9]);
      for (const end of [-1, 1]) {
        block(this.detail, trim, [0.12, 1.8, 1.9], [x + end * 3.15, 1.15, -PITCH_WIDTH / 2 - 4]);
        block(this.root, roof, [0.08, 0.03, 2.6], [x + end * 4, 0.04, -PITCH_WIDTH / 2 - 2.8]);
      }
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
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        block(
          this.root,
          roof,
          [0.035, 1.45, 0.035],
          [x * (PITCH_LENGTH / 2 + 0.2), 0.73, z * (PITCH_WIDTH / 2 + 0.2)],
          cylinder,
        );
        block(
          this.root,
          trim,
          [0.34, 0.24, 0.025],
          [x * (PITCH_LENGTH / 2 + 0.2) + 0.16, 1.38, z * (PITCH_WIDTH / 2 + 0.2)],
        );
      }
    this.crowdInstances = crowd.length;
    const people = new THREE.InstancedMesh(box, crowdMaterial, crowd.length);
    const heads = new THREE.InstancedMesh(box, crowdMaterial, crowd.length);
    this.crowdBodies = people;
    this.crowdHeads = heads;
    this.crowdPositions = crowd;
    people.name = 'static-crowd-silhouette';
    people.userData.decoration = true;
    heads.name = 'crowd-heads';
    heads.userData.decoration = true;
    const transform = new THREE.Object3D();
    crowd.forEach((position, index) => {
      const hash = stadiumIdentityHash(
        `${configuration.identity}:clothing:${Math.floor(index / 3)}`,
      );
      const palette = [
        configuration.seatColor,
        configuration.trimColor,
        '#be8263',
        '#455c71',
        '#ded5c2',
        '#798b74',
        '#343a44',
      ];
      people.setColorAt(index, new THREE.Color(palette[hash % palette.length]));
      heads.setColorAt(index, new THREE.Color(['#e8ba90', '#bc815d', '#714630'][hash % 3]));
      const scale = hash & 16 ? 0.55 : 0.7;
      this.crowdScales.push(scale);
      if (index % 19 === 0 && this.reactionIndices.length < 96) this.reactionIndices.push(index);
      transform.position.set(...position);
      transform.scale.set(0.36, scale, 0.25);
      transform.updateMatrix();
      people.setMatrixAt(index, transform.matrix);
      transform.position.y += scale / 2 + 0.12;
      transform.scale.set(0.21, 0.23, 0.21);
      transform.updateMatrix();
      heads.setMatrixAt(index, transform.matrix);
    });
    this.detail.add(people, heads);
    // Static modular pieces are built once, then batched by the existing two geometries/materials.
    for (const parent of [this.root, this.detail]) {
      const batches = new Map<string, THREE.Mesh[]>();
      for (const child of [...parent.children]) {
        if (
          !(child instanceof THREE.Mesh) ||
          child instanceof THREE.InstancedMesh ||
          Array.isArray(child.material)
        )
          continue;
        const key = `${child.geometry.uuid}:${child.material.uuid}:${child.userData.roofSide ?? ''}`;
        batches.set(key, [...(batches.get(key) ?? []), child]);
      }
      for (const pieces of batches.values()) {
        const batched = new THREE.InstancedMesh(
          pieces[0]!.geometry,
          pieces[0]!.material,
          pieces.length,
        );
        batched.userData.decoration = true;
        batched.name = 'static-stadium-modules';
        if (pieces[0]!.userData.roofSide !== undefined)
          this.canopies.push({ side: Number(pieces[0]!.userData.roofSide), mesh: batched });
        pieces.forEach((piece, index) => {
          piece.updateMatrix();
          batched.setMatrixAt(index, piece.matrix);
          parent.remove(piece);
        });
        parent.add(batched);
      }
    }
    this.setDetail(detail);
  }

  setDetail(detail: StadiumDetail) {
    this.detail.visible = detail === 'standard';
  }

  /** Cut away only the near roof sheets, so architecture never hides the football. */
  setCameraCutaway(x: number, z: number) {
    for (const { side, mesh } of this.canopies) {
      const sign = side % 2 === 0 ? 1 : -1;
      mesh.visible = (side < 2 ? z : x) * sign <= 0.1;
    }
  }

  /** At most 96 scattered supporters, 10 Hz, only after a confirmed projected goal. */
  updateCrowd(frame: TacticalFrame) {
    if (!this.detail.visible) return;
    const response = frame.players.find(
      (player) =>
        player.goalResponse?.role === 'scorer' && player.goalResponse.phase === 'celebration',
    )?.goalResponse;
    const elapsed = response ? frame.timestampMs - response.startedAtMs : -1;
    const reacting = elapsed >= 0 && elapsed < 2600;
    const step = Math.floor(frame.timestampMs / 100);
    if ((!reacting && !this.crowdReacting) || (reacting && step === this.lastCrowdStep)) return;
    this.lastCrowdStep = step;
    this.crowdReacting = reacting;
    for (const index of this.reactionIndices) {
      const position = this.crowdPositions[index]!,
        scale = this.crowdScales[index]!;
      const lift = reacting ? Math.max(0, Math.sin(elapsed * 0.006 + index * 1.7)) * 0.22 : 0;
      const transform = this.crowdTransform;
      transform.position.set(position[0], position[1] + lift, position[2]);
      transform.scale.set(0.36, scale, 0.25);
      transform.updateMatrix();
      this.crowdBodies.setMatrixAt(index, transform.matrix);
      transform.position.y += scale / 2 + 0.12;
      transform.scale.set(0.21, 0.23, 0.21);
      transform.updateMatrix();
      this.crowdHeads.setMatrixAt(index, transform.matrix);
    }
    this.crowdBodies.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
  }

  /** Used when replacing scenery. Renderer disposal otherwise collects shared resources once. */
  dispose() {
    this.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.resources.geometries.forEach((geometry) => geometry.dispose());
    this.resources.materials.forEach((material) => material.dispose());
  }
}
