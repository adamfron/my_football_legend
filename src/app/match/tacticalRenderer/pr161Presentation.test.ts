import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BALL_RADIUS } from '../../../core/matchSimulation/ballFlight';
import { DEFAULT_KITS, type TacticalPlayer } from './model';
import { deriveMovementPresentation, derivePlayerPose, playerPoseSchema } from './animation';
import { PlayerModel, PlayerModelResources } from './playerModel';
import {
  cameraViewSpan,
  cameraZoom,
  deriveInteractiveCameraPose,
  deriveSelectedReplayCameraPose,
  resetCameraOffset,
} from './cameraInteraction';
import {
  DEFAULT_TACTICAL_DIAGNOSTICS,
  MAX_DIAGNOSTIC_LINES,
  createTacticalDiagnosticFixture,
  diagnosticLineSchema,
  projectTacticalDiagnostics,
} from './diagnosticOverlay';
import { StadiumModel, deriveStadiumConfiguration, stadiumConfigurationSchema } from './stadium';

const player: TacticalPlayer = {
  id: 'fixture',
  team: 'home',
  x: 57,
  y: 32,
  facing: 0,
  velocity: { x: 0, y: 4 },
  gaitPhase: 1.2,
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

describe('PR161 measured locomotion and contact evidence', () => {
  it.each([
    [0, 'idle'],
    [1, 'walk'],
    [3, 'jog'],
    [4, 'run'],
    [7, 'sprint'],
  ] as const)('shows measured %.1f m/s as %s', (speed, locomotion) => {
    expect(deriveMovementPresentation({ ...player, velocity: { x: 0, y: speed } }).locomotion).toBe(
      locomotion,
    );
  });
  it('distinguishes acceleration, braking, stopping, lateral and backward motion', () => {
    const steady = derivePlayerPose(player, 1000);
    const accelerating = { ...player, acceleration: { x: 0, y: 2 } };
    const braking = { ...player, acceleration: { x: 0, y: -2 } };
    expect(deriveMovementPresentation(accelerating).effort).toBe('accelerating');
    expect(deriveMovementPresentation(braking).effort).toBe('braking');
    expect(deriveMovementPresentation({ ...braking, velocity: { x: 0, y: 0.5 } }).effort).toBe(
      'stopping',
    );
    expect(derivePlayerPose(accelerating, 1000).lean).toBeGreaterThan(steady.lean);
    expect(derivePlayerPose(braking, 1000).lean).toBeLessThan(steady.lean);
    const lateral = { ...player, velocity: { x: 2, y: 0 } };
    const backward = { ...player, velocity: { x: 0, y: -2 } };
    expect(deriveMovementPresentation(lateral).direction).toBe('lateral');
    expect(derivePlayerPose(lateral, 1000).hipSpread).not.toBe(0);
    expect(deriveMovementPresentation(backward).direction).toBe('backward');
    expect(derivePlayerPose(backward, 1000).lean).toBeLessThan(0);
  });
  it('uses recorded contact time and region without turning multiple contacts into a named move', () => {
    const idle = { ...player, velocity: { x: 0, y: 0 }, gaitSpeed: 0 };
    const contact = {
      lastAtMs: 1000,
      lastRegion: 'left_foot' as const,
      physicalCount: 2,
      retained: true,
    };
    const before = derivePlayerPose({ ...idle, contact }, 999);
    const touched = derivePlayerPose({ ...idle, contact }, 1000);
    expect(touched.hipLeft).toBeLessThan(before.hipLeft);
    expect(touched.hipRight).toBe(before.hipRight);
    expect(derivePlayerPose({ ...idle, contact: { ...contact, physicalCount: 14 } }, 1000)).toEqual(
      touched,
    );
    expect(
      derivePlayerPose(
        { ...idle, contact: { ...contact, retained: false, nextFailed: true } },
        1000,
      ).armSpread,
    ).toBeGreaterThan(touched.armSpread);
    // Exposure between contacts does not hold the foot in a permanent contact pose.
    expect(derivePlayerPose({ ...idle, contact }, 1250).hipLeft).toBe(0);
    const unexecuted = derivePlayerPose(
      { ...idle, contact: { nextFailed: true, failedAtMs: 1000, region: 'left_foot' } },
      1000,
    );
    expect(unexecuted.hipLeft).toBe(0);
    expect(unexecuted.armSpread).toBeGreaterThan(before.armSpread);
    const planned = derivePlayerPose(
      { ...idle, contact: { region: 'right_foot', plannedAtMs: 1100 } },
      1000,
    );
    expect(planned.hipRight).toBeLessThan(0);
  });
  it('keeps repeated low-progress turning visibly stationary and preserves the independent picker', () => {
    const input = freeze({
      ...player,
      velocity: { x: 0, y: 0 },
      angularVelocity: 3.1,
      preparation: 'turning' as const,
      contact: { physicalCount: 11, balance: 0.45 },
    });
    const rig = new PlayerModel(input, DEFAULT_KITS.home, new PlayerModelResources());
    rig.root.position.set(4, 0, 6);
    rig.root.rotation.y = input.facing!;
    rig.root.updateMatrixWorld(true);
    const picker = rig.picker.matrixWorld.clone();
    for (const atMs of [0, 150, 250, 1000]) {
      rig.update(input, atMs);
      rig.root.updateMatrixWorld(true);
      expect(rig.root.position.toArray()).toEqual([4, 0, 6]);
      expect(rig.root.rotation.y).toBe(input.facing);
      expect(rig.picker.matrixWorld).toEqual(picker);
      expect(playerPoseSchema.safeParse(derivePlayerPose(input, atMs)).success).toBe(true);
    }
    expect(derivePlayerPose(input, 150).torsoYaw).not.toBe(0);
  });
  it('distinguishes contain, engagement, missed challenge and true shielding', () => {
    const contain = derivePlayerPose({ ...player, defensive: { intent: 'contain' } }, 1000);
    const engage = derivePlayerPose({ ...player, defensive: { intent: 'engage' } }, 1000);
    const miss = derivePlayerPose(
      { ...player, defensive: { intent: 'recovery', outcome: 'missed' } },
      1000,
    );
    const shield = derivePlayerPose({ ...player, preparation: 'shielding' }, 1000);
    expect(contain.crouch).toBeGreaterThan(engage.crouch);
    expect(engage.lean).toBeGreaterThan(contain.lean);
    expect(miss.armSpread).toBeGreaterThan(engage.armSpread);
    expect(shield.armSpread).toBeGreaterThan(contain.armSpread);
  });
  it('distinguishes actual catch height, parry, missed reach and penalty readiness', () => {
    const keeper = { ...player, goalkeeper: true, velocity: { x: 0, y: 0 } };
    const low = derivePlayerPose(
      { ...keeper, goalkeeperIntervention: { kind: 'catch', height: 0.3 } },
      1000,
    );
    const high = derivePlayerPose(
      { ...keeper, goalkeeperIntervention: { kind: 'catch', height: 1.8 } },
      1000,
    );
    const parry = derivePlayerPose(
      {
        ...keeper,
        cue: { kind: 'high_save', atMs: 1000 },
        goalkeeperIntervention: { kind: 'parry', height: 1.8 },
      },
      1000,
    );
    const miss = derivePlayerPose(
      { ...keeper, goalkeeperIntervention: { kind: 'failed_save' } },
      1000,
    );
    const penalty = derivePlayerPose(
      { ...keeper, goalkeeperIntervention: { kind: 'penalty_ready' } },
      1000,
    );
    expect(high.armLeft).toBeLessThan(low.armLeft);
    expect(low.crouch).toBeGreaterThan(high.crouch);
    expect(parry.armSpread).toBeGreaterThan(high.armSpread);
    expect(parry.elbowLeft).toBeGreaterThan(high.elbowLeft);
    expect(miss.armLeft).not.toBe(miss.armRight);
    expect(penalty.crouch).toBeGreaterThan(high.crouch);
  });
  it('changes fatigue/assessment posture and temporary goalkeeper kit without moving bodies', () => {
    const fresh = {
      ...player,
      velocity: { x: 0, y: 0 },
      fitness: { capacity: 1, burstReadiness: 1 },
    };
    const tired = freeze({ ...fresh, fitness: { capacity: 0.5, burstReadiness: 0.1 } });
    expect(derivePlayerPose(tired, 1000).lean).toBeGreaterThan(derivePlayerPose(fresh, 1000).lean);
    const injured = {
      ...tired,
      participation: 'assisted_removal' as const,
      injury: {
        id: 'injury',
        playerId: player.id,
        at: 1,
        status: 'unable' as const,
        mechanism: 'contact' as const,
        injuryType: 'impact' as const,
        recoveryDays: 2,
        assessmentRequired: true,
      },
    };
    expect(derivePlayerPose(injured, 1000).crouch).toBeGreaterThan(
      derivePlayerPose(tired, 1000).crouch,
    );
    const rig = new PlayerModel(fresh, DEFAULT_KITS.home, new PlayerModelResources());
    rig.update({ ...fresh, goalkeeper: true, participation: 'entering' }, 1000);
    expect(rig.root.userData.goalkeeperRole).toBe(true);
    expect(rig.root.userData.participation).toBe('entering');
    const shirt = rig.torso.children.find((item) => item instanceof THREE.Mesh) as THREE.Mesh;
    expect((shirt.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      DEFAULT_KITS.home.goalkeeper.primary.slice(1),
    );
    expect(rig.root.position.toArray()).toEqual([0, 0, 0]);
    rig.update(fresh, 1000);
    expect((shirt.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      DEFAULT_KITS.home.primary.slice(1),
    );
  });
});

describe('canonical wall response', () => {
  it('uses actual jump height without moving the root or inventing a jump before reaction', () => {
    const hold = {
      ...player,
      wallResponse: { choice: 'hold' as const, jumpHeight: 0, reactionAtMs: 1200 },
    };
    const jumping = {
      ...player,
      wallResponse: { choice: 'jump' as const, jumpHeight: 0.32, reactionAtMs: 1000 },
    };
    expect(derivePlayerPose(hold, 1000).lift).toBe(0);
    expect(derivePlayerPose(jumping, 1100).lift).toBe(0.32);
    const rig = new PlayerModel(jumping, DEFAULT_KITS.home, new PlayerModelResources());
    rig.update(jumping, 1100);
    expect(rig.root.position.y).toBe(0);
    expect(rig.body.position.y).toBe(0.32);
  });
});

describe('canonical goal responses', () => {
  it('shows a confirmed scorer reaction versus urgent retrieval without anticipating a goal or moving roots', () => {
    const response = {
      goalId: 'scored-shot',
      role: 'scorer' as const,
      phase: 'celebration' as const,
      startedAtMs: 1000,
      reactionUntilMs: 2500,
      urgent: false,
      scorerId: player.id,
      retrieverId: 'actual-retriever',
    };
    const scorer = freeze({ ...player, velocity: { x: 0, y: 0 }, goalResponse: response });
    const original = structuredClone(scorer);
    const before = derivePlayerPose({ ...scorer, goalResponse: undefined }, 999);
    expect(derivePlayerPose(scorer, 999)).toEqual(before);
    const celebrated = derivePlayerPose(scorer, 1000);
    expect(celebrated.armLeft).toBeLessThan(before.armLeft);
    expect(celebrated.armSpread).toBeGreaterThan(before.armSpread);
    expect(derivePlayerPose(scorer, 2600)).toEqual(
      derivePlayerPose({ ...scorer, goalResponse: undefined }, 2600),
    );
    const retriever = freeze({
      ...player,
      goalResponse: {
        ...response,
        urgent: true,
        phase: 'urgent_retrieval' as const,
        retrieverId: player.id,
      },
    });
    const retrieving = derivePlayerPose(retriever, 1000);
    const running = derivePlayerPose(player, 1000);
    expect(retrieving.armSpread).toBeLessThan(celebrated.armSpread);
    expect(retrieving.lean).toBeGreaterThan(running.lean);
    expect(retrieving.hipLeft).toBe(running.hipLeft);
    expect(retrieving.hipRight).toBe(running.hipRight);
    const uninvolved = { ...retriever, id: 'different-player' };
    expect(derivePlayerPose(uninvolved, 1000)).toEqual(
      derivePlayerPose({ ...uninvolved, goalResponse: undefined }, 1000),
    );
    const rig = new PlayerModel(scorer, DEFAULT_KITS.home, new PlayerModelResources());
    rig.root.position.set(3, 0, 5);
    rig.root.rotation.y = scorer.facing!;
    rig.root.updateMatrixWorld(true);
    const picker = rig.picker.matrixWorld.clone();
    rig.update(scorer, 1000);
    rig.root.updateMatrixWorld(true);
    expect(rig.root.position.toArray()).toEqual([3, 0, 5]);
    expect(rig.root.rotation.y).toBe(scorer.facing);
    expect(rig.picker.matrixWorld).toEqual(picker);
    expect(scorer).toEqual(original);
  });
});

describe('PR161 opt-in tactical truth and stable scenery', () => {
  it('projects separate actual/movement/anchor/tactical/contact positions without mutation', () => {
    const frame = freeze(createTacticalDiagnosticFixture());
    expect(projectTacticalDiagnostics(frame, DEFAULT_TACTICAL_DIAGNOSTICS)).toEqual({
      lines: [],
      labels: [],
    });
    const options = {
      identity: true,
      movement: true,
      shape: true,
      assignments: true,
      contacts: true,
      fitness: true,
      ball: true,
    };
    const overlay = projectTacticalDiagnostics(frame, options);
    expect(overlay.lines.length).toBeLessThan(MAX_DIAGNOSTIC_LINES);
    expect(overlay.lines.every((line) => diagnosticLineSchema.safeParse(line).success)).toBe(true);
    const carrier = overlay.lines.filter((line) => line.playerId === 'carrier');
    expect(carrier.find((line) => line.kind === 'movement')?.end).toEqual(frame.players[0]!.target);
    expect(carrier.find((line) => line.kind === 'anchor')?.end).toEqual(frame.players[0]!.anchor);
    expect(carrier.find((line) => line.kind === 'tactical')?.end).toEqual(
      frame.players[0]!.idealTarget,
    );
    expect(carrier.find((line) => line.kind === 'contact')?.end).toEqual(
      frame.players[0]!.contact?.plannedPoint,
    );
    expect(overlay.labels.find((item) => item.id === 'carrier')?.text).toContain('7 kontaktów');
    expect(
      overlay.lines.filter((line) => line.playerId === 'screen' && line.kind === 'assignment'),
    ).toHaveLength(0);
    const circle = overlay.lines.find((line) => line.kind === 'ball')!;
    expect(Math.hypot(circle.start.x - frame.ball.x, circle.start.y - frame.ball.y)).toBeCloseTo(
      BALL_RADIUS,
    );
    expect(projectTacticalDiagnostics(frame, options)).toEqual(overlay);
  });
  it('keeps near-overhead pitch readable at default zoom and replay cameras seekable', () => {
    const preferences = { preset: 'overhead' as const, zoom: 0.35 };
    const pose = deriveInteractiveCameraPose(
      preferences,
      resetCameraOffset(),
      { x: 2, y: 4 },
      { x: 97, y: 60 },
    );
    expect(pose.position).toEqual({ x: 0, y: 110, z: 0.01 });
    expect(pose.lookAt).toEqual({ x: 0, y: 0, z: 0 });
    for (const aspect of [4 / 3, 16 / 9]) {
      const span = cameraViewSpan('overhead', aspect);
      expect(span.horizontal / cameraZoom(preferences)).toBeGreaterThan(105);
      expect(span.vertical / cameraZoom(preferences)).toBeGreaterThan(68);
    }
    const frame = freeze(createTacticalDiagnosticFixture());
    expect(deriveSelectedReplayCameraPose(frame, 'ball')).toEqual(
      deriveSelectedReplayCameraPose(frame, 'ball'),
    );
    expect(deriveSelectedReplayCameraPose(frame, 'overview').lookAt).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('derives distinct stable stadiums from club identity with shared geometry and bounded crowd', () => {
    const kit = freeze(DEFAULT_KITS.home);
    const config = deriveStadiumConfiguration('pro_1', kit);
    expect(deriveStadiumConfiguration('pro_1', kit)).toEqual(config);
    const archetypes = new Set(
      Array.from(
        { length: 12 },
        (_, index) => deriveStadiumConfiguration(`pro_${index}`, kit).archetype,
      ),
    );
    expect(archetypes.size).toBe(3);
    expect(stadiumConfigurationSchema.safeParse(config).success).toBe(true);
    const model = new StadiumModel(config);
    const geometries = new Set<THREE.BufferGeometry>();
    model.root.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    expect(geometries.size).toBe(2);
    expect(model.crowdInstances).toBeLessThan(2500);
    const crowd = model.root.getObjectByName('static-crowd-silhouette');
    expect(crowd).toBeInstanceOf(THREE.InstancedMesh);
    expect(model.root.userData.decoration).toBe(true);
    model.setDetail('minimal');
    expect(model.detail.visible).toBe(false);
    expect(model.configuration).toEqual(config);
    model.dispose();
  });
});
