import {
  BALL_RADIUS,
  GOAL_WIDTH,
  GOAL_HEIGHT,
  GOAL_POST_RADIUS,
} from '../../../core/matchSimulation/ballFlight';
import { PlayerModel, PlayerModelResources } from './playerModel';
import { createPlayerRing } from './playerMarkers';
import { StadiumModel, deriveStadiumConfiguration, type StadiumDetail } from './stadium';
import {
  DEFAULT_TACTICAL_DIAGNOSTICS,
  MAX_DIAGNOSTIC_LINES,
  projectTacticalDiagnostics,
  tacticalDiagnosticOptionsSchema,
  type TacticalDiagnosticOptions,
} from './diagnosticOverlay';
import { screenToGoalIntent } from './goalAiming';
import { selectFrameFeedback } from './actionFeedback';
import { projectMotionVectors } from './motionVectors';
import * as THREE from 'three';
import {
  cameraViewSpan,
  applyCameraGesture,
  deriveInteractiveCameraPose,
  deriveSelectedReplayCameraPose,
  cameraZoom,
  type ReplayCameraSelection,
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
  shotAimIntentToGoalPoint,
  selectScreenSpacePlayerCandidate,
  screenSpacePlayerPickRadius,
  type MatchCameraPreferences,
  validateRenderFrame,
} from './model';

export type RendererLifecycle = 'waiting_for_layout' | 'ready' | 'context_lost' | 'failed';
export type RendererPresentationOptions = {
  homeClubId?: string;
  stadiumDetail?: StadiumDetail;
  active?: boolean;
};

export class TacticalPitchRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly tacticalCamera = new THREE.OrthographicCamera();
  private readonly shotCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
  private camera: THREE.Camera = this.tacticalCamera;
  private readonly modelResources = new PlayerModelResources();
  private readonly playerModels = new Map<string, PlayerModel>();
  private readonly stadium: StadiumModel;
  private readonly playerMeshes = new Map<string, THREE.Group>();
  private readonly playerPickers = new Map<string, THREE.Mesh>();
  private readonly possessionMarkers = new Map<string, THREE.Mesh>();
  private readonly actionMarkers = new Map<string, THREE.Mesh>();
  private readonly targetMarkers = new Map<string, THREE.Mesh>();
  private readonly anchorMarkers = new Map<string, THREE.Mesh>();
  private readonly idealMarkers = new Map<string, THREE.Mesh>();
  private readonly restartPlayerMarkers = new Map<string, THREE.Mesh>();
  private readonly ball: THREE.Mesh;
  private readonly ballShadow: THREE.Mesh;
  private readonly ballPicker: THREE.Mesh;
  private readonly interceptionMarker: THREE.Mesh;
  private readonly selectionMarker: THREE.Mesh;
  private readonly carryTargetMarker: THREE.Mesh;
  private readonly restartSpotMarker: THREE.Mesh;
  private readonly restartDeliveryMarker: THREE.Mesh;
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
  private presentationActive = true;
  private stadiumDetail: StadiumDetail = 'standard';
  private goalAimIntent: { horizontal: number; vertical: number } | undefined;
  private suppressClick = false;
  private focusedPlayerId: string | undefined;
  private focusedTeam: 'home' | 'away' | undefined;
  private diagnostics: TacticalDiagnosticOptions = { ...DEFAULT_TACTICAL_DIAGNOSTICS };
  private replayCamera: ReplayCameraSelection = 'ball';
  private renderSamples = 0;
  private renderCpuTotalMs = 0;
  private renderCpuMaxMs = 0;
  private readonly diagnosticLabels = new Map<string, HTMLElement>();
  private readonly diagnosticPositions = new Float32Array(MAX_DIAGNOSTIC_LINES * 6);
  private readonly diagnosticColors = new Float32Array(MAX_DIAGNOSTIC_LINES * 6);
  private readonly diagnosticGeometry = new THREE.BufferGeometry();
  private readonly diagnosticLines = new THREE.LineSegments(
    this.diagnosticGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.78,
    }),
  );
  private readonly report: (message?: string) => void;
  private readonly feedbackLayer = document.createElement('div');
  private readonly feedbackLabels = new Map<string, HTMLElement>();
  private readonly feedbackProjection = new THREE.Vector3();
  private readonly motionPositions = new Float32Array(44 * 18);
  private readonly motionGeometry = new THREE.BufferGeometry();
  private readonly motionLines = new THREE.LineSegments(
    this.motionGeometry,
    new THREE.LineBasicMaterial({
      color: 0xd9fff1,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    }),
  );

  constructor(
    private readonly host: HTMLElement,
    frame: TacticalFrame,
    onDiagnostic: (message?: string) => void = () => undefined,
    private readonly kits: Record<'home' | 'away', KitPresentation> = DEFAULT_KITS,
    private readonly onCameraPreferences: (preferences: MatchCameraPreferences) => void = () =>
      undefined,
    presentationOptions: RendererPresentationOptions = {},
  ) {
    this.report = onDiagnostic;
    this.presentationActive = presentationOptions.active ?? true;
    this.stadiumDetail = presentationOptions.stadiumDetail ?? 'standard';
    this.motionGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.motionPositions, 3),
    );
    this.motionGeometry.setDrawRange(0, 0);
    this.motionLines.frustumCulled = false;
    this.scene.add(this.motionLines);
    this.diagnosticGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.diagnosticPositions, 3),
    );
    this.diagnosticGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.diagnosticColors, 3),
    );
    this.diagnosticGeometry.setDrawRange(0, 0);
    this.diagnosticLines.frustumCulled = false;
    this.diagnosticLines.name = 'read-only-tactical-diagnostics';
    this.scene.add(this.diagnosticLines);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.feedbackLayer.className = 'canonical-action-feedback';
    this.feedbackLayer.setAttribute('aria-hidden', 'true');
    Object.assign(this.feedbackLayer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    host.append(this.feedbackLayer);
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
    this.stadium = new StadiumModel(
      deriveStadiumConfiguration(presentationOptions.homeClubId ?? 'default-home', kits.home),
      presentationOptions.stadiumDetail,
    );
    this.scene.add(this.stadium.root);
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
    const restartMarker = (inner: number, outer: number, color: number) => {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 28),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.visible = false;
      this.scene.add(marker);
      return marker;
    };
    this.restartSpotMarker = restartMarker(0.65, 0.9, 0xf4c970);
    this.restartDeliveryMarker = restartMarker(1.5, 1.7, 0x75dfe3);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_RADIUS * 1.6, 16),
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
    this.anchorMarkers.set(id, marker(0x60a6ff));
    this.targetMarkers.set(id, marker(0xf3d65f));
    this.idealMarkers.set(id, marker(0xcb8cff));
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
    const centreSpot = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 10),
      new THREE.MeshBasicMaterial({ color: 0xf4f1de }),
    );
    centreSpot.rotation.x = -Math.PI / 2;
    centreSpot.position.y = 0.06;
    this.scene.add(centreSpot);
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
        new THREE.CircleGeometry(0.07, 10),
        new THREE.MeshBasicMaterial({ color: 0xd5dfd7 }),
      );
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(side - PITCH_LENGTH / 2 + direction * 11, 0.06, 0);
      this.scene.add(spot);
      const goalX = side - PITCH_LENGTH / 2;
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8ef, roughness: 0.6 });
      for (const z of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(GOAL_POST_RADIUS, GOAL_POST_RADIUS, GOAL_HEIGHT, 8),
          frameMaterial,
        );
        post.position.set(goalX, GOAL_HEIGHT / 2, z);
        this.scene.add(post);
      }
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(GOAL_POST_RADIUS, GOAL_POST_RADIUS, GOAL_WIDTH, 8),
        frameMaterial,
      );
      bar.rotation.x = Math.PI / 2;
      bar.position.set(goalX, GOAL_HEIGHT, 0);
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
        new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT),
        new THREE.MeshBasicMaterial({
          color: 0x8fffd2,
          transparent: true,
          opacity: 0.13,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      plane.rotation.y = Math.PI / 2;
      plane.position.set(side - PITCH_LENGTH / 2 + direction * 0.015, GOAL_HEIGHT / 2, 0);
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
    const possession = createPlayerRing('ball_owner');
    possession.visible = false;
    group.add(possession);
    this.possessionMarkers.set(id, possession);
    if (protagonist) {
      const ring = createPlayerRing('controlled_player');
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
    if (!this.presentationActive) {
      // A bounded immutable snapshot can wait for visibility; no scene or pose work in background.
      this.lastValidFrame = frame;
      this.lastDebugMode = debug;
      return;
    }
    const renderStart = performance.now();
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
    const activeIds = new Set(frame.players.map((player) => player.id));
    // A canonical dismissal removes all visible/pickable objects at this frame. The bounded
    // identity cache can still restore the same rig when viewing a pre-dismissal replay.
    for (const [id, mesh] of this.playerMeshes) {
      if (activeIds.has(id)) {
        if (mesh.parent !== this.scene) this.scene.add(mesh);
      } else this.scene.remove(mesh);
      for (const markers of [this.targetMarkers, this.anchorMarkers, this.idealMarkers]) {
        const marker = markers.get(id);
        if (!marker) continue;
        if (activeIds.has(id)) {
          if (marker.parent !== this.scene) this.scene.add(marker);
        } else this.scene.remove(marker);
      }
      const restartMarker = this.restartPlayerMarkers.get(id);
      if (restartMarker)
        restartMarker.visible = Boolean(
          activeIds.has(id) &&
            frame.restart &&
            (frame.restart.takerId === id || frame.restart.wallIds.includes(id)),
        );
    }
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
      const possessionMarker = this.possessionMarkers.get(player.id);
      if (possessionMarker) possessionMarker.visible = frame.ball.ownerId === player.id;
      const actionMarker = this.actionMarkers.get(player.id);
      if (actionMarker) {
        actionMarker.visible = Boolean(frame.actionableTargets?.includes(player.id));
        actionMarker.scale.setScalar(frame.selectedTarget === player.id ? 1.18 : 1);
      }
      if (
        frame.restart &&
        (frame.restart.takerId === player.id || frame.restart.wallIds.includes(player.id))
      ) {
        let marker = this.restartPlayerMarkers.get(player.id);
        if (!marker) {
          marker = new THREE.Mesh(
            new THREE.RingGeometry(1.1, 1.22, 24),
            new THREE.MeshBasicMaterial({
              side: THREE.DoubleSide,
              depthTest: false,
              transparent: true,
              opacity: 0.65,
            }),
          );
          marker.rotation.x = -Math.PI / 2;
          this.restartPlayerMarkers.set(player.id, marker);
          this.scene.add(marker);
        }
        marker.visible = true;
        (marker.material as THREE.MeshBasicMaterial).color.setHex(
          frame.restart.takerId === player.id ? 0x75dfe3 : 0xf4c970,
        );
        marker.position.set(world.x, 0.065, world.z);
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
    const presentedBall = frame.ball;
    const ball = tacticalToWorld(presentedBall, Math.max(BALL_RADIUS, presentedBall.height ?? 0));
    this.ball.position.set(ball.x, ball.y, ball.z);
    this.ballShadow.position.set(this.ball.position.x, 0.045, this.ball.position.z);
    this.ballPicker.position.copy(this.ball.position);
    if (this.cameraMode === 'tactical') this.updateTacticalCamera(frame, presentedBall);
    if (this.cameraMode === 'goal_replay') {
      const pose = deriveSelectedReplayCameraPose(frame, this.replayCamera);
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
    this.restartSpotMarker.visible = Boolean(frame.restart);
    this.restartDeliveryMarker.visible = Boolean(frame.restart?.deliveryTarget);
    if (frame.restart) {
      const spot = tacticalToWorld(frame.restart.spot);
      this.restartSpotMarker.position.set(spot.x, 0.07, spot.z);
      (this.restartSpotMarker.material as THREE.MeshBasicMaterial).color.setHex(
        frame.restart.ready ? 0x7adea2 : 0xf4c970,
      );
      if (frame.restart.deliveryTarget) {
        const target = tacticalToWorld(frame.restart.deliveryTarget);
        this.restartDeliveryMarker.position.set(target.x, 0.07, target.z);
      }
    }
    this.renderMotionVectors(frame);
    this.renderDiagnostics(frame, debug);
    this.renderer.render(this.scene, this.camera);
    this.renderActionFeedback(frame);
    const cpuMs = performance.now() - renderStart;
    this.renderSamples++;
    this.renderCpuTotalMs += cpuMs;
    this.renderCpuMaxMs = Math.max(this.renderCpuMaxMs, cpuMs);
  }

  setDiagnostics(options: Partial<TacticalDiagnosticOptions>) {
    this.diagnostics = tacticalDiagnosticOptionsSchema.parse({ ...this.diagnostics, ...options });
    if (!this.presentationActive) return;
    if (this.lastValidFrame) this.render(this.lastValidFrame, this.lastDebugMode);
  }

  setStadiumDetail(detail: StadiumDetail) {
    this.stadiumDetail = detail;
    if (!this.presentationActive) return;
    this.stadium.setDetail(detail);
    this.redraw();
  }

  setReplayCamera(selection: ReplayCameraSelection) {
    this.replayCamera = selection;
    if (this.lastValidFrame && this.cameraMode === 'goal_replay') this.resize();
  }

  /** Viewer activity is independent of canonical simulation and may restore one fresh snapshot. */
  setPresentationActive(active: boolean, frame?: TacticalFrame, debug = this.lastDebugMode) {
    if (frame) {
      this.lastValidFrame = frame;
      this.lastDebugMode = debug;
    }
    if (active === this.presentationActive) return;
    this.presentationActive = active;
    if (!active) {
      cancelAnimationFrame(this.zoomAnimation);
      this.zoomAnimation = 0;
      const drag = this.cameraDrag;
      this.cameraDrag = undefined;
      this.renderer.domElement.style.cursor = '';
      if (drag && this.renderer.domElement.hasPointerCapture(drag.pointerId))
        this.renderer.domElement.releasePointerCapture(drag.pointerId);
      return;
    }
    this.displayedZoom = this.cameraPreferences.zoom;
    this.stadium.setDetail(this.stadiumDetail);
    this.viewportReady = false;
    const goalAim = this.goalAimIntent;
    // The fresh frame is stored before any projection, avoiding an old-frame flash on re-entry.
    this.setCameraMode(this.cameraMode, this.focusedPlayerId, this.focusedTeam);
    if (goalAim && this.cameraMode === 'shot_aim') this.setGoalAimMarker(goalAim);
  }

  /** Detached transforms for software-render evidence; geometry/materials are shared read-only. */
  exportPresentationScene() {
    if (this.presentationActive) {
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
    }
    return { scene: this.scene.clone(), camera: this.camera.clone() };
  }

  getPresentationMetrics() {
    const geometries = new Set<THREE.BufferGeometry>();
    let meshes = 0;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        meshes++;
      }
    });
    return {
      renderSamples: this.renderSamples,
      averageCpuMs: this.renderSamples ? this.renderCpuTotalMs / this.renderSamples : 0,
      maxCpuMs: this.renderCpuMaxMs,
      activeAnimatedModels: this.lastValidFrame?.players.length ?? 0,
      cachedModels: this.playerModels.size,
      sceneMeshes: meshes,
      sharedGeometries: geometries.size,
      crowdInstances: this.stadium.crowdInstances,
      stadiumArchetype: this.stadium.configuration.archetype,
      stadiumDetail: this.stadium.detail.visible ? 'standard' : 'minimal',
      drawCalls: this.renderer.info?.render.calls ?? null,
      triangles: this.renderer.info?.render.triangles ?? null,
      diagnosticBufferBytes: this.diagnosticPositions.byteLength + this.diagnosticColors.byteLength,
    };
  }

  private renderDiagnostics(frame: TacticalFrame, legacyDebug: boolean) {
    const options = legacyDebug
      ? { ...this.diagnostics, movement: true, shape: true }
      : this.diagnostics;
    const projected = projectTacticalDiagnostics(frame, options);
    const color = new THREE.Color();
    let offset = 0;
    for (const line of projected.lines) {
      color.setHex(line.color);
      for (const point of [line.start, line.end]) {
        const world = tacticalToWorld(point, point.height ?? 0.12);
        this.diagnosticPositions[offset] = world.x;
        this.diagnosticColors[offset++] = color.r;
        this.diagnosticPositions[offset] = world.y;
        this.diagnosticColors[offset++] = color.g;
        this.diagnosticPositions[offset] = world.z;
        this.diagnosticColors[offset++] = color.b;
      }
    }
    this.diagnosticGeometry.setDrawRange(0, offset / 3);
    this.diagnosticGeometry.getAttribute('position').needsUpdate = true;
    this.diagnosticGeometry.getAttribute('color').needsUpdate = true;
    this.diagnosticLines.visible = offset > 0;
    this.camera.updateMatrixWorld();
    const visible = new Set<string>();
    for (const item of projected.labels) {
      const world = tacticalToWorld(item.position, item.position.height);
      const screen = this.feedbackProjection.set(world.x, world.y, world.z).project(this.camera);
      if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || screen.z < -1 || screen.z > 1)
        continue;
      visible.add(item.id);
      let label = this.diagnosticLabels.get(item.id);
      if (!label) {
        label = document.createElement('span');
        label.dataset.tacticalDiagnosticId = item.id;
        Object.assign(label.style, {
          position: 'absolute',
          pointerEvents: 'none',
          color: '#fff',
          background: 'rgba(14, 27, 25, 0.83)',
          font: '10px/1.2 monospace',
          padding: '2px 3px',
          maxWidth: '250px',
          transform: 'translate(-50%, -100%)',
        });
        this.feedbackLayer.append(label);
        this.diagnosticLabels.set(item.id, label);
      }
      label.textContent = item.text;
      label.style.left = `${Math.round(((screen.x + 1) * this.host.clientWidth) / 2)}px`;
      label.style.top = `${Math.round(((1 - screen.y) * this.host.clientHeight) / 2)}px`;
    }
    for (const [id, label] of this.diagnosticLabels)
      if (!visible.has(id)) {
        label.remove();
        this.diagnosticLabels.delete(id);
      }
  }

  private renderMotionVectors(frame: TacticalFrame) {
    const vectors = projectMotionVectors(frame);
    let offset = 0;
    const writePoint = (x: number, z: number) => {
      this.motionPositions[offset++] = x;
      this.motionPositions[offset++] = 0.16;
      this.motionPositions[offset++] = z;
    };
    for (const vector of vectors) {
      const start = tacticalToWorld(vector.start),
        end = tacticalToWorld(vector.end);
      const dx = end.x - start.x,
        dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const size = Math.min(length * 0.4, vector.controlled ? 0.65 : 0.45);
      const ux = dx / Math.max(0.001, length),
        uz = dz / Math.max(0.001, length);
      writePoint(start.x, start.z);
      writePoint(end.x, end.z);
      for (const side of [-1, 1]) {
        writePoint(end.x, end.z);
        writePoint(
          end.x - ux * size - uz * size * 0.5 * side,
          end.z - uz * size + ux * size * 0.5 * side,
        );
      }
    }
    this.motionGeometry.setDrawRange(0, offset / 3);
    this.motionGeometry.getAttribute('position').needsUpdate = true;
    this.motionLines.visible = vectors.length > 0;
  }

  /** Canvas and labels share the current camera; timing belongs to the recorded frame. */
  private renderActionFeedback(frame: TacticalFrame) {
    this.camera.updateMatrixWorld();
    const visible = new Set<string>();
    const occupied: { x: number; y: number; halfWidth: number }[] = [];
    for (const event of selectFrameFeedback(frame)) {
      const anchor = tacticalToWorld(event.position, 2.35);
      const projected = this.feedbackProjection
        .set(anchor.x, anchor.y, anchor.z)
        .project(this.camera);
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      )
        continue;
      const text = event.text;
      const halfWidth = text.length * 4 + 12;
      const x = Math.max(
        halfWidth + 4,
        Math.min(
          this.host.clientWidth - halfWidth - 4,
          ((projected.x + 1) * this.host.clientWidth) / 2,
        ),
      );
      const y = Math.max(
        26,
        Math.min(this.host.clientHeight - 4, ((1 - projected.y) * this.host.clientHeight) / 2),
      );
      if (
        occupied.some(
          (label) =>
            Math.abs(label.x - x) < label.halfWidth + halfWidth + 4 && Math.abs(label.y - y) < 23,
        )
      )
        continue;
      occupied.push({ x, y, halfWidth });
      visible.add(event.id);
      let label = this.feedbackLabels.get(event.id);
      if (!label) {
        label = document.createElement('span');
        label.dataset.actionEventId = event.id;
        label.dataset.actionKind = event.kind;
        label.textContent = text;
        Object.assign(label.style, {
          position: 'absolute',
          color: '#ffffff',
          background: 'rgba(24, 30, 29, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.64)',
          borderLeft: `3px solid ${this.kits[event.team].primary}`,
          borderRadius: '2px',
          padding: '3px 6px',
          whiteSpace: 'nowrap',
          font: '700 10px/1.15 Arial, sans-serif',
          letterSpacing: '0.02em',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.55)',
        });
        this.feedbackLabels.set(event.id, label);
        this.feedbackLayer.append(label);
      }
      label.style.left = `${Math.round(x)}px`;
      label.style.top = `${Math.round(y)}px`;
      label.style.transform = 'translate(-50%, -100%)';
      label.style.opacity = String(event.opacity);
    }
    for (const [id, label] of this.feedbackLabels)
      if (!visible.has(id)) {
        label.remove();
        this.feedbackLabels.delete(id);
      }
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
  /** Presentation-only hit test. The caller supplies legal targets; picking cannot commit play. */
  pick(
    clientX: number,
    clientY: number,
    goalIntentSide?: 'home' | 'away',
    actionablePlayerIds?: readonly string[],
  ): PresentationTarget | undefined {
    if (!this.presentationActive) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
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
      // A legally in-play sphere may overlap the painted line with its centre outside it.
      const point = {
        x: this.ball.position.x + PITCH_LENGTH / 2,
        y: this.ball.position.z + PITCH_WIDTH / 2,
      };
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
        return {
          kind: 'ball',
          point: {
            x: this.ball.position.x + PITCH_LENGTH / 2,
            y: this.ball.position.z + PITCH_WIDTH / 2,
          },
        };
    }
    const actionable = actionablePlayerIds === undefined ? undefined : new Set(actionablePlayerIds);
    const activeIds = new Set(this.lastValidFrame?.players.map((player) => player.id));
    // Expand only eligible actors in CSS pixels, so a crowded, nearer but unrelated body
    // cannot pre-empt the requested defender/pass target. Projection reflects zoom and orbit.
    const fallback = selectScreenSpacePlayerCandidate(
      [...this.playerMeshes.entries()]
        .filter(([id]) => activeIds.has(id) && (!actionable || actionable.has(id)))
        .map(([playerId, mesh]) => {
          const centre = mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
          const projected = centre.clone().project(this.camera);
          const bodyRadius = [
            new THREE.Vector3(0, -0.9, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0.6, 0, 0),
            new THREE.Vector3(0, 0, 0.6),
          ].reduce((maximum, offset) => {
            const edge = centre.clone().add(offset).project(this.camera);
            return Math.max(
              maximum,
              Math.hypot(
                ((edge.x - projected.x) * rect.width) / 2,
                ((edge.y - projected.y) * rect.height) / 2,
              ),
            );
          }, 0);
          return {
            playerId,
            x: rect.left + ((projected.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - projected.y) / 2) * rect.height,
            depth: projected.z,
            actionable: true,
            pickRadius: screenSpacePlayerPickRadius(bodyRadius),
          };
        }),
      { x: clientX, y: clientY },
      32,
    );
    if (fallback) return { kind: 'player', playerId: fallback.playerId };
    const playerHits = this.raycaster.intersectObjects(
      [...this.playerPickers.entries()]
        .filter(([id]) => activeIds.has(id) && (!actionable || actionable.has(id)))
        .map(([, picker]) => picker),
    );
    const playerHit = playerHits[0];
    if (playerHit) {
      let object: THREE.Object3D | null = playerHit.object;
      while (object && !object.userData.playerId) object = object.parent;
      if (object?.userData.playerId)
        return { kind: 'player', playerId: String(object.userData.playerId) };
    }
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
    if (!this.presentationActive || this.cameraMode !== 'shot_aim') return undefined;
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
    this.goalAimIntent = { ...intent };
    if (!this.presentationActive) return;
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
    if (!this.presentationActive) return;
    if (this.viewportReady) {
      if (this.lastValidFrame) this.renderDiagnostics(this.lastValidFrame, this.lastDebugMode);
      this.renderer.render(this.scene, this.camera);
      if (this.lastValidFrame) this.renderActionFeedback(this.lastValidFrame);
    }
  }

  /** Shared presentation-only framing for tactical play, aiming and stored replay frames. */
  setCameraMode(mode: MatchCameraMode, focusedPlayerId?: string, focusedTeam?: 'home' | 'away') {
    this.cameraMode = mode;
    this.focusedPlayerId = focusedPlayerId;
    this.focusedTeam = focusedTeam;
    if (!this.presentationActive) return;
    this.tacticalCamera.zoom =
      mode === 'goal_replay' ? 1 : cameraZoom(this.cameraPreferences, this.displayedZoom);
    for (const plane of this.goalPlanes.values()) plane.visible = false;
    this.aimMarker.visible = false;
    if (mode === 'tactical') {
      this.camera = this.tacticalCamera;
      if (this.lastValidFrame)
        this.updateTacticalCamera(this.lastValidFrame, this.lastValidFrame.ball);
    } else if (mode === 'shot_aim') {
      this.camera = this.shotCamera;
      const focused = this.lastValidFrame?.players.find((player) => player.id === focusedPlayerId);
      const pose = deriveShotAimCameraPose(focusedTeam ?? 'home', {
        x: focused?.x ?? PITCH_LENGTH / 2,
        y: focused?.y ?? PITCH_WIDTH / 2,
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
    const pose = deriveInteractiveCameraPose(
      this.cameraPreferences,
      this.cameraOffset,
      presentedBall,
      focused,
    );
    this.tacticalCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.tacticalCamera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  }
  setCameraPreferences(preferences: MatchCameraPreferences, focusedPlayerId?: string) {
    if (this.cameraPreferences.preset !== preferences.preset)
      this.cameraOffset = {
        ...resetCameraOffset(),
        ...(preferences.preset === 'overhead' ? { yaw: 0 } : {}),
      };
    const changedPreset = this.cameraPreferences.preset !== preferences.preset;
    this.cameraPreferences = { ...preferences };
    this.focusedPlayerId = focusedPlayerId;
    if (!this.presentationActive) return;
    if (changedPreset) this.resize();
    this.refreshCamera();
    if (!this.zoomAnimation && this.displayedZoom !== preferences.zoom)
      this.zoomAnimation = requestAnimationFrame(this.animateZoom);
  }
  resetView() {
    this.cameraOffset = {
      ...resetCameraOffset(),
      ...(this.cameraPreferences.preset === 'overhead' ? { yaw: 0 } : {}),
    };
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
    if (!this.presentationActive) return;
    this.tacticalCamera.zoom =
      this.cameraMode === 'goal_replay'
        ? 1
        : cameraZoom(this.cameraPreferences, this.displayedZoom);
    this.tacticalCamera.updateProjectionMatrix();
    if (this.cameraMode === 'tactical' && this.lastValidFrame)
      this.updateTacticalCamera(this.lastValidFrame, this.lastValidFrame.ball);
    this.redraw();
  }
  private readonly animateZoom = () => {
    if (!this.presentationActive) {
      this.zoomAnimation = 0;
      return;
    }
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
    if (!this.presentationActive || this.cameraMode !== 'tactical') return;
    event.preventDefault();
    const preferences = {
      ...this.cameraPreferences,
      zoom: zoomFromWheel(this.cameraPreferences.zoom, event.deltaY, event.deltaMode),
    };
    this.setCameraPreferences(preferences, this.focusedPlayerId);
    this.onCameraPreferences(preferences);
  };
  private readonly onCameraDown = (event: PointerEvent) => {
    if (!this.presentationActive) return;
    if (event.button === 0 && !this.cameraDrag) this.suppressClick = false;
    if (event.button !== 1 || this.cameraMode !== 'tactical') return;
    event.preventDefault();
    this.suppressClick = true;
    this.cameraDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
  };
  private readonly onCameraMove = (event: PointerEvent) => {
    if (!this.presentationActive) return;
    const drag = this.cameraDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const scale =
      (this.tacticalCamera.right - this.tacticalCamera.left) /
      this.tacticalCamera.zoom /
      Math.max(1, this.host.clientWidth);
    const pan = event.shiftKey || this.cameraPreferences.preset === 'overhead';
    this.cameraOffset = applyCameraGesture(this.cameraOffset, {
      kind: pan ? 'pan' : 'orbit',
      dx: (event.clientX - drag.x) * (pan ? scale : 1),
      dy: (event.clientY - drag.y) * (pan ? scale : 1),
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
    if (!this.presentationActive) return;
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
          : this.cameraMode === 'goal_replay'
            ? this.replayCamera === 'overview'
              ? cameraViewSpan('overview', aspect).horizontal
              : Math.max(
                  this.replayCamera === 'actors' ? 76 : 56,
                  (this.replayCamera === 'actors' ? 52 : 40) * aspect,
                )
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
    this.feedbackLayer.remove();
    this.feedbackLabels.clear();
    this.diagnosticLabels.clear();
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
    const collectResources = (object: THREE.Object3D) => {
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
    };
    this.scene.traverse(collectResources);
    // Detached dismissed rigs remain available to replay and need the same final disposal.
    for (const mesh of this.playerMeshes.values()) mesh.traverse(collectResources);
    for (const markers of [this.targetMarkers, this.anchorMarkers, this.idealMarkers])
      for (const marker of markers.values()) marker.traverse(collectResources);
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
    if (!this.presentationActive) {
      this.report(undefined);
      return;
    }
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
