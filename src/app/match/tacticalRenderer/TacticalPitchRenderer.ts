import * as THREE from 'three';
import { PITCH_LENGTH, PITCH_WIDTH, tacticalToWorld, type TacticalFrame } from './model';

export class TacticalPitchRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly playerMeshes = new Map<string, THREE.Group>();
  private readonly ball: THREE.Mesh;
  private readonly observer: ResizeObserver;

  constructor(
    private readonly host: HTMLElement,
    frame: TacticalFrame,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x16251f);
    this.camera.position.set(82, 92, 82);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x496055, 2.2));
    this.createPitch();
    for (const player of frame.players)
      this.createPlayer(
        player.id,
        player.team,
        Boolean(player.protagonist),
        Boolean(player.goalkeeper),
      );
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }),
    );
    this.scene.add(this.ball);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.render(frame);
  }

  private createPitch() {
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH_LENGTH, PITCH_WIDTH),
      new THREE.MeshStandardMaterial({ color: 0x315f46, roughness: 1 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    this.scene.add(pitch);
    const material = new THREE.LineBasicMaterial({ color: 0xd5dfd7 });
    const line = (points: [number, number][], loop = false) => {
      const coords = points.map(
        ([x, z]) => new THREE.Vector3(x - PITCH_LENGTH / 2, 0.04, z - PITCH_WIDTH / 2),
      );
      this.scene.add(
        loop
          ? new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(coords), material)
          : new THREE.Line(new THREE.BufferGeometry().setFromPoints(coords), material),
      );
    };
    line(
      [
        [0, 0],
        [105, 0],
        [105, 68],
        [0, 68],
      ],
      true,
    );
    line([
      [52.5, 0],
      [52.5, 68],
    ]);
    const circle = new THREE.EllipseCurve(52.5, 34, 9.15, 9.15)
      .getPoints(48)
      .map((p) => [p.x, p.y] as [number, number]);
    line(circle, true);
    for (const side of [0, 105]) {
      const direction = side === 0 ? 1 : -1;
      line([
        [side, 13.84],
        [side + direction * 16.5, 13.84],
        [side + direction * 16.5, 54.16],
        [side, 54.16],
      ]);
      line([
        [side, 24.84],
        [side + direction * 5.5, 24.84],
        [side + direction * 5.5, 43.16],
        [side, 43.16],
      ]);
      const spot = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 10),
        new THREE.MeshBasicMaterial({ color: 0xd5dfd7 }),
      );
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(side - PITCH_LENGTH / 2 + direction * 11, 0.06, 0);
      this.scene.add(spot);
      const goal = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.5, 2.5, 7.32)),
        material,
      );
      goal.position.set(side - PITCH_LENGTH / 2 - direction * 1.25, 1.25, 0);
      this.scene.add(goal);
    }
  }

  private createPlayer(
    id: string,
    team: 'home' | 'away',
    protagonist: boolean,
    goalkeeper: boolean,
  ) {
    const group = new THREE.Group();
    const color = goalkeeper ? 0xf0c84b : team === 'home' ? 0x4da3ff : 0xe7626c;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.05, 2.5, 8),
      new THREE.MeshStandardMaterial({ color }),
    );
    body.position.y = 1.25;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8bd91 }),
    );
    head.position.y = 3;
    group.add(head);
    if (protagonist) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 1.65, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      group.add(ring);
    }
    this.scene.add(group);
    this.playerMeshes.set(id, group);
  }

  render(frame: TacticalFrame) {
    for (const player of frame.players) {
      const world = tacticalToWorld(player);
      this.playerMeshes.get(player.id)?.position.set(world.x, 0, world.z);
    }
    const ball = tacticalToWorld(frame.ball, (frame.ball.height ?? 0) + 0.85);
    this.ball.position.set(ball.x, ball.y, ball.z);
    this.renderer.render(this.scene, this.camera);
  }
  private resize() {
    const width = Math.max(this.host.clientWidth, 320),
      height = Math.max(this.host.clientHeight, 240),
      aspect = width / height,
      horizontal = Math.max(125, 84 * aspect),
      vertical = horizontal / aspect;
    this.camera.left = -horizontal / 2;
    this.camera.right = horizontal / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.near = 0.1;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  dispose() {
    this.observer.disconnect();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.LineLoop ||
        object instanceof THREE.LineSegments
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
