import * as THREE from 'three';
import { createPlayerPose, derivePlayerPose, projectBodyDimensions } from './animation';
import { derivePlayerAppearance, type KitPresentation, type TacticalPlayer } from './model';

/** Per-renderer shared GPU resources; no geometry or material allocation during posing. */
export class PlayerModelResources {
  readonly box = new THREE.BoxGeometry(1, 1, 1);
  readonly sphere = new THREE.SphereGeometry(1, 8, 6);
  readonly cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  readonly picker = new THREE.CylinderGeometry(0.85, 0.95, 2.8, 8);
  readonly pickerMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  private materials = new Map<string | number, THREE.MeshStandardMaterial>();
  material(color: string | number) {
    let material = this.materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      this.materials.set(color, material);
    }
    return material;
  }
}

/** Transform-only articulated rig. Root/picker are independent of every animated body joint. */
export class PlayerModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly leftHip = new THREE.Group();
  readonly rightHip = new THREE.Group();
  readonly leftKnee = new THREE.Group();
  readonly rightKnee = new THREE.Group();
  readonly leftArm = new THREE.Group();
  readonly rightArm = new THREE.Group();
  readonly leftElbow = new THREE.Group();
  readonly rightElbow = new THREE.Group();
  readonly leftHand = new THREE.Object3D();
  readonly rightHand = new THREE.Object3D();
  readonly picker: THREE.Mesh;
  private readonly pose = createPlayerPose();

  constructor(player: TacticalPlayer, kit: KitPresentation, resources: PlayerModelResources) {
    const dimensions = projectBodyDimensions(player);
    const appearance = derivePlayerAppearance(player.id);
    this.root.userData.playerId = player.id;
    this.body.scale.set(dimensions.width, dimensions.height / 1.8, dimensions.width);
    this.root.add(this.body);
    const mesh = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      color: string | number,
      size: [number, number, number],
      position: [number, number, number],
    ) => {
      const result = new THREE.Mesh(geometry, resources.material(color));
      result.scale.set(...size);
      result.position.set(...position);
      parent.add(result);
      return result;
    };
    const shirt = player.goalkeeper ? kit.goalkeeper.primary : kit.primary;
    const trim = player.goalkeeper ? kit.goalkeeper.accent : kit.secondary;
    this.torso.position.y = 0.9;
    this.body.add(this.torso);
    mesh(this.torso, resources.cylinder, shirt, [0.255, 0.54, 0.17], [0, 0.31, 0]);
    // Small shoulder panels and collar keep solid canonical kits readable too.
    mesh(this.torso, resources.box, trim, [0.13, 0.11, 0.29], [-0.22, 0.52, 0]);
    mesh(this.torso, resources.box, trim, [0.13, 0.11, 0.29], [0.22, 0.52, 0]);
    mesh(this.torso, resources.box, trim, [0.16, 0.04, 0.27], [0, 0.59, 0]);
    const panel = (w: number, h: number, x: number, y: number, angle = 0) => {
      const patch = mesh(this.torso, resources.box, trim, [w, h, 0.012], [x, y, 0.174]);
      patch.rotation.z = angle;
    };
    if (!player.goalkeeper) {
      if (kit.pattern === 'vertical_stripes')
        for (const x of [-0.15, 0, 0.15]) panel(0.065, 0.46, x, 0.31);
      if (kit.pattern === 'halves') panel(0.21, 0.46, -0.105, 0.31);
      if (kit.pattern === 'hoops') for (const y of [0.17, 0.32, 0.47]) panel(0.42, 0.055, 0, y);
      if (kit.pattern === 'sash') panel(0.08, 0.54, 0, 0.31, -0.6);
    }
    mesh(
      this.body,
      resources.box,
      player.goalkeeper ? shirt : kit.shorts,
      [0.43, 0.22, 0.3],
      [0, 0.88, 0],
    );
    this.head.position.y = 0.7;
    this.torso.add(this.head);
    mesh(this.head, resources.sphere, appearance.skinColor, [0.16, 0.19, 0.155], [0, 0, 0]);
    const face = mesh(
      this.head,
      resources.box,
      appearance.skinColor,
      [0.065, 0.07, 0.07],
      [0, -0.005, 0.16],
    );
    face.userData.orientationFeature = 'local_forward_face';
    if (appearance.hairStyle !== 'bald') {
      const hair = mesh(
        this.head,
        resources.sphere,
        appearance.hairColor,
        [0.164, appearance.hairStyle === 'buzz' ? 0.05 : 0.085, 0.155],
        [0, 0.145, -0.01],
      );
      hair.userData.hairStyle = appearance.hairStyle;
    }
    for (const [hip, knee, arm, elbow, hand, side] of [
      [this.leftHip, this.leftKnee, this.leftArm, this.leftElbow, this.leftHand, -1],
      [this.rightHip, this.rightKnee, this.rightArm, this.rightElbow, this.rightHand, 1],
    ] as const) {
      hip.position.set(side * 0.125, 0.87, 0);
      this.body.add(hip);
      mesh(hip, resources.cylinder, appearance.skinColor, [0.085, 0.38, 0.085], [0, -0.19, 0]);
      knee.position.y = -0.38;
      hip.add(knee);
      mesh(
        knee,
        resources.cylinder,
        player.goalkeeper ? shirt : kit.socks,
        [0.065, 0.36, 0.065],
        [0, -0.18, 0],
      );
      const boot = mesh(knee, resources.box, '#181c1d', [0.13, 0.12, 0.26], [0, -0.41, 0.06]);
      boot.userData.orientationFeature = 'local_forward_boot';
      arm.position.set(side * 0.29, 0.5, 0);
      this.torso.add(arm);
      mesh(arm, resources.cylinder, shirt, [0.075, 0.23, 0.075], [0, -0.115, 0]);
      elbow.position.y = -0.23;
      arm.add(elbow);
      mesh(elbow, resources.cylinder, appearance.skinColor, [0.055, 0.22, 0.055], [0, -0.11, 0]);
      hand.position.y = -0.25;
      elbow.add(hand);
      mesh(
        hand,
        resources.sphere,
        player.goalkeeper ? '#eee9ce' : appearance.skinColor,
        [0.065, 0.075, 0.06],
        [0, 0, 0],
      );
    }
    this.picker = new THREE.Mesh(resources.picker, resources.pickerMaterial);
    this.picker.position.y = 1.4;
    this.picker.userData.playerId = player.id;
    this.root.add(this.picker);
  }

  update(player: TacticalPlayer, timestampMs: number) {
    const pose = derivePlayerPose(player, timestampMs, this.pose);
    this.body.position.y = pose.lift - pose.crouch;
    this.body.rotation.z = pose.roll;
    this.torso.rotation.x = pose.lean;
    this.head.rotation.x = pose.head;
    this.head.rotation.y = pose.headYaw;
    this.leftHip.rotation.x = pose.hipLeft;
    this.rightHip.rotation.x = pose.hipRight;
    this.leftKnee.rotation.x = pose.kneeLeft;
    this.rightKnee.rotation.x = pose.kneeRight;
    this.leftArm.rotation.set(pose.armLeft, 0, -pose.armSpread);
    this.rightArm.rotation.set(pose.armRight, 0, pose.armSpread);
    this.leftElbow.rotation.x = pose.elbowLeft;
    this.rightElbow.rotation.x = pose.elbowRight;
  }
}
