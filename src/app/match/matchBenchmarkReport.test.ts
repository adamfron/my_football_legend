// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMatchFlowTelemetry } from '../../core/matchSimulation/matchFlowTelemetry';
import { createPresentationRuntimeTelemetry } from '../../core/matchSimulation/matchPresentation';
import { PlayerAgencyTracker } from '../../core/matchSimulation/playerAgency';
import { createSessionTelemetryReport, sessionTelemetryReportSchema } from './matchBenchmarkReport';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../core/singleMatch';
import { createTacticalMatch } from '../../core/matchSimulation/matchSimulation';
import { CanonicalParticipationTracker } from '../../core/matchSimulation/canonicalMatchSanity';

const fixture = () => {
  const presentation = createPresentationRuntimeTelemetry();
  presentation.humanDecisionPromptsShown = 66;
  presentation.episodesPresented = 20;
  return {
    canonicalSeconds: 2700,
    flow: createMatchFlowTelemetry(),
    agency: new PlayerAgencyTracker().snapshot(2700),
    positioning: [],
    presentation,
  };
};

describe('PR151 benchmark collection scope', () => {
  it('exports uncollected detailed metrics as null while retaining actual runtime prompts', () => {
    const report = createSessionTelemetryReport({
      ...fixture(),
      coverage: [{ mode: 'normal', startedAt: 0 }],
    });
    expect(report).toMatchObject({
      collectionScope: {
        detailedObservers: 'unavailable',
        detailedCanonicalSeconds: 0,
        unavailableReason: 'dev_observer_not_enabled',
        presentationRuntime: 'whole_presentation_session',
      },
      decisionTelemetry: null,
      playerAgency: null,
      matchFlowTelemetry: null,
      sampledPositioning: null,
      presentationRuntime: { humanDecisionPromptsShown: 66, episodesPresented: 20 },
    });
    expect(sessionTelemetryReportSchema.safeParse(report).success).toBe(true);
    expect(report.canonicalSanity).toBeNull();
  });

  it('exports cheap canonical participation in normal mode without claiming detailed observer coverage', () => {
    const world = createCanonicalWorldDatabase();
    const spectator = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'normal-summary',
      control: { mode: 'spectator' },
    });
    const player = spectator.home.players.find(
      (entry) => entry.profile.primaryPosition === 'central_midfielder',
    )!;
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        ...spectator.setup,
        control: {
          mode: 'player',
          clubId: spectator.home.club.id,
          footballerId: player.footballerId,
          forceIntoXI: false,
        },
      }),
    );
    const report = createSessionTelemetryReport({
      ...fixture(),
      state,
      participation: new CanonicalParticipationTracker().snapshot(),
      coverage: [{ mode: 'normal', startedAt: 0 }],
    });
    expect(report.collectionScope.detailedObservers).toBe('unavailable');
    expect(report.matchFlowTelemetry).toBeNull();
    expect(report.canonicalSanity?.controlled).toMatchObject({
      playerId: state.controlledFootballerId,
      humanDecisionPrompts: 66,
      possessionEpisodes: 0,
      presentationCoverage: { hidden: { possessionEpisodes: 0 } },
    });
  });

  it('preserves genuine measured zeros and identifies whole-session DEV collection', () => {
    const report = createSessionTelemetryReport({
      ...fixture(),
      coverage: [{ mode: 'dev', startedAt: 0 }],
    });
    expect(report.collectionScope.detailedObservers).toBe('whole_session');
    expect(report.collectionScope.unavailableReason).toBeNull();
    expect(report.decisionTelemetry?.humanSelectedActions).toBe(0);
    expect(report.playerAgency?.meaningfulHumanDecisions).toBe(0);
  });

  it('keeps collected observations after disabling DEV and records the partial interval', () => {
    const options = fixture();
    options.flow.controlled.humanSelectedActions = 3;
    const report = createSessionTelemetryReport({
      ...options,
      coverage: [
        { mode: 'normal', startedAt: 0, endedAt: 1200 },
        { mode: 'capture', startedAt: 1200, endedAt: 1800 },
        { mode: 'normal', startedAt: 1800 },
      ],
    });
    expect(report.collectionScope.detailedObservers).toBe('coverage_intervals_only');
    expect(report.collectionScope.detailedCanonicalSeconds).toBe(600);
    expect(report.decisionTelemetry?.humanSelectedActions).toBe(3);
    expect(report.collectionScope.observerCoverage.at(-1)?.endedAt).toBe(2700);
    expect(report.presentationRuntime.humanDecisionPromptsShown).toBe(66);
  });
});
