// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createReformFixture } from '../../../scripts/pr177Fixtures';
import {
  assessCoachTactics,
  coachIntelligenceSchema,
  initialiseCoachIntelligence,
  observeCoachOpposition,
} from './coachIntelligence';
import { assignTacticalRoles, changeTacticalRole, tacticalRoleFor } from './tacticalRoles';
import { createTeamThreatMemory } from './teamThreatMemory';
import { deriveTacticalTargets } from './tacticalPositioning';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { evaluateRoleReplacement } from './substitutions';
import { createMatchFitness } from './matchFitness';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { PRIMARY_DECISION_POLICIES } from './decisionPolicyConfig';
import {
  canReconsiderDecision,
  canReleaseControlledAction,
  markDecisionEvaluated,
} from './decisionReadiness';
import { createSpatialFixture } from '../../../scripts/pr181SpatialFixtures';
import { roleMovementTarget } from './roleTactics';

const fixture = () => {
  const f = createReformFixture('stationary-winger');
  delete f.state.teams.home.coaching;
  delete f.state.teams.away.coaching;
  f.state = initialiseCoachIntelligence(f.state);
  f.state.decisionPolicy = 'role-intent-v1';
  f.state.rolePlan = assignTacticalRoles(f.state);
  return f;
};
const evidence = (
  state: ReturnType<typeof fixture>['state'],
  side: 'home' | 'away',
  data: Record<string, number>,
) => {
  state.teams[side].coaching = { ...state.teams[side].coaching!, samples: 24, ...data };
};

describe('PR182 bounded coach intelligence', () => {
  it.each(PRIMARY_DECISION_POLICIES)(
    'obeys a manager role instruction through real movement authority in %s',
    (policy) => {
      const { state, runner } = fixture();
      state.decisionPolicy = policy;
      const short = changeTacticalRole(state, runner.id, 'wide_playmaker', 'coach');
      const depth = changeTacticalRole(short, runner.id, 'traditional_winger', 'coach');
      expect(roleMovementTarget(depth, runner, runner.position)).not.toEqual(
        roleMovementTarget(short, runner, runner.position),
      );
    },
  );
  it('recognises known motor recovery without granting contact or exceeding the ranking budget', () => {
    const { state, actor } = fixture();
    state.ball = { ...state.ball, ...actor.position, ownerId: actor.id, height: 0 };
    state.lastGroundContact = {
      actorId: actor.id,
      at: state.time,
      region: 'left_foot',
      point: actor.position,
      incomingVelocity: { x: 0, y: 0 },
      outgoingVelocity: { x: 0, y: 0 },
      retained: true,
      executed: true,
      physicalCount: 1,
    };
    state.decisionReadiness = markDecisionEvaluated(state, actor);
    state.time += 0.05;
    expect(canReleaseControlledAction(state, actor)).toBe(false);
    expect(canReconsiderDecision(state, actor)).toBe(false);
    state.time += 0.075;
    expect(canReleaseControlledAction(state, actor)).toBe(true);
    expect(canReconsiderDecision(state, actor)).toBe(true);
  });
  it('keeps a target forward in finishing space for an advanced wide carrier, while a false nine can connect', () => {
    const { state, striker, actor } = createSpatialFixture('cross-target');
    actor.position.x = 76;
    state.ball.x = 76.4;
    striker.position.x = 85;
    state.decisionPolicy = 'role-intent-v1';
    const target = roleMovementTarget(state, striker, striker.position);
    const falseNine = changeTacticalRole(state, striker.id, 'false_nine');
    const short = roleMovementTarget(falseNine, striker, striker.position);
    expect(target.x).toBeGreaterThan(87);
    expect(target.x).toBeGreaterThan(short.x + 4);
    expect(target.y).toBeGreaterThan(20);
  });
  it.each(PRIMARY_DECISION_POLICIES)(
    'recovers actual foot contact in the unchanged historical keeper hold: %s',
    (policy) => {
      const raw = JSON.parse(
        gunzipSync(
          readFileSync('docs/performance/pr179-evidence/r2-new-hold-state.json.gz'),
        ).toString(),
      );
      tacticalMatchStateSchema.parse(raw);
      let state: TacticalMatchState = raw;
      state.decisionPolicy = policy;
      const owner = state.ball.ownerId;
      for (let tick = 0; tick < 320; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      expect(state.lastPassDiagnostic?.releasedAt ?? 0).toBeGreaterThan(raw.time);
      expect(state.ball.ownerId !== owner || state.lastPassDiagnostic?.passerId === owner).toBe(
        true,
      );
    },
  );
  it('uses public positions, never private opponent tactics, ranks or RNG', () => {
    const { state } = fixture();
    state.time += 5;
    const hidden = structuredClone(state);
    hidden.teams.away.tacticalPreferences = {
      blockHeight: 1,
      organisedPress: 1,
      counterpress: 1,
      compactness: 0,
      possessionPatience: 0,
      verticality: 1,
    };
    hidden.decisionIndex += 100;
    const a = observeCoachOpposition(state),
      b = observeCoachOpposition(hidden);
    expect(a.teams.home.coaching).toEqual(b.teams.home.coaching);
    const homeRoles = (s: typeof state) =>
      Object.entries(assignTacticalRoles(s).assignments).filter(([id]) =>
        s.players.some((p) => p.id === id && p.team === 'home'),
      );
    expect(homeRoles(state)).toEqual(homeRoles(hidden));
    expect(state.teams.home.coaching!.samples).toBe(0);
    expect(a.teams.home.coaching!.samples).toBe(1);
    expect(a.decisionIndex).toBe(state.decisionIndex);
  });
  it('requires repeated observations and forgets old coverage during a stoppage', () => {
    const { state } = fixture();
    state.time += 5;
    const once = assessCoachTactics(observeCoachOpposition(state), true);
    expect(once.teams.home.coaching!.decisions.at(-1)!.changed).toBe(false);
    const stopped = structuredClone(once);
    stopped.time += 360;
    stopped.scenario = 'kick_off';
    const forgotten = observeCoachOpposition(stopped);
    expect(forgotten.teams.home.coaching!.samples).toBeLessThan(0.3);
  });
  it('creates distinct collective roles for possession, direct, counter and pressing coaches', () => {
    const { state } = fixture();
    const signatures = ['possession', 'direct', 'counter_attacking', 'pressing'].map((style) => {
      const copy = structuredClone(state);
      copy.teams.home.style = style as typeof copy.teams.home.style;
      return JSON.stringify(
        Object.entries(assignTacticalRoles(copy).assignments).filter(
          ([id]) => copy.players.find((p) => p.id === id)?.team === 'home',
        ),
      );
    });
    expect(new Set(signatures).size).toBe(4);
  });
  it('A: exploits available pace with different future targets and physical movement', () => {
    const { state, runner } = fixture();
    const before = changeTacticalRole(state, runner.id, 'wide_playmaker');
    evidence(before, runner.team, { lineSpace: 38 });
    const changed = assessCoachTactics(before, true);
    const decision = changed.teams[runner.team].coaching!.decisions.at(-1)!;
    expect(decision.chosen).toBe('exploit_space');
    expect(decision.changed).toBe(true);
    expect(tacticalRoleFor(changed, runner).id).toBe('traditional_winger');
    expect(changed.players).toEqual(before.players);
    const a = deriveTacticalTargets(changed).find((p) => p.id === runner.id)!;
    const b = deriveTacticalTargets(before).find((p) => p.id === runner.id)!;
    expect(a.target).not.toEqual(b.target);
    const run = (input: typeof state) => {
      let s = structuredClone(input);
      for (let i = 0; i < 120; i++) s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
      return s;
    };
    const after = run(changed),
      control = run(before);
    expect(after.players.find((p) => p.id === runner.id)!.position).not.toEqual(
      control.players.find((p) => p.id === runner.id)!.position,
    );
    expect(tacticalMatchStateSchema.safeParse(after).success).toBe(true);
  });
  it('B: changes route after repeatedly observed failure of the original plan', () => {
    const { state } = fixture();
    state.teams.home.coaching!.plan = 'exploit_space';
    state.teams.home.threatMemory = {
      ...createTeamThreatMemory(),
      attackFailures: [4, 0, 0],
      qualifyingAttacks: 5,
    };
    const next = assessCoachTactics(state, true);
    expect(next.teams.home.coaching!.plan).toBe('switch_route');
    expect(next.teams.home.coaching!.channel).toBe(2);
  });
  it('C: fills a dismissed central defender berth without moving bodies instantly', () => {
    const { state } = fixture();
    const defender = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'center_back',
    )!;
    state.discipline = {
      [defender.id]: { yellowCards: 0, sentOff: true, sentOffAt: state.time, team: 'home' },
    };
    state.players = state.players.filter((p) => p.id !== defender.id);
    state.departedPlayers = [...(state.departedPlayers ?? []), defender];
    const next = assessCoachTactics(state, false, true);
    const replacement = next.players.find(
      (p) => p.id !== defender.id && p.team === 'home' && p.slotIndex === defender.slotIndex,
    )!;
    expect(replacement).toBeDefined();
    expect(replacement.position).toEqual(
      state.players.find((p) => p.id === replacement.id)!.position,
    );
    expect(next.teams.home.coaching!.decisions.at(-1)!.trigger).toBe('dismissal');
    expect(next.teams.home.coaching!.plan).toBe('reorganise');
    expect(next.rolePlan!.assignments[replacement.id]).toBe('covering_defender');
    let continued = next;
    for (let tick = 0; tick < 120; tick++)
      continued = stepTacticalMatchAfterDecisionProbe(continued, 0.025);
    expect(continued.players.filter((p) => p.team === 'home')).toHaveLength(10);
  });
  it.each([
    [1, 'protect_lead'],
    [-1, 'chase_goal'],
  ] as const)('D/E: reacts to score %i with balanced responsibilities', (lead, plan) => {
    const { state } = fixture();
    state.time = 4000;
    state.score = { home: lead > 0 ? 1 : 0, away: lead < 0 ? 1 : 0 };
    const next = assessCoachTactics(state, true);
    expect(next.teams.home.coaching!.plan).toBe(plan);
    const forwards = next.players.filter(
      (p) => p.team === 'home' && tacticalRoleFor(next, p).instructions.includes('depth'),
    );
    expect(forwards.length).toBeGreaterThan(0);
    expect(coachIntelligenceSchema.safeParse(next.teams.home.coaching).success).toBe(true);
  });
  it('F: halftime can rationally leave roles and tactics unchanged; second call is idempotent', () => {
    const { state } = fixture();
    const next = assessCoachTactics(state, true);
    expect(next.rolePlan).toEqual(state.rolePlan);
    expect(next.teams.home.coaching!.decisions.at(-1)!.changed).toBe(false);
    expect(assessCoachTactics(next, true)).toEqual(next);
  });
  it('repeated flank exposure changes defensive roles rather than only reporting danger', () => {
    const { state } = fixture();
    state.teams.home.threatMemory = {
      ...createTeamThreatMemory(),
      lineExposures: [5, 0, 0],
      isolation: [2, 0, 0],
    };
    const next = assessCoachTactics(state, true);
    expect(next.teams.home.coaching!.plan).toBe('protect_flank');
    expect(
      next.rolePlan!.changes.some((c) => c.reason === 'coach' && c.to === 'defensive_fullback'),
    ).toBe(true);
  });
  it('compares real bench suitability for the intended role, with fatigue and card exposure', () => {
    const { state, runner } = fixture();
    state.teams[runner.team].coaching!.plan = 'exploit_space';
    const player = { ...runner, fitness: { ...createMatchFitness(), longTermCapacity: 0.5 } };
    const incoming = {
      id: 'bench-fast',
      condition: 100,
      profile: {
        ...runner.profile,
        id: 'bench-fast',
        attributes: { ...runner.profile.attributes, pace: 99 },
      },
    };
    const fast = evaluateRoleReplacement(state, player, incoming);
    const slow = evaluateRoleReplacement(state, player, {
      ...incoming,
      profile: { ...incoming.profile, attributes: { ...incoming.profile.attributes, pace: 30 } },
    });
    expect(fast.roleId).toBe('traditional_winger');
    expect(fast.roleBenefit).toBeGreaterThan(slow.roleBenefit);
  });
});
