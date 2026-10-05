// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyRestartScenario,
  assertMatchStatisticsInvariants,
  beginDefensiveChallenge,
  createMatchStatistics,
  createTacticalMatch,
  enumerateRestartActions,
  FIXED_MATCH_DT,
  matchStatisticsSchema,
  observePlayerMatchStats,
  resolveMatchAction,
  stepTacticalMatchAfterDecisionProbe,
  type ChallengeDiagnostic,
  type TacticalMatchState,
} from '.';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr152-statistical-sources',
      control: { mode: 'spectator' },
    }),
  );
  const actor = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'central_midfielder',
  )!;
  const teammate = state.players.find(
    (player) => player.team === 'home' && player.id !== actor.id,
  )!;
  const opponent = state.players.find((player) => player.team === 'away')!;
  actor.position = { x: 51.3, y: 34 };
  actor.facingAngle = Math.PI / 2;
  opponent.position = { x: 52.5, y: 34 };
  state.time = 10;
  state.ball = { x: 51.9, y: 34, ownerId: opponent.id };
  state.possessionTeam = 'away';
  const challenge: ChallengeDiagnostic = {
    id: 'legitimate-tackle',
    at: state.time + 0.1,
    actorId: actor.id,
    opponentId: opponent.id,
    team: actor.team,
    source: 'autonomous_npc',
    technique: 'standing',
    position: opponent.position,
    outcome: 'clean_win',
    ballFirst: true,
    opponentContact: false,
    ballDistance: 0.6,
    opponentDistance: 1.2,
    facingError: 0,
    relativeSpeed: 0,
    lateness: 0,
    force: 0,
    fromBehind: false,
  };
  return { state, actor, teammate, opponent, challenge };
};

describe('PR152 canonical defensive accounting', () => {
  it('counts a committed attempt once while pending and its successful result once after a same-tick release', () => {
    const { state, actor, teammate, opponent, challenge } = fixture();
    const pending = beginDefensiveChallenge(
      state,
      { type: 'challenge', actorId: actor.id, opponentId: opponent.id, technique: 'standing' },
      'autonomous_npc',
    );
    expect(pending.defensiveChallenge).toBeDefined();
    let statistics = observePlayerMatchStats(createMatchStatistics(state), state, pending);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      tacklesAttempted: 1,
      tacklesWon: 0,
    });
    const resolved: TacticalMatchState = {
      ...pending,
      time: challenge.at,
      possessionTeam: 'home',
      ball: { ...teammate.position, ownerId: teammate.id },
      lastChallenge: { ...challenge, id: pending.defensiveChallenge!.id },
      lastPossessionChange: {
        at: challenge.at,
        from: 'away',
        to: 'home',
        cause: 'tackle',
        winnerId: actor.id,
        loserId: opponent.id,
        challengeId: pending.defensiveChallenge!.id,
      },
    };
    delete resolved.defensiveChallenge;
    statistics = observePlayerMatchStats(statistics, pending, resolved);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      tacklesAttempted: 1,
      tacklesWon: 1,
      possessionWon: 1,
      duelsWon: 1,
    });
    expect(statistics.players.find((player) => player.playerId === teammate.id)).toMatchObject({
      tacklesAttempted: 0,
      tacklesWon: 0,
      possessionWon: 0,
    });
    expect(
      statistics.players.find((player) => player.playerId === opponent.id)?.possessionLost,
    ).toBe(1);
    const unrelated = {
      ...resolved,
      lastChallenge: { ...challenge, id: 'another-attempt', outcome: 'missed' as const },
    };
    const later = observePlayerMatchStats(statistics, resolved, unrelated);
    const repeated = observePlayerMatchStats(later, unrelated, structuredClone(resolved));
    expect(repeated.players.find((player) => player.playerId === actor.id)).toMatchObject({
      tacklesAttempted: 2,
      tacklesWon: 1,
      possessionWon: 1,
    });
    expect(repeated.teamAccounting?.home.possessionChanges).toBe(1);
    expect(() => assertMatchStatisticsInvariants(repeated)).not.toThrow();
  });

  it('keeps interceptions, recoveries, blocks and aerial duels separate from tackle results', () => {
    const { state, actor, opponent } = fixture();
    const next: TacticalMatchState = {
      ...state,
      time: 11,
      ball: { ...actor.position, ownerId: actor.id },
      possessionTeam: actor.team,
      lastPossessionChange: {
        at: 11,
        from: 'away',
        to: 'home',
        cause: 'interception',
        winnerId: actor.id,
      },
      lastBallRecovery: { id: 'earlier-second-ball', at: 10.5, playerId: actor.id },
      lastBallContact: {
        playerId: actor.id,
        kind: 'defender',
        point: { ...actor.position, z: 0.1 },
        segmentFraction: 0.4,
        at: 10.7,
        preContactSpeed: 15,
        postContactSpeed: 8,
      },
      lastAerialContact: {
        id: 'contested-aerial-win',
        point: actor.position,
        ballHeight: 1.8,
        candidates: [],
        contestantIds: [actor.id, opponent.id],
        winnerId: actor.id,
      },
    };
    const statistics = observePlayerMatchStats(createMatchStatistics(state), state, next);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      tacklesAttempted: 0,
      tacklesWon: 0,
      interceptions: 1,
      possessionWon: 1,
      looseBallRecoveries: 1,
      blocks: 1,
      duelsWon: 1,
    });
    // The source records no controlled loser for the flight acquisition. A historical
    // tick-boundary owner must not be substituted for that deliberately absent evidence.
    expect(
      statistics.players.find((player) => player.playerId === opponent.id)?.possessionLost,
    ).toBe(0);
    expect(
      observePlayerMatchStats(statistics, next, { ...structuredClone(next), ballEpisode: 12 }),
    ).toEqual({
      ...statistics,
    });
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
  });

  it('cannot manufacture a successful tackle from claim ownership or an unsupported legacy tackle label', () => {
    const { state, actor } = fixture();
    const next: TacticalMatchState = {
      ...state,
      ball: { ...actor.position, ownerId: actor.id },
      lastPossessionChange: { at: 11, from: 'away', to: 'home', cause: 'tackle' },
    };
    const statistics = observePlayerMatchStats(createMatchStatistics(state), state, next);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      possessionWon: 1,
      tacklesAttempted: 0,
      tacklesWon: 0,
    });
  });

  it('resumes old possession ledgers without replaying stale acquisition facts', () => {
    const { state, actor } = fixture();
    const next: TacticalMatchState = {
      ...state,
      ball: { ...actor.position, ownerId: actor.id },
      lastPossessionChange: { at: 11, from: 'away', to: 'home', cause: 'claim' },
    };
    const old = createMatchStatistics(state);
    old.observedPossessionEvents = ['11:away:home:claim'];
    delete old.observedChallengeIds;
    delete old.observedChallengeResultIds;
    const resumed = observePlayerMatchStats(old, state, next);
    expect(resumed.players.find((player) => player.playerId === actor.id)?.possessionWon).toBe(0);
    expect(resumed.observedPossessionEvents).toEqual(old.observedPossessionEvents);
    expect(matchStatisticsSchema.safeParse(resumed).success).toBe(true);
  });

  it('migrates old challenge ledgers without replaying an already counted clean tackle', () => {
    const { state, actor, challenge } = fixture();
    const resolved = { ...state, lastChallenge: challenge };
    const old = createMatchStatistics(state);
    const player = old.players.find((entry) => entry.playerId === actor.id)!;
    player.tacklesAttempted = 1;
    player.tacklesWon = 1;
    delete old.observedChallengeIds;
    delete old.observedChallengeResultIds;
    const resumed = observePlayerMatchStats(old, resolved, structuredClone(resolved));
    expect(resumed.players.find((entry) => entry.playerId === actor.id)).toMatchObject({
      tacklesAttempted: 1,
      tacklesWon: 1,
    });
    expect(resumed.observedChallengeResultIds).toEqual([challenge.id]);
  });

  it('counts each canonical restart award once, without recording setup ownership as a touch', () => {
    const { state } = fixture();
    let statistics = createMatchStatistics(state);
    let previous = state;
    for (const scenario of ['goal_kick', 'gk_short', 'penalty', 'kick_off'] as const) {
      const next = applyRestartScenario({ ...previous, time: previous.time + 1 }, scenario, {
        restartTeam: 'home',
      });
      statistics = observePlayerMatchStats(statistics, previous, next);
      statistics = observePlayerMatchStats(statistics, next, structuredClone(next));
      previous = next;
    }
    expect(statistics.teamAccounting?.home).toMatchObject({
      goalKicks: 2,
      penalties: 1,
      kickOffs: 1,
    });
    expect(statistics.players.reduce((total, player) => total + player.touches, 0)).toBe(0);
  });

  it('migrates absent historical team totals after legacy schema parsing and counts later awards once', () => {
    const { state } = fixture();
    const old = createMatchStatistics(state);
    old.observedRestartIds = [
      'seed:with:separator:restart:1:home:goal_kick',
      'seed:with:separator:restart:2:home:gk_short',
      'seed:with:separator:restart:3:home:penalty',
      'seed:with:separator:restart:4:away:kick_off',
    ];
    old.observedPossessionEvents = [
      '1:away:home:claim',
      '2:home:away:interception:footballer:with:separator',
      '3:away:home:tackle:footballer_home',
    ];
    for (const side of ['home', 'away'] as const) {
      delete old.teamAccounting![side].goalKicks;
      delete old.teamAccounting![side].penalties;
      delete old.teamAccounting![side].kickOffs;
      delete old.teamAccounting![side].possessionChanges;
    }
    const parsed = matchStatisticsSchema.parse(old);
    expect(parsed.teamAccounting?.home.goalKicks).toBeUndefined();
    const resumed = observePlayerMatchStats(parsed, state, state);
    expect(resumed.teamAccounting?.home).toMatchObject({
      goalKicks: 2,
      penalties: 1,
      kickOffs: 0,
      possessionChanges: 2,
    });
    expect(resumed.teamAccounting?.away).toMatchObject({
      goalKicks: 0,
      penalties: 0,
      kickOffs: 1,
      possessionChanges: 1,
    });
    const awarded = applyRestartScenario({ ...state, time: 12 }, 'gk_short', {
      restartTeam: 'home',
    });
    const later = observePlayerMatchStats(resumed, state, awarded);
    expect(later.teamAccounting?.home.goalKicks).toBe(3);
    expect(observePlayerMatchStats(later, awarded, structuredClone(awarded))).toEqual(later);
    expect(parsed.teamAccounting?.home.goalKicks).toBeUndefined();
  });

  it.each(['goal_kick', 'gk_short', 'throw_in', 'free_kick_far'] as const)(
    'credits actual released %s flight as live possession before another player touches it',
    (scenario) => {
      const { state } = fixture();
      const setup = applyRestartScenario(state, scenario, { restartTeam: 'home' });
      setup.statistics = createMatchStatistics(setup);
      const action = enumerateRestartActions(setup).find(
        (candidate) => candidate.type === 'pass' || candidate.type === 'cross',
      )!;
      expect(action).toBeDefined();
      const released = resolveMatchAction(setup, action, 'autonomous_npc');
      released.statistics = observePlayerMatchStats(setup.statistics, setup, released);
      expect(released.restart?.phase).toBe('release');
      expect(released.scenario).toBe(scenario);
      expect(released.ball.ownerId).toBeUndefined();
      expect(released.statistics.teamAccounting?.home.possessionSeconds).toBe(0);
      const progressed = stepTacticalMatchAfterDecisionProbe(released, FIXED_MATCH_DT);
      expect(progressed.restart?.phase).toBe('release');
      expect(progressed.ball.ownerId).toBeUndefined();
      expect(progressed.statistics?.teamAccounting?.home.possessionSeconds).toBeCloseTo(
        FIXED_MATCH_DT,
        9,
      );
      expect(progressed.statistics?.teamAccounting?.away.possessionSeconds).toBe(0);
      expect(
        observePlayerMatchStats(progressed.statistics!, released, structuredClone(progressed)),
      ).toEqual(progressed.statistics);
      expect(
        stepTacticalMatchAfterDecisionProbe(structuredClone(released), FIXED_MATCH_DT),
      ).toEqual(progressed);
    },
  );

  it('excludes the scored-goal completion pause despite retaining an open-play scenario', () => {
    const { state } = fixture();
    const completed: TacticalMatchState = {
      ...state,
      goalCompletionUntil: state.time + 0.55,
      pendingKickoffTeam: 'home',
      ball: { x: 105, y: 34, looseSince: state.time },
      score: { home: 1, away: 0 },
    };
    completed.statistics = createMatchStatistics(completed);
    const progressed = stepTacticalMatchAfterDecisionProbe(completed, FIXED_MATCH_DT);
    expect(progressed.time).toBeGreaterThan(completed.time);
    expect(progressed.scenario).toBe('open_play');
    expect(progressed.goalCompletionUntil).toBeDefined();
    expect(progressed.statistics?.teamAccounting?.home.possessionSeconds).toBe(0);
    expect(progressed.statistics?.teamAccounting?.away.possessionSeconds).toBe(0);
  });

  it('allows repeated carries in one possession and records recovery then shot as one episode', () => {
    const { state, actor } = fixture();
    actor.position = { x: 82, y: 34 };
    const loose: TacticalMatchState = {
      ...state,
      ball: { ...actor.position, looseSince: state.time },
    };
    const recovered: TacticalMatchState = {
      ...loose,
      time: 11,
      ball: { ...actor.position, ownerId: actor.id },
      lastBallRecovery: { id: 'same-team-second-ball', at: 11, playerId: actor.id },
    };
    let statistics = observePlayerMatchStats(createMatchStatistics(loose), loose, recovered);
    let previous = recovered;
    for (const time of [12, 13]) {
      const carried = resolveMatchAction(
        { ...previous, time },
        { type: 'carry', actorId: actor.id, target: { x: 95, y: 34 } },
      );
      statistics = observePlayerMatchStats(statistics, previous, carried);
      previous = carried;
    }
    const shot = resolveMatchAction(
      { ...previous, time: 14 },
      { type: 'shot', actorId: actor.id, target: { x: 105, y: 34 }, intent: 'driven' },
    );
    statistics = observePlayerMatchStats(statistics, previous, shot);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      touches: 1,
      looseBallRecoveries: 1,
      carries: 2,
      shots: 1,
      passesReceived: 0,
    });
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
  });

  it('keeps interception then multiple carries and a pass within one possession episode', () => {
    const { state, actor, teammate } = fixture();
    const intercepted: TacticalMatchState = {
      ...state,
      time: 11,
      possessionTeam: actor.team,
      ball: { ...actor.position, ownerId: actor.id },
      lastPossessionChange: {
        at: 11,
        from: 'away',
        to: 'home',
        cause: 'interception',
        winnerId: actor.id,
      },
    };
    let statistics = observePlayerMatchStats(createMatchStatistics(state), state, intercepted);
    let previous = intercepted;
    for (const time of [12, 13]) {
      const carried = resolveMatchAction(
        { ...previous, time },
        { type: 'carry', actorId: actor.id, target: { x: 60, y: 34 } },
      );
      statistics = observePlayerMatchStats(statistics, previous, carried);
      previous = carried;
    }
    const passed = resolveMatchAction(
      { ...previous, time: 14 },
      {
        type: 'pass',
        actorId: actor.id,
        receiverId: teammate.id,
        target: teammate.position,
        intent: 'support',
      },
    );
    statistics = observePlayerMatchStats(statistics, previous, passed);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      touches: 1,
      interceptions: 1,
      possessionWon: 1,
      passesReceived: 0,
      carries: 2,
      passesAttempted: 1,
    });
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
  });

  it('merges a first-time reception and pass release into one episode with coherent incoming/outgoing edges', () => {
    const { state, actor, teammate } = fixture();
    const passer = state.players.find(
      (player) => player.team === actor.team && player.id !== actor.id && player.id !== teammate.id,
    )!;
    const received: TacticalMatchState = {
      ...state,
      time: 11,
      possessionTeam: actor.team,
      ball: { ...actor.position, ownerId: actor.id },
      lastResolvedPass: {
        passId: 'incoming-first-time',
        passerId: passer.id,
        intendedReceiverId: actor.id,
        actualReceiverId: actor.id,
        releasedAt: 10,
        resolvedAt: 11,
        receiverPositionAtRelease: actor.position,
        receiverVelocityAtRelease: actor.velocity,
        predictedReceptionPoint: actor.position,
        actualContactPoint: actor.position,
        awarenessDelay: 0,
        receiverArrivalEstimate: 0,
        bestDefenderArrivalEstimate: 2,
        leadDistance: 0,
        finalResult: 'completed',
      },
    };
    const passed = resolveMatchAction(received, {
      type: 'pass',
      actorId: actor.id,
      receiverId: teammate.id,
      target: teammate.position,
      intent: 'support',
      firstTime: true,
    });
    const statistics = observePlayerMatchStats(createMatchStatistics(state), state, passed);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      touches: 1,
      passesReceived: 1,
      passesAttempted: 1,
    });
    expect(statistics.activeControlEpisode).toBeUndefined();
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
  });
});
