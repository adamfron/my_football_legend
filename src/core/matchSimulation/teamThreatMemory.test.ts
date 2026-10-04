// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  beginDefensiveChallenge,
  deriveCooperativePress,
  cooperativePressSchema,
} from './defensiveChallenges';
import { chooseNpcAction, resolveMatchAction, scoreActionForAI } from './matchActions';
import { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import type { MatchAction, TacticalMatchState } from './matchState';
import { applyRestartScenario } from './restartScenarios';
import {
  deriveBuildUpSupport,
  deriveStructuralPosition,
  deriveTacticalTargets,
  deriveTeamBlockTransform,
} from './tacticalPositioning';
import {
  createTeamThreatMemory,
  evaluateTeamThreatResponse,
  initialiseTeamThreatMemory,
  observeTeamThreats,
  teamThreatMemorySchema,
} from './teamThreatMemory';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr151-team-threats'): TacticalMatchState =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

const repeatedLosses = (original: TacticalMatchState, count = 4) => {
  let state = structuredClone(original);
  const owner = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const presser = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  owner.position = { x: 28, y: 15 };
  presser.position = { x: 30, y: 15 };
  for (let attempt = 0; attempt < count; attempt++) {
    const before = {
      ...state,
      time: attempt * 12 + 2,
      possessionTeam: 'home' as const,
      ball: { x: 28, y: 15, ownerId: owner.id },
      scenario: 'open_play' as const,
      currentPressure: 0.8,
    };
    const after = {
      ...before,
      time: before.time + 0.025,
      possessionTeam: 'away' as const,
      ball: { x: 30, y: 15, ownerId: presser.id },
      ballEpisode: attempt + 1,
    };
    state = observeTeamThreats(before, after);
  }
  return state;
};

describe('PR151 rolling team threat memory', () => {
  it('reacts to repeated losses with a lower block, short support and safer actual action scores', () => {
    const initial = fixture();
    const reacted = repeatedLosses(initial);
    expect(teamThreatMemorySchema.safeParse(reacted.teams.home.threatMemory).success).toBe(true);
    const response = reacted.teams.home.threatMemory!.response;
    expect(response.reason).toBe('repeated_build_up_loss');
    expect(response.buildUpSafety).toBeGreaterThan(0.3);
    const unchanged = {
      ...reacted,
      teams: {
        ...reacted.teams,
        home: { ...reacted.teams.home, threatMemory: createTeamThreatMemory() },
      },
    };
    expect(deriveTeamBlockTransform(reacted, 'home').advance).toBeLessThan(
      deriveTeamBlockTransform(unchanged, 'home').advance - 1,
    );
    const carrier = reacted.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const onBall = {
      ...reacted,
      possessionTeam: 'home' as const,
      ball: { ...carrier.position, ownerId: carrier.id },
    };
    expect(deriveBuildUpSupport(onBall, 'home')).toHaveLength(2);
    const receiver = onBall.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== carrier.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.position = { x: 22, y: 25 };
    const pass: MatchAction = {
      type: 'pass',
      actorId: carrier.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    };
    const noResponse = { ...onBall, teams: { ...onBall.teams, home: unchanged.teams.home } };
    expect(scoreActionForAI(onBall, carrier.id, pass)).toBeGreaterThan(
      scoreActionForAI(noResponse, carrier.id, pass),
    );
    expect(chooseNpcAction(onBall, carrier.id)).toBeDefined();
    const defender = reacted.players.find(
      (player) =>
        player.team === 'home' &&
        player.duty === 'defend' &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    expect(deriveStructuralPosition(reacted, defender).x).toBeLessThan(
      deriveStructuralPosition(unchanged, defender).x,
    );
  });

  it('records real canonical press wins and moves the adapted team through normal locomotion', () => {
    const original = fixture('pr151-physical-press-trap');
    const home = original.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const away = original.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    let state = original;
    let wins = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      state = {
        ...state,
        time: attempt * 8,
        scenario: 'open_play',
        possessionTeam: 'home',
        ballEpisode: attempt * 2,
        actionCooldown: 20,
        ball: { x: 28.5, y: 15, ownerId: home.id },
        players: state.players.map((player) => ({
          ...player,
          position:
            player.id === home.id
              ? { x: 28, y: 15 }
              : player.id === away.id
                ? { x: 29, y: 15 }
                : { x: player.team === 'home' ? 16 : 85, y: 50 + player.slotIndex },
          velocity: { x: 0, y: 0 },
          facingAngle: player.team === 'home' ? Math.PI / 2 : -Math.PI / 2,
          profile:
            player.id === home.id || player.id === away.id
              ? {
                  ...player.profile,
                  attributes: {
                    ...player.profile.attributes,
                    tackling: player.id === away.id ? 100 : 10,
                    gameReading: player.id === away.id ? 100 : 10,
                    positioning: player.id === away.id ? 100 : 10,
                    strength: player.id === away.id ? 100 : 10,
                    dribbling: 10,
                    technique: 10,
                    agility: 10,
                    composure: 10,
                  },
                }
              : player.profile,
        })),
      };
      delete state.defensiveChallenge;
      delete state.defensiveEpisodes;
      delete state.recentDuel;
      state = beginDefensiveChallenge(
        state,
        { type: 'challenge', actorId: away.id, opponentId: home.id, technique: 'standing' },
        'autonomous_npc',
      );
      state = stepTacticalMatchAfterDecisionProbe(state);
      if (state.lastChallenge?.outcome === 'clean_win') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(2);
    expect(state.teams.home.threatMemory!.buildUpLosses[0]).toBeGreaterThan(3.2);
    expect(state.teams.home.threatMemory!.response.lineDepthMetres).toBeGreaterThan(1);
    const before = structuredClone(state);
    const planned = deriveTacticalTargets(state);
    const moving = planned.find(
      (player) =>
        player.team === 'home' &&
        player.id !== home.id &&
        Math.hypot(player.target.x - player.position.x, player.target.y - player.position.y) > 1,
    )!;
    state.players = planned;
    for (let tick = 0; tick < 16; tick++) state = stepTacticalMatchAfterDecisionProbe(state);
    expect(state.players.find((player) => player.id === moving.id)!.position).not.toEqual(
      before.players.find((player) => player.id === moving.id)!.position,
    );
  });

  it('retains normal carry/progression utility and forward options once stored danger is no longer nearby', () => {
    const state = repeatedLosses(fixture('pr151-free-build-up'));
    const carrier = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const receiver = state.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== carrier.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    for (const player of state.players.filter((player) => player.team === 'away'))
      player.position = { x: 100, y: 60 };
    carrier.position = { x: 28, y: 15 };
    receiver.position = { x: 45, y: 15 };
    state.possessionTeam = 'home';
    state.ball = { ...carrier.position, ownerId: carrier.id };
    const neutral = {
      ...state,
      teams: {
        ...state.teams,
        home: { ...state.teams.home, threatMemory: createTeamThreatMemory() },
      },
    };
    const carry: MatchAction = { type: 'carry', actorId: carrier.id, target: { x: 38, y: 15 } };
    const progressive: MatchAction = {
      type: 'pass',
      actorId: carrier.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'progressive',
    };
    expect(state.teams.home.threatMemory!.response.buildUpSafety).toBeGreaterThan(0.3);
    expect(scoreActionForAI(state, carrier.id, carry)).toBe(
      scoreActionForAI(neutral, carrier.id, carry),
    );
    expect(scoreActionForAI(state, carrier.id, progressive)).toBe(
      scoreActionForAI(neutral, carrier.id, progressive),
    );
    expect(deriveBuildUpSupport(state, 'home')).toEqual([]);
    expect(chooseNpcAction(state, carrier.id)).toEqual(chooseNpcAction(neutral, carrier.id));
  });

  it('decays evidence and relaxes responses after persistence without flipping on each tick', () => {
    const state = repeatedLosses(fixture());
    const response = state.teams.home.threatMemory!.response;
    const later = observeTeamThreats(state, {
      ...state,
      time: state.time + 1,
      scenario: 'open_play',
    });
    expect(later.teams.home.threatMemory!.response).toEqual(response);
    const relaxed = observeTeamThreats(later, {
      ...later,
      time: later.time + 1800,
      possessionTeam: 'home',
      ball: { x: 20, y: 34 },
    });
    expect(relaxed.teams.home.threatMemory!.buildUpLosses[0]).toBeLessThan(0.03);
    expect(relaxed.teams.home.threatMemory!.response.caution).toBeLessThan(response.caution);
  });

  it('observes dangerous losses in released GK build-up and excludes restart setup', () => {
    const state = fixture('pr151-released-build-up');
    const owner = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const attacker = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    owner.position = { x: 28, y: 15 };
    attacker.position = { x: 30, y: 15 };
    const before = {
      ...state,
      scenario: 'gk_short' as const,
      ball: { ...owner.position, ownerId: owner.id },
      possessionTeam: 'home' as const,
    };
    const after = {
      ...before,
      time: 0.025,
      ball: { ...attacker.position, ownerId: attacker.id },
      possessionTeam: 'away' as const,
    };
    expect(
      observeTeamThreats(before, after).teams.home.threatMemory!.buildUpLosses[0],
    ).toBeGreaterThan(1.7);
    const setup = applyRestartScenario(after, 'gk_short', { restartTeam: 'home' });
    expect(observeTeamThreats(before, setup).teams.home.threatMemory!.buildUpLosses[0]).toBe(0);
  });

  it('does not mistake a keeper claiming a shot for the stale last passer losing build-up possession', () => {
    const state = fixture('pr151-no-stale-passer');
    const cb = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const shooter = state.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== cb.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const keeper = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    const presser = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    cb.position = { x: 28, y: 15 };
    presser.position = { x: 29, y: 15 };
    shooter.position = { x: 90, y: 34 };
    const stale = resolveMatchAction(
      { ...state, ball: { ...cb.position, ownerId: cb.id } },
      {
        type: 'pass',
        actorId: cb.id,
        receiverId: shooter.id,
        target: shooter.position,
        intent: 'progressive',
      },
    );
    const previous: TacticalMatchState = {
      ...stale,
      time: 20,
      possessionTeam: 'home',
      ball: { x: 99, y: 34, travelKind: 'shot', lastTouchPlayerId: shooter.id },
    };
    const caught: TacticalMatchState = {
      ...previous,
      time: 20.025,
      possessionTeam: 'away',
      ball: { x: 99, y: 34, ownerId: keeper.id, lastTouchPlayerId: keeper.id },
    };
    expect(observeTeamThreats(previous, caught).teams.home.threatMemory!.buildUpLosses).toEqual([
      0, 0, 0,
    ]);
    expect(observeTeamThreats(previous, caught).teams.home.threatMemory!.pressuredPlayers).toEqual(
      [],
    );
  });

  it('keeps a long carry to one entry/line observation and reproduces the same responses', () => {
    const run = () => {
      let state = fixture('pr151-long-threat-carry');
      const attacker = state.players.find(
        (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
      )!;
      state = {
        ...state,
        possessionTeam: 'away',
        ball: { x: 40, y: 15, ownerId: attacker.id },
        ballEpisode: 12,
      };
      for (let tick = 0; tick < 800; tick++) {
        const next = {
          ...state,
          time: state.time + 0.025,
          players: state.players.map((player) =>
            player.id === attacker.id
              ? { ...player, position: { x: Math.max(19, 40 - tick / 20), y: 15 } }
              : player,
          ),
        };
        state = observeTeamThreats(state, next);
      }
      return state.teams.home.threatMemory!;
    };
    expect(run()).toEqual(run());
    const memory = run();
    expect(memory.channelEntries[0]).toBeGreaterThan(0.9);
    expect(memory.channelEntries[0]).toBeLessThanOrEqual(1);
    expect(memory.lineExposures[0]).toBeLessThanOrEqual(1.6);
  });

  it('derives bounded conservatism from mismatch/territory and late game state, retaining attacking outlets', () => {
    let state = fixture();
    state.players = state.players.map((player) => ({
      ...player,
      profile: {
        ...player.profile,
        attributes: {
          ...player.profile.attributes,
          passing: player.team === 'home' ? 25 : 85,
          technique: player.team === 'home' ? 25 : 85,
          gameReading: player.team === 'home' ? 25 : 85,
          tackling: player.team === 'home' ? 25 : 85,
          pace: player.team === 'home' ? 25 : 85,
        },
      },
    }));
    state = initialiseTeamThreatMemory(state);
    let memory = state.teams.home.threatMemory!;
    memory.territorialPressure = 0.7;
    for (let time = 2; time <= 60; time += 2)
      memory = evaluateTeamThreatResponse({ ...state, time }, 'home', memory);
    const weak = {
      ...state,
      time: 60,
      teams: { ...state.teams, home: { ...state.teams.home, threatMemory: memory } },
    };
    expect(memory.response.caution).toBeGreaterThan(0.3);
    expect(memory.response.lineDepthMetres).toBeLessThan(9);
    expect(deriveTeamBlockTransform(weak, 'home').widthScale).toBeLessThan(
      deriveTeamBlockTransform(
        {
          ...weak,
          teams: {
            ...weak.teams,
            home: { ...weak.teams.home, threatMemory: createTeamThreatMemory() },
          },
        },
        'home',
      ).widthScale,
    );
    expect(
      deriveTacticalTargets(weak).some(
        (player) => player.team === 'home' && player.duty === 'attack' && player.target.x > 40,
      ),
    ).toBe(true);
    const leader = evaluateTeamThreatResponse(
      { ...state, time: 88 * 60, score: { home: 1, away: 0 } },
      'home',
      createTeamThreatMemory(),
    );
    const chasing = evaluateTeamThreatResponse(
      { ...state, time: 88 * 60, score: { home: 0, away: 1 } },
      'home',
      createTeamThreatMemory(),
    );
    expect(leader.response.caution).toBeGreaterThan(chasing.response.caution);
  });
});

describe('PR151 structurally safe cooperative defending', () => {
  const cooperationFixture = () => {
    const state = fixture('pr151-cooperative-press');
    const carrier = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const defenders = state.players.filter(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    );
    for (const player of state.players) {
      player.position = { x: player.team === 'home' ? 80 : 90, y: 60 };
      player.velocity = { x: 0, y: 0 };
    }
    carrier.position = { x: 30, y: 34 };
    defenders[0]!.position = { x: 29, y: 34 };
    defenders[1]!.position = { x: 31, y: 40 };
    defenders[2]!.position = { x: 18, y: 34 };
    state.ball = { ...carrier.position, ownerId: carrier.id };
    state.possessionTeam = 'away';
    state.actionCooldown = 50;
    return { state, carrier, defenders };
  };
  it('recruits a second presser when shielding/slow control has goal cover and normal targets close down', () => {
    const { state, defenders } = cooperationFixture();
    const press = deriveCooperativePress(state, 'home');
    expect(press?.secondaryId).toBe(defenders[1]!.id);
    expect(cooperativePressSchema.safeParse(press).success).toBe(true);
    const planned = deriveTacticalTargets(state).find(
      (player) => player.id === press!.secondaryId,
    )!;
    expect(
      Math.hypot(planned.idealTarget.x - state.ball.x, planned.idealTarget.y - state.ball.y),
    ).toBeLessThan(3);
    expect(deriveCooperativePress(state, 'home', () => 0)).toBeUndefined();
  });
  it('declines a double press when the second defender would abandon a dangerous receiver or the last cover', () => {
    const { state, carrier, defenders } = cooperationFixture();
    const receiver = state.players.find(
      (player) =>
        player.team === 'away' &&
        player.id !== carrier.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.position = { x: 28, y: 43 };
    expect(deriveCooperativePress(state, 'home')).toBeUndefined();
    receiver.position = { x: 90, y: 60 };
    defenders[2]!.position = { x: 80, y: 60 };
    expect(deriveCooperativePress(state, 'home')).toBeUndefined();
  });
  it('does not chase a fast unconfined carrier or assign a sent-off defender', () => {
    const { state, carrier, defenders } = cooperationFixture();
    carrier.velocity = { x: -6, y: 0 };
    expect(deriveCooperativePress(state, 'home')).toBeUndefined();
    carrier.velocity = { x: 0, y: 0 };
    state.discipline = { [defenders[1]!.id]: { team: 'home', yellowCards: 0, sentOff: true } };
    expect(deriveCooperativePress(state, 'home')).toBeUndefined();
  });
});
