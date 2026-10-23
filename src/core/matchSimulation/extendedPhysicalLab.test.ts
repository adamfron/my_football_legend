import { describe, expect, it } from 'vitest';
import { createFootballLabProfile } from '../../../scripts/footballLabProfile';
import { createFootballDrillCatalog } from './footballLabCatalog';
import {
  runFootballSkillTrial,
  makeLabState,
  footballSkillTrialConfigSchema,
} from './footballPerformanceLab';
import {
  runFootContactTrial,
  runFeintTrial,
  runJumpTrial,
  runHoopTrial,
  runRepeatedSprintTrial,
  runGoalkeeperTrial,
} from './extendedPhysicalLab';
import { FOOT_CONTACT_PHYSICS, footContactExecutionSchema } from './footContact';
import { beginVerticalJump } from './bodyMechanics';
import { resolveMatchAction } from './matchActions';
import { deriveGoalkeeperThrow } from './goalkeeperDistribution';
import { advanceControlledBall } from './ballContactGeometry';
import { advanceLabBall } from './footballLabObjects';

const profile = createFootballLabProfile();
describe('PR185 physical surface contacts', () => {
  it('a flat zero-spin cushion does not invent a vertical impulse or a bounce', () => {
    const r = runFootContactTrial(
      { surface: 'cushion', velocity: { x: 6, y: 0, z: 0 } },
      profile,
      'flat',
    );
    expect(r.contact.normal.z).toBeCloseTo(0, 12);
    expect(r.contact.outgoingVelocity.z).toBe(0);
    expect(r.trajectory.every((s) => s.position.z === 0.11 && s.velocity.z === 0)).toBe(true);
  });
  it('ordinary control and laboratory apparatus integrate the same released impulse and spin once', () => {
    const s = makeLabState(
      profile,
      footballSkillTrialConfigSchema.parse({ id: 'shared', drill: 'sprint' }),
      'shared',
    );
    s.ball.velocity = { x: 4, y: 0, z: 0 };
    s.ball.spin = { x: 0, y: 0, z: 30 };
    const normal = advanceControlledBall(s, s.players[0]!, 0.025).state;
    const contact = normal.lastGroundContact!.surfaceContact!;
    const lab = advanceLabBall(
      {
        position: contact.point,
        velocity: contact.outgoingVelocity,
        spin: contact.outgoingSpin,
        airborne: false,
        bounceCount: 0,
      },
      0.025,
      [],
      0,
    ).ball;
    expect({ x: normal.ball.x, y: normal.ball.y, z: normal.ball.height }).toEqual(lab.position);
    expect(normal.ball.velocity).toEqual(lab.velocity);
    expect(normal.ball.spin).toEqual(lab.spin);
  });
  it('inside and outside surfaces change actual velocity, spin and trajectory', () => {
    const inside = runFootContactTrial(
      { surface: 'inside', spin: { x: 0, y: 0, z: 60 } },
      profile,
      'same',
    );
    const outside = runFootContactTrial(
      { surface: 'outside', spin: { x: 0, y: 0, z: 60 } },
      profile,
      'same',
    );
    expect(inside.contact.outgoingVelocity).not.toEqual(outside.contact.outgoingVelocity);
    expect(inside.trajectory.at(-1)!.position).not.toEqual(outside.trajectory.at(-1)!.position);
    expect(footContactExecutionSchema.safeParse(inside.contact).success).toBe(true);
  });
  it('sole friction dissipates energy and spin without perfect spin cancellation', () => {
    const r = runFootContactTrial(
      { surface: 'sole', spin: { x: 0, y: 0, z: 60 } },
      profile,
      'sole',
    ).contact;
    const energy = (
      v: { x: number; y: number; z: number },
      w: { x: number; y: number; z: number },
    ) =>
      0.5 * FOOT_CONTACT_PHYSICS.mass * (v.x * v.x + v.y * v.y + v.z * v.z) +
      0.5 * FOOT_CONTACT_PHYSICS.inertia * (w.x * w.x + w.y * w.y + w.z * w.z);
    expect(energy(r.outgoingVelocity, r.outgoingSpin)).toBeLessThan(
      energy(r.incomingVelocity, r.incomingSpin),
    );
    expect(Math.abs(r.outgoingSpin.z)).toBeGreaterThan(0);
    expect(Math.abs(r.outgoingSpin.z)).toBeLessThan(60);
    expect(r.outgoingVelocity.x).toBeLessThan(r.incomingVelocity.x);
  });
  it.each(['inside', 'outside', 'instep', 'sole', 'cushion', 'protection'] as const)(
    'bounds the %s normal and tangent impulses',
    (surface) => {
      const r = runFootContactTrial(
        { surface, velocity: { x: 26, y: 4, z: 0 }, spin: { x: 30, y: 45, z: 60 } },
        profile,
        'bounded',
      ).contact;
      const normal = r.impulse.x * r.normal.x + r.impulse.y * r.normal.y + r.impulse.z * r.normal.z;
      const tangent = Math.hypot(
        r.impulse.x - normal * r.normal.x,
        r.impulse.y - normal * r.normal.y,
        r.impulse.z - normal * r.normal.z,
      );
      expect(Math.abs(normal)).toBeLessThanOrEqual(r.normalImpulseLimit + 1e-8);
      expect(tangent).toBeLessThanOrEqual(r.tangentImpulseLimit + 1e-8);
      expect(Object.values(r.outgoingSpin).every(Number.isFinite)).toBe(true);
    },
  );
  it.each([
    { offset: { x: 2, y: 0 }, reason: 'out_of_reach' },
    { height: 0.8, reason: 'height' },
    { preparationSeconds: 0, reason: 'preparation' },
  ])('reports unavailable contacts without substituting one', (c) => {
    const r = runFootContactTrial({ surface: 'sole', ...c }, profile, 'impossible').contact;
    expect(r.available).toBe(false);
    expect(r.executed).toBeNull();
    expect(r.unavailableReason).toBe(c.reason);
    expect(r.outgoingVelocity).toEqual(r.incomingVelocity);
    expect(r.outgoingSpin).toEqual(r.incomingSpin);
  });
  it('weak-foot proficiency changes control execution on the same geometry', () => {
    const low = structuredClone(profile),
      high = structuredClone(profile);
    low.weakFootProficiency = 20;
    high.weakFootProficiency = 100;
    const config = {
      surface: 'outside' as const,
      foot: 'left' as const,
      desiredVelocity: { x: 15, y: 5, z: 0 },
    };
    const l = runFootContactTrial(config, low, 'weak'),
      h = runFootContactTrial(config, high, 'weak');
    expect(h.contact.quality).toBeGreaterThan(l.contact.quality);
    expect(h.contact.outgoingVelocity).not.toEqual(l.contact.outgoingVelocity);
  });
  it('spin axes remain distinct at the same angular speed', () => {
    const a = runFootContactTrial(
      { surface: 'sole', spin: { x: 0, y: 60, z: 0 } },
      profile,
      'axis',
    );
    const b = runFootContactTrial(
      { surface: 'sole', spin: { x: 0, y: 0, z: 60 } },
      profile,
      'axis',
    );
    expect(a.contact.outgoingVelocity).not.toEqual(b.contact.outgoingVelocity);
  });
});

describe('PR185 routing and multi-contact execution', () => {
  it.each(['dominant', 'weak', 'unrestricted'] as const)(
    'completes mirrored tight slalom with %s foot restriction',
    (foot) => {
      const c = structuredClone(
        createFootballDrillCatalog().find((c) => c.id === `slalom-2-${foot}`)!,
      );
      const p = structuredClone(profile),
        mirror = structuredClone(c);
      p.dominantFoot = 'left';
      mirror.route = mirror.route.map((point) => ({ ...point, y: 68 - point.y }));
      mirror.objects = mirror.objects.map((o) => ({
        ...o,
        position: { ...o.position, y: 68 - o.position.y },
      }));
      const right = runFootballSkillTrial(c, profile, 'mirror'),
        left = runFootballSkillTrial(mirror, p, 'mirror');
      expect(right.status).toBe('completed');
      expect(left.status).toBe('completed');
      expect(right.metrics.collisions).toBe(0);
      expect(left.metrics.collisions).toBe(0);
      expect(Math.abs(right.finishSeconds! - left.finishSeconds!)).toBeLessThan(0.075);
    },
  );
  it.each(['inside_outside', 'outside_inside', 'sole_redirect', 'elastico'] as const)(
    'executes separated %s contacts on one foot',
    (move) => {
      const r = runFeintTrial({ move, defender: 'none' }, profile, 'sequence');
      expect(r.completedMove).toBe(true);
      expect(r.contacts.length).toBeGreaterThanOrEqual(2);
      expect(r.contacts[1]!.at).toBeGreaterThan(r.contacts[0]!.at);
      expect(r.contacts[0]!.foot).toBe(r.contacts[1]!.foot);
      expect(r.contacts[0]!.outgoingVelocity).not.toEqual(r.contacts[1]!.outgoingVelocity);
    },
  );
  it('a completed feint can lose to a balanced defender', () => {
    const r = runFeintTrial({ defender: 'delay' }, profile, 'defence');
    expect(r.completedMove).toBe(true);
    expect(r.escaped).toBe(false);
    expect(r.defenderCommitment).toBeGreaterThan(0);
  });
  it('a wrong-facing slow defender can be beaten and impossible initial geometry can fail', () => {
    expect(runFeintTrial({ defender: 'wrong_facing' }, profile, 'evade').escaped).toBe(true);
    expect(
      runFeintTrial({ initialOffset: { x: 3, y: 0 }, defender: 'none' }, profile, 'fail')
        .completedMove,
    ).toBe(false);
  });
  it('human and AI selected surface/move actions share the match executor', () => {
    const state = makeLabState(
      profile,
      footballSkillTrialConfigSchema.parse({ id: 'human', drill: 'sprint' }),
      'parity',
    );
    const action = {
      type: 'carry' as const,
      actorId: profile.id,
      target: { x: 30, y: 34 },
      contactSurface: 'outside' as const,
      skillMove: 'elastico' as const,
    };
    const human = resolveMatchAction(state, action, 'human_selected'),
      ai = resolveMatchAction(state, action, 'dev_ai_selected');
    expect(human.ballCarrierIntent).toEqual(ai.ballCarrierIntent);
    expect(human.ballCarrierIntent?.contactSurface).toBe('outside');
    expect(human.ballCarrierIntent?.skillMove).toBe('elastico');
  });
});

describe('PR185 jump, workload and keepers', () => {
  it('continues a second physical delivery after a genuine parry without resetting the keeper', () => {
    const p = structuredClone(profile);
    Object.assign(p.attributes, {
      handling: 20,
      reflexes: 20,
      oneOnOnes: 20,
      goalkeeperSweeping: 20,
      goalkeeperKicking: 20,
      goalkeeperThrowing: 20,
    });
    const r = runGoalkeeperTrial(
      { exercise: 'parry_recovery', speed: 12, lateral: 0 },
      p,
      'pr185-keeper:0',
    );
    expect(['save', 'goal', 'block', 'miss']).toContain(r.secondBallOutcome);
    expect(r.samples.some((s) => s.at > 1.7 && s.ball.x > 95)).toBe(true);
  });
  it('a caught-ball throw window ends at the next actual foot contact', () => {
    const s = makeLabState(
      profile,
      footballSkillTrialConfigSchema.parse({ id: 'drop', drill: 'sprint' }),
      'drop',
    );
    s.ball.heldByKeeperId = profile.id;
    const next = advanceControlledBall(s, s.players[0]!, 0.025).state;
    expect(next.lastGroundContact?.executed).toBe(true);
    expect(next.ball.heldByKeeperId).toBeUndefined();
  });
  it('integrates takeoff, ballistic height, landing and finite repeat-jump recovery', () => {
    const p = structuredClone(profile);
    p.attributes.jumping = 90;
    p.attributes.strength = 90;
    const r = runJumpTrial({}, p, 'vertical');
    expect(r.jump.maximumHeight).toBeGreaterThan(0.15);
    expect(r.jump.landingAt).toBeGreaterThan(r.jump.takeoffAt!);
    expect(r.samples.some((s) => s.velocity > 0)).toBe(true);
    expect(r.samples.some((s) => s.velocity < 0)).toBe(true);
    expect(r.headerExecuted).toBe(true);
    expect(r.headerVelocity?.x).toBeGreaterThan(0);
    const actor = makeLabState(
      p,
      footballSkillTrialConfigSchema.parse({ id: 'jump', drill: 'sprint' }),
      'jump',
    ).players[0]!;
    actor.verticalJump = beginVerticalJump(actor, { armAssistance: false, approach: false })!;
    expect(beginVerticalJump(actor, { armAssistance: true, approach: true })).toBeUndefined();
  });
  it('standing height and jump capability affect reach separately', () => {
    const tall = structuredClone(profile),
      short = structuredClone(profile);
    tall.heightCm = 195;
    short.heightCm = 165;
    const a = runJumpTrial({}, tall, 'reach'),
      b = runJumpTrial({}, short, 'reach');
    expect(a.jump.maximumHeight).toBe(b.jump.maximumHeight);
    expect(a.maximumHeadingReach - b.maximumHeadingReach).toBeCloseTo(0.3);
  });
  it('completes repeated controlled carries with a checkpoint wider than foot/body separation', () => {
    const r = runRepeatedSprintTrial(
      { metres: '20+20', ball: true, restSeconds: 0 },
      profile,
      'carry-repeats',
    );
    expect(r.repetitions).toHaveLength(6);
    expect(r.repetitions.every((x) => x.status === 'completed' && x.seconds !== null)).toBe(true);
    expect(r.repetitions.every((x) => x.distance! > 35 && x.touches! > 0)).toBe(true);
    expect(r.fitnessAfter.longTermCapacity).toBeLessThan(1);
  });
  it('repeated physical work consumes fitness and rest recovers readiness', () => {
    const short = runRepeatedSprintTrial({ restSeconds: 0 }, profile, 'rsa'),
      long = runRepeatedSprintTrial({ restSeconds: 20 }, profile, 'rsa');
    expect(short.repetitions.every((r) => r.status === 'completed')).toBe(true);
    expect(short.repetitions.every((r) => r.brakingSeconds > 0)).toBe(true);
    expect(short.repetitions[5]!.fitnessAfter.burstReadiness).toBeLessThan(
      short.repetitions[0]!.fitnessAfter.burstReadiness,
    );
    expect(long.fitnessAfter.burstReadiness).toBeGreaterThan(short.fitnessAfter.burstReadiness);
  });
  it('a goalkeeper throw requires an actually held ball and has physical release uncertainty', () => {
    const s = makeLabState(
      profile,
      footballSkillTrialConfigSchema.parse({ id: 'keeper', drill: 'sprint' }),
      'throw',
    );
    const keeper = s.players[0]!;
    keeper.goalkeeperRole = true;
    keeper.position = { x: 5, y: 34 };
    s.ball = { x: 5, y: 34, ownerId: keeper.id };
    expect(deriveGoalkeeperThrow(s, keeper, { x: 30, y: 34 })).toBeUndefined();
    s.ball.heldByKeeperId = keeper.id;
    const plan = deriveGoalkeeperThrow(s, keeper, { x: 30, y: 34 })!;
    expect(plan.release.z).toBeGreaterThan(1);
    expect(plan.velocity.z).toBeGreaterThan(0);
    expect(plan.angularError).not.toBe(0);
  });
  it('reflexes alter canonical response to an identical incoming shot', () => {
    const low = structuredClone(profile),
      high = structuredClone(profile);
    low.attributes.reflexes = 20;
    high.attributes.reflexes = 100;
    const a = runGoalkeeperTrial({ exercise: 'reaction' }, low, 'reaction'),
      b = runGoalkeeperTrial({ exercise: 'reaction' }, high, 'reaction');
    expect(b.reactionDelay).toBeLessThan(a.reactionDelay!);
    expect(a.samples.length).toBeGreaterThan(0);
  });
  it('throws are reproducible and throwing ability changes the launched ball', () => {
    const low = structuredClone(profile),
      high = structuredClone(profile);
    low.attributes.goalkeeperThrowing = 20;
    high.attributes.goalkeeperThrowing = 100;
    const a = runGoalkeeperTrial({ exercise: 'throw', distance: 25 }, low, 'throw'),
      b = runGoalkeeperTrial({ exercise: 'throw', distance: 25 }, high, 'throw');
    expect(a.releaseVelocity).not.toEqual(b.releaseVelocity);
    expect(runGoalkeeperTrial({ exercise: 'throw', distance: 25 }, high, 'throw')).toEqual(b);
  });
});

describe('PR185 physical hoop trajectories', () => {
  const ball = {
    position: { x: 0, y: 34, z: 1 },
    velocity: { x: 18, y: 0, z: 4 },
    spin: { x: 0, y: 0, z: 0 },
  };
  const hoop = {
    id: 'hoop',
    kind: 'hoop' as const,
    position: { x: 10, y: 34, z: 1.6 },
    normal: { x: 1, y: 0, z: 0 },
    innerDiameter: 2,
    rimRadius: 0.04,
    direction: 'positive' as const,
  };
  it('records actual successful and missed crossings with a finite opening', () => {
    const hit = runHoopTrial({ ball, hoop });
    const miss = runHoopTrial({ ball, hoop: { ...hoop, position: { ...hoop.position, y: 38 } } });
    expect(hit.hit).toBe(true);
    expect(miss.hit).toBe(false);
    expect(miss.crossing!.missDistance).toBeGreaterThan(0);
    expect(hit.predictionError).toBeCloseTo(0, 10);
  });
  it('sidespin curves the actual path and wrong-way crossings cannot score', () => {
    const straight = runHoopTrial({ ball, hoop }),
      curved = runHoopTrial({ ball: { ...ball, spin: { x: 0, y: 0, z: 60 } }, hoop });
    expect(curved.lateralCurvature).toBeGreaterThan(straight.lateralCurvature);
    expect(runHoopTrial({ ball, hoop: { ...hoop, direction: 'negative' } }).hit).toBe(false);
  });
});
