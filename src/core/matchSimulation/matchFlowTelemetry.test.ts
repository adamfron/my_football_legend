import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, FIXED_MATCH_DT } from './matchSimulation';
import {
  createMatchFlowTelemetry,
  assertTelemetryInvariants,
  observeMatchFlow,
  matchFlowTelemetrySchema,
  positioningSampleSchema,
  recordDecisionOpportunity,
  recordDecisionSelection,
  sampleCanonicalPositioning,
} from './matchFlowTelemetry';
import { deriveTeamShapeMetrics } from './teamShapeMetrics';
import type { TacticalMatchState } from './matchState';
import { observePlayerMatchStats } from './playerMatchStats';

const createFlowFixture = (seed = 'flow-performance-regression') => {
  const world = createCanonicalWorldDatabase();
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
};

describe('session benchmark observations', () => {
  it('observes the actual queued reception and reconciles a completion-only physical network edge', () => {
    const before = createFlowFixture('pr149-flow-actual-reception');
    const passer = before.players.find((player) => player.id === before.ball.ownerId)!;
    const [intended, actual] = before.players.filter(
      (player) => player.team === passer.team && player.id !== passer.id,
    );
    passer.position = { x: 40, y: 34 };
    intended!.position = { x: 60, y: 34 };
    actual!.position = { x: 70, y: 34 };
    before.controlledFootballerId = actual!.id;
    const pass = {
      passId: 'incoming-intended-pass',
      passerId: passer.id,
      intendedReceiverId: intended!.id,
      releasedAt: 1,
      receiverPositionAtRelease: intended!.position,
      receiverVelocityAtRelease: { x: 1, y: 0 },
      predictedReceptionPoint: intended!.position,
      awarenessDelay: 0.1,
      receiverArrivalEstimate: 0.5,
      bestDefenderArrivalEstimate: 0.8,
      leadDistance: 0,
    };
    const release: TacticalMatchState = {
      ...before,
      time: 1,
      lastPassDiagnostic: pass,
      latestAction: {
        type: 'pass',
        actorId: passer.id,
        receiverId: intended!.id,
        target: intended!.position,
        intent: 'support',
      },
    };
    release.statistics = observePlayerMatchStats(before.statistics!, before, release);
    let telemetry = observeMatchFlow(createMatchFlowTelemetry(), before, release);
    const received: TacticalMatchState = {
      ...release,
      time: 2,
      decisionIndex: 2,
      lastResolvedPass: {
        ...pass,
        actualReceiverId: actual!.id,
        actualContactPoint: actual!.position,
        resolvedAt: 2,
        finalResult: 'completed',
        receptionOutcome: 'clean_control',
      },
      lastPassDiagnostic: {
        ...pass,
        passId: 'queued-outgoing-pass',
        passerId: actual!.id,
        releasedAt: 2,
      },
      latestAction: {
        type: 'pass',
        actorId: actual!.id,
        receiverId: intended!.id,
        target: intended!.position,
        intent: 'support',
      },
    };
    received.statistics = observePlayerMatchStats(release.statistics!, release, received);
    telemetry = observeMatchFlow(telemetry, release, received);
    expect(telemetry).toMatchObject({
      passesAttempted: 2,
      passesCompleted: 1,
      receptions: { clean: 1 },
      controlled: { passesReceived: 1 },
      threatFlow: { progressiveReceptions: 1, resultingFinalThirdEntries: 1 },
    });
    expect(telemetry.passOutcomes.find((outcome) => outcome.passId === pass.passId)?.outcome).toBe(
      'completed',
    );
    expect(telemetry.passingNetwork.find((edge) => edge.receiverId === actual!.id)).toMatchObject({
      attempted: 0,
      completed: 1,
    });
    expect(() => assertTelemetryInvariants(telemetry)).not.toThrow();
    const repeated = observeMatchFlow(telemetry, received, structuredClone(received));
    expect(repeated.receptions.clean).toBe(1);
    expect(repeated.controlled.passesReceived).toBe(1);
    expect(repeated.threatFlow.progressiveReceptions).toBe(1);
  });
  it('exports canonical shape/support data and records interaction events at their source', () => {
    const world = createCanonicalWorldDatabase();
    const controlledId = world.clubs[0]!.squadPlayerIds?.[0];
    if (!controlledId) throw new Error('Expected a controlled player fixture.');
    const session = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'benchmark-observation',
      control: {
        mode: 'player',
        clubId: world.clubs[0]!.id,
        footballerId: controlledId,
        forceIntoXI: true,
      },
    });
    const sample = sampleCanonicalPositioning(createTacticalMatch(session));
    expect(() => positioningSampleSchema.parse(sample)).not.toThrow();
    expect(sample.home.centroid).toBeDefined();
    expect(sample.ball.ownerId).toBeTruthy();

    const telemetry = createMatchFlowTelemetry();
    recordDecisionOpportunity(telemetry, 'on_ball', true);
    recordDecisionOpportunity(telemetry, 'loose_ball');
    recordDecisionSelection(telemetry, 'human');
    recordDecisionSelection(telemetry, 'dev_ai');
    recordDecisionSelection(telemetry, 'autonomous');
    expect(telemetry.controlled).toMatchObject({
      decisionOpportunities: { on_ball: 1, loose_ball: 1 },
      humanSelectedActions: 1,
      devAiSelections: 1,
      autonomousRoutineActions: 1,
      preventedByEscalation: 1,
    });
  });

  it('counts each immutable pass episode and its result exactly once', () => {
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pass-episode-integrity',
      control: { mode: 'spectator' },
    });
    const before = createTacticalMatch(session);
    const passer = before.players.find((player) => player.id === before.ball.ownerId)!;
    const receiver = before.players.find(
      (player) => player.team === passer.team && player.id !== passer.id,
    )!;
    const diagnostic = {
      passId: 'pass-episode-1',
      passerId: passer.id,
      intendedReceiverId: receiver.id,
      releasedAt: 1,
      receiverPositionAtRelease: receiver.position,
      receiverVelocityAtRelease: { x: 1, y: 0 },
      predictedReceptionPoint: receiver.position,
      awarenessDelay: 0.1,
      receiverArrivalEstimate: 0.5,
      bestDefenderArrivalEstimate: 0.8,
      leadDistance: 2,
    };
    const released = { ...before, time: 1, lastPassDiagnostic: diagnostic };
    let telemetry = observeMatchFlow(createMatchFlowTelemetry(), before, released);
    telemetry = observeMatchFlow(telemetry, released, { ...released });
    const resolved = {
      ...released,
      time: 2,
      lastPassDiagnostic: {
        ...diagnostic,
        resolvedAt: 2,
        finalResult: 'completed' as const,
        receptionOutcome: 'directional_control' as const,
        actualContactPoint: receiver.position,
      },
    };
    telemetry = observeMatchFlow(telemetry, released, resolved);
    telemetry = observeMatchFlow(telemetry, resolved, { ...resolved, time: 3 });

    expect(telemetry).toMatchObject({
      passesAttempted: 1,
      passesCompleted: 1,
      passesToMovingReceiver: 1,
      movingReceiverCompletions: 1,
      movingReceiverFailures: 0,
    });
    expect(telemetry.passingNetwork[0]).toMatchObject({ attempted: 1, completed: 1 });
    expect(() => assertTelemetryInvariants(telemetry)).not.toThrow();
    expect(() =>
      assertTelemetryInvariants({
        ...telemetry,
        passingNetwork: [{ ...telemetry.passingNetwork[0]!, attempted: 1, completed: 3 }],
      }),
    ).toThrow(/passing network/);
    expect(() =>
      assertTelemetryInvariants({
        ...telemetry,
        canonicalMinutes: 1 / 60,
        possessionSpellDurations: [1.1],
      }),
    ).toThrow(/spell exceeds segment duration/);
  });

  it('shares growing histories on routine ticks without cloning or revalidating their contents', () => {
    const previous = { ...createFlowFixture(), time: 1 };
    const telemetry = createMatchFlowTelemetry();
    telemetry.observedPassAttemptIds = Array.from({ length: 10_000 }, (_, i) => `old:${i}`);
    telemetry.possessionSpellDurations = Array.from({ length: 10_000 }, () => 0.1);
    Object.freeze(telemetry.observedPassAttemptIds);
    Object.freeze(telemetry.possessionSpellDurations);
    Object.freeze(telemetry.possessionSpells);
    Object.freeze(telemetry.passOutcomes);
    Object.freeze(telemetry.ballHolds);
    const parse = vi.spyOn(matchFlowTelemetrySchema, 'parse');
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      let result = telemetry;
      for (let tick = 1; tick <= 40; tick++)
        result = observeMatchFlow(result, previous, {
          ...previous,
          time: previous.time + tick * FIXED_MATCH_DT,
        });
      expect(result.observedPassAttemptIds).toBe(telemetry.observedPassAttemptIds);
      expect(result.possessionSpellDurations).toBe(telemetry.possessionSpellDurations);
      expect(result.possessionSpells).toBe(telemetry.possessionSpells);
      expect(result.passOutcomes).toBe(telemetry.passOutcomes);
      expect(result.ballHolds).toBe(telemetry.ballHolds);
      expect(parse).not.toHaveBeenCalled();
      expect(clone).not.toHaveBeenCalled();
      expect(() => assertTelemetryInvariants(result)).not.toThrow();
    } finally {
      parse.mockRestore();
      clone.mockRestore();
    }
  });

  it('preserves earlier snapshots, branch independence and imported deduplication evidence', () => {
    const before = createFlowFixture();
    const passer = before.players.find((player) => player.id === before.ball.ownerId)!;
    const receiver = before.players.find(
      (player) => player.team === passer.team && player.id !== passer.id,
    )!;
    const diagnostic = {
      passId: 'branch-pass',
      passerId: passer.id,
      intendedReceiverId: receiver.id,
      releasedAt: 1,
      receiverPositionAtRelease: receiver.position,
      receiverVelocityAtRelease: { x: 1, y: 0 },
      predictedReceptionPoint: receiver.position,
      awarenessDelay: 0.1,
      receiverArrivalEstimate: 0.5,
      bestDefenderArrivalEstimate: 0.8,
      leadDistance: 2,
    };
    const released: TacticalMatchState = {
      ...before,
      time: 1,
      lastPassDiagnostic: diagnostic,
      latestAction: {
        type: 'pass',
        actorId: passer.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      },
    };
    const root = createMatchFlowTelemetry();
    const first = observeMatchFlow(root, before, released);
    const firstSerialized = JSON.stringify(first);
    Object.freeze(first.passingNetwork);
    Object.freeze(first.passingNetwork[0]);
    Object.freeze(first.passOutcomes);
    Object.freeze(first.passOutcomes[0]);
    const resolved: TacticalMatchState = {
      ...released,
      time: 2,
      lastPassDiagnostic: {
        ...diagnostic,
        finalResult: 'completed',
        resolvedAt: 2,
        receptionOutcome: 'clean_control',
        actualContactPoint: receiver.position,
      },
    };
    const completed = observeMatchFlow(first, released, resolved);
    expect(JSON.stringify(first)).toBe(firstSerialized);
    expect(completed.passOutcomes[0]!.outcome).toBe('completed');
    expect(first.passOutcomes[0]!.outcome).toBe('unclaimed');
    expect(completed.passingNetwork[0]!.completed).toBe(1);
    expect(first.passingNetwork[0]!.completed).toBe(0);
    const retried = observeMatchFlow(root, before, released);
    expect(retried).toEqual(first);
    const alternate = observeMatchFlow(first, released, resolved);
    expect(alternate).toEqual(completed);
    const imported = matchFlowTelemetrySchema.parse(JSON.parse(JSON.stringify(completed)));
    const observedAgain = observeMatchFlow(imported, resolved, { ...resolved, time: 3 });
    expect(observedAgain.passesAttempted).toBe(1);
    expect(observedAgain.passesCompleted).toBe(1);
    expect(() => assertTelemetryInvariants(observedAgain)).not.toThrow();
  });

  it('validates new evidence at insertion and still reports reversed action intervals', () => {
    const previous = createFlowFixture();
    const actor = previous.players[0]!;
    const receiver = previous.players[1]!;
    const telemetry = createMatchFlowTelemetry();
    telemetry.observerState.lastActionAt = 2;
    const next: TacticalMatchState = {
      ...previous,
      time: 1,
      latestAction: {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      },
    };
    expect(() => observeMatchFlow(telemetry, previous, next)).toThrow();
    expect(telemetry.actionTempoSamples).toHaveLength(0);
  });

  it('keeps occupancy episodes identical to the complete shape projection at geometric boundaries', () => {
    let previous = createFlowFixture();
    let telemetry = createMatchFlowTelemetry();
    const expected = {
      boxOccupationEpisodes: 0,
      penaltySpotOccupationEpisodes: 0,
      farPostOccupationEpisodes: 0,
      edgeSupportEpisodes: 0,
    };
    for (const ballY of [20, 34, 48]) {
      const next = {
        ...previous,
        time: previous.time + 1,
        ball: { ...previous.ball, y: ballY },
        players: previous.players.map((player, index) => ({
          ...player,
          position: {
            x:
              player.team === 'home'
                ? [83, 88.5, 94, 99][index % 4]!
                : [22, 16.5, 11, 6][index % 4]!,
            y: [7, 13.8, 20, 27, 34, 41, 48, 54.2, 61][index % 9]!,
          },
        })),
      };
      for (const side of ['home', 'away'] as const) {
        const beforeShape = deriveTeamShapeMetrics(previous, side);
        const afterShape = deriveTeamShapeMetrics(next, side);
        if (!beforeShape.boxAttackers && afterShape.boxAttackers) expected.boxOccupationEpisodes++;
        if (!beforeShape.penaltySpotAttackers && afterShape.penaltySpotAttackers)
          expected.penaltySpotOccupationEpisodes++;
        if (!beforeShape.farPostAttackers && afterShape.farPostAttackers)
          expected.farPostOccupationEpisodes++;
        if (!beforeShape.edgeOfBoxSupport && afterShape.edgeOfBoxSupport)
          expected.edgeSupportEpisodes++;
      }
      telemetry = observeMatchFlow(telemetry, previous, next);
      previous = next;
    }
    expect(telemetry).toMatchObject(expected);
  });
});
