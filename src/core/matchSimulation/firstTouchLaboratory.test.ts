import { beforeAll, describe, expect, it } from 'vitest';
import { createFootballLabProfile } from '../../../scripts/footballLabProfile';
import type { FootballerProfile } from '../../types/domain';
import { playerAttributesSchema } from '../../schemas/domainSchemas';
import { makeLabState, footballSkillTrialConfigSchema } from './footballPerformanceLab';
import { createFirstTouchLabCatalog } from './firstTouchLabCatalog';
import { firstTouchLabConfigSchema, runFirstTouchLab } from './firstTouchLaboratory';
import {
  advanceSurfaceBall,
  executeSurfaceContact,
  experimentalBodyContactsSchema,
  surfaceContactReceiptSchema,
  surfaceRequestSchema,
} from './ballSurfaceContact';
import { neutralLowerBodyPose } from './lowerBodyGeometry';
import { tacticalMatchStateSchema } from './matchState';
import { advanceExperimentalBodyReception } from './experimentalBodyReception';
import { integrateBallFlight, type PhysicalBall } from './ballPhysics';
import { FOOT_CONTACT_PHYSICS } from './footContact';
let profile: FootballerProfile;
beforeAll(() => {
  profile = createFootballLabProfile();
});
const config = (id: string) =>
  structuredClone(createFirstTouchLabCatalog().find((c) => c.id === id)!);
const state = () =>
  makeLabState(
    profile,
    footballSkillTrialConfigSchema.parse({ id: 'contract', drill: 'receive' }),
    'pr191-contract',
  );
const run = (id: string, p = profile) => runFirstTouchLab(config(id), p, 'pr191-contract:' + id);
const ball = (x = 18.8, z = 1.3): PhysicalBall => ({
  position: { x, y: 34, z },
  velocity: { x: 80, y: 0, z: 0 },
  spin: { x: 4, y: 3, z: 7 },
  airborne: true,
  bounceCount: 0,
});
const request = (surface = 'chest') =>
  surfaceRequestSchema.parse({
    objective: 'settle',
    intendedSurface: surface,
    desiredVelocity: { x: 0, y: 0, z: 0 },
    preparationSeconds: 0.3,
  });

describe('PR191 finite surface contacts', () => {
  it('sweeps a fast ball through a torso and conserves the reported impulse', () => {
    const s = state(),
      p = s.players[0]!,
      b = ball(),
      r = advanceSurfaceBall(s, b, 0.025, [{ player: p, request: request() }]);
    expect(r.contacts).toHaveLength(1);
    const c = surfaceContactReceiptSchema.parse(r.contacts[0]);
    expect(c.actualSurface).toBe('chest');
    expect(c.at).toBeGreaterThan(0);
    expect(c.at).toBeLessThan(0.025);
    for (const axis of ['x', 'y', 'z'] as const)
      expect(
        (c.outgoingVelocity[axis] - c.incomingVelocity[axis]) * FOOT_CONTACT_PHYSICS.mass,
      ).toBeCloseTo(c.impulse[axis], 10);
    expect(c.outgoingSpin).not.toEqual({ x: 0, y: 0, z: 0 });
    expect(s.ball.ownerId).toBeUndefined();
  });
  it('keeps a near miss and unsupported head/overhead honest', () => {
    const s = state(),
      p = s.players[0]!,
      b = ball();
    b.position.y = 35;
    const r = advanceSurfaceBall(s, b, 0.025, [{ player: p, request: request() }]);
    expect(r.contacts).toEqual([]);
    expect(r.ball).toEqual(integrateBallFlight(b, 0.025));
    for (const surface of ['head', 'overhead']) {
      const result = executeSurfaceContact(s, p, request(surface));
      expect(result.actualSurface).toBeNull();
      expect(result.executed).toBe(false);
      expect(result.impulse).toEqual({ x: 0, y: 0, z: 0 });
    }
  });
  it('never silently substitutes a foot for a thigh or a high-ball foot miss', () => {
    const s = state(),
      p = s.players[0]!;
    s.ball = {
      x: 20.2,
      y: 34,
      height: 1.3,
      velocity: { x: 5, y: 0, z: -2 },
      spin: { x: 2, y: 3, z: 4 },
    };
    const foot = executeSurfaceContact(s, p, request('inside')),
      thigh = executeSurfaceContact(s, p, request('thigh'));
    expect(foot.actualSurface).toBeNull();
    expect(thigh.reason).toBe('surface_unavailable');
    expect(foot.outgoingVelocity).toEqual(s.ball.velocity);
    expect(thigh.outgoingSpin).toEqual(s.ball.spin);
  });
  it('applies at most one overlapping surface impulse and respects motor recovery', () => {
    const s = state(),
      p = s.players[0]!;
    p.lowerBodyPose = neutralLowerBodyPose();
    const b = ball();
    const chest = request();
    const r = advanceSurfaceBall(s, b, 0.025, [
      { player: p, request: chest },
      { player: p, request: chest },
    ]);
    expect(r.contacts).toHaveLength(1);
    const c = r.contacts[0]!;
    s.time = c.at;
    s.ball = {
      x: c.point.x,
      y: c.point.y,
      height: c.point.z,
      velocity: c.incomingVelocity,
      spin: c.incomingSpin,
    };
    const missed = executeSurfaceContact(s, p, { ...chest, readyAt: s.time + 1 });
    expect(missed.eligible).toBe(true);
    expect(missed.reason).toBe('motor_recovery');
    expect(missed.outgoingVelocity).toEqual(c.incomingVelocity);
  });
  it('retains old saves and validates the optional opt-in state', () => {
    const s = state();
    expect(tacticalMatchStateSchema.parse(s).experimentalBodyContacts).toBeUndefined();
    s.experimentalBodyContacts = experimentalBodyContactsSchema.parse({ version: 'body-v1' });
    expect(
      tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))).experimentalBodyContacts,
    ).toEqual(s.experimentalBodyContacts);
    expect(Object.keys(playerAttributesSchema.shape)).toHaveLength(28);
  });
  it('does not enable match contacts by default or override a human action', () => {
    const s = state(),
      p = s.players[0]!;
    s.time = 0.025;
    expect(advanceExperimentalBodyReception(s, [p], ball(), 0.025)).toBeUndefined();
    s.experimentalBodyContacts = experimentalBodyContactsSchema.parse({ version: 'body-v1' });
    s.playerAgencyEnabled = true;
    s.controlledFootballerId = p.id;
    expect(advanceExperimentalBodyReception(s, [p], ball(), 0.025)).toBeUndefined();
  });
  it('advances canonical flight counters through a real body impact without ownership', () => {
    const s = state(),
      p = s.players[0]!;
    s.time = 0.025;
    s.experimentalBodyContacts = experimentalBodyContactsSchema.parse({ version: 'body-v1' });
    s.ball.flightTime = 2;
    s.ball.distanceTravelled = 10;
    const r = advanceExperimentalBodyReception(s, [p], ball(), 0.025)!;
    expect(r.contact?.actualSurface).toBe('chest');
    expect(r.state.ball.ownerId).toBeUndefined();
    expect(r.state.ball.flightTime).toBeCloseTo(2.025, 12);
    expect(r.state.ball.distanceTravelled).toBeGreaterThan(10);
  });
});

describe('PR191 trajectories and football consequences', () => {
  it('executes chest/thigh then foot control without ending on the first touch', () => {
    for (const id of ['descending_chest', 'descending_thigh']) {
      const r = run(id);
      expect(r.contacts[0]!.actualSurface).toBe(id === 'descending_chest' ? 'chest' : 'thigh');
      expect(r.contacts.some((c) => c.actualSurface === 'cushion')).toBe(true);
      expect(r.metrics.controlAt).toBeGreaterThan(r.contacts[0]!.at);
      expect(r.metrics.nextOrdinaryAction).toBe(true);
    }
  });
  it('reports an incidental torso collision before a prescribed thigh attempt', () => {
    const r = run('blocked_thigh');
    expect(r.contacts[0]!.intendedSurface).toBe('thigh');
    expect(r.contacts[0]!.actualSurface).toBe('chest');
  });
  it('separates directional execution from an actual defender intervention', () => {
    const r = run('pressure');
    expect(r.contacts[0]!.playerId).toBe(profile.id);
    expect(r.metrics.defenderContact).toBe(true);
    expect(r.status).toBe('failed');
    expect(r.metrics.controlledBy).toContain('defender');
    expect(r.metrics.directionErrorRadians).not.toBeNull();
  });
  it('executes a first-time pass to a real receiver and a shot crossing the goal line', () => {
    const pass = run('outside_pass');
    expect(pass.contacts[0]!.objective).toBe('pass');
    expect(pass.contacts[0]!.controlEstablished).toBe(false);
    expect(pass.metrics.receiverContact).toBe(true);
    expect(pass.metrics.controlledBy).toContain('receiver');
    const shot = run('close_shot');
    expect(shot.metrics.goal).toBe(true);
    expect(shot.contacts.filter((c) => c.playerId === profile.id)).toHaveLength(1);
    expect(shot.contacts[0]!.objective).toBe('shot');
    const miss = config('close_shot');
    miss.target = { x: 105, y: 45 };
    expect(runFirstTouchLab(miss, profile, 'same-shot').metrics.goal).toBe(false);
  });
  it('uses actual flights between repeated touches and preserves spin and recovery', () => {
    const r = run('juggle_5'),
      own = r.contacts.filter((c) => c.playerId === profile.id);
    expect(own).toHaveLength(5);
    expect(r.metrics.bounces).toBe(0);
    for (let i = 1; i < own.length; i++) {
      expect(own[i]!.at - own[i - 1]!.at).toBeGreaterThanOrEqual(own[i - 1]!.recoverySeconds);
      expect(own[i]!.incomingVelocity.z).toBeLessThan(0);
    }
    const spinning = config('juggle_5');
    spinning.launcher.spin = { x: 12, y: 20, z: 8 };
    const result = runFirstTouchLab(spinning, profile, 'spin');
    expect(result.contacts[0]!.incomingSpin).not.toEqual({ x: 0, y: 0, z: 0 });
    const mixed = run('mixed_juggle');
    expect(mixed.status).toBe('failed');
    expect(mixed.reason).toBe('sequence_mismatch');
  });
  it('isolates first touch and preserves an irrelevant-attribute negative control', () => {
    const low = structuredClone(profile),
      high = structuredClone(profile),
      irrelevant = structuredClone(profile);
    low.attributes.firstTouch = 20;
    high.attributes.firstTouch = 100;
    irrelevant.attributes.leadership = 20;
    const c = config('fast_low'),
      a = runFirstTouchLab(c, low, 'paired'),
      b = runFirstTouchLab(c, high, 'paired');
    expect(a.metrics.firstContactSpeed!).toBeGreaterThan(b.metrics.firstContactSpeed!);
    const base = runFirstTouchLab(c, profile, 'paired'),
      negative = runFirstTouchLab(c, irrelevant, 'paired');
    expect(base.contacts).toEqual(negative.contacts);
    expect(base.samples).toEqual(negative.samples);
    expect(base.metrics).toEqual(negative.metrics);
  });
  it('keeps manual/autonomous inputs distinct and observer mutation harmless', () => {
    const c = config('autonomous_aerial'),
      before = structuredClone(c),
      a = runFirstTouchLab(c, profile, 'repeat'),
      b = runFirstTouchLab(c, profile, 'repeat', (sample) => {
        sample.ball.x = 999;
      });
    expect(b).toEqual(a);
    expect(c).toEqual(before);
    expect(a.input.config.mode).toBe('autonomous');
    expect(firstTouchLabConfigSchema.safeParse({ ...c, mode: 'manual' }).success).toBe(false);
  });
});
