import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createMatchStatistics,
  createTacticalMatch,
  observePlayerMatchStats,
  resolveCanonicalShot,
  matchStateToFrame,
  matchStatisticsSchema,
  resolveMatchAction,
  assertMatchStatisticsInvariants,
  type TacticalMatchState,
} from '.';

const world = createCanonicalWorldDatabase();
const state = (seed: string) =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

const completedPass = (base: TacticalMatchState, passerId: string, scorerId: string) => ({
  ...base,
  lastPassDiagnostic: {
    passId: 'assist-pass',
    passerId,
    intendedReceiverId: scorerId,
    releasedAt: base.time,
    resolvedAt: base.time + 1,
    receiverPositionAtRelease: { x: 70, y: 34 },
    receiverVelocityAtRelease: { x: 0, y: 0 },
    predictedReceptionPoint: { x: 80, y: 34 },
    actualContactPoint: { x: 80, y: 34 },
    awarenessDelay: 0.1,
    receiverArrivalEstimate: 1,
    bestDefenderArrivalEstimate: 2,
    leadDistance: 0,
    finalResult: 'completed' as const,
  },
});

describe('canonical contact and pass event semantics', () => {
  it('counts reception, carry samples, shielding and release as one public control episode', () => {
    const initial = state('pr150-control-episode');
    const [passer, receiver, target] = initial.players.filter((player) => player.team === 'home');
    const received: TacticalMatchState = {
      ...completedPass(initial, passer!.id, receiver!.id),
      time: 1,
      ball: { ...receiver!.position, ownerId: receiver!.id },
    };
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const carry = resolveMatchAction(received, {
      type: 'carry',
      actorId: receiver!.id,
      target: { x: receiver!.position.x + 10, y: receiver!.position.y },
    });
    const progressed: TacticalMatchState = {
      ...carry,
      time: 2,
      players: carry.players.map((player) =>
        player.id === receiver!.id
          ? { ...player, position: { x: player.position.x + 2, y: player.position.y } }
          : player,
      ),
    };
    statistics = observePlayerMatchStats(statistics, received, progressed);
    const shield = { ...progressed, time: 3 };
    statistics = observePlayerMatchStats(statistics, progressed, shield);
    const released = resolveMatchAction(shield, {
      type: 'pass',
      actorId: receiver!.id,
      receiverId: target!.id,
      target: target!.position,
      intent: 'support',
    });
    statistics = observePlayerMatchStats(statistics, shield, released);
    expect(statistics.players.find((player) => player.playerId === receiver!.id)).toMatchObject({
      touches: 1,
      carries: 1,
      passesReceived: 1,
      passesAttempted: 1,
    });
    expect(
      statistics.observedContactIds.filter((id) => id.includes(receiver!.id)).length,
    ).toBeGreaterThanOrEqual(3);
    expect(statistics.activeControlEpisode).toBeUndefined();
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
  });

  it('starts a new public touch after release and recovery, including unsuccessful contact', () => {
    const initial = state('pr150-recovery-touch');
    const actor = initial.players.find((player) => player.id === initial.ball.ownerId)!;
    const failed: TacticalMatchState = {
      ...initial,
      time: 1,
      ball: { ...actor.position },
      lastReceptionOutcome: {
        receiverId: actor.id,
        kind: 'failed_control',
        contactPoint: actor.position,
      },
    };
    const first = observePlayerMatchStats(createMatchStatistics(initial), initial, failed);
    const recovered = { ...failed, time: 2, ball: { ...actor.position, ownerId: actor.id } };
    const second = observePlayerMatchStats(first, failed, recovered);
    expect(second.players.find((player) => player.playerId === actor.id)?.touches).toBe(2);
    expect(second.activeControlEpisode?.playerId).toBe(actor.id);
    expect(observePlayerMatchStats(second, recovered, structuredClone(recovered))).toEqual(second);
  });

  it('moves exactly one attempt to an unintended actual receiver and preserves intended evidence', () => {
    const initial = state('pr150-realized-network');
    const [passer, intended, actual] = initial.players.filter((player) => player.team === 'home');
    const release = completedPass(initial, passer!.id, intended!.id);
    const received = {
      ...release,
      lastPassDiagnostic: { ...release.lastPassDiagnostic, actualReceiverId: actual!.id },
    };
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    expect(received.lastPassDiagnostic.intendedReceiverId).toBe(intended!.id);
    expect(statistics.passingNetwork).toEqual([
      { passerId: passer!.id, receiverId: actual!.id, attempted: 1, completed: 1 },
    ]);
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
    expect(
      matchStatisticsSchema.safeParse({
        ...statistics,
        passingNetwork: [{ ...statistics.passingNetwork[0], attempted: 0, completed: 1 }],
      }).success,
    ).toBe(false);
  });

  it('never reports an own recovery as a self pass', () => {
    const initial = state('pr150-no-self-pass');
    const actor = initial.players[0]!;
    const next = completedPass(initial, actor.id, actor.id);
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, next);
    expect(statistics.passingNetwork).toEqual([]);
    expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
      passesAttempted: 0,
      passesCompleted: 0,
      passesReceived: 0,
    });
    expect(() => assertMatchStatisticsInvariants(statistics)).not.toThrow();
  });
  it('reuses inert whole-match histories and preserves earlier snapshots on a new event', () => {
    const initial = state('stats-history-sharing');
    const [passer, receiver] = initial.players.filter((player) => player.team === 'home');
    const received = completedPass(initial, passer!.id, receiver!.id);
    const first = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const frozen = structuredClone(first);
    Object.freeze(first.observedContactIds);
    Object.freeze(first.observedPassAttemptIds);
    Object.freeze(first.observedPassResultIds);
    Object.freeze(first.passingNetwork[0]);
    Object.freeze(first.passingNetwork);
    const unchanged = observePlayerMatchStats(first, received, received);
    expect(unchanged.observedContactIds).toBe(first.observedContactIds);
    expect(unchanged.observedPassAttemptIds).toBe(first.observedPassAttemptIds);
    expect(unchanged.observedPassResultIds).toBe(first.observedPassResultIds);
    expect(unchanged.passingNetwork).toBe(first.passingNetwork);
    const another = {
      ...received,
      lastPassDiagnostic: {
        ...received.lastPassDiagnostic,
        passId: 'another-pass',
        releasedAt: 2,
        resolvedAt: 3,
      },
    };
    const observed = observePlayerMatchStats(first, received, another);
    expect(first).toEqual(frozen);
    expect(observed.passingNetwork[0]).toMatchObject({ attempted: 2, completed: 2 });
    // A replay/branch from the earlier snapshot still counts its own new event exactly once.
    expect(observePlayerMatchStats(first, received, another)).toEqual(observed);
  });

  it('indexes a large unchanged contact ledger once instead of scanning it every tick', () => {
    const initial = state('stats-ledger-index');
    const [passer, receiver] = initial.players.filter((player) => player.team === 'home');
    const received = completedPass(initial, passer!.id, receiver!.id);
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    statistics.observedContactIds = [
      ...Array.from({ length: 20_000 }, (_, index) => `historical-contact-${index}`),
      ...statistics.observedContactIds,
    ];
    const ledger = statistics.observedContactIds;
    const iterator = ledger[Symbol.iterator].bind(ledger);
    let scans = 0;
    ledger[Symbol.iterator] = () => {
      scans++;
      return iterator();
    };
    for (let tick = 0; tick < 100; tick++)
      statistics = observePlayerMatchStats(statistics, received, received);
    expect(scans).toBe(1);
    expect(statistics.observedContactIds).toBe(ledger);
  });

  it('counts one release and one intended reception even without an ownership transition', () => {
    const initial = state('contact-pass');
    const [passer, receiver] = initial.players.filter((p) => p.team === 'home');
    const received = completedPass(initial, passer!.id, receiver!.id);
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const from = statistics.players.find((p) => p.playerId === passer!.id)!;
    const to = statistics.players.find((p) => p.playerId === receiver!.id)!;
    expect(from).toMatchObject({ passesAttempted: 1, passesCompleted: 1, touches: 1 });
    expect(to).toMatchObject({ passesReceived: 1, touches: 1 });
    expect(statistics.passingNetwork).toEqual([
      { passerId: passer!.id, receiverId: receiver!.id, attempted: 1, completed: 1 },
    ]);
    expect(matchStatisticsSchema.safeParse(statistics).success).toBe(true);
    expect(observePlayerMatchStats(statistics, received, received)).toEqual(statistics);
  });

  it('never creates a reception/network completion from an intercepted pass', () => {
    const initial = state('contact-intercepted');
    const [passer, receiver] = initial.players.filter((p) => p.team === 'home');
    const completed = completedPass(initial, passer!.id, receiver!.id);
    const intercepted = {
      ...completed,
      lastPassDiagnostic: { ...completed.lastPassDiagnostic, finalResult: 'intercepted' as const },
    };
    const statistics = observePlayerMatchStats(
      createMatchStatistics(initial),
      initial,
      intercepted,
    );
    expect(statistics.players.find((p) => p.playerId === receiver!.id)?.passesReceived).toBe(0);
    expect(statistics.passingNetwork[0]).toMatchObject({ attempted: 1, completed: 0 });
    expect(statistics.players.find((p) => p.playerId === passer!.id)?.touches).toBe(1);
  });

  it('merges first-time reception, ownership and shot evidence into one physical contact', () => {
    const initial = state('contact-first-time');
    const [passer, receiver] = initial.players.filter((p) => p.team === 'home');
    const completed = completedPass(initial, passer!.id, receiver!.id);
    const ready = {
      ...completed,
      time: completed.lastPassDiagnostic.resolvedAt,
      ball: {
        ...initial.ball,
        x: receiver!.position.x,
        y: receiver!.position.y,
        ownerId: receiver!.id,
      },
    };
    const shot = resolveCanonicalShot(ready, {
      type: 'shot',
      actorId: receiver!.id,
      target: { x: 105, y: 34 },
      intent: 'driven',
      contact: 'first_time',
    });
    const released = { ...ready, ball: { ...ready.ball, shot } };
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, released);
    expect(statistics.players.find((p) => p.playerId === receiver!.id)).toMatchObject({
      touches: 1,
      passesReceived: 1,
      shots: 1,
    });
    const finished = {
      ...released,
      time: ready.time + 1,
      lastShot: { ...shot, outcome: 'goal' as const },
      ball: { x: 105, y: 34 },
    };
    const resolved = observePlayerMatchStats(statistics, released, finished);
    expect(resolved.players.find((p) => p.playerId === receiver!.id)).toMatchObject({
      touches: 1,
      shots: 1,
      shotsOnTarget: 1,
      goals: 1,
    });
    expect(observePlayerMatchStats(resolved, finished, finished)).toEqual(resolved);
  });

  it('records failed-control contact but never a completed reception', () => {
    const initial = state('failed-contact');
    const receiver = initial.players.find((p) => p.team === 'away')!;
    const next = {
      ...initial,
      time: initial.time + 1,
      lastReceptionOutcome: {
        receiverId: receiver.id,
        kind: 'failed_control' as const,
        contactPoint: receiver.position,
      },
    };
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, next);
    expect(statistics.players.find((p) => p.playerId === receiver.id)).toMatchObject({
      touches: 1,
      passesReceived: 0,
    });
  });

  it('counts separate failed receptions at the same point after preparation has been cleared', () => {
    const initial = state('pr150-repeated-failed-contact');
    const [passer, receiver] = initial.players.filter((player) => player.team === 'home');
    const contactPoint = { ...receiver!.position };
    const pass = completedPass(initial, passer!.id, receiver!.id).lastPassDiagnostic;
    const failed: TacticalMatchState = {
      ...initial,
      time: 1,
      ball: { ...contactPoint },
      lastPassDiagnostic: {
        ...pass,
        actualContactPoint: contactPoint,
        finalResult: 'technical_error',
        receptionOutcome: 'failed_control',
      },
      lastReceptionOutcome: { receiverId: receiver!.id, kind: 'failed_control', contactPoint },
    };
    delete failed.onBallPreparation;
    const first = observePlayerMatchStats(createMatchStatistics(initial), initial, failed);
    const failedAgain: TacticalMatchState = {
      ...failed,
      time: 2,
      lastPassDiagnostic: {
        ...failed.lastPassDiagnostic!,
        passId: 'another-failed-reception',
        releasedAt: 1.2,
        resolvedAt: 2,
      },
    };
    const second = observePlayerMatchStats(first, failed, failedAgain);
    expect(second.players.find((player) => player.playerId === receiver!.id)?.touches).toBe(2);
    expect(observePlayerMatchStats(second, failedAgain, structuredClone(failedAgain))).toEqual(
      second,
    );
    const recovered = structuredClone(failedAgain);
    recovered.time += 0.025;
    recovered.ball.ownerId = receiver!.id;
    const third = observePlayerMatchStats(second, failedAgain, recovered);
    expect(third.players.find((player) => player.playerId === receiver!.id)?.touches).toBe(3);
  });

  it('counts a substep keeper catch once when ownership also changes at the tick boundary', () => {
    const initial = state('keeper-contact-once');
    const keeper = initial.players.find(
      (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    const next = {
      ...initial,
      time: 1,
      ball: { ...keeper.position, ownerId: keeper.id, lastTouchPlayerId: keeper.id },
      lastBallContact: {
        kind: 'goalkeeper' as const,
        playerId: keeper.id,
        point: { ...keeper.position, z: 1 },
        segmentFraction: 0.3,
        at: 0.98,
        preContactSpeed: 15,
        postContactSpeed: 0,
      },
    };
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, next);
    expect(statistics.players.find((p) => p.playerId === keeper.id)?.touches).toBe(1);
    expect(observePlayerMatchStats(statistics, next, next)).toEqual(statistics);
  });

  it('requires physical contact evidence before crediting a claimed pass completion', () => {
    const initial = state('missing-pass-contact');
    const [passer, receiver] = initial.players.filter((p) => p.team === 'home');
    const completed = completedPass(initial, passer!.id, receiver!.id);
    const { actualContactPoint: _contact, ...diagnostic } = completed.lastPassDiagnostic;
    void _contact;
    const next = { ...completed, lastPassDiagnostic: diagnostic };
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, next);
    expect(statistics.players.find((p) => p.playerId === receiver!.id)?.passesReceived).toBe(0);
    expect(statistics.passingNetwork[0]?.completed).toBe(0);
  });

  it('counts a carry intent once across copied snapshots and subsequent off-ball decisions', () => {
    const initial = state('carry-event-once');
    const actor = initial.players.find((p) => p.id === initial.ball.ownerId)!;
    const carry = resolveMatchAction(initial, {
      type: 'carry',
      actorId: actor.id,
      target: { x: 65, y: 34 },
    });
    const statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, carry);
    expect(statistics.players.find((p) => p.playerId === actor.id)?.carries).toBe(1);
    const copied = structuredClone(carry);
    const repeated = observePlayerMatchStats(statistics, carry, copied);
    expect(repeated.players.find((p) => p.playerId === actor.id)?.carries).toBe(1);
    const after = { ...copied, decisionIndex: copied.decisionIndex + 1 };
    delete after.ballCarrierIntent;
    expect(
      observePlayerMatchStats(repeated, copied, after).players.find((p) => p.playerId === actor.id)
        ?.carries,
    ).toBe(1);
  });

  it('presentation projections cannot change contact statistics or canonical snapshots', () => {
    const initial = state('contact-presentation');
    const [passer, receiver] = initial.players.filter((p) => p.team === 'home');
    const next = completedPass(initial, passer!.id, receiver!.id);
    const withStats = {
      ...next,
      statistics: observePlayerMatchStats(createMatchStatistics(initial), initial, next),
    };
    const snapshot = structuredClone(withStats);
    matchStateToFrame(withStats);
    matchStateToFrame(withStats);
    expect(withStats).toEqual(snapshot);
  });
});

describe('assist observation', () => {
  it('attributes one assist after normal scorer possession and never double counts the goal', () => {
    const initial = state('assist-once');
    const scorer = initial.players.find(
      (player) => player.team === 'home' && player.id !== initial.ball.ownerId,
    )!;
    const passer = initial.players.find(
      (player) => player.team === scorer.team && player.id !== scorer.id,
    )!;
    const received = completedPass(initial, passer.id, scorer.id);
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const goal = {
      ...received,
      lastShot: {
        shotId: 'assist-goal',
        shooterId: scorer.id,
        context: 'open_play' as const,
        distance: 15,
        angle: 1,
        pressure: 0,
        blockingDefenders: 0,
        baseXg: 0.3,
        effectiveScoringExpectation: 0.3,
        shooterExecutionQuality: 0.8,
        intendedTarget: { horizontal: 0, vertical: 0.3 },
        actualTarget: { horizontal: 0, vertical: 0.3 },
        error: { horizontal: 0, vertical: 0 },
        speed: 24,
        classification: 'on_target' as const,
        outcome: 'goal' as const,
      },
    };
    statistics = observePlayerMatchStats(statistics, received, goal);
    statistics = observePlayerMatchStats(statistics, goal, goal);
    expect(statistics.players.find((entry) => entry.playerId === passer.id)?.assists).toBe(1);
    expect(statistics.observedAssistGoalIds).toEqual(['assist-goal']);
  });

  it('invalidates the provider after controlled opponent possession', () => {
    const initial = state('assist-turnover');
    const home = initial.players.filter((player) => player.team === 'home');
    const away = initial.players.find((player) => player.team === 'away')!;
    const received = completedPass(initial, home[0]!.id, home[1]!.id);
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const turnover = {
      ...received,
      ball: { ...received.ball, ownerId: away.id },
      possessionTeam: 'away' as const,
      lastPossessionChange: {
        at: received.time + 1,
        from: 'home' as const,
        to: 'away' as const,
        cause: 'interception' as const,
      },
    };
    statistics = observePlayerMatchStats(statistics, received, turnover);
    expect(statistics.assistCandidate).toBeUndefined();
  });
});
