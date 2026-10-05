// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { PlayerAgencyTracker } from './playerAgency';
import type { projectPlayerAgency } from './playerDecision';
import { projectPlayerActiveTime } from './playerActiveMinutes';

const world = createCanonicalWorldDatabase();
const fixture = (minutesPlayed: number) => {
  const spectator = createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'active-agency',
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
  state.time = 2700;
  state.statistics!.players = state.statistics!.players.map((player) =>
    player.playerId === state.controlledFootballerId ? { ...player, minutesPlayed } : player,
  );
  return state;
};
const countFour = (tracker: PlayerAgencyTracker, state: ReturnType<typeof fixture>) => {
  for (let i = 0; i < 4; i++)
    tracker.observe(state, {
      probe: { candidate: true },
      opportunity: {
        id: `decision-${i}`,
        actorId: state.controlledFootballerId,
        kind: 'on_ball',
        triggerReason: 'meaningful_test',
      },
    } as ReturnType<typeof projectPlayerAgency>);
};

describe('active player agency rates', () => {
  it('uses dismissal exposure even when the full-half clock continues', () => {
    const state = fixture(45);
    const id = state.controlledFootballerId!;
    state.discipline = { [id]: { team: 'home', yellowCards: 2, sentOff: true, sentOffAt: 1416 } };
    state.players = state.players.filter((player) => player.id !== id);
    const tracker = new PlayerAgencyTracker();
    countFour(tracker, state);
    const report = tracker.snapshot(state.time, state);
    expect(report.activePlayerSeconds).toBe(1416);
    expect(report.decisionsPer45Minutes).toBeCloseTo(7.627118644, 8);
    expect(report.decisionsPer90Minutes).toBeCloseTo(15.254237288, 8);
    expect(report.rateBasis).toBe('active_player_minutes');
    expect(tracker.snapshot(5400).decisionsPer45Minutes).toBe(report.decisionsPer45Minutes);
  });

  it('respects cumulative substitute exposure and final exposure after the last candidate', () => {
    const state = fixture(6);
    const tracker = new PlayerAgencyTracker();
    countFour(tracker, state);
    expect(tracker.snapshot(state.time, state).decisionsPer45Minutes).toBe(30);
    const final = fixture(12);
    expect(tracker.snapshot(final.time, final).decisionsPer45Minutes).toBe(15);
  });

  it('never interprets an unobserved player as a full-half appearance', () => {
    const report = new PlayerAgencyTracker().snapshot(2700);
    expect(report.activeTimeSource).toBe('unavailable');
    expect(report.activePlayerSeconds).toBe(0);
    expect(report.decisionsPer45Minutes).toBe(0);
  });

  it('subtracts a substitute entry timestamp in the legacy roster-clock fallback', () => {
    const state = fixture(0);
    delete state.statistics;
    const player = state.players.find((entry) => entry.id === state.controlledFootballerId)!;
    player.activeSince = 1200;
    expect(projectPlayerActiveTime(state)).toEqual({
      seconds: 1500,
      source: 'legacy_active_roster_clock',
    });
  });
});
