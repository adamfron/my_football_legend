import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import {
  applyRestartScenario,
  createTacticalMatch,
  resolveMatchAction,
  stepTacticalMatch,
  FIXED_MATCH_DT,
} from '../../../core/matchSimulation';
import {
  deriveLocomotion,
  derivePlayerPose,
  projectBodyDimensions,
  cueWeight,
  playerPoseSchema,
} from './animation';
import { PresentationFrameProjector, observeAnimationCues } from './frameProjection';
import {
  DEFAULT_KITS,
  tacticalFrameSchema,
  type TacticalFrame,
  type TacticalPlayer,
} from './model';
import { PlayerModel, PlayerModelResources } from './playerModel';
import {
  appendReplayFrame,
  interpolatePresentationFrames,
  sampleReplayFrame,
  deriveReplayCameraPose,
} from './replay';

const player: TacticalPlayer = {
  id: 'p',
  team: 'home',
  x: 40,
  y: 30,
  facing: 0,
  velocity: { x: 0, y: 4 },
  heightCm: 180,
  weightKg: 75,
};
const frame: TacticalFrame = {
  timestampMs: 0,
  players: [player],
  ball: { x: 40, y: 30 },
  continuity: 'one',
};
const world = createCanonicalWorldDatabase();
const makeState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr142-animation',
      control: { mode: 'spectator' },
    }),
  );
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

describe('seekable presentation poses', () => {
  it.each([
    [0, 'idle'],
    [1, 'walk'],
    [4, 'run'],
    [7, 'sprint'],
  ] as const)('classifies canonical speed %s', (speed, mode) => {
    expect(deriveLocomotion(speed)).toBe(mode);
  });
  it('scales body dimensions from the canonical profile and bounds malformed extremes', () => {
    expect(projectBodyDimensions(player)).toEqual({ height: 1.8, width: 1 });
    expect(projectBodyDimensions({ ...player, heightCm: 200, weightKg: 100 }).height).toBe(2);
    expect(projectBodyDimensions({ ...player, weightKg: 10000 }).width).toBe(1.2);
  });
  it('has increasing stride amplitude, preserves facing and blends out a kick', () => {
    const input = freeze({
      ...player,
      gaitPhase: Math.PI / 2,
      cue: { kind: 'shot' as const, atMs: 1000 },
    });
    const walk = derivePlayerPose({ ...input, cue: undefined, gaitSpeed: 1 }, 1000);
    const sprint = derivePlayerPose({ ...input, cue: undefined, gaitSpeed: 7 }, 1000);
    expect(Math.abs(sprint.hipLeft)).toBeGreaterThan(Math.abs(walk.hipLeft));
    expect(cueWeight(input.cue, 999)).toBe(0);
    expect(derivePlayerPose(input, 1000).hipRight).toBeCloseTo(-1.15);
    expect(derivePlayerPose(input, 1620)).toEqual(
      derivePlayerPose({ ...input, cue: undefined }, 1620),
    );
    expect(input.facing).toBe(0);
    expect(derivePlayerPose(input, 1150)).toEqual(derivePlayerPose(input, 1150));
  });
  it('uses both hands and planted legs for throw setup and forward follow-through', () => {
    const setup = { ...player, preparation: 'throw' as const, preparationSinceMs: 0 };
    const ready = derivePlayerPose(setup, 700);
    expect(ready.armLeft).toBe(ready.armRight);
    expect(ready.armLeft).toBeCloseTo(-3);
    expect(ready.hipLeft).toBe(0);
    expect(ready.hipRight).toBe(0);
    const release = derivePlayerPose({ ...player, cue: { kind: 'throw', atMs: 700 } }, 700);
    expect(release.armLeft).toBe(release.armRight);
    expect(release.armLeft).toBeCloseTo(-1.65);
  });
  it.each([
    'pass',
    'shot',
    'cross',
    'receive',
    'throw',
    'header',
    'contest',
    'catch',
    'low_save',
    'high_save',
    'distribution',
  ] as const)('has a finite bounded %s cue', (kind) => {
    const pose = derivePlayerPose(
      freeze({ ...player, cue: { kind, atMs: 0, contactHeight: 5, side: 1 } }),
      50,
    );
    expect(playerPoseSchema.safeParse(pose).success).toBe(true);
    expect(pose.lift).toBeLessThanOrEqual(0.45);
  });
});

describe('canonical evidence projection', () => {
  it.each(['pass', 'cross', 'shot', 'header'] as const)(
    'observes %s release once without changing the ball',
    (kind) => {
      const before = makeState();
      const actor = before.players.find((p) => p.id === before.ball.ownerId)!;
      const receiver = before.players.find((p) => p.team === actor.team && p.id !== actor.id)!;
      const target = { x: 80, y: 34 };
      const action =
        kind === 'pass'
          ? {
              type: kind,
              actorId: actor.id,
              receiverId: receiver.id,
              target,
              intent: 'support' as const,
            }
          : kind === 'cross'
            ? { type: kind, actorId: actor.id, target, intent: 'floated' as const }
            : kind === 'shot'
              ? { type: kind, actorId: actor.id, target, intent: 'placed' as const }
              : { type: kind, actorId: actor.id, target, intent: 'header_pass' as const };
      const after = freeze(resolveMatchAction(before, action));
      const projector = new PresentationFrameProjector();
      projector.observe(before);
      const projected = projector.frame(after);
      expect(projected.players.find((p) => p.id === actor.id)?.cue?.kind).toBe(kind);
      expect(projected.ball).toMatchObject({
        x: after.ball.x,
        y: after.ball.y,
        height: after.ball.height,
      });
      expect(projector.frame(after)).toEqual(projected);
      expect(tacticalFrameSchema.safeParse(projected).success).toBe(true);
    },
  );
  it('projects throw setup and release without creating an alternate trajectory', () => {
    const setup = applyRestartScenario(makeState(), 'throw_in', {
      restartTeam: 'home',
      restartPoint: { x: 72, y: 0 },
    });
    const projector = new PresentationFrameProjector();
    const taker = setup.restart!.takerId;
    expect(projector.frame(freeze(setup)).players.find((p) => p.id === taker)?.preparation).toBe(
      'throw',
    );
    const receiver = setup.players.find((p) => p.team === 'home' && p.id !== taker)!;
    const after = resolveMatchAction(setup, {
      type: 'pass',
      actorId: taker,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    });
    const projected = projector.frame(freeze(after));
    expect(projected.players.find((p) => p.id === taker)?.cue?.kind).toBe('throw');
    expect(projected.players.find((p) => p.id === taker)?.preparation).toBeUndefined();
    expect(projected.ball.height).toBe(1.9);
  });
  it('observes reception and aerial winners/contestants rather than guessing from possession', () => {
    const before = makeState(),
      id = before.players[1]!.id,
      other = before.players[2]!.id;
    const received = {
      ...before,
      time: 1,
      lastReceptionOutcome: {
        receiverId: id,
        kind: 'failed_control' as const,
        contactPoint: { x: 50, y: 34 },
      },
    };
    expect(observeAnimationCues(before, freeze(received)).get(id)).toMatchObject({
      kind: 'receive',
      atMs: 1000,
    });
    const headed = {
      ...before,
      time: 2,
      lastAerialContact: {
        point: { x: 50, y: 34 },
        ballHeight: 2.1,
        candidates: [],
        contestantIds: [id, other],
        winnerId: id,
      },
      lastAerialResult: 'attacking_header' as const,
    };
    const cues = observeAnimationCues(before, freeze(headed));
    expect(cues.get(id)).toMatchObject({ kind: 'header', contactHeight: 2.1 });
    expect(cues.get(other)?.kind).toBe('contest');
    expect(observeAnimationCues(headed, headed).size).toBe(0);
  });
  it.each([
    [0.3, 'low_save'],
    [1.8, 'high_save'],
  ] as const)('uses canonical keeper contact height %s', (height, expected) => {
    const before = makeState(),
      keeper = before.players.find((p) => p.profile.primaryPosition === 'goalkeeper')!;
    const after = {
      ...before,
      time: 2,
      lastBallContact: {
        kind: 'goalkeeper' as const,
        playerId: keeper.id,
        point: { x: keeper.position.x, y: keeper.position.y + 0.5, z: height },
        segmentFraction: 0.5,
        at: 1.99,
        preContactSpeed: 20,
        postContactSpeed: 5,
      },
    };
    expect(observeAnimationCues(before, freeze(after)).get(keeper.id)).toMatchObject({
      kind: expected,
      atMs: 1990,
    });
  });
  it('never changes canonical results when rendering at different FPS or seeking poses', () => {
    let state = makeState();
    let control = structuredClone(state);
    const projector = new PresentationFrameProjector();
    for (let i = 0; i < 80; i++) {
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      control = stepTacticalMatch(control, FIXED_MATCH_DT);
      projector.observe(state);
      if (i % 3 === 0) {
        const projected = freeze(projector.frame(state));
        projected.players.forEach((p) => derivePlayerPose(p, projected.timestampMs));
        deriveReplayCameraPose(projected);
      }
    }
    expect(state).toEqual(control);
    expect(projector.frame(state)).toEqual(projector.frame(state));
  });
  it('distinguishes keeper ready, moving, claim and distribution without inventing a save', () => {
    const state = makeState();
    const keeper = state.players.find((p) => p.profile.primaryPosition === 'goalkeeper')!;
    const projector = new PresentationFrameProjector();
    const ready = projector.frame(state).players.find((p) => p.id === keeper.id)!;
    expect(ready.cue).toBeUndefined();
    expect(derivePlayerPose({ ...ready, gaitSpeed: 0 }, 0).crouch).toBeGreaterThan(0);
    const moving = {
      ...state,
      time: 0.025,
      players: state.players.map((p) =>
        p.id === keeper.id ? { ...p, velocity: { x: 0, y: 3 } } : p,
      ),
      keeperIntervention: {
        keeperId: keeper.id,
        intention: 'claim' as const,
        target: keeper.position,
        distanceToContact: 2,
      },
    };
    const claim = projector.frame(freeze(moving)).players.find((p) => p.id === keeper.id)!;
    expect(claim.preparation).toBe('claim');
    expect(claim.cue).toBeUndefined();
    expect(claim.gaitPhase).toBeGreaterThan(ready.gaitPhase!);
    const receiver = state.players.find((p) => p.team === keeper.team && p.id !== keeper.id)!;
    const released = resolveMatchAction(
      { ...state, ball: { ...keeper.position, ownerId: keeper.id } },
      {
        type: 'pass',
        actorId: keeper.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      },
    );
    expect(observeAnimationCues(state, released).get(keeper.id)?.kind).toBe('distribution');
  });
  it('projects a canonical aerial claim as a catch and expires it without replaying stale evidence', () => {
    const state = makeState();
    const keeper = state.players.find((p) => p.profile.primaryPosition === 'goalkeeper')!;
    const caught = {
      ...state,
      time: 0.025,
      lastAerialResult: 'keeper_claim' as const,
      lastAerialContact: {
        point: keeper.position,
        ballHeight: 2,
        candidates: [],
        contestantIds: [keeper.id],
        winnerId: keeper.id,
      },
    };
    const projector = new PresentationFrameProjector();
    projector.observe(state);
    expect(projector.frame(freeze(caught)).players.find((p) => p.id === keeper.id)?.cue?.kind).toBe(
      'catch',
    );
    expect(
      projector.frame({ ...caught, time: 1 }).players.find((p) => p.id === keeper.id)?.cue,
    ).toBeUndefined();
  });
});

describe('rig resources and independent selection', () => {
  it('keeps both throwing hands close to the single held ball through preparation', () => {
    const rig = new PlayerModel(player, DEFAULT_KITS.home, new PlayerModelResources());
    for (const atMs of [0, 325, 650]) {
      rig.update({ ...player, preparation: 'throw', preparationSinceMs: 0 }, atMs);
      rig.root.updateMatrixWorld(true);
      const left = rig.leftHand.getWorldPosition(new THREE.Vector3());
      const right = rig.rightHand.getWorldPosition(new THREE.Vector3());
      expect(left.distanceTo(right)).toBeLessThan(0.4);
      expect(left.y).toBeCloseTo(right.y);
      expect(rig.leftHip.rotation.x).toBe(0);
      expect(rig.rightHip.rotation.x).toBe(0);
    }
  });
  it.each(['solid', 'vertical_stripes', 'halves', 'hoops', 'sash'] as const)(
    'builds %s without changing kits or picker geometry',
    (pattern) => {
      const resources = new PlayerModelResources();
      const kit = freeze({ ...DEFAULT_KITS.home, pattern });
      const rig = new PlayerModel(player, kit, resources);
      const other = new PlayerModel({ ...player, id: 'other', goalkeeper: true }, kit, resources);
      expect(rig.picker.geometry).toBe(other.picker.geometry);
      expect(rig.picker.parent).toBe(rig.root);
      rig.root.updateMatrixWorld(true);
      const pickerMatrix = rig.picker.matrixWorld.clone();
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.4, 5), new THREE.Vector3(0, 0, -1));
      const distance = ray.intersectObject(rig.picker)[0]!.distance;
      rig.update({ ...player, cue: { kind: 'high_save', atMs: 0, side: 1 } }, 100);
      rig.root.updateMatrixWorld(true);
      expect(rig.picker.matrixWorld).toEqual(pickerMatrix);
      expect(ray.intersectObject(rig.picker)[0]!.distance).toBe(distance);
      expect(rig.root.position.toArray()).toEqual([0, 0, 0]);
    },
  );
});

describe('recorded frame interpolation', () => {
  it('interpolates position and shortest facing without anticipating an action or possession', () => {
    const before = freeze({ ...frame, players: [{ ...player, facing: Math.PI - 0.1 }] });
    const next = freeze({
      ...frame,
      timestampMs: 100,
      players: [
        { ...player, x: 41, facing: -Math.PI + 0.1, cue: { kind: 'shot' as const, atMs: 100 } },
      ],
      ball: { x: 42, y: 30 },
    });
    const middle = interpolatePresentationFrames(before, next, 50);
    expect(middle.players[0]!.x).toBe(40.5);
    expect(middle.players[0]!.facing).toBeCloseTo(Math.PI);
    expect(middle.players[0]!.cue).toBeUndefined();
    expect(middle.ball).toEqual(before.ball);
    expect(sampleReplayFrame([before, next], 100)).toBe(next);
  });
  it('does not invent paths across missing background time, restarts or teleports', () => {
    expect(interpolatePresentationFrames(frame, { ...frame, timestampMs: 5000 }, 100)).toBe(frame);
    expect(
      interpolatePresentationFrames(frame, { ...frame, timestampMs: 100, continuity: 'two' }, 50),
    ).toBe(frame);
    expect(
      interpolatePresentationFrames(
        frame,
        { ...frame, timestampMs: 100, players: [{ ...player, x: 80 }] },
        50,
      ).players[0]!.x,
    ).toBe(40);
  });
  it('bounds and deduplicates replay samples and resets on scenario rewind', () => {
    const frames: TacticalFrame[] = [];
    for (let t = 0; t <= 11000; t += 25) appendReplayFrame(frames, { ...frame, timestampMs: t });
    expect(frames.length).toBe(401);
    appendReplayFrame(frames, { ...frame, timestampMs: 11000 });
    expect(frames.length).toBe(401);
    appendReplayFrame(frames, frame);
    expect(frames).toEqual([frame]);
  });
});
