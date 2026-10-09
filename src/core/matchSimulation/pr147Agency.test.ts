// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatch } from './matchSimulation';
import {
  projectPlayerAgency,
  createPendingOutcome,
  applyPlayerDecision,
  resolveDevPlayerDecision,
} from './playerDecision';
import {
  projectContextualInteractions,
  applyContextualInteraction,
} from './contextualInteractions';
import { enumerateAvailableActions, resolveMatchAction, scoreActionForAI } from './matchActions';
import { resolvePendingPlayerDecision } from './decisionOutcome';
import { resolveDefensiveChallenge } from './defensiveChallenges';
import { createMatchStatistics, observePlayerMatchStats } from './playerMatchStats';
import { applyChallengeInfringement } from './matchRules';
import type { ChallengeDiagnostic } from './defensiveChallenges';
import { tacticalMatchStateSchema } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (dangerous = true) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr147-agency',
      control: { mode: 'spectator' },
    }),
  );
  const actor = state.players.find(
    (p) => p.team === 'home' && p.profile.primaryPosition === 'central_midfielder',
  )!;
  const opponent = state.players.find(
    (p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  state.time = 10;
  state.controlledFootballerId = actor.id;
  for (const player of state.players) {
    player.position = { x: 95, y: 62 };
    player.anchor = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  }
  actor.position = { x: dangerous ? 22 : 52, y: 34 };
  actor.anchor = { ...actor.position };
  actor.facingAngle = Math.PI / 2;
  opponent.position = { x: actor.position.x + 1.5, y: 34 };
  opponent.facingAngle = -Math.PI / 2;
  opponent.velocity = { x: dangerous ? -4 : 0, y: 0 };
  state.ball = { ...opponent.position, ownerId: opponent.id, height: 0.11 };
  state.possessionTeam = opponent.team;
  state.teams.away.phase = dangerous ? 'attacking_transition' : 'positional_attack';
  return { state, actor, opponent };
};

describe('PR147 target-first defensive intent and honest consequences', () => {
  it('keeps harmless standing defence autonomous without adding a menu prompt', () => {
    const { state } = fixture(false);
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
    expect(projectPlayerAgency(state).probe.blockedReason).toBe('routine');
  });

  it('offers physical slide and tactical risk only for the selected dangerous carrier', () => {
    const { state, opponent } = fixture();
    const opportunity = projectPlayerAgency(state).opportunity!;
    expect(opportunity.kind).toBe('defensive_response');
    const choices = projectContextualInteractions(state, opportunity, {
      kind: 'player',
      playerId: opponent.id,
    });
    expect(choices.map((choice) => choice.labelKey)).toContain('slide_tackle');
    expect(choices.map((choice) => choice.labelKey)).toContain('tactical_foul');
    opponent.velocity = { x: 0, y: 0 };
    state.teams.away.phase = 'positional_attack';
    const stationary = projectContextualInteractions(state, opportunity, {
      kind: 'player',
      playerId: opponent.id,
    });
    expect(stationary.map((choice) => choice.labelKey)).not.toContain('slide_tackle');
    expect(stationary.map((choice) => choice.labelKey)).not.toContain('tactical_foul');
  });

  it('passes explicit human commitment through the canonical action path', () => {
    const { state, actor, opponent } = fixture();
    const opportunity = projectPlayerAgency(state).opportunity!;
    const choice = projectContextualInteractions(state, opportunity, {
      kind: 'player',
      playerId: opponent.id,
    }).find((item) => item.labelKey === 'slide_tackle')!;
    const next = applyContextualInteraction(state, opportunity, choice);
    expect(next.defensiveChallenge).toMatchObject({
      actorId: actor.id,
      opponentId: opponent.id,
      technique: 'slide',
      source: 'human_selected',
    });
    expect(next.pendingPlayerDecision?.selectedIntent).toBe('challenge:slide');
    expect(next.lastChallenge).toBeUndefined();
    expect(projectPlayerAgency(next).probe.blockedReason).toBe('resolution_in_progress');
  });

  it('never silently selects a high-risk controlled-player action', () => {
    const { state, actor, opponent } = fixture();
    for (const technique of ['committed', 'slide', 'tactical'] as const) {
      expect(
        resolveMatchAction(
          state,
          { type: 'challenge', actorId: actor.id, opponentId: opponent.id, technique },
          'autonomous_routine',
        ),
      ).toBe(state);
      expect(
        resolveMatchAction(
          state,
          { type: 'challenge', actorId: actor.id, opponentId: opponent.id, technique },
          'autonomous_npc',
        ),
      ).toBe(state);
    }
  });

  it('uses the same canonical action path for an NPC high-risk intent', () => {
    const { state, actor, opponent } = fixture();
    delete state.controlledFootballerId;
    const next = resolveMatchAction(
      state,
      { type: 'challenge', actorId: actor.id, opponentId: opponent.id, technique: 'slide' },
      'autonomous_npc',
    );
    expect(next.defensiveChallenge).toMatchObject({ technique: 'slide', source: 'autonomous_npc' });
  });

  it('waits for a physical result rather than reporting loss at intent selection', () => {
    const { state, actor, opponent } = fixture();
    const opportunity = projectPlayerAgency(state).opportunity!;
    const action = {
      type: 'challenge',
      actorId: actor.id,
      opponentId: opponent.id,
      technique: 'standing',
    } as const;
    const selected = resolveMatchAction(
      {
        ...state,
        pendingPlayerDecision: createPendingOutcome(state, opportunity, { id: 'standing', action }),
      },
      action,
      'human_selected',
    );
    expect(resolvePendingPlayerDecision(selected).lastPlayerDecisionOutcome).toBeUndefined();
    const expired = { ...selected, time: selected.time + 1 };
    actor.position = { x: 17, y: 34 };
    const resolved = resolveDefensiveChallenge(expired).state;
    expect(resolved.lastChallenge?.outcome).toBe('missed');
    const reported = resolvePendingPlayerDecision(resolved);
    expect(reported.lastPlayerDecisionOutcome?.result).toMatchObject({
      kind: 'defensive_action_resolved',
      duelWon: false,
      duelLost: true,
    });
    const statistics = observePlayerMatchStats(createMatchStatistics(state), selected, resolved);
    expect(statistics.players.find((p) => p.playerId === actor.id)).toMatchObject({
      tacklesAttempted: 1,
      tacklesWon: 0,
    });
  });
});

describe('PR147 dismissed player availability and ten-man continuation', () => {
  const dismiss = (secondYellow = false) => {
    // Midfield contact is reckless, without a DOGSO straight-red escalation.
    const { state, actor, opponent } = fixture(false);
    state.currentPressure = 1;
    if (secondYellow)
      state.discipline = { [actor.id]: { team: actor.team, yellowCards: 1, sentOff: false } };
    const priorStats = state.statistics!.players.find((entry) => entry.playerId === actor.id)!;
    priorStats.passesAttempted = 3;
    priorStats.tacklesWon = 1;
    const contact: ChallengeDiagnostic = {
      id: `${state.seed}:dismissal:${secondYellow}`,
      at: state.time,
      actorId: actor.id,
      team: actor.team,
      opponentId: opponent.id,
      technique: 'committed',
      source: 'human_selected',
      position: { ...opponent.position },
      outcome: 'foul',
      ballFirst: false,
      opponentContact: true,
      ballDistance: 1.5,
      opponentDistance: 1.5,
      facingError: 0,
      relativeSpeed: 4,
      lateness: 0,
      force: secondYellow ? 5 : 10,
      fromBehind: false,
    };
    return { state: applyChallengeInfringement(state, contact), actor, opponent };
  };

  it.each([false, true])(
    'removes all agency and action availability after dismissal (%s)',
    (secondYellow) => {
      const { state, actor, opponent } = dismiss(secondYellow);
      expect(state.lastCard?.kind).toBe(secondYellow ? 'second_yellow_red' : 'red');
      expect(state.players.filter((player) => player.team === actor.team)).toHaveLength(10);
      expect(projectPlayerAgency(state).opportunity).toBeUndefined();
      expect(projectPlayerAgency(state).probe.blockedReason).toBe('no_controlled_player');
      expect(enumerateAvailableActions(state, actor.id)).toEqual([]);
      const staleChallenge = {
        type: 'challenge',
        actorId: actor.id,
        opponentId: opponent.id,
        technique: 'standing',
      } as const;
      expect(resolveMatchAction(state, staleChallenge, 'human_selected')).toBe(state);
      expect(scoreActionForAI(state, actor.id, staleChallenge)).toBe(-Infinity);
      expect(resolveMatchAction(state, { type: 'hold', actorId: actor.id }, 'human_selected')).toBe(
        state,
      );
      expect(state.statistics!.players.find((entry) => entry.playerId === actor.id)).toMatchObject({
        passesAttempted: 3,
        tacklesWon: 1,
      });
      expect(state.discipline?.[actor.id]?.sentOff).toBe(true);
      const before = fixture();
      const cachedOpportunity = projectPlayerAgency(before.state).opportunity!;
      const cachedChoice = projectContextualInteractions(before.state, cachedOpportunity, {
        kind: 'player',
        playerId: before.opponent.id,
      })[0]!;
      expect(cachedOpportunity.openedAt).toBe(state.time);
      expect(applyPlayerDecision(state, cachedOpportunity, cachedOpportunity.options[0]!.id)).toBe(
        state,
      );
      expect(applyContextualInteraction(state, cachedOpportunity, cachedChoice)).toBe(state);
      expect(resolveDevPlayerDecision(state, cachedOpportunity)).toMatchObject({
        state,
        status: 'terminal_or_no_longer_relevant',
      });
    },
  );

  it('rejects a stale selected pass to a dismissed teammate and enumerates only active targets', () => {
    const { state, actor } = dismiss();
    const passer = state.players.find((player) => player.team === actor.team)!;
    const live = {
      ...state,
      scenario: 'open_play' as const,
      ball: { ...passer.position, ownerId: passer.id },
      possessionTeam: passer.team,
    };
    delete live.restart;
    const choices = enumerateAvailableActions(live, passer.id);
    expect(choices.some((action) => action.type === 'pass')).toBe(true);
    expect(choices.some((action) => action.type === 'pass' && action.receiverId === actor.id)).toBe(
      false,
    );
    expect(
      choices.some(
        (action) =>
          (action.type === 'cross' || action.type === 'header') &&
          action.intendedTargetId === actor.id,
      ),
    ).toBe(false);
    expect(
      resolveMatchAction(
        live,
        {
          type: 'pass',
          actorId: passer.id,
          receiverId: actor.id,
          target: actor.position,
          intent: 'support',
        },
        'human_selected',
      ),
    ).toBe(live);
    const stalePass = {
      type: 'pass',
      actorId: passer.id,
      receiverId: actor.id,
      target: actor.position,
      intent: 'support',
    } as const;
    const opportunity = {
      id: 'cached-pass-before-dismissal',
      actorId: passer.id,
      openedAt: live.time,
      kind: 'on_ball',
      signature: 'cached-pass',
      options: [{ id: 'pass', kind: 'action', labelKey: 'pass_support', action: stalePass }],
    } as Parameters<typeof applyPlayerDecision>[1];
    live.controlledFootballerId = passer.id;
    for (const kind of ['on_ball', 'incoming_ball'] as const) {
      const cached = { ...opportunity, kind };
      expect(applyPlayerDecision(live, cached, 'pass')).toBe(live);
      expect(
        applyContextualInteraction(live, cached, {
          id: 'stale-pass',
          labelKey: 'pass_support',
          target: { kind: 'player', playerId: actor.id },
          resolution: { kind: 'action', action: stalePass },
        }),
      ).toBe(live);
    }
  });

  it('releases a legal restart and deterministically continues with ten players and preserved records', () => {
    const continueMatch = () => {
      const { state, actor } = dismiss(true);
      const taker = state.restart!.takerId;
      const restartAction = enumerateAvailableActions(state, taker).find(
        (action) => action.type !== 'hold',
      )!;
      expect(restartAction).toBeDefined();
      let next = resolveMatchAction(state, restartAction, 'autonomous_npc');
      expect(next.restart?.phase).toBe('kick_preparation');
      expect(next.ball).toEqual(state.ball);
      const awardId = state.lastRestartAward!.id;
      for (
        let tick = 0;
        tick < 1600 &&
        !next.stoppageLedger?.intervals.some(
          (interval) => interval.awardId === awardId && interval.endReason === 'execution',
        );
        tick++
      ) {
        next = stepTacticalMatch(next, 0.025);
        expect(next.players.some((player) => player.id === actor.id)).toBe(false);
        expect(next.ball.ownerId).not.toBe(actor.id);
        expect(next.defensiveChallenge?.actorId).not.toBe(actor.id);
        expect(projectPlayerAgency(next).opportunity).toBeUndefined();
      }
      const executedAt = next.stoppageLedger?.intervals.find(
        (interval) => interval.awardId === awardId,
      )?.executedAt;
      expect(executedAt).toBeDefined();
      const continuationStartedAt = next.time;
      for (let tick = 0; tick < 400; tick++) {
        next = stepTacticalMatch(next, 0.025);
        expect(next.players.some((player) => player.id === actor.id)).toBe(false);
        expect(next.ball.ownerId).not.toBe(actor.id);
        expect(next.defensiveChallenge?.actorId).not.toBe(actor.id);
        expect(projectPlayerAgency(next).opportunity).toBeUndefined();
      }
      expect(next.time).toBeCloseTo(continuationStartedAt + 10, 8);
      expect(next.players.filter((player) => player.team === actor.team)).toHaveLength(10);
      expect(next.statistics!.players.find((entry) => entry.playerId === actor.id)).toMatchObject({
        passesAttempted: 3,
        tacklesWon: 1,
      });
      expect(next.discipline?.[actor.id]).toMatchObject({ yellowCards: 2, sentOff: true });
      expect(tacticalMatchStateSchema.safeParse(next).success).toBe(true);
      return JSON.stringify(next);
    };
    expect(continueMatch()).toBe(continueMatch());
  });
});
