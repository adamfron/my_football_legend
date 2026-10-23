import { beforeAll, describe, expect, it } from 'vitest';
import { createFootballLabProfile } from '../../../scripts/footballLabProfile';
import type { FootballerProfile } from '../../types/domain';
import { createFootballDrillCatalog } from './footballLabCatalog';
import {
  footballSkillTrialConfigSchema,
  footballSkillTrialResultSchema,
  runFootballSkillTrial,
} from './footballPerformanceLab';
import {
  advanceLabBall,
  intersectLabPlane,
  labHoopSchema,
  labTargetSchema,
  labWallSchema,
  measureLabOpening,
} from './footballLabObjects';
import { integrateBallFlight, type PhysicalBall } from './ballPhysics';
import { BALL_RADIUS } from './ballFlight';

let profile: FootballerProfile;
const catalog = createFootballDrillCatalog();
const config = (id: string) => structuredClone(catalog.find((c) => c.id === id)!);
const run = (id: string, seed = 'pr184-contract') =>
  runFootballSkillTrial(config(id), profile, seed);
const flight = (x = 0, z = BALL_RADIUS): PhysicalBall => ({
  position: { x, y: 34, z },
  velocity: { x: 10, y: 0, z: 0 },
  airborne: z > BALL_RADIUS,
  bounceCount: 0,
});
beforeAll(() => {
  profile = createFootballLabProfile();
});

describe('physical apparatus and measured crossings', () => {
  it('interpolates a gate and counts a shared endpoint once', () => {
    const plane = {
      position: { x: 10, y: 34, z: 1 },
      normal: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 },
    };
    const crossing = intersectLabPlane({ x: 9.7, y: 34, z: 1 }, { x: 10.1, y: 34, z: 1 }, plane)!;
    expect(crossing.fraction).toBeCloseTo(0.75, 12);
    expect(2 + crossing.fraction * 0.025).toBeCloseTo(2.01875, 12);
    expect(
      intersectLabPlane({ x: 10, y: 34, z: 1 }, { x: 10.2, y: 34, z: 1 }, plane),
    ).toBeUndefined();
  });
  it('never treats a projected ball crossing as a real target hit', () => {
    const target = labTargetSchema.parse({
      id: 'high',
      kind: 'target',
      position: { x: 10, y: 34, z: 2 },
      normal: { x: 1, y: 0, z: 0 },
      width: 1,
      height: 1,
    });
    expect(intersectLabPlane({ x: 8, y: 34, z: 2 }, { x: 9, y: 34, z: 2 }, target)).toBeUndefined();
    const wrongHeight = intersectLabPlane(
      { x: 9, y: 34, z: 0.11 },
      { x: 11, y: 34, z: 0.11 },
      target,
    )!;
    expect(measureLabOpening(target, wrongHeight).hit).toBe(false);
    const actual = intersectLabPlane({ x: 9, y: 34, z: 2 }, { x: 11, y: 34, z: 2 }, target)!;
    expect(measureLabOpening(target, actual)).toEqual({ hit: true, errorMetres: 0 });
  });
  it('reflects a ball at a finite wall with restitution and tangential loss', () => {
    const wall = labWallSchema.parse({
      id: 'wall',
      kind: 'wall',
      position: { x: 1, y: 34, z: 1 },
      normal: { x: -1, y: 0, z: 0 },
      width: 8,
      height: 2,
      restitution: 0.8,
      tangentRetention: 0.5,
    });
    const ball = { ...flight(0.7), velocity: { x: 10, y: 2, z: 0 } };
    const result = advanceLabBall(ball, 0.05, [wall], 0);
    expect(result.contacts).toHaveLength(1);
    const contact = result.contacts[0]!;
    expect(contact.point.x).toBeCloseTo(1 - BALL_RADIUS, 8);
    expect(contact.outgoing.x).toBeCloseTo(-contact.incoming.x * 0.8, 9);
    expect(contact.outgoing.y).toBeCloseTo(contact.incoming.y * 0.5, 9);
    expect(result.ball.position.x).toBeLessThan(contact.point.x);
    expect(result.ball.position.x).toBeGreaterThan(0.1);
  });
  it('distinguishes a route marker from a colliding pole', () => {
    const object = {
      id: 'pole',
      kind: 'pole' as const,
      position: { x: 1, y: 34, z: 0 },
      radius: 0.08,
      height: 2,
      orientation: 0,
      collision: false,
      restitution: 0.38,
    };
    expect(advanceLabBall(flight(0.7), 0.05, [object], 0).contacts).toHaveLength(0);
    expect(
      advanceLabBall(flight(0.7), 0.05, [{ ...object, collision: true }], 0).contacts,
    ).toHaveLength(1);
    const inelastic = advanceLabBall(
      flight(0.7),
      0.05,
      [{ ...object, collision: true, restitution: 0 }],
      0,
    );
    expect(inelastic.contacts[0]!.outgoing.x).toBeCloseTo(0, 9);
  });
  it('handles elevated and horizontal hoop planes and excludes the finite ball at a rim', () => {
    const hoop = labHoopSchema.parse({
      id: 'hoop',
      kind: 'hoop',
      position: { x: 10, y: 34, z: 2 },
      normal: { x: 0, y: 0, z: 1 },
      up: { x: 0, y: 1, z: 0 },
      innerDiameter: 1,
      rimRadius: 0.03,
      direction: 'negative',
    });
    const hit = intersectLabPlane({ x: 10, y: 34, z: 3 }, { x: 10, y: 34, z: 1 }, hoop)!;
    expect(measureLabOpening(hoop, hit).hit).toBe(true);
    const edge = intersectLabPlane({ x: 10.45, y: 34, z: 3 }, { x: 10.45, y: 34, z: 1 }, hoop)!;
    expect(measureLabOpening(hoop, edge).hit).toBe(false);
    expect(measureLabOpening(hoop, { ...hit, direction: 'positive' }).hit).toBe(false);
  });
  it('launches the prescribed physical velocity and spin deterministically', () => {
    const c = footballSkillTrialConfigSchema.parse({
      id: 'launcher',
      drill: 'receive',
      maximumSeconds: 0.05,
      position: { x: 40, y: 34 },
      objects: [
        {
          id: 'launcher',
          kind: 'launcher',
          position: { x: 20, y: 34, z: 1 },
          velocity: { x: 8, y: 1, z: 3 },
          spin: { x: 20, y: 40, z: -10 },
          releaseAt: 0,
        },
      ],
    });
    const a = runFootballSkillTrial(c, profile, 'launcher'),
      b = runFootballSkillTrial(c, profile, 'launcher');
    expect(a).toEqual(b);
    expect(a.events.find((e) => e.kind === 'launcher_release')!.values).toMatchObject({
      vx: 8,
      vy: 1,
      vz: 3,
      spinX: 20,
      spinY: 40,
      spinZ: -10,
    });
    const expected = integrateBallFlight(
      {
        position: { x: 20, y: 34, z: 1 },
        velocity: { x: 8, y: 1, z: 3 },
        spin: { x: 20, y: 40, z: -10 },
        airborne: true,
        bounceCount: 0,
      },
      0.05,
    );
    expect(a.finalBall.position.x).toBeCloseTo(expected.position.x, 10);
    expect(a.finalBall.spin.y).toBeCloseTo(expected.spin!.y, 10);
  });
});

describe('additional apparatus contracts', () => {
  it('releases at an exact non-grid time and integrates only the remaining flight', () => {
    const c = footballSkillTrialConfigSchema.parse({
      id: 'fractional-launch',
      drill: 'receive',
      maximumSeconds: 0.025,
      position: { x: 50, y: 34 },
      objects: [
        {
          id: 'launcher',
          kind: 'launcher',
          position: { x: 20, y: 34, z: 1 },
          velocity: { x: 8, y: 1, z: 3 },
          spin: { x: 0, y: 40, z: 0 },
          releaseAt: 0.013,
        },
      ],
    });
    const r = runFootballSkillTrial(c, profile, 'fractional');
    expect(r.events.find((e) => e.kind === 'launcher_release')!.at).toBe(0.013);
    const expected = integrateBallFlight(
      {
        position: { x: 20, y: 34, z: 1 },
        velocity: { x: 8, y: 1, z: 3 },
        spin: { x: 0, y: 40, z: 0 },
        airborne: true,
        bounceCount: 0,
      },
      0.012,
    );
    expect(r.finalBall.position.x).toBeCloseTo(expected.position.x, 12);
  });
  it('physically hits the hoop rim before a grazing ball can cross', () => {
    const hoop = labHoopSchema.parse({
      id: 'hoop',
      kind: 'hoop',
      position: { x: 1, y: 34, z: 1 },
      normal: { x: 1, y: 0, z: 0 },
      innerDiameter: 1,
      rimRadius: 0.03,
      direction: 'positive',
    });
    const r = advanceLabBall(
      { ...flight(0.7, 1), position: { x: 0.7, y: 34.48, z: 1 } },
      0.05,
      [hoop],
      0,
    );
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]!.objectId).toBe('hoop');
    expect(r.contacts[0]!.point.x).toBeLessThan(1);
  });
  it('does not let an incidental target complete an unfinished route', () => {
    const c = footballSkillTrialConfigSchema.parse({
      id: 'incidental-target',
      drill: 'slalom',
      maximumSeconds: 0.05,
      route: [{ x: 40, y: 34 }],
      initialBall: {
        position: { x: 22, y: 34, z: 0.11 },
        velocity: { x: 4, y: 0, z: 0 },
        spin: { x: 0, y: 0, z: 0 },
        airborne: false,
        bounceCount: 0,
      },
      objects: [
        {
          id: 'marking',
          kind: 'target',
          position: { x: 22.05, y: 34, z: 0.4 },
          normal: { x: 1, y: 0, z: 0 },
          width: 2,
          height: 1,
        },
      ],
    });
    const r = runFootballSkillTrial(c, profile, 'incidental');
    expect(r.events.some((e) => e.kind === 'ball_plane')).toBe(true);
    expect(r.finishSeconds).toBeNull();
    expect(r.metrics.missedCheckpoints).toBe(1);
  });
  it('does not turn a manual carry command into a kick release', () => {
    const c = {
      ...config('pass-10-dominant-ground'),
      mode: 'manual' as const,
      maximumSeconds: 0.2,
      commands: [
        {
          at: 0,
          action: { type: 'carry' as const, actorId: profile.id, target: { x: 24, y: 34 } },
        },
      ],
    };
    const r = runFootballSkillTrial(c, profile, 'manual-carry');
    expect(r.events.some((e) => e.kind === 'release')).toBe(false);
    expect(r.finalPlayer.x).toBeGreaterThan(20);
    expect(r.metrics.touches).toBeGreaterThan(0);
    expect(r.finishSeconds).toBeNull();
  });
  it('uses configurable canonical small-goal frame contacts', () => {
    const goal = {
      id: 'small-goal',
      kind: 'goal' as const,
      position: { x: 1, y: 34, z: 0.5 },
      normal: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 },
      width: 2,
      height: 1,
      postRadius: 0.06,
      sectors: [],
    };
    const r = advanceLabBall(
      { ...flight(0.7, 0.5), position: { x: 0.7, y: 35, z: 0.5 } },
      0.05,
      [goal],
      0,
    );
    expect(r.contacts.some((c) => c.kind === 'right_post')).toBe(true);
    expect(r.ball.velocity.x).toBeLessThan(0);
  });
  it('records explicit pass feet and does not manufacture an incoming contact', () => {
    const c = { ...config('pass-first-time'), maximumSeconds: 0.025 };
    const r = runFootballSkillTrial(c, profile, 'incoming-projection');
    expect(r.events.some((e) => e.kind === 'release')).toBe(false);
    expect(r.finishSeconds).toBeNull();
    const weak = run('pass-10-weak-ground');
    expect(weak.events.find((e) => e.kind === 'release')!.values.foot).toBe('left_foot');
    expect(weak.events.find((e) => e.kind === 'release')!.values.technique).toBe('weak_foot');
  });
  it.each(['slalom-6-unrestricted', 'pass-20-weak-ground'])(
    'keeps observers independent during %s',
    (id) => {
      const a = run(id),
        b = runFootballSkillTrial(config(id), profile, 'pr184-contract', (sample) => {
          sample.velocity.x = 12345;
        });
      expect(a).toEqual(b);
    },
  );
  it('allows a manual normal-game pass command to reach the same release pathway', () => {
    const c = {
      ...config('pass-10-dominant-ground'),
      mode: 'manual' as const,
      commands: [
        {
          at: 0,
          action: {
            type: 'pass' as const,
            actorId: profile.id,
            receiverId: 'training-target',
            target: { x: 30, y: 34 },
            intent: 'direct' as const,
            delivery: 'ground' as const,
            foot: 'right' as const,
          },
        },
      ],
    };
    const r = runFootballSkillTrial(c, profile, 'manual-pass');
    expect(r.status).toBe('completed');
    expect(r.events.some((e) => e.kind === 'release')).toBe(true);
  });
});

describe('canonical physical trials', () => {
  it('measures a deterministic sprint from actual positions with standing and flying starts', () => {
    const a = run('sprint-20-standing');
    expect(a).toEqual(run('sprint-20-standing'));
    expect(a.status).toBe('completed');
    expect(a.finishSeconds).toBeGreaterThan(2);
    expect(a.samples.at(-1)!.player.x).toBeGreaterThanOrEqual(40);
    expect(a.samples.at(-2)!.player.x).toBeLessThan(40);
    expect(run('sprint-20-moving').finishSeconds!).toBeLessThan(a.finishSeconds!);
    expect(a.events.filter((e) => e.kind === 'player_gate')).toHaveLength(3);
  });
  it('does not complete a sprint merely because an arrival projection is available', () => {
    const c = { ...config('sprint-5-standing'), maximumSeconds: 0.025 };
    const r = runFootballSkillTrial(c, profile, 'projection-anticheat');
    expect(r.predictions[0]!.predicted).toBeGreaterThan(0);
    expect(r.finalPlayer.x).toBeLessThan(20.01);
    expect(r.finishSeconds).toBeNull();
    expect(r.status).toBe('incomplete');
  });
  it.each(['left', 'right'])(
    'physically returns across the 505 timing gate after a %s turn',
    (direction) => {
      const r = run(`505-${direction}`);
      expect(r.status).toBe('completed');
      expect(Math.max(...r.samples.map((s) => s.player.x))).toBeGreaterThanOrEqual(35);
      expect(r.finalPlayer.x).toBeLessThanOrEqual(30);
      expect(r.samples.at(-1)!.velocity.x).toBeLessThan(0);
      expect(
        r.events.filter((e) => e.objectId === '505-timing').map((e) => e.values.direction),
      ).toEqual(['positive', 'negative']);
      expect(r.fitnessAfter.workload.brakingImpulse).toBeGreaterThan(0);
      expect(Math.abs(r.samples.at(-1)!.facingAngle - r.samples[0]!.facingAngle)).toBeGreaterThan(
        2,
      );
    },
  );
  it.each([2, 6])(
    'physically completes the %s m slalom through all ordered checkpoints',
    (spacing) => {
      const r = run(`slalom-${spacing}-unrestricted`);
      expect(r.status).toBe('completed');
      expect(r.metrics.missedCheckpoints).toBe(0);
      expect(r.events.filter((e) => e.kind === 'checkpoint')).toHaveLength(
        r.input.config.route.length,
      );
      expect(r.metrics.touches).toBeGreaterThan(10);
      expect(r.metrics.distanceMetres).toBeGreaterThan(10);
      expect(r.finalBall.position.x).not.toEqual(r.finalPlayer.x);
    },
  );
  it.each(['dominant', 'weak'] as const)('enforces %s foot on actual carry contacts', (foot) => {
    const r = run(`slalom-6-${foot}`),
      expected = foot === 'dominant' ? 'right_foot' : 'left_foot';
    const touches = r.events.filter((e) => e.kind === 'touch');
    expect(touches.length).toBeGreaterThan(5);
    expect(new Set(touches.map((e) => e.values.foot))).toEqual(new Set([expected]));
  });
  it('permits a finite recovery after an initially separated touch', () => {
    const c = footballSkillTrialConfigSchema.parse({
      id: 'recover',
      drill: 'slalom',
      maximumSeconds: 20,
      route: [{ x: 28, y: 34 }],
      initialBall: {
        position: { x: 22, y: 34, z: 0.11 },
        velocity: { x: 1, y: 0, z: 0 },
        spin: { x: 0, y: 0, z: 0 },
        airborne: false,
        bounceCount: 0,
      },
    });
    const r = runFootballSkillTrial(c, profile, 'recover');
    expect(r.metrics.recoveries).toBeGreaterThan(0);
    expect(r.status).toBe('completed');
    expect(r.events.find((e) => e.kind === 'recovered_control')!.at).toBeGreaterThan(0.1);
  });
  it('retains genuine failure instead of assigning a slow completion', () => {
    const c = footballSkillTrialConfigSchema.parse({
      id: 'fail',
      drill: 'slalom',
      maximumSeconds: 1,
      route: [{ x: 24, y: 34 }],
      lostBallDistance: 2,
      initialBall: {
        position: { x: 40, y: 34, z: 0.11 },
        velocity: { x: 10, y: 0, z: 0 },
        spin: { x: 0, y: 0, z: 0 },
        airborne: false,
        bounceCount: 0,
      },
    });
    const r = runFootballSkillTrial(c, profile, 'fail');
    expect(r.status).toBe('failed');
    expect(r.finishSeconds).toBeNull();
    expect(r.metrics.missedCheckpoints).toBe(1);
  });
  it('passes, physically rebounds, receives, turns and releases a second pass', () => {
    const r = run('wall-receive-turn');
    expect(r.status).toBe('completed');
    expect(r.contacts.some((c) => c.objectId === 'wall')).toBe(true);
    expect(r.events.filter((e) => e.kind === 'release')).toHaveLength(2);
    const wall = r.contacts.find((c) => c.objectId === 'wall')!;
    expect(r.events.find((e) => e.kind === 'reception')!.at).toBeGreaterThan(wall.at);
    expect(r.events.filter((e) => e.kind === 'checkpoint')).toHaveLength(3);
  });
  it('receives a physically bouncing delivery with first-touch evidence', () => {
    const r = run('receive-18-spin-0');
    expect(r.status).toBe('completed');
    expect(r.samples.some((s) => s.ball.z > 0.6)).toBe(true);
    expect(r.samples.some((s) => s.ball.z <= 0.12)).toBe(true);
    expect(r.events.find((e) => e.kind === 'reception')!.values.quality).toBeTypeOf('number');
    expect(r.metrics.timeToControlSeconds).toBeGreaterThan(0);
  });
  it('distinguishes a first-time contact from a prepared pass', () => {
    const first = run('pass-first-time'),
      prepared = run('pass-10-dominant-ground');
    expect(first.events.find((e) => e.kind === 'release')!.values.technique).toBe('first_time');
    expect(prepared.events.find((e) => e.kind === 'release')!.values.technique).not.toBe(
      'first_time',
    );
    expect(
      prepared.events.find((e) => e.kind === 'release')!.values.preparationSeconds,
    ).toBeGreaterThan(0);
    expect(first.events.find((e) => e.kind === 'release')!.point!.x).not.toBe(20);
  });
  it('uses canonical shot launch and physical target-plane error with no keeper', () => {
    const r = run('shot-stationary-placed-dominant');
    expect(r.status).toBe('completed');
    expect(r.metrics.launchSpeedMetresPerSecond).toBeGreaterThan(15);
    const crossing = r.events.find((e) => e.kind === 'ball_plane' && e.objectId === 'target')!;
    expect(r.metrics.targetErrorMetres).toBeCloseTo(
      Math.hypot(crossing.values.u as number, crossing.values.v as number),
      12,
    );
    expect(
      r.predictions.find((p) => p.source === 'ballPhysics.projectFutureBallTrajectory')!.error,
    ).toBeCloseTo(0, 8);
  });
  it('keeps observer-on and observer-off execution identical despite observer mutation', () => {
    const a = run('sprint-10-standing');
    const b = runFootballSkillTrial(
      config('sprint-10-standing'),
      profile,
      'pr184-contract',
      (s) => {
        s.player.x = 999;
        s.ball.z = 999;
      },
    );
    expect(a).toEqual(b);
  });
  it('preserves input fitness and records only completed physical work', () => {
    const c = config('sprint-30-standing');
    const original = structuredClone(c),
      card = structuredClone(profile);
    const r = runFootballSkillTrial(c, profile, 'fitness');
    expect(c).toEqual(original);
    expect(profile).toEqual(card);
    expect(r.fitnessAfter.workload.seconds).toBeCloseTo(r.elapsedSeconds, 8);
    expect(r.fitnessAfter.workload.accelerationImpulse).toBeGreaterThan(0);
    expect(r.fitnessAfter.burstSpent).toBeGreaterThan(0);
    expect(r.fitnessBefore.workload.seconds).toBe(0);
  });
  it('uses exact one-attribute counterfactuals and distinct seeds in technical trials', () => {
    const low = structuredClone(profile),
      high = structuredClone(profile);
    low.attributes.pace = 20;
    high.attributes.pace = 100;
    const a = runFootballSkillTrial(config('sprint-30-standing'), low, 'paired'),
      b = runFootballSkillTrial(config('sprint-30-standing'), high, 'paired');
    expect(b.finishSeconds!).toBeLessThan(a.finishSeconds!);
    expect(a.input.player.attributes.agility).toBe(b.input.player.attributes.agility);
    expect(a.inputHash).not.toBe(b.inputHash);
    expect(run('pass-10-dominant-ground', 'seed-a').finalBall).not.toEqual(
      run('pass-10-dominant-ground', 'seed-b').finalBall,
    );
  });
  it('validates exported JSON and rejects invalid timestep, dimensions and duplicate IDs', () => {
    const r = run('sprint-5-standing');
    expect(footballSkillTrialResultSchema.parse(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(footballSkillTrialResultSchema.safeParse({ ...r, stepSeconds: 0.1 }).success).toBe(
      false,
    );
    const c = config('pass-10-dominant-ground');
    c.objects.push(c.objects[0]!);
    expect(footballSkillTrialConfigSchema.safeParse(c).success).toBe(false);
    expect(
      labTargetSchema.safeParse({
        id: 'bad',
        kind: 'target',
        position: { x: 1, y: 1, z: 1 },
        normal: { x: 0, y: 0, z: 0 },
        width: -1,
        height: 1,
      }).success,
    ).toBe(false);
  });
  it('provides manual and autonomous modes with the same physical runner', () => {
    const manual = runFootballSkillTrial(
      { ...config('sprint-5-standing'), mode: 'manual', maximumSeconds: 0.1 },
      profile,
      'manual',
    );
    expect(manual.finishSeconds).toBeNull();
    expect(manual.finalPlayer.x).toBe(20);
    const auto = runFootballSkillTrial(
      { ...config('shot-stationary-placed-dominant'), mode: 'autonomous', maximumSeconds: 2 },
      profile,
      'autonomous',
    );
    expect(auto.decisions.length).toBeGreaterThan(0);
    expect(auto.decisions[0]!.alternatives.length).toBeGreaterThan(1);
  });
  it('cannot mutate a saved career card through laboratory execution', () => {
    const career = {
      player: structuredClone(profile),
      currentDate: '2026-10-23',
      history: [{ kind: 'saved_fact' }],
    };
    const before = JSON.stringify(career);
    runFootballSkillTrial(config('wall-receive-turn'), career.player, 'career-isolation');
    expect(JSON.stringify(career)).toBe(before);
  });
});
