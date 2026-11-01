// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPr211Scene, tracePr211 } from '../../../scripts/pr211Scenarios';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { projectPlayerAgency } from './playerDecision';
import {
  canonicalStrikeFoot,
  findStrikeIntervalContact,
  physicalStrikeBall,
  reconcilePendingStrike,
} from './pendingStrike';
import { integrateBallFlight } from './ballPhysics';
import { createTemporalStrikeFixture } from './temporalStrikeLaboratory';
import { executeTemporalStrike, ZERO_TEMPORAL_ERROR } from './temporalFootStrike';
import { withIntegrationProfile } from './integrationProfile';
import { advancePendingStrikeInterval } from './pendingStrikeInterval';
import { createKickFixture } from './physicalKickLaboratory';

describe('PR211 pending strike in the canonical executor', () => {
  it('resolves a real goal-post rebound before the planned foot without a fabricated pass or goal', () => {
    const f = createPr211Scene('goal-post', 0);
    const s = stepTacticalMatch(f.selected, 0.025);
    expect(s.lastStrikeResolution?.outcome).toBe('interrupted');
    expect(s.lastStrikeResolution?.reason).toBe('goal_frame');
    expect(s.lastBallContact?.kind).toBe('left_post');
    expect(s.ball.velocity!.x).toBeLessThan(0);
    expect(s.lastPassDiagnostic).toBeUndefined();
    expect(s.score).toEqual(f.initial.score);
  });
  it('removes pending state from terminal or overdue restored snapshots', () => {
    const f = createPr211Scene();
    const terminal = stepTacticalMatch({ ...f.selected, status: 'full_time' }, 0.025);
    expect(terminal.pendingStrike).toBeUndefined();
    expect(terminal.lastStrikeResolution?.reason).toBe('terminal_or_restart');
    expect(reconcilePendingStrike({ ...f.selected, time: 20 }).lastStrikeResolution?.reason).toBe(
      'expired_snapshot',
    );
  });
  it('keeps a batched call identical to four canonical 25ms intervals', () => {
    const f = createPr211Scene('ordinary', 0);
    expect(stepTacticalMatch(f.selected, 0.1)).toEqual(tracePr211(f.selected, 4).state);
  });
  it('restores every uncontacted canonical body velocity after a substep strike', () => {
    const f = createPr211Scene('ordinary', 0);
    const input = tracePr211(f.selected, 3).state;
    const moved = {
      ...input,
      time: input.time + 0.025,
      players: input.players.map((p) => ({
        ...p,
        velocity: { x: p.velocity.x + 0.1, y: p.velocity.y },
      })),
    };
    const result = advancePendingStrikeInterval(input, moved, 0.025, {
      boundary: (s) => s,
      control: (s) => s,
      body: (s) => s,
    });
    expect(result.lastStrikeResolution?.outcome).toBe('contact');
    expect(result.players.map((p) => p.velocity)).toEqual(moved.players.map((p) => p.velocity));
  });
  it.each(['shot', 'lofted', 'first_time'] as const)(
    'preserves the historical %s release family',
    (family) => {
      const f = createKickFixture({
        seed: 'pr211-legacy-control',
        family: family === 'shot' ? 'shot' : 'pass',
        delivery: family === 'lofted' ? 'lofted' : 'ground',
        context: family === 'first_time' ? 'first_time' : 'open',
      });
      const a = resolveMatchAction(f.state, f.action, 'human_selected');
      const b = resolveMatchAction(
        { ...f.state, experimentalPendingStrike: 'low-pass-dev-v1' },
        f.action,
        'human_selected',
      );
      expect(b.pendingStrike).toBeUndefined();
      const { experimentalPendingStrike: _selection, ...withoutSelection } = b;
      void _selection;
      expect(withoutSelection).toEqual(a);
    },
  );
  it('rejects an out-of-reach request without manufacturing release', () => {
    const f = createPr211Scene();
    const out = { ...f.initial, ball: { ...f.initial.ball, x: f.initial.ball.x + 4 } };
    expect(resolveMatchAction(out, f.action, 'human_selected')).toBe(out);
  });
  it('commits once without a ball impulse, pass, statistic or repeated random sample', () => {
    const f = createPr211Scene();
    expect(f.selected.pendingStrike).toBeDefined();
    expect(f.selected.ball).toEqual(f.initial.ball);
    expect(f.selected.lastPassDiagnostic).toEqual(f.initial.lastPassDiagnostic);
    expect(f.selected.statistics).toEqual(f.initial.statistics);
    expect(f.selected.actionEvents ?? []).toEqual(f.initial.actionEvents ?? []);
    expect(f.selected.decisionIndex).toBe(f.initial.decisionIndex + 1);
    expect(resolveMatchAction(f.selected, f.action, 'human_selected')).toBe(f.selected);
    let s = f.selected;
    for (let i = 0; i < 2; i++) {
      s = stepTacticalMatch(s, 0.025);
      expect(s.pendingStrike?.perturbation).toEqual(f.selected.pendingStrike!.perturbation);
      expect(s.pendingStrike?.id).toBe(f.selected.pendingStrike!.id);
      expect(s.decisionIndex).toBe(f.selected.decisionIndex);
      expect(s.lastPassDiagnostic).toEqual(f.initial.lastPassDiagnostic);
    }
  });
  it('advances the real ball during preparation and records the finite intersecting impulse once', () => {
    const f = createPr211Scene('ordinary', 0);
    const next = stepTacticalMatch(f.selected, 0.025);
    const physical = integrateBallFlight(
      physicalStrikeBall(f.selected),
      0.025,
      f.selected.ballEnvironment,
    );
    expect(next.ball.x).toBe(physical.position.x);
    expect(next.ball.x).toBeGreaterThan(f.selected.ball.x);
    const r = tracePr211(f.selected, 5),
      receipt = r.state.lastStrikeResolution!;
    expect(receipt.outcome).toBe('contact');
    expect(receipt.at).toBeGreaterThan(f.initial.time + 0.05);
    expect(receipt.contact!.available).toBe(true);
    expect(
      Math.hypot(
        receipt.foot!.x - receipt.contact!.point.x,
        receipt.foot!.y - receipt.contact!.point.y,
        receipt.foot!.z - receipt.contact!.point.z,
      ),
    ).toBeCloseTo(0.145, 6);
    expect(r.state.actionEvents?.filter((e) => e.kind === 'pass')).toHaveLength(1);
    expect(r.state.lastPassDiagnostic!.releasedAt).toBe(receipt.at);
    expect(r.state.lastGroundContact!.at).toBe(receipt.at);
    expect(r.state.pendingStrike).toBeUndefined();
  });
  it.each(['advance', 'brake', 'turn'])('uses actual canonical body segments for %s', (name) => {
    const f = createPr211Scene(name, 0),
      r = tracePr211(f.selected, 5);
    expect(r.state.lastStrikeResolution?.outcome).toBe('contact');
    const actorFrames = r.frames.map((v) => v.actor!);
    expect(
      actorFrames.some(
        (p) => p.velocity.x !== f.actor.velocity.x || p.facingAngle !== f.actor.facingAngle,
      ),
    ).toBe(true);
    expect(r.state.players.find((p) => p.id === f.actor.id)!.position).not.toEqual(
      f.actor.position,
    );
  });
  it.each(['defender-first', 'teammate-first'])(
    'resolves an earlier real %s contact without a delayed pass',
    (name) => {
      const f = createPr211Scene(name, 0),
        r = tracePr211(f.selected, 5);
      expect(r.state.lastStrikeResolution?.outcome).toBe('interrupted');
      expect(r.state.lastStrikeResolution?.reason).toBe('competing_foot');
      expect(r.state.lastStrikeResolution!.at).toBeLessThan(10.025);
      expect(r.state.lastStrikeResolution?.contact?.available).toBe(true);
      expect(
        r.state.actionEvents?.some((e) => e.kind === 'pass' && e.actorId === f.actor.id),
      ).not.toBe(true);
      expect(r.state.pendingStrike).toBeUndefined();
    },
  );
  it('does not give a later defender priority over the actual strike', () => {
    const f = createPr211Scene('defender-late', 0),
      r = tracePr211(f.selected, 5);
    expect(r.state.lastStrikeResolution?.outcome).toBe('contact');
    expect(r.state.actionEvents?.filter((e) => e.kind === 'pass')).toHaveLength(1);
  });
  it.each([
    ['touchline', 'throw_in'],
    ['goal-line', 'goal_kick'],
  ])('resolves %s before the foot', (name, scenario) => {
    const f = createPr211Scene(name, 0),
      s = stepTacticalMatch(f.selected, 0.025);
    expect(s.lastStrikeResolution?.outcome).toBe('interrupted');
    expect(s.lastStrikeResolution?.reason).toBe('boundary');
    expect(s.scenario).toBe(scenario);
    expect(s.restart?.restartTeam).toBe('away');
    expect(s.lastRestartAward?.eventAt).toBeCloseTo(s.lastStrikeResolution!.at, 9);
    expect(s.score).toEqual(f.initial.score);
    expect(s.pendingStrike).toBeUndefined();
    expect(s.actionEvents?.some((e) => e.kind === 'pass')).not.toBe(true);
  });
  it.each(['miss', 'crossing'])(
    'keeps %s as a real no-impulse continuation at the finite expiry',
    (name) => {
      const f = createPr211Scene(name, 0),
        r = tracePr211(f.selected, 5);
      expect(r.state.lastStrikeResolution?.outcome).toBe('miss');
      expect(r.state.lastStrikeResolution!.at).toBe(10.12);
      expect(r.state.lastStrikeResolution?.contact).toBeUndefined();
      expect(r.state.ball.travelKind).toBeUndefined();
      expect(r.state.actionEvents?.some((e) => e.kind === 'pass' || e.kind === 'shot')).not.toBe(
        true,
      );
      expect(r.state.pendingStrike).toBeUndefined();
    },
  );
  it.each([0, 1, 2, 3])(
    'reloads preparation/swing checkpoint %s into identical physical, event, RNG and terminal state',
    (ticks) => {
      const f = createPr211Scene('ordinary', 0);
      const checkpoint = tracePr211(f.selected, ticks).state;
      expect(checkpoint.pendingStrike).toBeDefined();
      const saved = JSON.parse(JSON.stringify(checkpoint));
      const restored = tacticalMatchStateSchema.parse(saved) as unknown as TacticalMatchState;
      expect(tracePr211(restored)).toEqual(tracePr211(checkpoint));
    },
  );
  it('blocks ordinary human menus while bodies/ball continue, then returns valid agency', () => {
    const f = createPr211Scene('miss', 0);
    let s: TacticalMatchState = { ...f.selected, playerAgencyEnabled: true };
    for (let i = 0; i < 5; i++) {
      expect(projectPlayerAgency(s).opportunity).toBeUndefined();
      const next = stepTacticalMatch(s, 0.025);
      expect(next.time).toBeGreaterThan(s.time);
      s = next;
    }
    expect(s.pendingStrike).toBeUndefined();
    expect(s.humanPossessionEpisode).toBeUndefined();
    expect(() => projectPlayerAgency(s)).not.toThrow();
  });
  it('shares the physical execution between human and autonomous accepted intentions', () => {
    const f = createPr211Scene();
    const npc = resolveMatchAction(f.initial, f.action, 'autonomous_npc');
    expect(npc.pendingStrike).toBeDefined();
    const a = tracePr211(f.selected, 5).state,
      b = tracePr211(npc, 5).state;
    expect(a.lastStrikeResolution?.contact).toEqual(b.lastStrikeResolution?.contact);
    expect(a.ball).toEqual(b.ball);
  });
  it.each(['episode', 'touch', 'height', 'sentOff', 'restart', 'challenge'])(
    'cancels invalid %s without executing the old intention',
    (kind) => {
      const f = createPr211Scene(),
        s = structuredClone(f.selected);
      if (kind === 'episode') s.ballEpisode = 99;
      if (kind === 'touch') s.ball.lastTouchPlayerId = f.opponent.id;
      if (kind === 'height') s.ball.height = 1;
      if (kind === 'sentOff')
        s.discipline = {
          ...s.discipline,
          [f.actor.id]: { team: f.actor.team, yellowCards: 0, sentOff: true },
        };
      if (kind === 'restart') s.scenario = 'throw_in';
      if (kind === 'challenge')
        s.defensiveChallenge = {
          id: 'challenge',
          actorId: f.opponent.id,
          opponentId: f.actor.id,
          technique: 'standing',
          source: 'autonomous_npc',
          startedAt: s.time,
          expiresAt: s.time + 1,
          target: { x: s.ball.x, y: s.ball.y },
        };
      const next = reconcilePendingStrike(s);
      expect(next.pendingStrike).toBeUndefined();
      expect(next.lastStrikeResolution?.outcome).toBe('cancelled');
      expect(next.lastPassDiagnostic).toEqual(f.initial.lastPassDiagnostic);
    },
  );
  it('rejects malformed persisted identities and undeclared historical profile mixing', () => {
    const f = createPr211Scene();
    expect(
      tacticalMatchStateSchema.safeParse({
        ...f.selected,
        pendingStrike: { ...f.selected.pendingStrike!, actorId: 'other' },
      }).success,
    ).toBe(false);
    const historical = withIntegrationProfile(f.initial, 'realism-candidate-v1', 'state-value-v1');
    expect(historical.experimentalPendingStrike).toBeUndefined();
    expect(
      tacticalMatchStateSchema.safeParse({
        ...historical,
        experimentalPendingStrike: 'low-pass-dev-v1',
      }).success,
    ).toBe(false);
  });
  it('keeps bounded exhaustion, tangent/separated and overlap distinct from a known miss', () => {
    const f = createPr211Scene(),
      p = f.selected.pendingStrike!;
    const footAt = (t: number) =>
      canonicalStrikeFoot(p, f.actor, f.actor, p.plan.foot, f.initial.time, 0.025, t);
    expect(findStrikeIntervalContact(f.selected, 0.025, footAt, 0.035, 1).outcome).toBe(
      'unresolved',
    );
    const ball = physicalStrikeBall(f.selected);
    const tangent = () => ({
      position: { ...ball.position, x: ball.position.x - 0.145 },
      velocity: ball.velocity,
      speedBound: 0,
    });
    expect(findStrikeIntervalContact(f.selected, 0.025, tangent).outcome).toBe('unresolved');
    const overlapping = () => ({ position: ball.position, velocity: ball.velocity, speedBound: 0 });
    expect(findStrikeIntervalContact(f.selected, 0.025, overlapping).reason).toBe(
      'initial_penetration',
    );
  });
  it.each([
    ['departing', 5, -0.005],
    ['approaching', 8, 0.005],
  ] as const)('preserves PR209 unresolved %s case', (direction, speed, timingSeconds) => {
    const f = createTemporalStrikeFixture({ seed: 'pr209-unresolved-pr211', direction, speed });
    expect(
      executeTemporalStrike(f.state, f.actor, f.plan, { ...ZERO_TEMPORAL_ERROR, timingSeconds })
        .outcome,
    ).toBe('unresolved');
  });
});
