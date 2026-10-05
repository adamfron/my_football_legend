// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { createPresentationRuntimeTelemetry } from './matchPresentation';
import { CanonicalParticipationTracker, projectCanonicalMatchSanity } from './canonicalMatchSanity';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const session = createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'sanity',
    control: { mode: 'spectator' },
  });
  const midfielder = session.home.players.find(
    (player) => player.profile.primaryPosition === 'central_midfielder',
  )!;
  return createTacticalMatch(
    createSingleMatchSession(world, {
      ...session.setup,
      control: {
        mode: 'player',
        clubId: session.home.club.id,
        footballerId: midfielder.footballerId,
        forceIntoXI: false,
      },
    }),
  );
};
const increment = (
  state: TacticalMatchState,
  changes: Record<string, number>,
): TacticalMatchState => ({
  ...state,
  statistics: {
    ...state.statistics!,
    players: state.statistics!.players.map((player) =>
      player.playerId === state.controlledFootballerId
        ? {
            ...player,
            ...Object.fromEntries(
              Object.entries(changes).map(([key, amount]) => [
                key,
                Number(player[key as keyof typeof player]) + amount,
              ]),
            ),
          }
        : player,
    ),
  },
});

describe('PR152 cheap whole-match canonical sanity', () => {
  it('partitions possession starts without turning continuous carries/passes into extra touches', () => {
    const initial = fixture();
    const tracker = new CanonicalParticipationTracker();
    const received = increment(initial, { touches: 1, passesReceived: 1, distanceCovered: 2 });
    tracker.observe(initial, received, true);
    const carried = increment(received, { carries: 1, distanceCovered: 6, sprintDistance: 2 });
    tracker.observe(received, carried, true);
    tracker.markVisiblePlayerInvolvement();
    const released = increment(carried, { passesAttempted: 1 });
    tracker.observe(carried, released, false);
    tracker.observe(released, released, false);
    tracker.beginHiddenSequence();
    const intercepted = increment(released, { touches: 1, interceptions: 1, possessionWon: 1 });
    tracker.observe(released, intercepted, false);
    expect(tracker.snapshot()).toEqual({
      defensiveInvolvementCoverage: 'complete',
      hidden: {
        possessionEpisodes: 1,
        passesReceived: 1,
        passesAttempted: 0,
        carries: 1,
        shots: 0,
        defensiveInvolvements: 0,
        distanceMetres: 8,
        sprintDistanceMetres: 2,
      },
      visiblePossessionEpisodes: 1,
      visibleEpisodesInvolvingPlayer: 2,
    });
    const report = projectCanonicalMatchSanity(
      intercepted,
      createPresentationRuntimeTelemetry(),
      tracker.snapshot(),
    );
    expect(report?.controlled?.possessionEpisodes).toBe(2);
    expect(report?.controlled?.presentationCoverage?.hidden.possessionEpisodes).toBe(1);
  });

  it('retains canonical totals without detailed observation and derives old snapshot award facts', () => {
    const initial = fixture();
    const changed = increment(initial, {
      touches: 7,
      passesAttempted: 6,
      passesReceived: 5,
      carries: 7,
      distanceCovered: 4300,
      minutesPlayed: 45,
    });
    const legacy: TacticalMatchState = {
      ...changed,
      time: 2700,
      statistics: {
        ...changed.statistics!,
        observedRestartIds: [
          `${changed.seed}:restart:10:home:goal_kick`,
          `${changed.seed}:restart:20:away:penalty`,
          `${changed.seed}:restart:30:home:kick_off`,
        ],
        observedPossessionEvents: ['1:home:away:interception', '2:away:home:claim'],
      },
    };
    // This fixture deliberately models a pre-PR152 serialized team-accounting object.
    for (const accounting of Object.values(legacy.statistics!.teamAccounting!)) {
      for (const key of ['goalKicks', 'penalties', 'kickOffs', 'possessionChanges'])
        delete (accounting as Record<string, number>)[key];
    }
    for (const player of legacy.statistics!.players) {
      for (const key of ['looseBallRecoveries', 'blocks', 'duelsWon'])
        delete (player as unknown as Record<string, unknown>)[key];
    }
    const presentation = createPresentationRuntimeTelemetry();
    presentation.humanDecisionPromptsShown = 15;
    const report = projectCanonicalMatchSanity(legacy, presentation);
    expect(report).toMatchObject({
      controlled: {
        possessionEpisodes: 7,
        passesReceived: 5,
        passesAttempted: 6,
        minutes: 45,
        distanceMetres: 4300,
        humanDecisionPrompts: 15,
        presentationCoverage: null,
        defense: { looseBallRecoveries: null, blocks: null, duelsWon: null },
      },
      teams: {
        home: { possessionChanges: 1, restarts: { goalKicks: 1, kickOffs: 1 } },
        away: { possessionChanges: 1, restarts: { penalties: 1 } },
      },
      ratios: {
        humanPromptsPer90: 30,
        canonicalPlayerPossessionsPerHumanPrompt: 7 / 15,
        penaltiesPer90: 2,
      },
    });
    expect(
      report?.warnings.some((warning) => warning.code === 'midfielder_running_without_possession'),
    ).toBe(true);
    expect(
      legacy.statistics?.players.find((player) => player.playerId === legacy.controlledFootballerId)
        ?.touches,
    ).toBe(7);
  });

  it('reports unavailable data as null and preserves undefined ratios at zero duration/denominators', () => {
    const initial = fixture();
    expect(projectCanonicalMatchSanity(initial)?.ratios).toMatchObject({
      humanPromptsPer90: null,
      controlledPlayerTouchShare: null,
      foulsPer90: null,
      canonicalPlayerPossessionsPerHumanPrompt: null,
    });
    const withoutStatistics = { ...initial };
    delete withoutStatistics.statistics;
    expect(projectCanonicalMatchSanity(withoutStatistics)).toBeNull();
  });
});
