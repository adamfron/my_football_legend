import { BALL_RADIUS } from '../../../core/matchSimulation/ballFlight';
import { PlayerModel, PlayerModelResources } from './playerModel';
import { deriveReplayCameraPose } from './replay';
import { screenToGoalIntent } from './goalAiming';
import * as THREE from 'three';
import {
  cameraViewSpan,
  applyCameraGesture,
  offsetCameraPose,
  resetCameraOffset,
  resetViewPreferences,
  zoomFromWheel,
} from './cameraInteraction';
import {
  PITCH_LENGTH,
  PITCH_WIDTH,
  tacticalToWorld,
  worldToTactical,
  type PresentationTarget,
  type TacticalFrame,
  type KitPresentation,
  type MatchCameraMode,
  DEFAULT_KITS,
  type TacticalPlayer,
  deriveShotAimCameraPose,
  deriveOwnedBallPose,
  shotAimIntentToGoalPoint,
  updateTacticalCameraPose,
  selectScreenSpacePlayerCandidate,
  type MatchCameraPreferences,
  validateRenderFrame,
} from './model';

export type RendererLifecycle = 'waiting_for_layout' | 'ready' | 'context_lost' | 'failed';

export class TacticalPitchRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly tacticalCamera = new THREE.OrthographicCamera();
  private readonly shotCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
  private camera: THREE.Camera = this.tacticalCamera;
  private readonly modelResources = new PlayerModelResources();
  private readonly playerModels = new Map<string, PlayerModel>();
  private readonly handPosition = new THREE.Vector3();
  private readonly otherHandPosition = new THREE.Vector3();
  private readonly playerMeshes = new Map<string, THREE.Group>();
  private readonly playerPickers = new Map<string, THREE.Mesh>();
  private readonly actionMarkers = new Map<string, THREE.Mesh>();
  private readonly targetMarkers = new Map<string, THREE.Mesh>();
  private readonly anchorMarkers = new Map<string, THREE.Mesh>();
  private readonly idealMarkers = new Map<string, THREE.Mesh>();
  private readonly ball: THREE.Mesh;
  private readonly ballShadow: THREE.Mesh;
  private readonly ballPicker: THREE.Mesh;
  private readonly interceptionMarker: THREE.Mesh;
  private readonly selectionMarker: THREE.Mesh;
  private readonly carryTargetMarker: THREE.Mesh;
  private readonly observer: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pitch: THREE.Mesh;
  private readonly goalPlanes = new Map<'home' | 'away', THREE.Mesh>();
  private readonly aimMarker: THREE.Mesh;
  private contextLost = false;
  private viewportReady = false;
  private lastValidFrame?: TacticalFrame;
  private lastDebugMode = false;
  private cameraMode: MatchCameraMode = 'tactical';
  private cameraPreferences: MatchCameraPreferences = { preset: 'overview', zoom: 0.35 };
  private cameraOffset = resetCameraOffset();
  private cameraDrag: { pointerId: number; x: number; y: number } | undefined;
  private zoomAnimation = 0;
  private displayedZoom = 0.35;
  private suppressClick = false;
  private focusedPlayerId: string | undefined;
  private readonly report: (message?: string) => void;

  constructor(
    private readonly host: HTMLElement,
    frame: TacticalFrame,
    onDiagnostic: (message?: string) => void = () => undefined,
    private readonly kits: Record<'home' | 'away', KitPresentation> = DEFAULT_KITS,
    private readonly onCameraPreferences: (preferences: MatchCameraPreferences) => void = () =>
      undefined,
  ) {
    this.report = onDiagnostic;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.renderer.domElement.addEventListener('pointerdown', this.onCameraDown);
    this.renderer.domElement.addEventListener('pointermove', this.onCameraMove);
    this.renderer.domElement.addEventListener('pointerup', this.onCameraUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onCameraUp);
    this.renderer.domElement.addEventListener('lostpointercapture', this.onCameraUp);
    this.renderer.domElement.addEventListener('auxclick', this.onAuxClick);
    this.scene.background = new THREE.Color(0x34463e);
    this.tacticalCamera.position.set(-82, 92, 82);
    this.tacticalCamera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x496055, 1.8));
    const sunlight = new THREE.DirectionalLight(0xfff4dc, 2.2);
    sunlight.position.set(-25, 60, 30);
    this.scene.add(sunlight);
    this.pitch = this.createPitch();
    this.aimMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.25, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe36e, side: THREE.DoubleSide, depthTest: false }),
    );
    this.aimMarker.visible = false;
    this.scene.add(this.aimMarker);
    for (const player of frame.players) {
      this.createPlayer(player);
      this.createDebugMarkers(player.id);
    }
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }),
    );
    this.ball.userData.ball = true;
    this.scene.add(this.ball);
    this.ballPicker = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.ballPicker.userData.ball = true;
    this.scene.add(this.ballPicker);
    this.interceptionMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.62, 20),
      new THREE.MeshBasicMaterial({
        color: 0xd9fff1,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    this.interceptionMarker.rotation.x = -Math.PI / 2;
    this.interceptionMarker.position.y = 0.075;
    this.interceptionMarker.visible = false;
    this.scene.add(this.interceptionMarker);
    this.carryTargetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.92, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd447, side: THREE.DoubleSide, depthTest: false }),
    );
    this.carryTargetMarker.rotation.x = -Math.PI / 2;
    this.carryTargetMarker.position.y = 0.08;
    this.carryTargetMarker.visible = false;
    this.scene.add(this.carryTargetMarker);
    this.selectionMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.05, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, side: THREE.DoubleSide, depthTest: false }),
    );
    this.selectionMarker.rotation.x = -Math.PI / 2;
    this.selectionMarker.visible = false;
    this.scene.add(this.selectionMarker);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 16),
      new THREE.MeshBasicMaterial({ color: 0x101814, transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.045;
    this.ballShadow = shadow;
    this.scene.add(shadow);
    this.lastValidFrame = frame;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
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
    for (let stripe = 0; stripe < 10; stripe += 2) {
      const band = new THREE.Mesh(
        new THREE.PlaneGeometry(PITCH_LENGTH / 10, PITCH_WIDTH),
        new THREE.MeshStandardMaterial({ color: 0x39694d, roughness: 1 }),
      );
      band.rotation.x = -Math.PI / 2;
      band.position.set(-PITCH_LENGTH / 2 + ((stripe + 0.5) * PITCH_LENGTH) / 10, 0.005, 0);
      this.scene.add(band);
    }
    const material = new THREE.LineBasicMaterial({ color: 0xf4f1de });
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
      const goalX = side - PITCH_LENGTH / 2;
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8ef, roughness: 0.6 });
      for (const z of [-3.66, 3.66]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.075, 2.44, 8),
          frameMaterial,
        );
        post.position.set(goalX, 1.22, z);
        this.scene.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 7.32, 8), frameMaterial);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(goalX, 2.44, 0);
      this.scene.add(bar);
      const netPoints: THREE.Vector3[] = [];
      const backX = goalX - direction * 2;
      for (let z = -3.66; z <= 3.67; z += 0.61) {
        netPoints.push(
          new THREE.Vector3(backX, 0, z),
          new THREE.Vector3(backX, 2.44, z),
          new THREE.Vector3(backX, 2.44, z),
          new THREE.Vector3(goalX, 2.44, z),
        );
      }
      for (let y = 0; y <= 2.45; y += 0.305) {
        netPoints.push(new THREE.Vector3(backX, y, -3.66), new THREE.Vector3(backX, y, 3.66));
        for (const z of [-3.66, 3.66])
          netPoints.push(new THREE.Vector3(goalX, y, z), new THREE.Vector3(backX, y, z));
      }
      this.scene.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(netPoints),
          new THREE.LineBasicMaterial({ color: 0xd6dfd4, transparent: true, opacity: 0.42 }),
        ),
      );
      const goalSide = side === 0 ? 'home' : 'away';
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(7.32, 2.44),
        new THREE.MeshBasicMaterial({
          color: 0x8fffd2,
          transparent: true,
          opacity: 0.13,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      plane.rotation.y = Math.PI / 2;
      plane.position.set(side - PITCH_LENGTH / 2 + direction * 0.015, 1.22, 0);
      plane.visible = false;
      plane.userData.goalSide = goalSide;
      this.scene.add(plane);
      this.goalPlanes.set(goalSide, plane);
    }
    return pitch;
  }

  private createPlayer(player: TacticalPlayer) {
    const { id, team, protagonist, goalkeeper } = player;
    const model = new PlayerModel(player, this.kits[team], this.modelResources);
    const group = model.root;
    this.playerModels.set(id, model);
    this.playerPickers.set(id, model.picker);
    this.addShirtNumber(
      model.torso,
      id,
      player.displayNumber ?? 1,
      goalkeeper ? this.kits[team].goalkeeper.accent : this.kits[team].accent,
    );
    const action = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.36, 24),
      new THREE.MeshBasicMaterial({
        color: 0xd9fff1,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    action.rotation.x = -Math.PI / 2;
    action.position.y = 0.07;
    action.visible = false;
    group.add(action);
    this.actionMarkers.set(id, action);
    if (protagonist) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 1.65, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd447, side: THREE.DoubleSide, depthTest: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      group.add(ring);
    }
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 16),
      new THREE.MeshBasicMaterial({
        color: 0x101814,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    group.add(shadow);
    this.scene.add(group);
    this.playerMeshes.set(id, group);
  }

  private addShirtNumber(group: THREE.Group, id: string, number: number, color: string) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 64, 64);
    context.fillStyle = color;
    context.font = 'bold 42px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(number), 32, 34);
    const texture = new THREE.CanvasTexture(canvas);
    const numberPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.28),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    numberPlane.position.set(0, 0.32, -0.173);
    numberPlane.rotation.y = Math.PI;
    numberPlane.userData = { shirtNumber: number, playerId: id, side: 'back' };
    group.add(numberPlane);
  }

  render(frame: TacticalFrame, debug = false) {
    const invalid = validateRenderFrame(frame);
    if (invalid) {
      this.report(`Renderer error: ${invalid}`);
      return;
    }
    this.lastValidFrame = frame;
    this.lastDebugMode = debug;
    if (!this.viewportReady) return;
    if (!this.renderer.domElement.isConnected || this.contextLost) {
      this.report(
        `Renderer error: ${this.contextLost ? 'WebGL context lost' : 'canvas disconnected'}`,
      );
      return;
    }
    this.report(undefined);
    for (const player of frame.players) {
      if (!this.playerModels.has(player.id)) {
        this.createPlayer(player);
        this.createDebugMarkers(player.id);
      }
      const world = tacticalToWorld(player);
      const mesh = this.playerMeshes.get(player.id);
      mesh?.position.set(world.x, 0, world.z);
      if (mesh && player.facing !== undefined) mesh.rotation.y = player.facing;
      this.playerModels.get(player.id)?.update(player, frame.timestampMs);
      const actionMarker = this.actionMarkers.get(player.id);
      if (actionMarker) {
        actionMarker.visible = Boolean(frame.actionableTargets?.includes(player.id));
        actionMarker.scale.setScalar(frame.selectedTarget === player.id ? 1.18 : 1);
      }
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
    const presentedBall = deriveOwnedBallPose(frame);
    const ball = tacticalToWorld(presentedBall, Math.max(BALL_RADIUS, presentedBall.height ?? 0));
    this.ball.position.set(ball.x, ball.y, ball.z);
    const thrower = frame.players.find(
      (p) => p.preparation === 'throw' && p.id === frame.ball.ownerId,
    );
    const heldModel = thrower && this.playerModels.get(thrower.id);
    if (heldModel) {
      heldModel.root.updateMatrixWorld(true);
      heldModel.leftHand.getWorldPosition(this.handPosition);
      heldModel.rightHand.getWorldPosition(this.otherHandPosition);
      this.ball.position.copy(this.handPosition).add(this.otherHandPosition).multiplyScalar(0.5);
    }
    this.ballShadow.position.set(this.ball.position.x, 0.045, this.ball.position.z);
    this.ballPicker.position.copy(this.ball.position);
    if (this.cameraMode === 'tactical') this.updateTacticalCamera(frame, presentedBall);
    if (this.cameraMode === 'goal_replay') {
      const pose = deriveReplayCameraPose(frame);
      this.tacticalCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.tacticalCamera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    }
    this.interceptionMarker.visible = Boolean(frame.interceptionTarget);
    if (frame.interceptionTarget) {
      const target = tacticalToWorld(frame.interceptionTarget);
      this.interceptionMarker.position.set(target.x, 0.075, target.z);
    }
    this.carryTargetMarker.visible = Boolean(frame.carryTarget);
    if (frame.carryTarget) {
      const target = tacticalToWorld(frame.carryTarget);
      this.carryTargetMarker.position.set(target.x, 0.08, target.z);
    }
    this.selectionMarker.visible = Boolean(frame.selectedPoint);
    if (frame.selectedPoint) {
      const point = tacticalToWorld(frame.selectedPoint);
      this.selectionMarker.position.set(point.x, 0.09, point.z);
    }
    this.renderer.render(this.scene, this.camera);
  }

  getCanvas() {
    return this.renderer.domElement;
  }
  get lifecycle(): RendererLifecycle {
    if (this.contextLost) return 'context_lost';
    return this.viewportReady ? 'ready' : 'waiting_for_layout';
  }
  /** Retries presentation reconstruction from the frozen frame; canonical state is untouched. */
  recover() {
    this.onContextRestored();
  }
  /** Presentation-only hit test: no canonical state or football legality is consulted. */
  pick(
    clientX: number,
    clientY: number,
    goalIntentSide?: 'home' | 'away',
    actionablePlayerIds: readonly string[] = [],
  ): PresentationTarget | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(pointer, this.camera);
    // Only the visible presentation goal plane owns a goal intention. Pitch grass is never a
    // hidden shot button.
    if (goalIntentSide) {
      const goalPlane = this.goalPlanes.get(goalIntentSide);
      const goalHit = goalPlane && this.raycaster.intersectObject(goalPlane)[0];
      if (goalHit) return { kind: 'goal', side: goalIntentSide };
      // Expanded physical goal area, independent of the exact post/net geometry.
      if (goalPlane) {
        const point = this.raycaster.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(1, 0, 0), -goalPlane.position.x),
          new THREE.Vector3(),
        );
        if (point && Math.abs(point.z) <= 4.66 && point.y >= -0.5 && point.y <= 3.24)
          return { kind: 'goal', side: goalIntentSide };
      }
    }
    const ballHit = this.raycaster.intersectObject(this.ballPicker)[0];
    if (ballHit) {
      const point = worldToTactical(this.ball.position);
      return { kind: 'ball', point };
    }
    if (this.interceptionMarker.visible) {
      const screen = this.interceptionMarker.position.clone().project(this.camera);
      if (
        screen.z >= -1 &&
        screen.z <= 1 &&
        Math.hypot(
          clientX - (rect.left + ((screen.x + 1) * rect.width) / 2),
          clientY - (rect.top + ((1 - screen.y) * rect.height) / 2),
        ) <= 22
      )
        // The marker is a handle for the canonical incoming ball, not a new space action.
        return { kind: 'ball', point: worldToTactical(this.ball.position) };
    }
    const actionable = new Set(actionablePlayerIds);
    const playerHits = this.raycaster.intersectObjects([...this.playerPickers.values()]);
    const playerHit =
      playerHits.find((hit) => {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.playerId) object = object.parent;
        return object?.userData.playerId && actionable.has(String(object.userData.playerId));
      }) ?? playerHits[0];
    if (playerHit) {
      let object: THREE.Object3D | null = playerHit.object;
      while (object && !object.userData.playerId) object = object.parent;
      if (object?.userData.playerId)
        return { kind: 'player', playerId: String(object.userData.playerId) };
    }
    const fallback = selectScreenSpacePlayerCandidate(
      [...this.playerMeshes.entries()].map(([playerId, mesh]) => {
        const projected = mesh.position.clone().project(this.camera);
        return {
          playerId,
          x: rect.left + ((projected.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - projected.y) / 2) * rect.height,
          depth: projected.z,
          actionable: actionable.has(playerId),
        };
      }),
      { x: clientX, y: clientY },
      22,
    );
    if (fallback) return { kind: 'player', playerId: fallback.playerId };
    const pitchHit = this.raycaster.intersectObject(this.pitch)[0];
    if (!pitchHit) return undefined;
    const point = worldToTactical(pitchHit.point);
    return { kind: 'pitch', point };
  }
  /** Maps the projected goal mouth to normalized intention; dragging does not touch camera state. */
  pickGoalAim(
    clientX: number,
    clientY: number,
  ): { horizontal: number; vertical: number } | undefined {
    if (this.cameraMode !== 'shot_aim') return undefined;
    const plane = [...this.goalPlanes.values()].find((item) => item.visible);
    if (!plane) return undefined;
    const team = plane.userData.goalSide === 'away' ? 'home' : 'away';
    const intent = screenToGoalIntent(
      this.camera,
      team,
      { x: clientX, y: clientY },
      this.renderer.domElement.getBoundingClientRect(),
    );
    if (!intent) return undefined;
    this.setGoalAimMarker(intent);
    return intent;
  }

  setGoalAimMarker(intent: { horizontal: number; vertical: number }) {
    const plane = [...this.goalPlanes.values()].find((item) => item.visible);
    if (!plane) return;
    this.aimMarker.visible = true;
    this.aimMarker.rotation.y = Math.PI / 2;
    const point = shotAimIntentToGoalPoint(
      plane.userData.goalSide === 'away' ? 'home' : 'away',
      intent,
    );
    this.aimMarker.position.set(plane.position.x, point.height, point.y - PITCH_WIDTH / 2);
    this.redraw();
  }

  /** Repaints stored presentation state without advancing simulation or changing the camera. */
  redraw() {
    if (this.viewportReady) this.renderer.render(this.scene, this.camera);
  }

  /** Shared presentation-only framing for tactical play, aiming and stored replay frames. */
  setCameraMode(mode: MatchCameraMode, focusedPlayerId?: string, focusedTeam?: 'home' | 'away') {
    this.cameraMode = mode;
    this.tacticalCamera.zoom = mode === 'goal_replay' ? 1 : 0.75 + this.displayedZoom * 1.5;
    this.focusedPlayerId = focusedPlayerId;
    for (const plane of this.goalPlanes.values()) plane.visible = false;
    this.aimMarker.visible = false;
    if (mode === 'tactical') {
      this.camera = this.tacticalCamera;
      if (this.lastValidFrame)
        this.updateTacticalCamera(this.lastValidFrame, deriveOwnedBallPose(this.lastValidFrame));
    } else if (mode === 'shot_aim') {
      this.camera = this.shotCamera;
      const focused = focusedPlayerId ? this.playerMeshes.get(focusedPlayerId) : undefined;
      const centre = focused?.position ?? new THREE.Vector3();
      const pose = deriveShotAimCameraPose(focusedTeam ?? 'home', {
        x: centre.x + PITCH_LENGTH / 2,
        y: centre.z + PITCH_WIDTH / 2,
      });
      this.shotCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.shotCamera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
      const opponentGoal = pose.opponentGoal;
      const plane = this.goalPlanes.get(opponentGoal);
      if (plane) {
        plane.visible = true;
        this.setGoalAimMarker({ horizontal: 0, vertical: 0.45 });
      }
    } else {
      this.camera = this.tacticalCamera;
      const focused = focusedPlayerId ? this.playerMeshes.get(focusedPlayerId) : undefined;
      const centre = focused?.position ?? new THREE.Vector3();
      this.tacticalCamera.position.set(centre.x - 18, 13, centre.z + 7);
      this.tacticalCamera.lookAt(centre.x + 30, 1.2, 0);
    }
    this.resize();
  }
  private updateTacticalCamera(frame: TacticalFrame, presentedBall: TacticalFrame['ball']) {
    const focused = frame.players.find((player) => player.id === this.focusedPlayerId);
    const pose = offsetCameraPose(
      updateTacticalCameraPose(this.cameraPreferences, presentedBall, focused),
      this.cameraOffset,
    );
    this.tacticalCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.tacticalCamera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  }
  setCameraPreferences(preferences: MatchCameraPreferences, focusedPlayerId?: string) {
    if (this.cameraPreferences.preset !== preferences.preset)
      this.cameraOffset = resetCameraOffset();
    const changedPreset = this.cameraPreferences.preset !== preferences.preset;
    this.cameraPreferences = { ...preferences };
    this.focusedPlayerId = focusedPlayerId;
    if (changedPreset) this.resize();
    this.refreshCamera();
    if (!this.zoomAnimation && this.displayedZoom !== preferences.zoom)
      this.zoomAnimation = requestAnimationFrame(this.animateZoom);
  }
  resetView() {
    this.cameraOffset = resetCameraOffset();
    const preferences = resetViewPreferences(this.cameraPreferences);
    this.setCameraPreferences(preferences, this.focusedPlayerId);
    this.onCameraPreferences(preferences);
  }
  /** Consumed by the football-input boundary, including multi-button/cancelled drags. */
  consumeCameraClick() {
    const blocked = this.suppressClick || Boolean(this.cameraDrag);
    this.suppressClick = false;
    return blocked;
  }
  private refreshCamera() {
    this.tacticalCamera.zoom =
      this.cameraMode === 'goal_replay' ? 1 : 0.75 + this.displayedZoom * 1.5;
    this.tacticalCamera.updateProjectionMatrix();
    if (this.cameraMode === 'tactical' && this.lastValidFrame)
      this.updateTacticalCamera(this.lastValidFrame, deriveOwnedBallPose(this.lastValidFrame));
    this.redraw();
  }
  private readonly animateZoom = () => {
    const remaining = this.cameraPreferences.zoom - this.displayedZoom;
    this.displayedZoom =
      Math.abs(remaining) < 0.001
        ? this.cameraPreferences.zoom
        : this.displayedZoom + remaining * 0.24;
    this.refreshCamera();
    this.zoomAnimation =
      this.displayedZoom === this.cameraPreferences.zoom
        ? 0
        : requestAnimationFrame(this.animateZoom);
  };
  private readonly onWheel = (event: WheelEvent) => {
    if (this.cameraMode !== 'tactical') return;
    event.preventDefault();
    const preferences = {
      ...this.cameraPreferences,
      zoom: zoomFromWheel(this.cameraPreferences.zoom, event.deltaY, event.deltaMode),
    };
    this.setCameraPreferences(preferences, this.focusedPlayerId);
    this.onCameraPreferences(preferences);
  };
  private readonly onCameraDown = (event: PointerEvent) => {
    if (event.button === 0 && !this.cameraDrag) this.suppressClick = false;
    if (event.button !== 1 || this.cameraMode !== 'tactical') return;
    event.preventDefault();
    this.suppressClick = true;
    this.cameraDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
  };
  private readonly onCameraMove = (event: PointerEvent) => {
    const drag = this.cameraDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const scale =
      (this.tacticalCamera.right - this.tacticalCamera.left) /
      this.tacticalCamera.zoom /
      Math.max(1, this.host.clientWidth);
    this.cameraOffset = applyCameraGesture(this.cameraOffset, {
      kind: event.shiftKey ? 'pan' : 'orbit',
      dx: (event.clientX - drag.x) * (event.shiftKey ? scale : 1),
      dy: (event.clientY - drag.y) * (event.shiftKey ? scale : 1),
    });
    this.cameraDrag = { ...drag, x: event.clientX, y: event.clientY };
    this.refreshCamera();
  };
  private readonly onCameraUp = (event: PointerEvent) => {
    if (this.cameraDrag?.pointerId !== event.pointerId) return;
    this.cameraDrag = undefined;
    this.renderer.domElement.style.cursor = '';
    if (this.renderer.domElement.hasPointerCapture(event.pointerId))
      this.renderer.domElement.releasePointerCapture(event.pointerId);
  };
  private readonly onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  private resize() {
    if (this.host.clientWidth <= 0 || this.host.clientHeight <= 0) {
      this.viewportReady = false;
      this.report('Renderer waiting_for_layout');
      return;
    }
    const width = Math.max(this.host.clientWidth, 320),
      height = Math.max(this.host.clientHeight, 240),
      aspect = width / height,
      horizontal =
        this.cameraMode === 'tactical'
          ? cameraViewSpan(this.cameraPreferences.preset, aspect).horizontal
          : Math.max(42, 28 * aspect),
      vertical = horizontal / aspect;
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.left = -horizontal / 2;
      this.camera.right = horizontal / 2;
      this.camera.top = vertical / 2;
      this.camera.bottom = -vertical / 2;
      this.camera.near = 0.1;
      this.camera.far = 400;
      this.camera.updateProjectionMatrix();
    } else if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(width, height, false);
    this.viewportReady = true;
    this.report(undefined);
    if (this.lastValidFrame && !this.contextLost)
      this.render(this.lastValidFrame, this.lastDebugMode);
  }
  dispose() {
    cancelAnimationFrame(this.zoomAnimation);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.renderer.domElement.removeEventListener('pointerdown', this.onCameraDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onCameraMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onCameraUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onCameraUp);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.onCameraUp);
    this.renderer.domElement.removeEventListener('auxclick', this.onAuxClick);
    this.observer.disconnect();
    const geometries = new Set<THREE.BufferGeometry>();
    const materialsToDispose = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.LineLoop ||
        object instanceof THREE.LineSegments
      ) {
        geometries.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => materialsToDispose.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materialsToDispose.forEach((material) => {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
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
      this.report(
        `Renderer recovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
