import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createFootballLabProfile } from '../../../scripts/footballLabProfile';
import type { FootballerProfile } from '../../types/domain';
import { createFirstTouchLabCatalog } from './firstTouchLabCatalog';
import { runFirstTouchLab } from './firstTouchLaboratory';
import { makeLabState, footballSkillTrialConfigSchema } from './footballPerformanceLab';
import {
  ballMotorObservationSchema,
  observeBallMotorState,
  planBallOrientedMovement,
} from './ballOrientedMovement';
import { tacticalMatchStateSchema } from './matchState';
import { resolveReceptionOutcome } from './passReception';
import { projectFirstTouchLabOverlay } from '../../app/match/firstTouchLabOverlay';
let profile: FootballerProfile;
beforeAll(() => {
  profile = createFootballLabProfile();
});
const config = (id: string) =>
  structuredClone(createFirstTouchLabCatalog().find((c) => c.id === id)!);
describe('PR192 ball-oriented continuation', () => {
  it('reconstructs the exact rounded human failures with an unedited canonical Adam Krawczyk card', () => {
    let receipt = JSON.parse(
      readFileSync('docs/performance/pr192/reconstructed-human.json', 'utf8'),
    );
    if (receipt.receiptArchive)
      receipt = JSON.parse(gunzipSync(readFileSync(receipt.receiptArchive.path)).toString('utf8'));
    expect(receipt.selectedId).toBe('footballer_pro_9_12');
    expect(receipt.numericMatchToRoundedHumanEvidence).toBe(true);
    for (const [id, separation] of [
      ['direction_45', 2.975],
      ['direction_90', 3.417],
    ] as const) {
      const row = receipt.rows.find((r: { id: string }) => r.id === id);
      expect(row.old.metrics.finalSeparation).toBeCloseTo(separation, 3);
      expect(row.old.metrics.controlAt).toBeNull();
      const actual = runFirstTouchLab(
        row.current.input.config,
        row.current.input.player,
        row.current.seed,
      );
      // Persisted JSON normalizes IEEE -0 to 0; compare its exact serialization contract.
      expect(JSON.stringify(actual)).toBe(JSON.stringify(row.current));
      expect(JSON.stringify(actual.contacts[0])).toBe(JSON.stringify(row.old.contacts[0]));
      expect(actual.metrics.controlledBy).toBe('footballer_pro_9_12');
      expect(actual.metrics.finalSeparation).toBeLessThan(1.05);
    }
  });
  it.each(['direction_45', 'direction_90'])(
    'keeps the first impulse and physically recovers %s instead of reaching a fixed destination',
    (id) => {
      const c = config(id),
        old = runFirstTouchLab({ ...c, movementModel: 'pr191' }, profile, 'pr191-inspection');
      const r = runFirstTouchLab(c, profile, 'pr191-inspection');
      expect(r.contacts[0]).toEqual(old.contacts[0]);
      expect(r.samples.some((s) => s.movement?.nextContact)).toBe(true);
      expect(r.metrics.finalSeparation).toBeLessThan(1.15);
      expect(r.metrics.controlledBy).toBe(profile.id);
      const control = r.contacts.find((c) => c.controlEstablished);
      expect(control?.executed).toBe(true);
      expect(r.contacts.filter((c) => c.playerId === profile.id).length).toBeGreaterThan(1);
      // The first approach is toward -x, while the fixed target is 45/90 degrees from +x.
      expect(Math.abs(r.metrics.angles.playerApproach!)).toBeCloseTo(Math.PI);
      expect(r.metrics.angles.intendedTarget).toBeCloseTo(
        id === 'direction_45' ? Math.PI / 4 : Math.PI / 2,
      );
    },
  );
  it.each(['descending_chest', 'descending_thigh', 'flat_aerial'])(
    'retains actual body-to-foot control for %s',
    (id) => {
      const r = runFirstTouchLab(config(id), profile, 'pr191-inspection');
      expect(r.metrics.controlledBy).toBe(profile.id);
      expect(r.contacts.some((c) => ['chest', 'thigh'].includes(c.actualSurface ?? ''))).toBe(true);
    },
  );
  it('preserves intended thigh versus actual chest and reacts to that real outgoing flight', () => {
    const r = runFirstTouchLab(config('lifted_thigh'), profile, 'pr191-inspection');
    expect(r.contacts[0]!.intendedSurface).toBe('thigh');
    expect(r.contacts[0]!.actualSurface).toBe('chest');
    expect(r.samples.some((s) => s.movement?.nextContact)).toBe(true);
  });
  it.each([
    [40, 40],
    [80, 80],
    [40, 80],
    [80, 40],
  ])('allows either side to win the physical race at %s:%s', (attacker, defender) => {
    const p = structuredClone(profile);
    for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[])
      p.attributes[key] = attacker!;
    const c = { ...config('direction_45'), defender: 'active' as const, defenderRating: defender! };
    const front = runFirstTouchLab(
      {
        ...c,
        defenderPosition: { x: 22, y: 36 },
        defenderVelocity: { x: -2, y: -1 },
        defenderReaction: 0.12,
      },
      p,
      'pr192:paired:front:false',
    );
    const behind = runFirstTouchLab(
      {
        ...c,
        defenderPosition: { x: 17, y: 36 },
        defenderVelocity: { x: 2, y: 0 },
        defenderReaction: 0.4,
      },
      p,
      'pr192:paired:behind:false',
    );
    expect(front.metrics.controlledBy).toBe(p.id);
    expect(behind.metrics.controlledBy).toContain(':defender');
    expect(behind.contacts.some((c) => c.playerId.endsWith(':defender'))).toBe(true);
  });
  it('does not pursue an intentional pass and permits an intentional leave', () => {
    const pass = runFirstTouchLab(config('first_time_pass'), profile, 'pr192:release');
    expect(
      pass.samples.filter((s) => s.movement).every((s) => s.movement!.intention === 'release'),
    ).toBe(true);
    expect(pass.contacts.filter((c) => c.playerId === profile.id)).toHaveLength(1);
    const leave = runFirstTouchLab(
      { ...config('direction_45'), leaveForTeammate: true, teammatePosition: { x: 18, y: 36 } },
      profile,
      'pr192:leave',
    );
    expect(leave.contacts.filter((c) => c.playerId === profile.id)).toHaveLength(0);
    expect(leave.metrics.controlledBy).toContain('receiver');
    expect(leave.status).toBe('completed');
  });
  it('samples local sightings, ignores hidden opponent changes and persists optional observation state', () => {
    const s = makeLabState(
      profile,
      footballSkillTrialConfigSchema.parse({ id: 'motor', drill: 'receive' }),
      'pr192:observation',
    );
    s.ball = { x: 22, y: 34, height: 0.11, velocity: { x: 3, y: 0, z: 0 } };
    const actor = s.players[0]!,
      seen = observeBallMotorState(s, actor);
    actor.ballMotorObservation = seen;
    const changed = structuredClone(s);
    changed.time = 0.025;
    changed.ball.velocity = { x: -20, y: 10, z: 5 };
    expect(observeBallMotorState(changed, changed.players[0]!)).toEqual(seen);
    expect(ballMotorObservationSchema.parse(seen)).toEqual(seen);
    expect(tacticalMatchStateSchema.parse(s).players[0]!.ballMotorObservation).toEqual(seen);
    const plan = planBallOrientedMovement(actor, seen, s.time, { x: 30, y: 34 });
    expect(plan.nextContact!.x).toBeGreaterThan(22);
    const noFuture = structuredClone(seen);
    noFuture.others = [];
    expect(
      planBallOrientedMovement(actor, noFuture, s.time, { x: 30, y: 34 }).movementTarget,
    ).toEqual(plan.movementTarget);
  });
  it('allows a prepared moving low-rated directional attempt without replacing the finite impulse', () => {
    const s = makeLabState(
      profile,
      footballSkillTrialConfigSchema.parse({ id: 'attempt', drill: 'receive' }),
      'pr192:attempt',
    );
    const p = s.players[0]!;
    for (const key of Object.keys(p.profile.attributes) as (keyof typeof p.profile.attributes)[])
      p.profile.attributes[key] = 40;
    p.velocity = { x: 1, y: 0 };
    p.facingAngle = Math.PI / 2;
    s.ball = {
      x: p.position.x + 0.3,
      y: p.position.y,
      height: 0.11,
      velocity: { x: -4, y: 0, z: 0 },
    };
    s.pendingReceptionIntent = {
      actorId: p.id,
      action: { type: 'carry', actorId: p.id, target: { x: 30, y: 34 } },
      createdAt: 0,
      expiresAt: 2,
      ballEpisode: 'test',
    };
    s.experimentalBallRecovery = true;
    const r = resolveReceptionOutcome(s, p, s.ball);
    expect(r.quality!.score).toBeLessThan(0.64);
    expect(r.technique).toBe('directional');
    expect(r.surfaceContact).toBeDefined();
  });
  it('keeps diagnostic scrubbing independent of the physical trace', () => {
    const c = config('direction_90'),
      a = runFirstTouchLab(c, profile, 'pr192:overlay');
    const before = JSON.stringify(a),
      lines = projectFirstTouchLabOverlay(a, a.samples.length - 1, true, true);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines.length).toBeGreaterThan(4);
    expect(JSON.stringify(a)).toBe(before);
    expect(
      runFirstTouchLab(c, profile, 'pr192:overlay', (s) => {
        if (s.movement) s.movement.movementTarget.x = 999;
      }),
    ).toEqual(a);
  });
});
