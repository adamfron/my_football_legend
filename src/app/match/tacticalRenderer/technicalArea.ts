import * as THREE from 'three';
import type { KitPresentation, TacticalFrame } from './model';
import { appearanceColors } from './faceModel';

/** Real roster only; a bounded instanced seated silhouette, never a football picker. */
export class TechnicalAreaModel {
  readonly root = new THREE.Group();
  private readonly people: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private signature = '';
  constructor(
    geometry: THREE.BufferGeometry,
    private readonly kits: Record<'home' | 'away', KitPresentation>,
  ) {
    this.root.name = 'technical-area-participants';
    this.root.userData.decoration = true;
    this.people = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      30 * 6,
    );
    this.people.count = 0;
    this.people.userData.decoration = true;
    this.people.frustumCulled = false;
    this.root.add(this.people);
  }
  update(frame: TacticalFrame, visible: boolean) {
    this.root.visible = visible;
    if (!visible) return;
    const roster = frame.technicalArea ?? [];
    const signature = roster
      .map(({ player, status }) => `${player.id}:${status}:${player.appearance?.identityId}`)
      .join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.userData.roster = roster.map(({ player, status }) => ({ id: player.id, status }));
    let index = 0;
    for (const { player, status } of roster) {
      const kit = this.kits[player.team],
        colors = player.appearance
          ? appearanceColors(player.appearance)
          : { skin: 0xbc815d, hair: 0x30221b };
      const x = player.x - 52.5,
        z = player.y - 34;
      const part = (
        color: string | number,
        size: [number, number, number],
        offset: [number, number, number],
      ) => {
        this.transform.position.set(x + offset[0], offset[1], z + offset[2]);
        this.transform.scale.set(...size);
        this.transform.updateMatrix();
        this.people.setMatrixAt(index, this.transform.matrix);
        this.people.setColorAt(index, this.color.set(color));
        index++;
      };
      part(
        status === 'departed'
          ? kit.accent
          : player.goalkeeper
            ? kit.goalkeeper.primary
            : kit.primary,
        [0.38, 0.48, 0.24],
        [0, 0.95, 0],
      );
      part(colors.skin, [0.26, 0.29, 0.25], [0, 1.36, 0]);
      part(colors.hair, [0.27, 0.09, 0.26], [0, 1.5, -0.015]);
      part(kit.shorts, [0.4, 0.18, 0.5], [0, 0.64, 0.15]);
      part(kit.socks, [0.12, 0.42, 0.14], [-0.12, 0.34, 0.32]);
      part(kit.socks, [0.12, 0.42, 0.14], [0.12, 0.34, 0.32]);
    }
    this.people.count = index;
    this.people.instanceMatrix.needsUpdate = true;
    if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
  }
}
