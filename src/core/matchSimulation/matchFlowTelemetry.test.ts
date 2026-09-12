import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import {
  createMatchFlowTelemetry,
  assertTelemetryInvariants,
  observeMatchFlow,
  positioningSampleSchema,
  recordDecisionOpportunity,
  recordDecisionSelection,
  sampleCanonicalPositioning,
} from './matchFlowTelemetry';

describe('session benchmark observations', () => {
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
    ).toThrow(/passing edge/);
  });
});
