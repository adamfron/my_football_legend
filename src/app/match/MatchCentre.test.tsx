import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../core/singleMatch';
import { createTacticalMatch } from '../../core/matchSimulation/matchSimulation';
import { DEFAULT_KITS } from './tacticalRenderer/model';
import { MatchCentre } from './MatchCentre';

const world = createCanonicalWorldDatabase();
const session = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr149-match-centre',
  control: { mode: 'spectator' },
});

describe('permanent Match Centre', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses canonical match time, unknown percentages and trustworthy team totals', () => {
    const state = createTacticalMatch(session);
    const actor = state.players.find((player) => player.team === 'home')!;
    const statistics = state.statistics!;
    const populated = {
      ...state,
      time: 82,
      statistics: {
        ...statistics,
        players: statistics.players.map((entry) =>
          entry.playerId === actor.id
            ? { ...entry, shots: 3, shotsOnTarget: 1, passesAttempted: 5, passesCompleted: 4 }
            : entry,
        ),
      },
    };
    act(() => root.render(<MatchCentre state={populated} session={session} kits={DEFAULT_KITS} />));
    expect(container.querySelector('.match-centre__clock')!.textContent).toContain('01:22');
    const rows = [...container.querySelectorAll('tr')];
    expect(
      rows.find((row) => row.querySelector('th[scope="row"]')?.textContent === 'Strzały')!
        .textContent,
    ).toBe('3Strzały0');
    expect(
      rows.find((row) => row.querySelector('th[scope="row"]')?.textContent === 'Posiadanie')!
        .textContent,
    ).toBe('—Posiadanie—');
    expect(
      rows.find((row) => row.querySelector('th[scope="row"]')?.textContent === 'Celność podań')!
        .textContent,
    ).toBe('80%Celność podań—');
  });

  it('retains the named dismissed actor and only offers available canonical event recordings', () => {
    const state = createTacticalMatch(session);
    const actor = state.players.find((player) => player.team === 'home')!;
    const red = {
      id: 'red-incident',
      replayKey: 'red-recording',
      at: 70,
      kind: 'red_card' as const,
      team: 'home' as const,
      actorId: actor.id,
    };
    const goal = {
      id: 'older-goal',
      replayKey: 'older-goal',
      at: 30,
      kind: 'goal' as const,
      team: 'away' as const,
      score: { home: 0, away: 1 },
    };
    const canonical = {
      ...state,
      time: 80,
      score: { home: 0, away: 1 },
      players: state.players.filter((player) => player.id !== actor.id),
      matchEvents: [goal, red],
    };
    const replay = vi.fn();
    act(() =>
      root.render(
        <MatchCentre
          state={canonical}
          session={session}
          kits={DEFAULT_KITS}
          canReplay={(key) => key === red.replayKey}
          onReplay={replay}
        />,
      ),
    );
    const events = container.querySelectorAll('li');
    expect(events).toHaveLength(2);
    expect(events[0]!.textContent).toContain(
      `${actor.profile.firstName} ${actor.profile.lastName}`,
    );
    expect(events[0]!.textContent).toContain('Czerwona kartka');
    expect(events[1]!.textContent).toContain('0–1');
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    act(() => buttons[0]!.click());
    expect(replay).toHaveBeenCalledWith(red.replayKey);
    expect(canonical.matchEvents).toEqual([goal, red]);
  });

  it('rounds complementary canonical possession percentages to a displayed total of 100%', () => {
    const state = createTacticalMatch(session);
    const statistics = state.statistics!;
    const accounting = statistics.teamAccounting!;
    const canonical = {
      ...state,
      statistics: {
        ...statistics,
        teamAccounting: {
          home: { ...accounting.home, possessionSeconds: 81 },
          away: { ...accounting.away, possessionSeconds: 119 },
        },
      },
    };
    act(() => root.render(<MatchCentre state={canonical} session={session} kits={DEFAULT_KITS} />));
    const row = [...container.querySelectorAll('tr')].find(
      (entry) => entry.querySelector('th[scope="row"]')?.textContent === 'Posiadanie',
    )!;
    expect([...row.querySelectorAll('td')].map((entry) => entry.textContent)).toEqual([
      '41%',
      '59%',
    ]);
  });
});
