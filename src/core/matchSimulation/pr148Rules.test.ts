// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  advanceTacticalMatch,
  startSecondHalf,
  matchStateToFrame,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import {
  beginDefensiveChallenge,
  chooseNpcDefensiveChallengeAction,
  enumerateDefensiveChallengeActions,
  resolveDefensiveChallenge,
  shouldCommitRoutinePress,
  type ChallengeDiagnostic,
} from './defensiveChallenges';
import {
  applyChallengeInfringement,
  awardFoulRestart,
  classifyChallengeFoul,
  enforceMinimumPlayers,
} from './matchRules';
import { enumerateAvailableActions, resolveMatchAction } from './matchActions';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import {
  applyPlayerDecision,
  projectPlayerDecisionOpportunity,
  type PlayerDecisionOpportunity,
} from './playerDecision';
import { applyContextualInteraction, type ContextualInteraction } from './contextualInteractions';
import { evaluateMatchSituation } from './matchSituationEvaluator';
import { applyRestartScenario } from './restartScenarios';
import { observePlayerMatchStats } from './playerMatchStats';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr148-rules', team: 'home' | 'away' = 'home') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  state.players = state.players.map((p) => ({
    ...p,
    position: { x: p.team === 'home' ? 90 : 100, y: 62 },
    target: { x: p.team === 'home' ? 90 : 100, y: 62 },
    velocity: { x: 0, y: 0 },
  }));
  const defender = state.players.find(
    (p) => p.team === team && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  const attacker = state.players.find(
    (p) => p.team !== team && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  defender.position = { x: 22, y: 34 };
  defender.target = { ...defender.position };
  defender.anchor = { ...defender.position };
  defender.facingAngle = Math.PI / 2;
  attacker.position = { x: 23.2, y: 34 };
  attacker.target = { ...attacker.position };
  attacker.facingAngle = -Math.PI / 2;
  defender.profile = {
    ...defender.profile,
    attributes: {
      ...defender.profile.attributes,
      aggression: 90,
      tackling: 90,
      positioning: 90,
      gameReading: 90,
      composure: 70,
    },
  };
  state.ball = { x: 22.7, y: 34, ownerId: attacker.id };
  state.possessionTeam = attacker.team;
  state.currentPressure = 1;
  state.actionCooldown = 20;
  state.teams[attacker.team] = { ...state.teams[attacker.team], phase: 'attacking_transition' };
  return { state, defender, attacker };
};
const foul = (
  state: TacticalMatchState,
  actorId: string,
  opponentId: string,
  force = 10,
): ChallengeDiagnostic => ({
  id: `${state.seed}:contact:${state.time}:${actorId}`,
  at: state.time,
  actorId,
  team: state.players.find((p) => p.id === actorId)!.team,
  opponentId,
  technique: 'standing',
  source: 'autonomous_npc',
  position: { ...state.players.find((p) => p.id === opponentId)!.position },
  outcome: 'foul',
  ballFirst: false,
  opponentContact: true,
  ballDistance: 1,
  opponentDistance: 1,
  facingError: 0,
  relativeSpeed: force,
  lateness: 0.1,
  force,
  fromBehind: false,
});

describe('PR148 minimum players and complete dismissal', () => {
  it('rejects stale action and movement choices at either terminal state and while half time is paused', () => {
    const { state, defender, attacker } = fixture('pr148-terminal-choices');
    state.controlledFootballerId = attacker.id;
    const movement = {
      actorId: attacker.id,
      type: 'support' as const,
      target: { x: 40, y: 34 },
      startedAt: state.time,
      expiresAt: state.time + 2,
    };
    const opportunity: PlayerDecisionOpportunity = {
      id: 'stale-decision',
      actorId: attacker.id,
      openedAt: state.time,
      kind: 'off_ball_run',
      triggerReason: 'meaningful_movement',
      signature: 'stale-signature',
      situation: evaluateMatchSituation(state, attacker.id),
      options: [
        { id: 'stale-movement', kind: 'movement', labelKey: 'support', intent: movement },
        {
          id: 'stale-hold',
          kind: 'action',
          labelKey: 'control',
          action: { type: 'hold', actorId: attacker.id },
        },
      ],
    };
    const interaction: ContextualInteraction = {
      id: 'stale-context',
      target: { kind: 'space', point: movement.target },
      labelKey: 'support',
      resolution: { kind: 'movement', intent: movement },
    };
    const classified = classifyChallengeFoul(state, foul(state, defender.id, attacker.id, 5));
    expect(classified).toBeDefined();
    const penalty = { ...classified!, penalty: true };
    for (const status of ['abandoned', 'full_time', 'half_time'] as const) {
      const terminal: TacticalMatchState = { ...state, status };
      expect(
        resolveMatchAction(terminal, { type: 'hold', actorId: attacker.id }, 'human_selected'),
      ).toBe(terminal);
      expect(applyPlayerDecision(terminal, opportunity, 'stale-movement')).toBe(terminal);
      expect(applyPlayerDecision(terminal, opportunity, 'stale-hold')).toBe(terminal);
      expect(applyContextualInteraction(terminal, opportunity, interaction)).toBe(terminal);
      expect(enumerateAvailableActions(terminal, attacker.id)).toEqual([]);
      expect(advanceTacticalMatch(terminal, 50_000)).toBe(terminal);
      expect(terminal.actionEvents).toBe(state.actionEvents);
      expect(terminal.statistics).toBe(state.statistics);
      if (status !== 'half_time') {
        expect(applyRestartScenario(terminal, 'kick_off')).toBe(terminal);
        expect(awardFoulRestart(terminal, penalty)).toBe(terminal);
      }
    }
  });
  it('batch advancement enforces an invalid six-player input and stops at the first half-time whistle', () => {
    const { state } = fixture('pr148-batch-terminal');
    const home = state.players.filter((p) => p.team === 'home').slice(0, 6);
    const insufficient = {
      ...state,
      players: state.players.filter((p) => p.team !== 'home' || home.includes(p)),
    };
    const stopped = advanceTacticalMatch(insufficient, 20);
    expect(stopped.status).toBe('abandoned');
    expect(stopped.time).toBe(insufficient.time);
    expect(stopped.statistics).toBe(insufficient.statistics);
    const whistle = advanceTacticalMatch({ ...state, time: 2699.99 }, 20);
    expect(whistle.status).toBe('half_time');
    expect(whistle.time).toBe(2700);
    const loadedHalfTime: TacticalMatchState = { ...insufficient, status: 'half_time', time: 2700 };
    const rejectedKickoff = startSecondHalf(loadedHalfTime);
    expect(rejectedKickoff.status).toBe('abandoned');
    expect(rejectedKickoff.time).toBe(2700);
    expect(rejectedKickoff.restart).toBeUndefined();
    expect(rejectedKickoff.termination).toMatchObject({
      reason: 'insufficient_players',
      team: 'home',
      activePlayers: 6,
    });
  });
  it('a queued second yellow reducing seven to six at the final whistle preserves the abandonment result', () => {
    const { state, defender, attacker } = fixture('pr148-final-whistle-card');
    const home = state.players.filter((p) => p.team === 'home').slice(0, 7);
    state.players = state.players.filter((p) => p.team !== 'home' || home.includes(p));
    state.status = 'second_half';
    state.time = 5399.99;
    state.score = { home: 1, away: 2 };
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    const queued = classifyChallengeFoul(state, foul(state, defender.id, attacker.id, 5))!;
    state.lastFoul = queued;
    state.pendingCards = [queued];
    const terminal = stepTacticalMatch(state, 0.025);
    expect(terminal).toMatchObject({
      status: 'abandoned',
      time: 5400,
      score: { home: 1, away: 2 },
      termination: { reason: 'insufficient_players', at: 5400, team: 'home', activePlayers: 6 },
    });
    expect(terminal.lastCard).toMatchObject({ kind: 'second_yellow_red', at: 5400, delayed: true });
    expect(
      terminal.actionEvents?.some(
        (event) =>
          event.kind === 'card' &&
          event.actorId === defender.id &&
          event.outcome === 'second_yellow_red',
      ),
    ).toBe(true);
    expect(
      terminal.statistics!.players.find((p) => p.playerId === defender.id)?.minutesPlayed,
    ).toBe(90);
    expect(stepTacticalMatch(terminal)).toBe(terminal);
    const completedSnapshot = { ...terminal, status: 'full_time' as const };
    expect(enforceMinimumPlayers(completedSnapshot)).toBe(completedSnapshot);
  });
  for (const team of ['home', 'away'] as const) {
    it(`${team}: exactly seven can continue, seven to six stops at the canonical whistle`, () => {
      const { state, defender, attacker } = fixture(`pr148-seven-${team}`, team);
      const survivors = state.players.filter((p) => p.team === team).slice(0, 7);
      if (!survivors.some((p) => p.id === defender.id)) survivors[6] = defender;
      state.players = state.players.filter((p) => p.team !== team || survivors.includes(p));
      expect(enforceMinimumPlayers(state)).toBe(state);
      expect(stepTacticalMatch(state, 0.025).status).not.toBe('abandoned');
      state.time = 1312.4;
      state.score = { home: 2, away: 3 };
      const terminated = applyChallengeInfringement(state, foul(state, defender.id, attacker.id));
      expect(terminated).toMatchObject({
        status: 'abandoned',
        score: { home: 2, away: 3 },
        time: 1312.4,
        termination: { reason: 'insufficient_players', at: 1312.4, team, activePlayers: 6 },
      });
      expect(terminated.restart).toBeUndefined();
      expect(terminated.pendingPlayerDecision).toBeUndefined();
      expect(tacticalMatchStateSchema.safeParse(terminated).success).toBe(true);
      expect(stepTacticalMatch(terminated, 0.25)).toBe(terminated);
      expect(stepTacticalMatchAfterDecisionProbe(terminated)).toBe(terminated);
      expect(resolveMatchAction(terminated, { type: 'hold', actorId: attacker.id })).toBe(
        terminated,
      );
      expect(projectPlayerDecisionOpportunity(terminated)).toBeUndefined();
      expect(applyRestartScenario(terminated, 'kick_off')).toBe(terminated);
      expect(observePlayerMatchStats(terminated.statistics!, terminated, terminated)).toBe(
        terminated.statistics,
      );
      const replay = applyChallengeInfringement(state, foul(state, defender.id, attacker.id));
      // The benchmark hashes this complete canonical payload; replay must preserve every field.
      expect(terminated).toEqual(replay);
      expect(stepTacticalMatch(terminated)).toEqual(terminated);
    });
  }
  it('keeps historical statistics but removes physics, renderer and action targets', () => {
    const { state, defender, attacker } = fixture();
    state.time = 600.25;
    const recorded = state.statistics!.players.find((p) => p.playerId === defender.id)!;
    recorded.touches = 14;
    recorded.passesAttempted = 8;
    recorded.distanceCovered = 499;
    defender.locomotionTelemetry = {
      distanceTotal: 500,
      distanceWalk: 100,
      distanceJog: 300,
      distanceRun: 75,
      distanceSprint: 25,
      sprintSeconds: 5,
      sprintBursts: 2,
      maxSpeed: 8.1,
    };
    state.playerMovementIntent = {
      actorId: defender.id,
      type: 'support',
      target: { x: 50, y: 34 },
      startedAt: 600,
      expiresAt: 610,
    };
    state.currentAction = {
      type: 'pass',
      actorId: attacker.id,
      receiverId: defender.id,
      target: defender.position,
      intent: 'support',
    };
    const dismissed = applyChallengeInfringement(state, foul(state, defender.id, attacker.id));
    expect(dismissed.status).not.toBe('abandoned');
    expect(dismissed.players.some((p) => p.id === defender.id)).toBe(false);
    expect(matchStateToFrame(dismissed).players.some((p) => p.id === defender.id)).toBe(false);
    expect(dismissed.currentAction).toBeUndefined();
    expect(dismissed.playerMovementIntent).toBeUndefined();
    expect(enumerateAvailableActions(dismissed, defender.id)).toEqual([]);
    expect(
      enumerateAvailableActions(dismissed, attacker.id).some(
        (action) => action.type === 'pass' && action.receiverId === defender.id,
      ),
    ).toBe(false);
    expect(resolveMatchAction(dismissed, { type: 'hold', actorId: defender.id })).toBe(dismissed);
    expect(
      observePlayerMatchStats(state.statistics!, state, dismissed).players.find(
        (p) => p.playerId === defender.id,
      ),
    ).toMatchObject({ distanceCovered: 500, sprintDistance: 25, sprintBursts: 2, maxSpeed: 8.1 });
    const after = stepTacticalMatch(dismissed, 0.025);
    expect(after.statistics!.players.find((p) => p.playerId === defender.id)).toMatchObject({
      touches: 14,
      passesAttempted: 8,
      minutesPlayed: 600.25 / 60,
      distanceCovered: 500,
      sprintDistance: 25,
      sprintBursts: 2,
    });
  });
  it('a second yellow reaches the same terminal lifecycle', () => {
    const { state, defender, attacker } = fixture('pr148-second-yellow-minimum');
    const survivors = state.players.filter((p) => p.team === defender.team).slice(0, 7);
    state.players = state.players.filter((p) => p.team !== defender.team || survivors.includes(p));
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    const next = applyChallengeInfringement(state, foul(state, defender.id, attacker.id, 5));
    expect(next.lastCard?.kind).toBe('second_yellow_red');
    expect(next.status).toBe('abandoned');
  });
  it('retains the final movement tick before a physical red card, then freezes that player history', () => {
    const { state, defender, attacker } = fixture('pr148-final-dismissal-tick');
    state.time = 600.2;
    defender.velocity = { x: -5, y: 0 };
    attacker.velocity = { x: 4, y: 0 };
    attacker.facingAngle = Math.PI / 2;
    state.ball = { x: 23, y: 34, ownerId: attacker.id };
    defender.locomotionTelemetry = {
      distanceTotal: 500,
      distanceWalk: 100,
      distanceJog: 300,
      distanceRun: 75,
      distanceSprint: 25,
      sprintSeconds: 5,
      sprintBursts: 2,
      maxSpeed: 8.1,
    };
    state.statistics!.players.find((p) => p.playerId === defender.id)!.distanceCovered = 500;
    let prepared = beginDefensiveChallenge(
      state,
      { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'slide' },
      'human_selected',
    );
    expect(prepared.defensiveChallenge).toBeDefined();
    prepared = {
      ...prepared,
      defensiveChallenge: { ...prepared.defensiveChallenge!, startedAt: state.time - 0.2 },
    };
    const dismissed = stepTacticalMatch(prepared, 0.025);
    expect(dismissed.lastCard?.kind).toBe('red');
    const finalStats = dismissed.statistics!.players.find((p) => p.playerId === defender.id)!;
    expect(finalStats.minutesPlayed).toBe(dismissed.time / 60);
    expect(finalStats.distanceCovered).toBeGreaterThan(500);
    expect(
      stepTacticalMatch(dismissed, 0.025).statistics!.players.find(
        (p) => p.playerId === defender.id,
      ),
    ).toEqual(finalStats);
  });
});

describe('PR148 context-aware defensive intent and one duel episode', () => {
  it('jockeys covered calm circulation but still commits to a threat, exposed control or an explicit press', () => {
    const { state, defender, attacker } = fixture('pr148-press-commitment');
    defender.position = { x: 51, y: 34 };
    defender.anchor = { ...defender.position };
    attacker.position = { x: 52.2, y: 34 };
    attacker.target = { ...attacker.position };
    state.ball = { x: 51.7, y: 34, ownerId: attacker.id };
    state.teams[attacker.team].phase = 'positional_attack';
    defender.profile = {
      ...defender.profile,
      attributes: { ...defender.profile.attributes, aggression: 35 },
    };
    const cover = state.players
      .filter(
        (p) =>
          p.team === defender.team &&
          p.id !== defender.id &&
          p.profile.primaryPosition !== 'goalkeeper',
      )
      .slice(0, 2);
    cover.forEach((p, i) => {
      p.position = { x: 43 + i * 3, y: 34 };
    });
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)).toBeUndefined();
    state.currentAction = { type: 'hold', actorId: attacker.id };
    state.actionCooldown = 0.025;
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
    state.actionCooldown = 0;
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    state.currentAction = { type: 'hold', actorId: cover[0]!.id };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
    delete state.currentAction;
    expect(
      beginDefensiveChallenge(
        state,
        { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'standing' },
        'human_selected',
      ).defensiveChallenge,
    ).toBeDefined();
    cover[1]!.position = { x: 90, y: 62 };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)?.technique).toBe('standing');
    cover[1]!.position = { x: 46, y: 34 };
    state.ballCarrierIntent = {
      actorId: attacker.id,
      type: 'carry',
      target: { x: 43, y: 34 },
      startedAt: state.time,
      expiresAt: state.time + 2,
      estimatedArrival: state.time + 2,
      startPosition: { ...attacker.position },
      closestPointReached: { ...attacker.position },
      humanSelected: true,
    };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    delete state.ballCarrierIntent;
    state.onBallPreparation = {
      actorId: attacker.id,
      gainedAt: state.time,
      readyAt: state.time + 0.5,
      kind: 'settling',
      receptionKind: 'heavy_touch',
      incomingSpeed: 12,
    };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    state.onBallPreparation.receptionKind = 'clean_control';
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
    state.ball.x = attacker.position.x + 1.6;
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    state.ball.x = 51.7;
    state.playerMovementIntent = {
      actorId: defender.id,
      type: 'attack_space',
      target: { ...attacker.position },
      startedAt: state.time,
      expiresAt: state.time + 2,
    };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    delete state.playerMovementIntent;
    attacker.position = { x: 24, y: 34 };
    cover.forEach((p, i) => {
      p.position = { x: 15 + i * 3, y: 34 };
    });
    state.ball = { ...attacker.position, ownerId: attacker.id };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
  });
  it('an eager skilled defender can press calm covered possession, with issued and pending bookings suppressing that habit', () => {
    const { state, defender, attacker } = fixture('pr148-eager-press');
    defender.position = { x: 51, y: 34 };
    attacker.position = { x: 52.2, y: 34 };
    state.ball = { x: 51.7, y: 34, ownerId: attacker.id };
    state.teams[attacker.team].phase = 'positional_attack';
    state.players
      .filter(
        (p) =>
          p.team === defender.team &&
          p.id !== defender.id &&
          p.profile.primaryPosition !== 'goalkeeper',
      )
      .slice(0, 2)
      .forEach((p, i) => {
        p.position = { x: 43 + i * 3, y: 34 };
      });
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(true);
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
    delete state.discipline;
    const pendingBooking = classifyChallengeFoul(state, foul(state, defender.id, attacker.id, 5));
    expect(pendingBooking?.card).toBe('yellow');
    state.pendingCards = [pendingBooking!];
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
    state.pendingCards = [];
    defender.profile = {
      ...defender.profile,
      attributes: { ...defender.profile.attributes, gameReading: 35, positioning: 35 },
    };
    expect(shouldCommitRoutinePress(state, defender.id)).toBe(false);
  });
  it('a close standing poke cannot win or loosen the ball without a legal ball-first contact', () => {
    for (let i = 0; i < 30; i++) {
      const { state, defender, attacker } = fixture(`pr148-rear-standing-${i}`);
      attacker.facingAngle = Math.PI / 2;
      const result = resolveDefensiveChallenge(
        beginDefensiveChallenge(
          state,
          {
            type: 'challenge',
            actorId: defender.id,
            opponentId: attacker.id,
            technique: 'standing',
          },
          'autonomous_npc',
        ),
      );
      expect(result.diagnostic?.ballFirst).toBe(false);
      expect(result.diagnostic?.outcome).not.toBe('clean_win');
      expect(result.diagnostic?.outcome).not.toBe('loose_ball');
      expect(result.state.ball.ownerId).toBe(attacker.id);
    }
  });
  it('routine defence contains at stretched reach while a skilled comfortable window and explicit poke remain available', () => {
    const { state, defender, attacker } = fixture('pr148-standing-window');
    defender.profile = {
      ...defender.profile,
      attributes: { ...defender.profile.attributes, aggression: 35 },
    };
    defender.velocity = { x: 3, y: 0 };
    state.ball = { x: defender.position.x + 0.94, y: 34, ownerId: attacker.id };
    expect(
      enumerateDefensiveChallengeActions(state, defender.id).some(
        (action) => action.technique === 'standing',
      ),
    ).toBe(true);
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)).toBeUndefined();
    const explicit = beginDefensiveChallenge(
      state,
      { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'standing' },
      'human_selected',
    );
    expect(explicit.defensiveChallenge?.technique).toBe('standing');
    state.ball.x = defender.position.x + 0.7;
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)?.technique).toBe('standing');
    defender.profile = {
      ...defender.profile,
      attributes: {
        ...defender.profile.attributes,
        tackling: 25,
        positioning: 25,
        gameReading: 25,
      },
    };
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)).toBeUndefined();
  });
  it('booked defenders and an already queued booking suppress ordinary risky choices', () => {
    const { state, defender, attacker } = fixture();
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)?.technique).not.toBe('standing');
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)?.technique).toBe('standing');
    delete state.discipline;
    const advantage = applyChallengeInfringement(
      { ...state, currentPressure: 0.4 },
      foul(state, defender.id, attacker.id, 5),
    );
    expect(advantage.pendingCards).toHaveLength(1);
    expect(chooseNpcDefensiveChallengeAction(advantage, defender.id)?.technique).toBe('standing');
  });
  it('all routine standing defence withdraws from rear/unsafe contact while committed actions retain risk', () => {
    const { state, defender, attacker } = fixture();
    state.controlledFootballerId = defender.id;
    attacker.facingAngle = Math.PI / 2;
    const action = {
      type: 'challenge' as const,
      actorId: defender.id,
      opponentId: attacker.id,
      technique: 'standing' as const,
    };
    const routine = resolveDefensiveChallenge(
      beginDefensiveChallenge(state, action, 'autonomous_routine'),
    );
    expect(routine.diagnostic?.outcome).not.toBe('foul');
    expect(routine.diagnostic?.opponentContact).toBe(false);
    const npcState = { ...state };
    delete npcState.controlledFootballerId;
    const npc = resolveDefensiveChallenge(
      beginDefensiveChallenge(npcState, action, 'autonomous_npc'),
    );
    expect(npc.diagnostic?.outcome).toBe(routine.diagnostic?.outcome);
    expect(npc.diagnostic?.opponentContact).toBe(false);
    const explicit = beginDefensiveChallenge(
      state,
      { ...action, technique: 'committed' },
      'human_selected',
    );
    expect(explicit.defensiveChallenge).toBeDefined();
  });
  it('a booked NPC can still commit when exceptional danger, temperament and late score justify it', () => {
    const { state, defender } = fixture('pr148-booked-desperate');
    state.time = 83 * 60;
    state.score = { home: 0, away: 1 };
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    defender.profile = {
      ...defender.profile,
      attributes: {
        ...defender.profile.attributes,
        aggression: 100,
        composure: 0,
        tackling: 100,
        positioning: 100,
        gameReading: 100,
      },
    };
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)?.technique).not.toBe('standing');
  });
  it('does not reopen a close unchanged contest after its short recovery timer, but releases on separation', () => {
    const { state, defender, attacker } = fixture('pr148-episode');
    const action = {
      type: 'challenge' as const,
      actorId: defender.id,
      opponentId: attacker.id,
      technique: 'standing' as const,
    };
    const result = resolveDefensiveChallenge(
      beginDefensiveChallenge(state, action, 'human_selected'),
    );
    expect(result.state.defensiveEpisodes).toHaveLength(1);
    const lingering = { ...result.state, time: 3 };
    expect(beginDefensiveChallenge(lingering, action, 'human_selected')).toBe(lingering);
    expect(enumerateDefensiveChallengeActions(lingering, defender.id)).toEqual([]);
    const separated = { ...lingering, ball: { ...lingering.ball, x: lingering.ball.x + 7 } };
    expect(
      beginDefensiveChallenge(separated, action, 'human_selected').defensiveChallenge,
    ).toBeDefined();
  });
  it('a genuinely different attacker can challenge immediately without a global lock', () => {
    const { state, defender, attacker } = fixture('pr148-second-contest');
    const action = {
      type: 'challenge' as const,
      actorId: defender.id,
      opponentId: attacker.id,
      technique: 'standing' as const,
    };
    const result = resolveDefensiveChallenge(
      beginDefensiveChallenge(state, action, 'human_selected'),
    );
    const other = result.state.players.find(
      (p) => p.team === defender.team && p.id !== defender.id,
    )!;
    other.position = { ...defender.position };
    other.facingAngle = defender.facingAngle;
    expect(
      beginDefensiveChallenge(result.state, { ...action, actorId: other.id }, 'human_selected')
        .defensiveChallenge,
    ).toBeDefined();
  });
  it('a clean win advances possession without re-arming the close pair until a football release', () => {
    let verified = 0;
    for (let i = 0; i < 12; i++) {
      const { state, defender, attacker } = fixture(`pr148-win-recovery-${i}`);
      state.ballEpisode = 17;
      const committed = beginDefensiveChallenge(
        state,
        { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'standing' },
        'human_selected',
      );
      const won = stepTacticalMatch(committed, 0.025);
      if (won.lastChallenge?.outcome !== 'clean_win') continue;
      verified++;
      expect(won.ball.ownerId).toBe(defender.id);
      expect(won.ballEpisode).toBe(18);
      const reverse = {
        type: 'challenge' as const,
        actorId: attacker.id,
        opponentId: defender.id,
        technique: 'standing' as const,
      };
      expect(beginDefensiveChallenge(won, reverse, 'human_selected')).toBe(won);
      const recovered = { ...won, time: won.time + 2 };
      expect(beginDefensiveChallenge(recovered, reverse, 'human_selected')).toBe(recovered);
      const teammate = recovered.players.find(
        (p) => p.team === defender.team && p.id !== defender.id,
      )!;
      const released = resolveMatchAction(
        recovered,
        {
          type: 'pass',
          actorId: defender.id,
          receiverId: teammate.id,
          target: teammate.position,
          intent: 'support',
        },
        'human_selected',
      );
      expect(released.lastPassDiagnostic?.releasedAt).toBe(recovered.time);
      // Eventual control after that release belongs to a new football contest, even near the
      // earlier pair's location. The release evidence is canonical, rather than a timer.
      const newRelease = {
        ...released,
        ball: { x: won.ball.x, y: won.ball.y, ownerId: defender.id },
      };
      expect(
        beginDefensiveChallenge(newRelease, reverse, 'human_selected').defensiveChallenge,
      ).toBeDefined();
      const reclaimed = {
        ...won,
        time: won.time + 0.4,
        ballEpisode: won.ballEpisode! + 2,
        ball: { ...won.ball, ownerId: attacker.id },
      };
      expect(
        beginDefensiveChallenge(
          reclaimed,
          { ...reverse, actorId: defender.id, opponentId: attacker.id },
          'human_selected',
        ),
      ).toBe(reclaimed);
    }
    expect(verified).toBeGreaterThan(0);
  });
  it('a weak dribbler carrying into two elite defenders usually loses the live ball', () => {
    const turnovers = (defence: number, attack: number) => {
      let lost = 0;
      for (let i = 0; i < 40; i++) {
        const { state, defender, attacker } = fixture(`pr148-two-defenders-${i}`);
        const second = state.players.find(
          (p) =>
            p.team === defender.team &&
            p.id !== defender.id &&
            p.profile.primaryPosition !== 'goalkeeper',
        )!;
        attacker.position = { x: 52, y: 34 };
        attacker.target = { x: 43, y: 34 };
        attacker.velocity = { x: -2, y: 0 };
        state.controlledFootballerId = attacker.id;
        state.ball = { x: 50.85, y: 34, ownerId: attacker.id };
        for (const [index, player] of [defender, second].entries()) {
          player.position = { x: index === 0 ? 50.4 : 49, y: index === 0 ? 34.3 : 33.5 };
          player.target = { ...player.position };
          player.anchor = { ...player.position };
          player.facingAngle = Math.PI / 2;
          player.profile = {
            ...player.profile,
            attributes: {
              ...player.profile.attributes,
              tackling: defence,
              positioning: defence,
              gameReading: defence,
              strength: defence,
              pace: defence,
              agility: defence,
              aggression: 35,
            },
          };
        }
        attacker.profile = {
          ...attacker.profile,
          attributes: {
            ...attacker.profile.attributes,
            dribbling: attack,
            technique: attack,
            agility: attack,
            composure: attack,
            pace: attack,
          },
        };
        let next = resolveMatchAction(
          state,
          {
            type: 'carry',
            actorId: attacker.id,
            target: { x: 43, y: 34 },
            movementMode: 'dribble',
          },
          'human_selected',
        );
        for (let tick = 0; tick < 40 && next.ball.ownerId === attacker.id; tick++) {
          // Commit to this take-on again if a real pressure/contest boundary offers a choice.
          // A paused decision is not a physics sample or evidence that the dribbler survived.
          if (projectPlayerDecisionOpportunity(next))
            next = resolveMatchAction(
              next,
              {
                type: 'carry',
                actorId: attacker.id,
                target: { x: 43, y: 34 },
                movementMode: 'dribble',
              },
              'human_selected',
            );
          const beforeTick = next.time;
          next = stepTacticalMatch(next, 0.025);
          expect(next.time).toBeGreaterThan(beforeTick);
        }
        if (next.ball.ownerId !== attacker.id) lost++;
      }
      return lost;
    };
    const weakDribbler = turnovers(95, 25);
    const eliteDribbler = turnovers(25, 95);
    expect(weakDribbler).toBeGreaterThanOrEqual(30);
    expect(weakDribbler - eliteDribbler).toBeGreaterThanOrEqual(12);
  }, 15000);
  it('component ability changes a seeded distribution without removing stochastic outcomes', () => {
    const run = (defence: number, attack: number) =>
      Array.from({ length: 120 }, (_, i) => {
        const { state, defender, attacker } = fixture(`pr148-quality-${i}`);
        defender.profile = {
          ...defender.profile,
          attributes: {
            ...defender.profile.attributes,
            tackling: defence,
            positioning: defence,
            gameReading: defence,
            strength: defence,
          },
        };
        attacker.profile = {
          ...attacker.profile,
          attributes: {
            ...attacker.profile.attributes,
            dribbling: attack,
            technique: attack,
            agility: attack,
            composure: attack,
          },
        };
        return resolveDefensiveChallenge(
          beginDefensiveChallenge(
            state,
            {
              type: 'challenge',
              actorId: defender.id,
              opponentId: attacker.id,
              technique: 'standing',
            },
            'autonomous_npc',
          ),
        ).diagnostic!.outcome;
      });
    const eliteDefence = run(95, 25);
    const eliteDribbler = run(25, 95);
    expect(eliteDefence.filter((outcome) => outcome === 'clean_win').length).toBeGreaterThan(90);
    expect(eliteDribbler.filter((outcome) => outcome === 'clean_win').length).toBeLessThan(30);
    expect(new Set(eliteDefence).size).toBeGreaterThan(1);
    expect(new Set(eliteDribbler).size).toBeGreaterThan(1);
  });
});
