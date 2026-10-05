// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyRestartScenario,
  assertMatchStatisticsInvariants,
  awardFoulRestart,
  beginDefensiveChallenge,
  createMatchFlowTelemetry,
  createMatchStatistics,
  createTacticalMatch,
  emitCanonicalActionEvents,
  FIXED_MATCH_DT,
  matchStatisticsSchema,
  observeMatchFlow,
  observePlayerMatchStats,
  recordPossessionLoss,
  resolveMatchAction,
  stepTacticalMatchAfterDecisionProbe,
  type MatchFlowTelemetry,
  type FoulFact,
  type PossessionLossCause,
  type TacticalMatchState,
} from '.';

const world = createCanonicalWorldDatabase();
const fixture = (seed: string) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  state.time = 10;
  state.actionCooldown = 100;
  state.playerAgencyEnabled = false;
  state.players = state.players.map((player, index) => ({
    ...player,
    position: { x: player.team === 'home' ? 15 : 85, y: 55 + (index % 6) },
    velocity: { x: 0, y: 0 },
    profile: {
      ...player.profile,
      attributes: {
        ...player.profile.attributes,
        firstTouch: 100,
        technique: 100,
        composure: 100,
        gameReading: 100,
        positioning: 100,
        tackling: 100,
        anticipation: 100,
      },
    },
  }));
  const [passer, receiver] = state.players.filter(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  );
  const opponent = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  passer!.position = { x: 30, y: 34 };
  passer!.facingAngle = Math.PI / 2;
  receiver!.position = { x: 40, y: 34 };
  receiver!.facingAngle = -Math.PI / 2;
  opponent.position = { x: 60, y: 34 };
  state.ball = { ...passer!.position, ownerId: passer!.id, lastTouchPlayerId: passer!.id };
  state.statistics = createMatchStatistics(state);
  return { state, passer: passer!, receiver: receiver!, opponent };
};
const trace = (state: TacticalMatchState) => ({ state, flow: createMatchFlowTelemetry() });
type Trace = ReturnType<typeof trace>;
const observe = (run: Trace, next: TacticalMatchState) => {
  next = emitCanonicalActionEvents(run.state, next);
  next.statistics = observePlayerMatchStats(run.state.statistics!, run.state, next);
  run.flow = observeMatchFlow(run.flow, run.state, next);
  run.state = next;
};
const tick = (run: Trace) => {
  const next = stepTacticalMatchAfterDecisionProbe(run.state, FIXED_MATCH_DT);
  run.flow = observeMatchFlow(run.flow, run.state, next);
  run.state = next;
};
const runUntil = (run: Trace, predicate: (state: TacticalMatchState) => boolean, ticks = 120) => {
  for (let index = 0; index < ticks && !predicate(run.state); index++) tick(run);
  expect(
    predicate(run.state),
    JSON.stringify({
      ball: run.state.ball,
      pass: run.state.lastResolvedPass,
      loss: run.state.lastPossessionLoss,
      reception: run.state.lastReceptionOutcome,
      challenge: run.state.lastChallenge,
    }),
  ).toBe(true);
};
const passFlight = (seed: string) => {
  const { state, passer, receiver, opponent } = fixture(seed);
  const run = trace(state);
  observe(
    run,
    resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    }),
  );
  run.state.time += 1;
  run.state.actionCooldown = 100;
  run.state.ball = {
    ...run.state.ball,
    x: 38.99,
    y: 34,
    velocity: { x: 7, y: 0, z: 0 },
    height: 0.11,
    airborne: false,
    flightTime: 0.7,
  };
  run.state.receptionPreparation!.awarenessAt = run.state.time - 1.2;
  return { run, passer, receiver, opponent };
};
const checkLoss = (run: Trace, cause: PossessionLossCause, loserId: string) => {
  const loss = run.state.lastPossessionLoss!;
  expect(loss).toMatchObject({ cause, loserId, from: 'home', to: 'away' });
  expect(run.state.statistics!.teamAccounting!.home.turnoverCauses![cause]).toBe(1);
  expect(run.state.statistics!.players.find((player) => player.playerId === loserId)).toMatchObject(
    {
      possessionLost: 1,
      possessionLossCauses: { [cause]: 1 },
    },
  );
  expect(run.flow.turnoverCauses[cause]).toBe(1);
  expect(run.state.actionEvents?.filter((event) => event.kind === 'possession_loss')).toHaveLength(
    1,
  );
  expect(run.state.actionEvents?.find((event) => event.kind === 'possession_loss')?.cause).toBe(
    cause,
  );
  expect(matchStatisticsSchema.safeParse(run.state.statistics).success).toBe(true);
  expect(() => assertMatchStatisticsInvariants(run.state.statistics!, run.state)).not.toThrow();
  const repeated = observePlayerMatchStats(
    run.state.statistics!,
    run.state,
    structuredClone(run.state),
  );
  expect(repeated.players).toEqual(run.state.statistics!.players);
  const repeatedFlow: MatchFlowTelemetry = observeMatchFlow(
    run.flow,
    run.state,
    structuredClone(run.state),
  );
  expect(repeatedFlow.turnoverCauses).toEqual(run.flow.turnoverCauses);
  expect(repeatedFlow.restartAwards).toBe(run.flow.restartAwards);
};

describe('PR152 causal turnover scenarios from canonical physics', () => {
  it('1. completes a clean pass with one attempt, one actual reception and no loss', () => {
    const { run, passer, receiver } = passFlight('turnover-clean');
    tick(run);
    expect(run.state.lastResolvedPass?.finalResult).toBe('completed');
    expect(
      run.state.statistics!.players.find((player) => player.playerId === passer.id),
    ).toMatchObject({
      passesAttempted: 1,
      passesCompleted: 1,
      possessionLost: 0,
    });
    expect(
      run.state.statistics!.players.find((player) => player.playerId === receiver.id),
    ).toMatchObject({
      touches: 1,
      passesReceived: 1,
    });
    expect(run.flow.passesCompleted).toBe(1);
    expect(run.state.lastPossessionLoss).toBeUndefined();
  });

  it('2. attributes a controlled lane interception to the original passer', () => {
    const { run, passer, receiver, opponent } = passFlight('turnover-lane');
    run.state.players.find((player) => player.id === receiver.id)!.position = { x: 65, y: 34 };
    run.state.players.find((player) => player.id === opponent.id)!.position = { x: 40, y: 34 };
    runUntil(run, (state) => state.possessionTeam === 'away');
    checkLoss(run, 'interception', passer.id);
    expect(
      run.state.statistics!.players.find((player) => player.playerId === opponent.id)
        ?.interceptions,
    ).toBe(1);
  });

  it('3. separates a displaced inaccurate pass collected by an opponent from a lane interception', () => {
    const { run, passer, receiver, opponent } = passFlight('turnover-inaccurate');
    run.state.players.find((player) => player.id === receiver.id)!.position = { x: 60, y: 34 };
    run.state.players.find((player) => player.id === opponent.id)!.position = { x: 40, y: 38 };
    run.state.ball = { ...run.state.ball, x: 38.99, y: 38, target: { x: 40, y: 38 } };
    run.state.lastPassDiagnostic = {
      ...run.state.lastPassDiagnostic!,
      intendedTarget: { x: 60, y: 34 },
      physicalTarget: { x: 40, y: 38 },
      executionQuality: 0.1,
    };
    runUntil(run, (state) => state.possessionTeam === 'away');
    checkLoss(run, 'bad_pass', passer.id);
    expect(run.state.lastResolvedPass?.finalResult).toBe('inaccurate');
    expect(
      run.state.statistics!.players.find((player) => player.playerId === opponent.id)
        ?.interceptions,
    ).toBe(0);
  });

  it.each([
    ['touchline', { x: 52, y: 67.95 }, { x: 0, y: 12, z: 0 }, 'throw_in'],
    ['goal line', { x: 104.95, y: 10 }, { x: 12, y: 0, z: 0 }, 'goal_kick'],
  ] as const)(
    '4/5. preserves pass_out over the %s before the opponent %s',
    (name, point, velocity, scenario) => {
      const { run, passer } = passFlight(`turnover-out-${name}`);
      run.state.ball = { ...run.state.ball, ...point, velocity };
      tick(run);
      expect(run.state.scenario).toBe(scenario);
      expect(run.state.lastResolvedPass?.finalResult).toBe('out_of_play');
      expect(run.state.lastRestartAward).toMatchObject({
        scenario,
        cause: 'boundary',
        lossId: run.state.lastPossessionLoss!.id,
      });
      expect(run.flow.restartAwards).toBe(1);
      checkLoss(run, 'pass_out', passer.id);
      const lossId = run.state.lastPossessionLoss!.id;
      tick(run);
      expect(run.state.lastPossessionLoss!.id).toBe(lossId);
      expect(run.flow.turnoverCauses.pass_out).toBe(1);
    },
  );

  it.each([
    [55, 4, 'heavy_touch'],
    [10, 18, 'failed_control'],
  ] as const)(
    '6. credits %s-skill %s m/s failed reception loss to the receiver as %s',
    (skill, speed, cause) => {
      const { run, passer, receiver, opponent } = passFlight(`turnover-reception-${cause}`);
      const actor = run.state.players.find((player) => player.id === receiver.id)!;
      actor.profile = {
        ...actor.profile,
        attributes: {
          ...actor.profile.attributes,
          firstTouch: skill,
          technique: skill,
          composure: skill,
          pace: 1,
          agility: 1,
          gameReading: 1,
        },
      };
      actor.velocity = { x: 2, y: 0 };
      actor.facingAngle = Math.PI;
      run.state.players.find((player) => player.id === opponent.id)!.position = { x: 41.6, y: 34 };
      run.state.ball = { ...run.state.ball, x: 39.3, velocity: { x: speed, y: 0, z: 0 } };
      run.state.receptionPreparation!.awarenessAt = run.state.time - 1;
      tick(run);
      expect(run.state.lastReceptionOutcome?.kind).toBe(cause);
      expect(run.state.lastPossessionLoss).toBeUndefined();
      expect(
        run.state.statistics!.players.find((player) => player.playerId === receiver.id)?.touches,
      ).toBe(0);
      const defender = run.state.players.find((player) => player.id === opponent.id)!;
      defender.position = { ...run.state.ball };
      defender.velocity = { x: 0, y: 0 };
      actor.position = { x: 25, y: 34 };
      runUntil(run, (state) => state.possessionTeam === 'away');
      checkLoss(run, cause, receiver.id);
      expect(
        run.state.statistics!.players.find((player) => player.playerId === passer.id)
          ?.possessionLost,
      ).toBe(0);
      expect(run.flow.turnoverCauses.loose_ball_claim).toBe(0);
    },
  );

  it('7. attributes a standing tackle to the challenger and counts the loss once', () => {
    const { state, passer, opponent } = fixture('turnover-standing');
    const actor = state.players.find((player) => player.id === opponent.id)!;
    actor.position = { x: 30.2, y: 34 };
    actor.facingAngle = -Math.PI / 2;
    const run = trace(state);
    observe(
      run,
      beginDefensiveChallenge(
        state,
        {
          type: 'challenge',
          actorId: opponent.id,
          opponentId: passer.id,
          technique: 'standing',
        },
        'autonomous_npc',
      ),
    );
    runUntil(run, (next) => next.possessionTeam === 'away');
    expect(run.state.lastChallenge?.outcome).toBe('clean_win');
    checkLoss(run, 'tackle', passer.id);
    expect(
      run.state.statistics!.players.find((player) => player.playerId === opponent.id),
    ).toMatchObject({
      tacklesAttempted: 1,
      tacklesWon: 1,
      possessionWon: 1,
    });
  });

  it('8. distinguishes a loose-ball recovery without a pass or challenge', () => {
    const { state, passer, opponent } = fixture('turnover-loose');
    state.players.find((player) => player.id === opponent.id)!.position = { x: 60, y: 34 };
    state.ball = {
      x: 60,
      y: 34,
      velocity: { x: 0, y: 0 },
      looseSince: state.time - 1,
      lastTouchPlayerId: passer.id,
    };
    const run = trace(state);
    runUntil(run, (next) => next.possessionTeam === 'away');
    checkLoss(run, 'loose_ball_claim', passer.id);
    expect(
      run.state.statistics!.players.find((player) => player.playerId === opponent.id),
    ).toMatchObject({
      looseBallRecoveries: 1,
      tacklesWon: 0,
      interceptions: 0,
    });
  });

  it('9. keeps a foul free kick separate from possession loss and counts bookkeeping only as an award', () => {
    const { state, passer, opponent } = fixture('turnover-foul');
    const run = trace(state);
    const foul: FoulFact = {
      id: 'canonical-attacking-foul',
      challengeId: 'attacking-contact',
      technique: 'standing',
      at: state.time,
      actorId: passer.id,
      team: 'home',
      opponentId: opponent.id,
      awardedTeam: 'away',
      position: { x: 50, y: 34 },
      severity: 'ordinary',
      tactical: false,
      promisingAttack: false,
      dogso: false,
      penalty: false,
      card: 'none',
    };
    observe(run, awardFoulRestart({ ...state, lastFoul: foul }, foul));
    checkLoss(run, 'foul_stoppage', passer.id);
    expect(run.flow.restartAwards).toBe(1);
    expect(run.state.statistics!.teamAccounting!.away.freeKicks).toBe(1);
    expect(run.state.actionEvents?.filter((event) => event.kind === 'foul')).toHaveLength(1);
    const retained = fixture('retained-foul').state;
    const retaining = applyRestartScenario(retained, 'free_kick_far', {
      restartTeam: 'home',
      cause: 'foul',
      loserId: retained.ball.ownerId!,
    });
    expect(retaining.lastPossessionLoss).toBeUndefined();
    expect(retaining.lastRestartAward?.cause).toBe('foul');
    const bookkeeping = applyRestartScenario(state, 'kick_off', { restartTeam: 'away' });
    expect(bookkeeping.lastPossessionLoss).toBeUndefined();
    expect(bookkeeping.lastRestartAward?.cause).toBe('bookkeeping');
  });
});

describe('PR152 possession episode and lineage invariants', () => {
  it('does not count a defender deflection or keeper parry as controlled possession', () => {
    const { state, opponent } = fixture('turnover-deflection-contact');
    const run = trace(state);
    const next: TacticalMatchState = {
      ...state,
      time: state.time + FIXED_MATCH_DT,
      ball: { x: 60, y: 34, looseSince: state.time },
      lastBallContact: {
        playerId: opponent.id,
        kind: 'defender',
        point: { x: 60, y: 34, z: 0.1 },
        at: state.time + 0.01,
        segmentFraction: 0.4,
        preContactSpeed: 12,
        postContactSpeed: 4,
      },
    };
    observe(run, next);
    expect(
      run.state.statistics!.players.find((player) => player.playerId === opponent.id),
    ).toMatchObject({ touches: 0, blocks: 1 });
    expect(run.state.statistics!.observedContactIds).toHaveLength(1);
  });

  it.each(['parry', 'block'] as const)(
    'retains shot cause through a later %s rebound recovery',
    (kind) => {
      const { state, passer, opponent } = fixture(`turnover-shot-${kind}`);
      state.ball = {
        x: 60,
        y: 34,
        looseSince: state.time - 1,
        velocity: { x: 0, y: 0 },
        lastTouchPlayerId: opponent.id,
      };
      state.pendingPossessionLoss = {
        id: 'canonical-shot-rebound',
        at: state.time - 0.1,
        team: 'home',
        actorId: passer.id,
        cause: 'shot',
      };
      const run = trace(state);
      runUntil(run, (next) => next.possessionTeam === 'away');
      checkLoss(run, 'shot', passer.id);
      expect(
        run.state.statistics!.players.find((player) => player.playerId === opponent.id)
          ?.possessionLost,
      ).toBe(0);
    },
  );

  it.each([0, 100])(
    'records physical keeper saves and retains shot lineage at handling %s',
    (handling) => {
      const { state, passer, opponent } = fixture(`keeper-75-${handling}`);
      const keeper = state.players.find(
        (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
      )!;
      keeper.position = { x: 103, y: 34 };
      keeper.facingAngle = -Math.PI / 2;
      keeper.profile = {
        ...keeper.profile,
        attributes: {
          ...keeper.profile.attributes,
          handling,
          concentration: handling,
          positioning: handling,
          reflexes: 100,
          agility: 100,
        },
      };
      passer.position = { x: 75, y: 34 };
      state.ball = {
        x: 75,
        y: 34,
        from: { x: 75, y: 34 },
        target: { x: 107, y: 34 },
        height: 0.11,
        airborne: true,
        velocity: { x: 27, y: 0.8, z: 3 },
        launchVelocity: { x: 27, y: 0.8, z: 3 },
        launchSpeed: 27.18,
        launchElevation: 0.11,
        flightTime: 0,
        distanceTravelled: 0,
        bounceCount: 0,
        travelKind: 'shot',
        lastTouchPlayerId: passer.id,
        shot: {
          shotId: 'physical-save-shot',
          shooterId: passer.id,
          releasedAt: state.time,
          context: 'open_play',
          distance: 30,
          angle: 1,
          pressure: 0,
          blockingDefenders: 0,
          baseXg: 0.1,
          effectiveScoringExpectation: 0.1,
          shooterExecutionQuality: 0.8,
          intendedTarget: { horizontal: 0, vertical: 0.3 },
          actualTarget: { horizontal: 0, vertical: 0.3 },
          error: { horizontal: 0, vertical: 0 },
          speed: 27.18,
          classification: 'on_target',
        },
      };
      const run = trace(state);
      runUntil(run, (next) => next.lastShotResult !== undefined, 200);
      expect(run.state.lastBallContact?.kind).toBe('goalkeeper');
      expect(run.state.lastShotResult).toBe('save');
      if (run.state.lastShot?.goalkeeperAction === 'catch') {
        expect(run.state.lastBallContact!.at).toBeLessThan(run.state.time);
        checkLoss(run, 'shot', passer.id);
      } else {
        expect(run.state.pendingPossessionLoss).toMatchObject({
          actorId: passer.id,
          cause: 'shot',
        });
        const rebounder = run.state.players.find((player) => player.id === opponent.id)!;
        rebounder.position = { ...run.state.ball };
        run.state.players.find((player) => player.id === passer.id)!.position = { x: 30, y: 34 };
        run.state.ball = {
          ...run.state.ball,
          velocity: { x: 0, y: 0 },
          looseSince: run.state.time - 1,
        };
        runUntil(run, (next) => next.possessionTeam === 'away');
        checkLoss(run, 'shot', passer.id);
      }
    },
  );

  it('closes removed-player episodes and freezes later playing statistics while preserving entry time', () => {
    const { state, passer } = fixture('turnover-dismissal');
    state.players.find((player) => player.id === passer.id)!.activeSince = 5;
    state.statistics = createMatchStatistics(state);
    state.statistics.activeControlEpisode = {
      playerId: passer.id,
      startedAt: 10,
      lastContactAt: 10,
    };
    const dismissed: TacticalMatchState = {
      ...state,
      time: 11,
      players: state.players.filter((player) => player.id !== passer.id),
      discipline: { [passer.id]: { team: 'home', sentOff: true, sentOffAt: 10.8, yellowCards: 2 } },
    };
    let stats = observePlayerMatchStats(state.statistics, state, dismissed);
    expect(stats.activeControlEpisode).toBeUndefined();
    expect(
      stats.players.find((player) => player.playerId === passer.id)?.minutesPlayed,
    ).toBeCloseTo(5.8 / 60);
    const late = {
      ...dismissed,
      time: 20,
      lastPossessionLoss: {
        id: 'illegal-later-loss',
        at: 20,
        from: 'home' as const,
        to: 'away' as const,
        cause: 'tackle' as const,
        position: { x: 30, y: 34 },
        loserId: passer.id,
      },
    };
    stats = observePlayerMatchStats(stats, dismissed, late);
    expect(stats.players.find((player) => player.playerId === passer.id)).toMatchObject({
      touches: 0,
      passesAttempted: 0,
      possessionLost: 0,
      yellowCards: 2,
      redCards: 1,
    });
    expect(() => assertMatchStatisticsInvariants(stats, late)).not.toThrow();
  });

  it('does not create a loss merely by releasing a shot or recording an own-team rebound', () => {
    const { state, passer } = fixture('turnover-own-shot-rebound');
    const unchanged = recordPossessionLoss(state, {
      key: 'own-rebound',
      to: 'home',
      cause: 'shot',
      loserId: passer.id,
    });
    expect(unchanged).toBe(state);
  });
});
