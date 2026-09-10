import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import {
  createMatchFlowTelemetry,
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
});
