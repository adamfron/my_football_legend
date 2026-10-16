// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pushedTouchFixture } from '../../../scripts/pr168Fixtures';
import { createFormationBenchmarkMatch } from './benchmarkFixtures';
import { deriveCarryPursuit } from './carryPursuit';
import { deriveCarryExecution } from './carryExecution';
import { reconcileHumanPossession } from './possessionAgency';
import { resolveMatchAction, enumerateAvailableActions } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { distance } from './matchSpace';
import { evaluateTacticalActions, explainTacticalOutcome } from './tacticalActionEvaluator';
import { TACTICAL_PREFERENCE_DEFAULTS } from './tacticalPreferences';

describe('PR168 pushed-touch continuity', () => {
  for (const loose of [false, true])
    for (const reversed of [false, true])
      for (const pressure of [false, true])
        it(`pursues before turning: loose=${loose}, reversed=${reversed}, pressure=${pressure}`, () => {
          const fixture = pushedTouchFixture({ loose, reversed, pressure });
          const actor = fixture.state.players.find((p) => p.id === fixture.actorId)!;
          const ball = structuredClone(fixture.state.ball);
          const next = resolveMatchAction(
            fixture.state,
            {
              type: 'carry',
              actorId: actor.id,
              target: { x: 60 - fixture.dir * 8, y: 15 },
              movementMode: 'sprint',
            },
            'human_selected',
          );
          expect(next.ball).toEqual(ball);
          expect(next.ballCarrierIntent?.target).toEqual({ x: 60 - fixture.dir * 8, y: 15 });
          const execution = deriveCarryExecution(next, actor, next.ballCarrierIntent!);
          expect((execution.localTarget.x - actor.position.x) * fixture.dir).toBeGreaterThan(2);
          expect(reconcileHumanPossession(next).humanPossessionEpisode).toBeDefined();
          expect(deriveCarryPursuit(next, actor)).toBeDefined();
        });
  it('actually makes physical contact before continuing toward the new destination, deterministically', () => {
    const run = () => {
      const { state, actorId } = pushedTouchFixture();
      let next = resolveMatchAction(
        state,
        { type: 'carry', actorId, target: { x: 78, y: 20 }, movementMode: 'sprint' },
        'human_selected',
      );
      let contact = false;
      for (let i = 0; i < 100; i++) {
        next = stepTacticalMatchAfterDecisionProbe(next);
        if (
          next.lastGroundContact?.actorId === actorId &&
          next.lastGroundContact.executed &&
          next.lastGroundContact.at > 600
        )
          contact = true;
      }
      return { next, contact };
    };
    const first = run();
    expect(first.contact).toBe(true);
    expect(
      first.next.players.find((p) => p.id === first.next.controlledFootballerId)!.position.y,
    ).toBeLessThan(34);
    expect(run()).toEqual(first);
  });
  it('rejects impossible, boundary, intercepted and terminal-release continuations', () => {
    for (const input of [{ gap: 20 }, { gap: 7, ballSpeed: 35 }, { boundary: true }]) {
      const { state, actorId } = pushedTouchFixture({ ...input, loose: true });
      expect(
        deriveCarryPursuit(state, state.players.find((p) => p.id === actorId)!),
      ).toBeUndefined();
    }
    for (const kind of ['intercepted', 'shot', 'pass', 'explicit_movement'] as const) {
      const { state, actorId } = pushedTouchFixture({ loose: true });
      const actor = state.players.find((p) => p.id === actorId)!;
      if (kind === 'intercepted') {
        state.ball.ownerId = state.players[15]!.id;
        state.ball.lastTouchPlayerId = state.ball.ownerId;
      }
      if (kind === 'shot') state.ball.travelKind = 'shot';
      if (kind === 'pass') state.ball.travelKind = 'pass';
      if (kind === 'explicit_movement')
        state.playerMovementIntent = {
          actorId,
          type: 'attack_space',
          target: { x: 40, y: 10 },
          startedAt: 600,
          expiresAt: 604,
        };
      expect(deriveCarryPursuit(state, actor)).toBeUndefined();
      expect(reconcileHumanPossession(state).humanPossessionEpisode).toBeUndefined();
    }
  });
  it('does not synthesize a contact or ownership while pursuing a loose ball', () => {
    const { state, actorId } = pushedTouchFixture({ loose: true });
    const next = resolveMatchAction(
      state,
      { type: 'carry', actorId, target: { x: 80, y: 20 }, movementMode: 'carry' },
      'human_selected',
    );
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.lastGroundContact).toEqual(state.lastGroundContact);
    expect(
      distance(next.ball, next.players.find((p) => p.id === actorId)!.position),
    ).toBeGreaterThan(2);
  });
  it('preserves the destination through the last loose approach tick and real acquisition', () => {
    const { state, actorId } = pushedTouchFixture({ loose: true });
    const actor = state.players.find((p) => p.id === actorId)!;
    state.ball.x = actor.position.x + 0.4;
    state.ball.velocity = { x: 0, y: 0 };
    expect(deriveCarryPursuit(state, actor)?.arrival).toBe(0);
    expect(reconcileHumanPossession(state).humanPossessionEpisode).toBeDefined();
    let next = resolveMatchAction(
      state,
      { type: 'carry', actorId, target: { x: 78, y: 20 }, movementMode: 'carry' },
      'human_selected',
    );
    expect(next.ball.ownerId).toBeUndefined();
    for (let tick = 0; tick < 60; tick++) next = stepTacticalMatchAfterDecisionProbe(next);
    expect(next.ball.ownerId).toBe(actorId);
    expect(next.ballCarrierIntent?.target).toEqual({ x: 78, y: 20 });
    expect(next.players.find((p) => p.id === actorId)!.position.y).toBeLessThan(34);
  });
});

describe('PR168 read-only tactical alternatives', () => {
  for (const scenario of [
    'short_progressive',
    'wide',
    'counter',
    'pressure',
    'clear_shot',
    'poor_angle',
    'defender',
    'overlap',
    'loose',
    'late',
    'fatigued',
    'coach',
  ] as const)
    it(scenario, () => {
      const { state } = createFormationBenchmarkMatch({
        anchor: '4-3-3',
        opponent: '4-4-2',
        seed: `pr168:${scenario}`,
        attributes: 70,
      });
      delete state.restart;
      state.scenario = 'open_play';
      state.time = 1200;
      const actor = state.players[scenario === 'defender' || scenario === 'overlap' ? 2 : 8]!;
      actor.position = {
        x: scenario.includes('shot') || scenario === 'poor_angle' ? 88 : 55,
        y: scenario === 'wide' || scenario === 'poor_angle' ? 3 : 34,
      };
      state.players
        .filter((p) => p.team !== actor.team)
        .forEach((p, i) => {
          p.position = { x: 70 + i, y: 4 + i * 5 };
        });
      state.ball = { ...actor.position, ownerId: actor.id, lastTouchPlayerId: actor.id };
      if (scenario === 'pressure')
        state.players[15]!.position = { x: actor.position.x + 0.7, y: actor.position.y };
      if (scenario === 'counter') state.teams[actor.team].phase = 'attacking_transition';
      if (scenario === 'late') {
        state.time = 5300;
        state.score[actor.team] = 1;
      }
      if (scenario === 'fatigued') actor.fitness!.longTermCapacity = 0.55;
      if (scenario === 'coach')
        state.teams[actor.team].tacticalPreferences = TACTICAL_PREFERENCE_DEFAULTS.direct;
      if (scenario === 'loose') delete state.ball.ownerId;
      const before = structuredClone(state);
      const result = evaluateTacticalActions(state, actor.id);
      if (scenario !== 'loose') expect(result.actions.length).toBeGreaterThan(0);
      expect(result.context?.ballDistance).toBe(0);
      if (scenario === 'pressure')
        expect(
          result.actions.some((entry) => entry.reasons.some((r) => r.code === 'pressure')),
        ).toBe(true);
      if (scenario === 'fatigued')
        expect(
          result.actions.some((entry) => entry.reasons.some((r) => r.code === 'fatigue')),
        ).toBe(true);
      if (scenario === 'late')
        expect(
          result.actions.some((entry) =>
            entry.reasons.some((r) => r.code === 'late_score_context'),
          ),
        ).toBe(true);
      expect(state).toEqual(before);
      expect(evaluateTacticalActions(state, actor.id)).toEqual(result);
      const available = enumerateAvailableActions(state, actor.id);
      for (const entry of result.actions) expect(available).toContainEqual(entry.action);
      expect(
        result.actions.every(
          (entry) => entry.reasons.length > 0 && entry.uncertainty === 'uncalibrated_heuristic',
        ),
      ).toBe(true);
      if (result.actions[0]) {
        expect(explainTacticalOutcome(result.actions[0], 'failed').decision).toEqual(
          explainTacticalOutcome(result.actions[0], 'goal').decision,
        );
      }
    });
});
