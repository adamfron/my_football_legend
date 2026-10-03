import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyChallengeInfringement,
  applyRestartScenario,
  createMatchStatistics,
  createTacticalMatch,
  emitCanonicalActionEvents,
  emitMatchEvents,
  FIXED_MATCH_DT,
  matchCentreStatisticsSchema,
  matchStateToFrame,
  observePlayerMatchStats,
  projectMatchCentreStatistics,
  resolveCanonicalShot,
  resolveMatchAction,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
  type TacticalMatchState,
  type ChallengeDiagnostic,
} from '.';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr149-accounting') =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
const observe = (previous: TacticalMatchState, next: TacticalMatchState) => ({
  ...next,
  statistics: observePlayerMatchStats(
    previous.statistics ?? createMatchStatistics(previous),
    previous,
    next,
  ),
});

describe('PR149 canonical accounting', () => {
  it('credits the actual teammate receiver without inventing a second attempted pass', () => {
    const initial = fixture('pr149-actual-receiver');
    const passer = initial.players.find((player) => player.id === initial.ball.ownerId)!;
    const [intended, actual] = initial.players.filter(
      (player) => player.team === passer.team && player.id !== passer.id,
    );
    let released = resolveMatchAction(initial, {
      type: 'pass',
      actorId: passer.id,
      receiverId: intended!.id,
      target: intended!.position,
      intent: 'support',
    });
    released = observe(initial, released);
    const received = observe(
      released,
      emitCanonicalActionEvents(released, {
        ...released,
        time: 1,
        ball: { ...actual!.position, ownerId: actual!.id },
        lastPassDiagnostic: {
          ...released.lastPassDiagnostic!,
          actualReceiverId: actual!.id,
          actualContactPoint: actual!.position,
          resolvedAt: 1,
          finalResult: 'completed',
        },
      }),
    );
    expect(
      received.statistics!.players.find((entry) => entry.playerId === passer.id),
    ).toMatchObject({ passesAttempted: 1, passesCompleted: 1 });
    expect(
      received.statistics!.players.find((entry) => entry.playerId === actual!.id),
    ).toMatchObject({ passesReceived: 1, touches: 1 });
    expect(
      received.statistics!.players.find((entry) => entry.playerId === intended!.id)?.passesReceived,
    ).toBe(0);
    expect(received.statistics!.passingNetwork).toEqual([
      { passerId: passer.id, receiverId: intended!.id, attempted: 1, completed: 0 },
      { passerId: passer.id, receiverId: actual!.id, attempted: 0, completed: 1 },
    ]);
    expect(received.actionEvents?.find((event) => event.kind === 'reception')?.actorId).toBe(
      actual!.id,
    );
    const total = projectMatchCentreStatistics(received)[passer.team];
    expect(total).toMatchObject({
      passesAttempted: 1,
      passesCompleted: 1,
      completionPercentage: 100,
    });
  });
  it('reconciles both cautions and the dismissal with permanent disciplinary history', () => {
    let state = fixture('pr149-card-reconciliation');
    const defender = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const opponent = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = { x: 50, y: 34 };
    opponent.position = { x: 51, y: 34 };
    state.ball = { ...opponent.position, ownerId: opponent.id };
    state.possessionTeam = 'away';
    state.currentPressure = 1;
    for (let incident = 1; incident <= 2; incident++) {
      const { restart: _restart, ...openPlay } = state;
      void _restart;
      const previous = {
        ...openPlay,
        scenario: 'open_play' as const,
        time: incident * 10,
        currentPressure: 1,
        ball: { x: 51, y: 34, ownerId: opponent.id },
        players: state.players.map((player) => ({
          ...player,
          position:
            player.id === defender.id
              ? { x: 50, y: 34 }
              : player.id === opponent.id
                ? { x: 51, y: 34 }
                : player.position,
        })),
      };
      const challenge: ChallengeDiagnostic = {
        id: `reckless-${incident}`,
        at: previous.time,
        actorId: defender.id,
        team: 'home',
        opponentId: opponent.id,
        technique: 'standing',
        source: 'autonomous_npc',
        position: { x: 51, y: 34 },
        outcome: 'foul',
        ballFirst: false,
        opponentContact: true,
        ballDistance: 1,
        opponentDistance: 1,
        facingError: 0,
        relativeSpeed: 5,
        lateness: 0.1,
        force: 6,
        fromBehind: false,
      };
      state = observe(
        previous,
        emitMatchEvents(previous, applyChallengeInfringement(previous, challenge)),
      );
    }
    const projected = projectMatchCentreStatistics(state).home;
    const events = state.matchEvents!.filter((event) => event.team === 'home');
    expect(projected.yellowCards).toBe(
      events.filter((event) => ['yellow_card', 'second_yellow_red'].includes(event.kind)).length,
    );
    expect(projected.redCards).toBe(
      events.filter((event) => ['red_card', 'second_yellow_red'].includes(event.kind)).length,
    );
    expect(projected).toMatchObject({ fouls: 2, yellowCards: 2, redCards: 1 });
    expect(state.players.some((player) => player.id === defender.id)).toBe(false);
    const frozen = state.statistics!.players.find((player) => player.playerId === defender.id)!;
    state = stepTacticalMatchAfterDecisionProbe(state);
    expect(state.statistics!.players.find((player) => player.playerId === defender.id)).toEqual(
      frozen,
    );
  });
  it('counts blocked shots separately from on-target saves, without duplicating copied shot facts', () => {
    const initial = fixture('pr149-blocked-accounting');
    const shooter = initial.players.find((player) => player.id === initial.ball.ownerId)!;
    const shot = resolveCanonicalShot(initial, {
      type: 'shot',
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      intent: 'driven',
    });
    let state = observe(initial, { ...initial, time: 1, lastShot: { ...shot, outcome: 'block' } });
    state = observe(state, structuredClone(state));
    expect(projectMatchCentreStatistics(state)[shooter.team]).toMatchObject({
      shots: 1,
      shotsOnTarget: 0,
      blockedShots: 1,
    });
    state = observe(state, {
      ...state,
      time: 2,
      lastShot: { ...shot, shotId: 'separate-save', outcome: 'save' },
    });
    expect(projectMatchCentreStatistics(state)[shooter.team]).toMatchObject({
      shots: 2,
      shotsOnTarget: 1,
      blockedShots: 1,
    });
  });
  it('uses canonical live time once, excludes dead balls and halftime, and sums percentages to 100', () => {
    const initial = fixture();
    let state = observe(initial, { ...initial, time: 20 });
    state = observe(state, { ...state, time: 30, possessionTeam: 'away' });
    state = observe(state, { ...state, time: 50 });
    const beforeDeadBall = projectMatchCentreStatistics(state);
    expect(beforeDeadBall.home.possessionPercentage).toBe(60);
    expect(beforeDeadBall.away.possessionPercentage).toBe(40);
    const corner = applyRestartScenario(state, 'corner', { restartTeam: 'away' });
    state = observe(corner, { ...corner, time: 100 });
    state = observe(
      { ...state, status: 'half_time' },
      { ...state, status: 'half_time', time: 150 },
    );
    const projected = projectMatchCentreStatistics(state);
    expect(projected.home.possessionPercentage).toBe(60);
    expect(projected.away.possessionPercentage).toBe(40);
    const repeated = observePlayerMatchStats(state.statistics!, initial, state);
    expect(repeated.teamAccounting?.home.possessionSeconds).toBe(30);
    expect(repeated.teamAccounting?.away.possessionSeconds).toBe(20);
    expect(projectMatchCentreStatistics(initial).home.possessionPercentage).toBeUndefined();
    expect(matchCentreStatisticsSchema.safeParse(projected).success).toBe(true);
  });

  it('counts restart awards and offside facts exactly once across release and copied snapshots', () => {
    const initial = fixture();
    let state = observe(initial, applyRestartScenario(initial, 'corner', { restartTeam: 'home' }));
    state = observe(state, { ...state, time: 1, restart: { ...state.restart!, phase: 'release' } });
    state = observe(state, structuredClone(state));
    expect(projectMatchCentreStatistics(state).home.corners).toBe(1);
    const freeKick = applyRestartScenario({ ...state, time: 2 }, 'free_kick_far', {
      restartTeam: 'away',
    });
    state = observe(state, freeKick);
    const throwIn = applyRestartScenario({ ...state, time: 3 }, 'throw_in', {
      restartTeam: 'home',
    });
    state = observe(state, throwIn);
    const offender = state.players.find((player) => player.team === 'away')!;
    state = observe(state, {
      ...state,
      lastOffsideOffence: { playerId: offender.id, at: 3, reason: 'attempted_receive' },
    });
    state = observe(state, structuredClone(state));
    expect(projectMatchCentreStatistics(state)).toMatchObject({
      home: { corners: 1, throwIns: 1 },
      away: { freeKicks: 1, offsides: 1 },
    });
  });

  it('retains the incoming physical completion when a queued reception pass starts immediately', () => {
    const base = fixture('pr149-preselected-reception-pass');
    const [passer, receiver, target] = base.players.filter(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    );
    base.players = base.players.map((player) => ({
      ...player,
      position:
        player.id === passer!.id
          ? { x: 40, y: 34 }
          : player.id === receiver!.id
            ? { x: 50, y: 34 }
            : player.id === target!.id
              ? { x: 60, y: 30 }
              : { x: player.team === 'home' ? 10 : 95, y: 60 },
      velocity: { x: 0, y: 0 },
    }));
    for (const player of base.players) player.target = { ...player.position };
    const controlledReceiver = base.players.find((player) => player.id === receiver!.id)!;
    controlledReceiver.facingAngle = -Math.PI / 2;
    controlledReceiver.profile = {
      ...controlledReceiver.profile,
      attributes: {
        ...controlledReceiver.profile.attributes,
        firstTouch: 100,
        technique: 100,
        composure: 100,
        concentration: 100,
        gameReading: 100,
      },
    };
    base.controlledFootballerId = receiver!.id;
    base.ball = { x: 40, y: 34, ownerId: passer!.id };
    base.possessionTeam = 'home';
    let released = resolveMatchAction(base, {
      type: 'pass',
      actorId: passer!.id,
      receiverId: receiver!.id,
      target: { x: 50, y: 34 },
      intent: 'support',
    });
    released = observe(base, released);
    const incomingId = released.lastPassDiagnostic!.passId;
    // Place an already released flight immediately before its physical contact segment.
    released.ball = {
      ...released.ball,
      x: 49.9,
      y: 34,
      height: 0.11,
      airborne: false,
      velocity: { x: 12, y: 0, z: 0 },
    };
    delete released.receptionPreparation;
    released.actionCooldown = 20;
    released.pendingReceptionIntent = {
      actorId: receiver!.id,
      createdAt: released.time,
      expiresAt: released.time + 2,
      ballEpisode: 'incoming-physical-pass',
      sourceAction: 'pass',
      action: {
        type: 'pass',
        actorId: receiver!.id,
        receiverId: target!.id,
        target: { x: 60, y: 30 },
        intent: 'support',
      },
    };
    const next = stepTacticalMatchAfterDecisionProbe(released);
    expect(next.latestAction).toMatchObject({ type: 'pass', actorId: receiver!.id });
    expect(next.lastResolvedPass).toMatchObject({ passId: incomingId, finalResult: 'completed' });
    expect(next.lastPassDiagnostic?.passId).not.toBe(incomingId);
    expect(next.statistics?.players.find((entry) => entry.playerId === passer!.id)).toMatchObject({
      passesCompleted: 1,
    });
    expect(next.statistics?.players.find((entry) => entry.playerId === receiver!.id)).toMatchObject(
      { passesReceived: 1, passesAttempted: 1, touches: 1 },
    );
    expect(
      next.actionEvents?.find(
        (event) => event.kind === 'reception' && event.actorId === receiver!.id,
      )?.parentId,
    ).toContain(incomingId);
    const copied = observePlayerMatchStats(next.statistics!, next, structuredClone(next));
    expect(copied.players.find((entry) => entry.playerId === receiver!.id)?.passesReceived).toBe(1);
  });

  it('keeps dismissed player history in team totals and counts the second caution as a yellow and a red', () => {
    const state = fixture();
    const player = state.players.find((entry) => entry.team === 'home')!;
    const stats = state.statistics!.players.find((entry) => entry.playerId === player.id)!;
    stats.shots = 2;
    stats.shotsOnTarget = 1;
    stats.passesAttempted = 4;
    stats.passesCompleted = 3;
    state.players = state.players.filter((entry) => entry.id !== player.id);
    state.discipline = {
      [player.id]: { team: 'home', yellowCards: 2, sentOff: true, sentOffAt: 20 },
    };
    expect(projectMatchCentreStatistics(state).home).toMatchObject({
      shots: 2,
      shotsOnTarget: 1,
      passesAttempted: 4,
      passesCompleted: 3,
      completionPercentage: 75,
      yellowCards: 2,
      redCards: 1,
    });
    const terminal = { ...state, status: 'full_time' as const };
    expect(observePlayerMatchStats(state.statistics!, terminal, { ...terminal, time: 9999 })).toBe(
      state.statistics,
    );
  });

  it('headless and repeatedly projected execution preserve identical statistics, facts and the score', () => {
    let headless = fixture('pr149-stats-render-independent');
    let watched = structuredClone(headless);
    for (let tick = 0; tick < 2400; tick++) {
      headless = stepTacticalMatchAfterDecisionProbe(headless, FIXED_MATCH_DT);
      watched = stepTacticalMatch(watched, FIXED_MATCH_DT);
      if (tick % 20 === 0) {
        matchStateToFrame(watched);
        projectMatchCentreStatistics(watched);
      }
    }
    expect(watched).toEqual(headless);
    const players = headless.statistics!.players;
    const sum = (key: 'passesCompleted' | 'passesReceived') =>
      players.reduce((total, player) => total + player[key], 0);
    expect(sum('passesCompleted')).toBe(sum('passesReceived'));
    expect(
      players.every(
        (entry) =>
          entry.passesCompleted <= entry.passesAttempted && entry.shotsOnTarget <= entry.shots,
      ),
    ).toBe(true);
    expect(
      headless.statistics?.passingNetwork.reduce((total, edge) => total + edge.completed, 0),
    ).toBe(sum('passesCompleted'));
    for (const team of ['home', 'away'] as const)
      expect(
        headless.matchEvents?.filter((event) => event.kind === 'goal' && event.team === team)
          .length ?? 0,
      ).toBe(headless.score[team]);
  });
});
