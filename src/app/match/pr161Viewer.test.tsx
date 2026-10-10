import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../core/singleMatch';
import { createTacticalMatch } from '../../core/matchSimulation/matchSimulation';
import { formatPeriodClock } from './matchTime';
import { advanceReplayViewer } from './replayViewer';
import { PlayerFitness } from './PlayerFitness';
import { ReplayControls } from './ReplayControls';

const world = createCanonicalWorldDatabase();
const initial = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'pr161-viewer',
    control: { mode: 'spectator' },
  }),
);

describe('PR161 viewer clock and condition', () => {
  it('seeks recorded time, pauses without a jump, changes speed and clamps at the final sample', () => {
    const before = JSON.stringify(initial);
    let cursor = { cursorMs: 72000, lastWallMs: 1000 };
    cursor = advanceReplayViewer(cursor, 2000, 80000, 0.5, true);
    expect(cursor.cursorMs).toBe(72500);
    cursor = advanceReplayViewer(cursor, 9000, 80000, 2, false);
    expect(cursor.cursorMs).toBe(72500);
    cursor = advanceReplayViewer(cursor, 10000, 80000, 2, true);
    expect(cursor.cursorMs).toBe(74500);
    expect(advanceReplayViewer(cursor, 20000, 80000, 2, true).cursorMs).toBe(80000);
    expect(JSON.stringify(initial)).toBe(before);
  });

  it('formats added time relative to the actual second-half start', () => {
    const state = {
      ...initial,
      status: 'second_half' as const,
      time: 5552,
      timekeeping: {
        period: 'second_half' as const,
        periodStartedAt: 2820,
        nominalEndAt: 5520,
        qualifyingLostSeconds: 60,
        additionalLostAfterAnnouncement: 0,
        requiredEndAt: 5580,
        minimumAnnouncedAddedSeconds: 60,
      },
    };
    expect(formatPeriodClock(state)).toBe('90+00:32');
    expect(formatPeriodClock(state, 5520 - 1)).toBe('89:59');
    expect(formatPeriodClock(state, 2700)).toBe('45:00');
  });

  it('shows independent real reserves and injury restrictions without mutation', () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const base = initial.players[0]!;
    const player = {
      ...base,
      fitness: { ...base.fitness!, longTermCapacity: 0.8, burstReadiness: 0.2 },
      injury: {
        id: 'injury-fixture',
        playerId: base.id,
        at: 0,
        status: 'playable' as const,
        mechanism: 'contact' as const,
        injuryType: 'impact' as const,
        recoveryDays: 1,
        assessmentRequired: false,
      },
    };
    const before = JSON.stringify(player);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<PlayerFitness player={player} />));
    const meters = container.querySelectorAll('meter');
    expect([...meters].map((meter) => meter.value)).toEqual([0.8, 0.2]);
    expect(container.textContent).toContain('Uraz ogranicza ruch');
    expect(JSON.stringify(player)).toBe(before);
    act(() => root.unmount());
  });

  it('keeps replay pause/restart/speed/live controls independent of football decisions', () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const callbacks = { onPlaying: vi.fn(), onSpeed: vi.fn(), onRestart: vi.fn(), onLive: vi.fn() };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <ReplayControls title="Obrona bramkarza" eventAt={79} playing speed={0.5} {...callbacks} />,
      ),
    );
    expect(container.textContent).toContain('Obrona bramkarza · 01:19');
    act(() => container.querySelectorAll('button')[0]!.click());
    expect(callbacks.onPlaying).toHaveBeenCalledWith(false);
    act(() => container.querySelectorAll('button')[1]!.click());
    expect(callbacks.onRestart).toHaveBeenCalledOnce();
    const select = container.querySelector('select')!;
    act(() => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(callbacks.onSpeed).toHaveBeenCalledWith(2);
    act(() => container.querySelectorAll('button')[2]!.click());
    expect(callbacks.onLive).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
