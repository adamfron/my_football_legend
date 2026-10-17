// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCombinationFixture } from '../../../scripts/pr174Fixtures';
import { resolveMatchAction, rankAvailableActionsForAI, shotUtility } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { reconcileCombination, enumerateCombinationPasses } from './combinationPlay';
import { combinationIntentSchema } from './combinationState';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { distance } from './matchSpace';
import {
  createTeamThreatMemory,
  evaluateTeamThreatResponse,
  observeTeamThreats,
  deriveSolutionPenalty,
} from './teamThreatMemory';

const planned = () => {
  const f = createCombinationFixture({ scenario: 'winger' });
  const state = resolveMatchAction(f.state, f.action);
  // A lifecycle fixture retains the real release identity; it does not prescribe any contact.
  state.combinationIntent = combinationIntentSchema.parse({
    id: `${state.lastPassDiagnostic!.passId}:test`,
    team: 'home',
    kind: 'pass_and_go',
    initiatorId: f.a,
    partnerId: f.b,
    runnerId: f.a,
    firstPassId: state.lastPassDiagnostic!.passId,
    startedAt: state.time,
    expiresAt: state.time + 4,
    origin: f.state.players.find((p) => p.id === f.a)!.position,
    target: { x: 76, y: 10 },
    phase: 'first_flight',
    runMetres: 0,
  });
  return { ...f, state };
};
describe('PR174 bounded independent combinations', () => {
  it('does not count physically unavailable teammates as rest cover', () => {
    const f = createCombinationFixture({ scenario: 'winger' });
    const teammates = f.state.players.filter(
      (p) => p.team === 'home' && ![f.a, f.b].includes(p.id) && p.slot.position !== 'goalkeeper',
    );
    for (const [i, p] of teammates.entries()) {
      if (i < 2) {
        p.position = { x: 40 + i * 4, y: 40 };
        p.injury = {
          id: 'cover',
          playerId: p.id,
          at: 20,
          status: 'unable',
          mechanism: 'contact',
          injuryType: 'impact',
          recoveryDays: 1,
          assessmentRequired: false,
        };
      } else p.position = { x: 85, y: 35 + i * 3 };
    }
    const withoutCover = resolveMatchAction(f.state, f.action);
    expect(withoutCover.combinationIntent).toBeUndefined();
    for (const p of teammates) delete p.injury;
    expect(resolveMatchAction(f.state, f.action).combinationIntent?.kind).toBe('pass_and_go');
  });
  it('recognises a third player moving laterally toward an open connection', () => {
    const f = planned();
    const c = f.state.combinationIntent!;
    c.kind = 'third_man';
    c.target = { x: c.origin.x, y: c.origin.y + 6 };
    const runner = f.state.players.find((p) => p.id === c.runnerId)!;
    runner.position = { x: c.origin.x, y: c.origin.y + 2 };
    runner.velocity = { x: 0, y: 3 };
    expect(reconcileCombination(f.state).combinationIntent?.runStartedAt).toBe(f.state.time);
  });
  it('never awards possession or changes the first pass physics when an intent is recorded', () => {
    const f = planned();
    expect(f.state.ball.ownerId).toBeUndefined();
    expect(f.state.lastPassDiagnostic?.resolvedAt).toBeUndefined();
    expect(f.state.ball.velocity).toBeDefined();
    expect(distance(f.state.ball, f.state.combinationIntent!.target)).toBeGreaterThan(4);
  });
  it.each([
    'possession_lost',
    'expired',
    'restart',
    'participant_unavailable',
    'human_command',
  ] as const)('cancels on %s without altering ball authority', (reason) => {
    const f = planned(),
      s = f.state;
    if (reason === 'possession_lost') s.possessionTeam = 'away';
    if (reason === 'expired') s.time = s.combinationIntent!.expiresAt;
    if (reason === 'restart') s.status = 'half_time';
    if (reason === 'participant_unavailable') s.players = s.players.filter((p) => p.id !== f.b);
    if (reason === 'human_command') {
      s.controlledFootballerId = f.a;
      s.playerAgencyEnabled = true;
    }
    const ball = structuredClone(s.ball),
      next = reconcileCombination(s);
    expect(next.combinationIntent).toBeUndefined();
    expect(next.lastCombination?.result).toBe(reason);
    expect(next.ball).toEqual(ball);
  });
  it.each(['intercepted', 'technical_error', 'out_of_play', 'unclaimed'] as const)(
    'cancels a physically failed first contact: %s',
    (finalResult) => {
      const f = planned();
      f.state.lastResolvedPass = {
        ...f.state.lastPassDiagnostic!,
        resolvedAt: f.state.time,
        finalResult,
      };
      expect(reconcileCombination(f.state).lastCombination?.result).toBe('contact_failed');
    },
  );
  it('does not confuse an assignment with an actually started run', () => {
    const f = planned();
    expect(enumerateCombinationPasses(f.state, f.state.players.find((p) => p.id === f.b)!)).toEqual(
      [],
    );
    expect(reconcileCombination(f.state).combinationIntent?.runStartedAt).toBeUndefined();
  });
  it('rejects an offside runner even with an observed run identity', () => {
    const f = planned();
    f.state.combinationIntent!.runStartedAt = f.state.time;
    f.state.players.find((p) => p.id === f.a)!.position.x = 104;
    expect(enumerateCombinationPasses(f.state, f.state.players.find((p) => p.id === f.b)!)).toEqual(
      [],
    );
  });
  it('lets a covering defender close a planned return lane', () => {
    const f = planned();
    f.state.combinationIntent!.runStartedAt = f.state.time;
    const a = f.state.players.find((p) => p.id === f.a)!;
    a.position = { x: 74, y: 10 };
    a.velocity = { x: 4, y: 0 };
    const defender = f.state.players.find(
      (p) => p.team !== a.team && p.slot.position !== 'goalkeeper',
    )!;
    defender.position = { x: 80, y: 10 };
    defender.velocity = { x: -2, y: 0 };
    defender.facingAngle = -Math.PI / 2;
    expect(enumerateCombinationPasses(f.state, f.state.players.find((p) => p.id === f.b)!)).toEqual(
      [],
    );
  });
  it('preserves the entire schema-validated continuation across JSON reload', () => {
    const { state } = planned();
    const normal = tacticalMatchStateSchema.parse(state) as unknown as TacticalMatchState;
    const reloaded = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(state)),
    ) as unknown as TacticalMatchState;
    expect(stepTacticalMatchAfterDecisionProbe(normal)).toEqual(
      stepTacticalMatchAfterDecisionProbe(reloaded),
    );
  });
  it('does not auto-run a human passer after a deliberate layoff', () => {
    const f = createCombinationFixture({ scenario: 'human' });
    const state = resolveMatchAction(f.state, f.action, 'human_selected');
    expect(state.playerMovementIntent).toBeUndefined();
    expect(state.combinationIntent?.runnerId).not.toBe(f.a);
    expect(state.pendingReceptionIntent).toBeUndefined();
  });
  it('leaves short passing available at low burst readiness', () => {
    const f = createCombinationFixture({ scenario: 'winger', variant: 'tired' });
    expect(
      rankAvailableActionsForAI(f.state, f.a).some(
        (r) => r.action.type === 'pass' && r.action.receiverId === f.b,
      ),
    ).toBe(true);
  });
});

describe('PR174 existing threat-memory adaptation', () => {
  it('does not count a transient forward visit followed by recycling as retained progression', () => {
    const f = planned();
    let state = f.state;
    state.teams.home.threatMemory = createTeamThreatMemory(0, state.time);
    for (let i = 0; i < 6; i++) {
      const previous = structuredClone(state),
        x = i % 2 === 0 ? 81 : 68;
      state = {
        ...state,
        time: state.time + 1,
        ball: { x, y: 10, ownerId: f.a },
        players: state.players.map((p) => (p.id === f.a ? { ...p, position: { x, y: 10 } } : p)),
        lastResolvedPass: {
          ...f.state.lastPassDiagnostic!,
          passId: `recycle-${i}`,
          passerId: f.b,
          actualReceiverId: f.a,
          resolvedAt: state.time + 1,
          actualContactPoint: { x, y: 10 },
          finalResult: 'completed',
        },
      };
      state = observeTeamThreats(previous, state);
    }
    expect(state.teams.home.threatMemory?.attackFailures?.[0]).toBeGreaterThan(0.9);
  });
  it('requires actual distinct completed contacts, deduplicates them and does not trigger after one window', () => {
    const f = planned();
    let state = f.state;
    state.teams.home.threatMemory = createTeamThreatMemory(0, state.time);
    for (let i = 0; i < 12; i++) {
      const before = structuredClone(state);
      state = {
        ...state,
        time: state.time + 1,
        ball: { x: 68, y: 10, ownerId: f.a },
        lastResolvedPass: {
          ...f.state.lastPassDiagnostic!,
          passId: `observed-${i}`,
          passerId: f.b,
          actualReceiverId: f.a,
          resolvedAt: state.time + 1,
          actualContactPoint: { x: 68, y: 10 },
          finalResult: 'completed',
        },
      };
      state = observeTeamThreats(before, state);
      const once = state.teams.home.threatMemory!;
      expect(observeTeamThreats(state, state).teams.home.threatMemory).toEqual(once);
      if (i === 5) expect(once.response.attackVariation ?? 0).toBe(0);
    }
    expect(state.teams.home.threatMemory?.qualifyingAttacks).toBe(2);
    expect(state.teams.home.threatMemory?.attackFailures?.[0]).toBeGreaterThan(1.8);
  });
  it('has no attacking adaptation without evidence, and changes slowly with repeated evidence', () => {
    const f = createCombinationFixture({ scenario: 'recycling' });
    const memory = createTeamThreatMemory(0, f.state.time);
    expect(
      evaluateTeamThreatResponse({ ...f.state, time: f.state.time + 2 }, 'home', memory).response
        .attackVariation ?? 0,
    ).toBe(0);
    memory.attackFailures = [0, 6, 0];
    const reacted = evaluateTeamThreatResponse(
      { ...f.state, time: f.state.time + 2 },
      'home',
      memory,
    );
    expect(reacted.response.attackVariation).toBeCloseTo(0.07);
    expect(reacted.retainUntil).toBeGreaterThan(f.state.time + 20);
    const retained = evaluateTeamThreatResponse({ ...f.state, time: f.state.time + 4 }, 'home', {
      ...reacted,
      attackFailures: [0, 0, 0],
    });
    expect(retained.response.attackVariation).toBe(reacted.response.attackVariation);
    const reverted = evaluateTeamThreatResponse({ ...f.state, time: f.state.time + 60 }, 'home', {
      ...retained,
      attackFailures: [0, 0, 0],
    });
    expect(reverted.response.attackVariation).toBe(0);
  });
  it('constrains the same failed history when protecting a late lead', () => {
    const f = createCombinationFixture({ scenario: 'recycling', variant: 'lead' });
    const memory = createTeamThreatMemory(0, f.state.time - 30);
    memory.attackFailures = [0, 6, 0];
    const protecting = evaluateTeamThreatResponse(f.state, 'home', memory);
    const chasing = evaluateTeamThreatResponse(
      { ...f.state, score: { home: 0, away: 1 } },
      'home',
      memory,
    );
    expect(protecting.response.attackVariation!).toBeLessThan(chasing.response.attackVariation!);
    expect(protecting.response.distanceShotContext!).toBeLessThan(
      chasing.response.distanceShotContext!,
    );
  });
  it('distinguishes technical failure from a repeatedly intercepted decision', () => {
    const f = createCombinationFixture({ scenario: 'central' });
    const actor = f.state.players.find((p) => p.id === f.a)!;
    const memory = createTeamThreatMemory(0, f.state.time);
    memory.recentSolutions = [
      {
        id: 'physical-failure',
        actorId: f.a,
        receiverId: f.b,
        action: 'support',
        channel: 1,
        origin: actor.position,
        at: f.state.time,
        pressure: f.state.currentPressure,
        outcome: 'technical_error',
      },
    ];
    f.state.teams.home.threatMemory = memory;
    const executionCost = deriveSolutionPenalty(
      f.state,
      actor,
      'support',
      actor.position,
      f.b,
      0.9,
    );
    memory.recentSolutions[0]!.outcome = 'intercepted';
    expect(
      deriveSolutionPenalty(f.state, actor, 'support', actor.position, f.b, 0.9),
    ).toBeGreaterThan(executionCost * 10);
  });
  it('uses long-range evidence only with appropriate release ability and geometry', () => {
    const f = createCombinationFixture({ scenario: 'distance' });
    const actor = f.state.players.find((p) => p.id === f.a)!;
    for (const p of f.state.players.filter(
      (p) =>
        p.team !== actor.team &&
        p.slot.position !== 'goalkeeper' &&
        distance(p.position, actor.position) < 12,
    ))
      p.position = { x: 90, y: p.position.y < 34 ? 18 : 50 };
    f.state.players.find((p) => p.id === f.b)!.position = { x: 94, y: 38 };
    const memory = createTeamThreatMemory(0, f.state.time);
    f.state.teams.home.threatMemory = memory;
    const neutral = shotUtility(f.state, actor);
    memory.response.distanceShotContext = 0.4;
    expect(shotUtility(f.state, actor)).toBeGreaterThan(neutral);
    actor.profile.attributes.finishing = 20;
    actor.profile.attributes.technique = 20;
    const adaptedWeak = shotUtility(f.state, actor);
    memory.response.distanceShotContext = 0;
    expect(shotUtility(f.state, actor)).toBe(adaptedWeak);
  });
});
