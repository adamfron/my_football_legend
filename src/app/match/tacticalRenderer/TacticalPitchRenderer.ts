import * as THREE from 'three';
import {
  PITCH_LENGTH,
  PITCH_WIDTH,
  tacticalToWorld,
  worldToTactical,
  type PresentationTarget,
  type TacticalFrame,
  validateRenderFrame,
} from './model';

export class TacticalPitchRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly playerMeshes = new Map<string, THREE.Group>();
  private readonly targetMarkers = new Map<string, THREE.Mesh>();
  private readonly anchorMarkers = new Map<string, THREE.Mesh>();
  private readonly idealMarkers = new Map<string, THREE.Mesh>();
  private readonly ball: THREE.Mesh;
  private readonly observer: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pitch: THREE.Mesh;
  private contextLost = false;
  private lastValidFrame?: TacticalFrame;
  private lastDebugMode = false;
  private readonly report: (message?: string) => void;

  constructor(
    private readonly host: HTMLElement,
    frame: TacticalFrame,
    onDiagnostic: (message?: string) => void = () => undefined,
  ) {
    this.report = onDiagnostic;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.scene.background = new THREE.Color(0x16251f);
    this.camera.position.set(-82, 92, 82);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x496055, 2.2));
    this.pitch = this.createPitch();
    for (const player of frame.players) {
      this.createPlayer(
        player.id,
        player.team,
        Boolean(player.protagonist),
        Boolean(player.goalkeeper),
      );
      this.createDebugMarkers(player.id);
    }
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }),
    );
    this.ball.userData.ball = true;
    this.scene.add(this.ball);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.render(frame);
  }

  private createDebugMarkers(id: string) {
    const marker = (color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 10),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.08;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.anchorMarkers.set(id, marker(0xf4d35e));
    this.targetMarkers.set(id, marker(0xffffff));
    this.idealMarkers.set(id, marker(0x52e0c4));
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
    // Canonical 9.15 m penalty arcs; only the portion outside each penalty area is painted.
    for (const side of [0, 105]) {
      const spotX = side === 0 ? 11 : 94;
      const arc = new THREE.EllipseCurve(
        spotX,
        34,
        9.15,
        9.15,
        side === 0 ? -Math.acos(5.5 / 9.15) : Math.PI - Math.acos(5.5 / 9.15),
        side === 0 ? Math.acos(5.5 / 9.15) : Math.PI + Math.acos(5.5 / 9.15),
      )
        .getPoints(24)
        .map((p) => [p.x, p.y] as [number, number]);
      line(arc);
    }
    // Quarter-circle corner arcs share the same projection as every other pitch marking.
    const cornerArcs: [number, number, number, number][] = [
      [0, 0, 0, Math.PI / 2],
      [0, 68, -Math.PI / 2, 0],
      [105, 0, Math.PI / 2, Math.PI],
      [105, 68, Math.PI, Math.PI * 1.5],
    ];
    for (const [x, y, start, end] of cornerArcs)
      line(
        new THREE.EllipseCurve(x, y, 1, 1, start, end)
          .getPoints(10)
          .map((p) => [p.x, p.y] as [number, number]),
      );
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
    return pitch;
  }

  private createPlayer(
    id: string,
    team: 'home' | 'away',
    protagonist: boolean,
    goalkeeper: boolean,
  ) {
    const group = new THREE.Group();
    group.userData.playerId = id;
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

  render(frame: TacticalFrame, debug = false) {
    const invalid = validateRenderFrame(frame);
    if (invalid) {
      this.report(`Renderer error: ${invalid}`);
      return;
    }
    if (!this.renderer.domElement.isConnected || this.contextLost) {
      this.report(
        `Renderer error: ${this.contextLost ? 'WebGL context lost' : 'canvas disconnected'}`,
      );
      return;
    }
    this.report(undefined);
    for (const player of frame.players) {
      const world = tacticalToWorld(player);
      this.playerMeshes.get(player.id)?.position.set(world.x, 0, world.z);
      const target = player.target && tacticalToWorld(player.target),
        anchor = player.anchor && tacticalToWorld(player.anchor),
        ideal = player.idealTarget && tacticalToWorld(player.idealTarget);
      const targetMarker = this.targetMarkers.get(player.id),
        anchorMarker = this.anchorMarkers.get(player.id);
      const idealMarker = this.idealMarkers.get(player.id);
      if (targetMarker) {
        targetMarker.visible = debug && Boolean(target);
        if (target) targetMarker.position.set(target.x, 0.08, target.z);
      }
      if (anchorMarker) {
        anchorMarker.visible = debug && Boolean(anchor);
        if (anchor) anchorMarker.position.set(anchor.x, 0.08, anchor.z);
      }
      if (idealMarker) {
        idealMarker.visible = debug && Boolean(ideal);
        if (ideal) idealMarker.position.set(ideal.x, 0.08, ideal.z);
      }
    }
    const ball = tacticalToWorld(frame.ball, (frame.ball.height ?? 0) + 0.85);
    this.ball.position.set(ball.x, ball.y, ball.z);
    this.renderer.render(this.scene, this.camera);
    this.lastValidFrame = frame;
    this.lastDebugMode = debug;
  }

  getCanvas() {
    return this.renderer.domElement;
  }
  /** Retries presentation reconstruction from the frozen frame; canonical state is untouched. */
  recover() {
    this.onContextRestored();
  }
  /** Presentation-only hit test: no canonical state or football legality is consulted. */
  pick(clientX: number, clientY: number): PresentationTarget | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const ballHit = this.raycaster.intersectObject(this.ball)[0];
    if (ballHit) {
      const point = worldToTactical(this.ball.position);
      return { kind: 'ball', point };
    }
    const playerHit = this.raycaster.intersectObjects([...this.playerMeshes.values()], true)[0];
    if (playerHit) {
      let object: THREE.Object3D | null = playerHit.object;
      while (object && !object.userData.playerId) object = object.parent;
      if (object?.userData.playerId)
        return { kind: 'player', playerId: String(object.userData.playerId) };
    }
    const pitchHit = this.raycaster.intersectObject(this.pitch)[0];
    if (!pitchHit) return undefined;
    const point = worldToTactical(pitchHit.point);
    if (point.x <= 2 && point.y >= 23 && point.y <= 45) return { kind: 'goal', side: 'home' };
    if (point.x >= 103 && point.y >= 23 && point.y <= 45) return { kind: 'goal', side: 'away' };
    return { kind: 'pitch', point };
  }
  private resize() {
    if (this.host.clientWidth <= 0 || this.host.clientHeight <= 0) {
      this.report('Renderer error: viewport has zero width or height');
      return;
    }
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
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.domElement.remove();
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.report('Renderer error: WebGL context lost');
  };

  private readonly onContextRestored = () => {
    this.contextLost = false;
    try {
      this.resize();
      if (!this.lastValidFrame) throw new Error('brak ostatniej poprawnej klatki');
      this.render(this.lastValidFrame, this.lastDebugMode);
      this.report(undefined);
    } catch (error) {
      this.contextLost = true;
      this.report(`Renderer recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
