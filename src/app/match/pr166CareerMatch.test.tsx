import { startFixtureMatch } from '../../core/matchEngine';
import { getCurrentFixture } from '../../core/careerWeeks';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from '../../core/playerCreator';
import { advanceCareerFlow } from '../../core/careerFlow';
import { createCareerMatchInput, startCareerMatch } from '../../core/careerMatchContract';
import { enforceMinimumPlayers } from '../../core/matchSimulation/matchRules';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { CareerState } from '../../types/domain';
import { MatchGame } from './MatchGame';

const runtime = vi.hoisted(() => ({
  props: undefined as
    | undefined
    | {
        session: unknown;
        onComplete(state: TacticalMatchState): void;
        onSimulateRemainder(state: TacticalMatchState, unselectedDecision: boolean): boolean;
        initialState: TacticalMatchState;
      },
  starts: 0,
}));
vi.mock('./TacticalMatchSandbox', () => ({
  RunningLabGuard: (props: typeof runtime.props) => {
    if (runtime.props?.session !== props?.session) runtime.starts++;
    runtime.props = props;
    return <p>Wspólny runtime kanoniczny</p>;
  },
}));
const world = createCanonicalWorldDatabase();
beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
vi.mock('../../core/worldDatabase', async (original) => ({
  ...(await original<object>()),
  loadWorldDatabase: async () => world,
}));
const career = () => {
  const initial = advanceCareerFlow(
    createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'UI',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'central_midfielder',
          heightCm: 178,
          weightKg: 70,
          seed: 'pr166-ui',
        },
        'pr166-ui',
        0,
      ),
      'pr166-ui',
      world,
    ),
  );
  return startFixtureMatch(initial, getCurrentFixture(initial)!);
};

describe('PR166 career runtime save transaction', () => {
  it('offers a lightweight per-fixture choice and retries a failed summary save without starting 3D', async () => {
    const source = career(),
      starts = runtime.starts,
      container = document.createElement('div'),
      root = createRoot(container);
    const saved: CareerState[] = [];
    const commit = vi.fn(async (next: CareerState) => {
      saved.push(next);
      return saved.length > 1;
    });
    await act(async () => root.render(<MatchGame career={source} onCareer={commit} />));
    expect(container.textContent).toContain('Rozegraj mecz 3D');
    const simulate = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Symuluj mecz',
    )!;
    await act(async () => {
      simulate.click();
      simulate.click();
    });
    expect(container.querySelector('[role=alert]')?.textContent).toBe(
      'Wynik nie został zapisany. Ponów zapis tego samego wyniku.',
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(runtime.starts).toBe(starts);
    expect(saved[0]!.player.matchPresentation).toBe(source.player.matchPresentation);
    expect(source.activeMatch).toBeTruthy();
    expect(saved[0]!.activeMatch).toBeUndefined();
    const retry = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Ponów zapis wyniku',
    )!;
    await act(async () => retry.click());
    expect(saved[1]).toBe(saved[0]);
    expect(runtime.starts).toBe(starts);
    await act(async () => root.unmount());
  });

  it('returns from preflight without resolving the fixture', async () => {
    const source = career(),
      commit = vi.fn(async (next: CareerState) => Boolean(next));
    const container = document.createElement('div'),
      visible = createRoot(container);
    await act(async () => visible.render(<MatchGame career={source} onCareer={commit} />));
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Wróć do kariery')!
        .click(),
    );
    const returned = commit.mock.calls[0] as unknown as [CareerState];
    expect(returned[0].leagueSeason).toBe(source.leagueSeason);
    expect(returned[0].seasonParticipation).toBe(source.seasonParticipation);
    await act(async () => {
      visible.unmount();
    });
  });

  it('freezes and retains a combined result when storage fails, retries it and rejects repeated handoffs', async () => {
    const source = career(),
      container = document.createElement('div'),
      root = createRoot(container),
      saved: CareerState[] = [];
    let release: ((value: boolean) => void) | undefined;
    const commit = vi.fn((next: CareerState) => {
      saved.push(next);
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });
    await act(async () => root.render(<MatchGame career={source} onCareer={commit} />));
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Rozegraj mecz 3D')!
        .click();
      await vi.dynamicImportSettled();
    });
    const props = runtime.props!,
      state = structuredClone(props.initialState);
    state.time = 3780;
    state.status = 'second_half';
    state.score = { home: 2, away: 1 };
    state.timekeeping = {
      period: 'second_half',
      periodStartedAt: 2700,
      nominalEndAt: 5400,
      qualifyingLostSeconds: 0,
      additionalLostAfterAnnouncement: 0,
      requiredEndAt: 5400,
    };
    state.statistics!.observedThrough = state.time;
    state.statistics!.players = state.statistics!.players.map((p) => ({ ...p, minutesPlayed: 63 }));
    await act(async () => {
      expect(props.onSimulateRemainder(state, true)).toBe(true);
      expect(props.onSimulateRemainder(state, true)).toBe(false);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    await act(async () => release!(false));
    expect(container.textContent).toContain('do ponowienia zapisu');
    expect(container.textContent).toContain(
      'Indywidualne statystyki akcji obejmują rozegrany fragment',
    );
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Ponów zapis wyniku')!
        .click(),
    );
    expect(saved[1]).toEqual(saved[0]);
    await act(async () => release!(true));
    await act(async () => root.unmount());
    expect(props.onSimulateRemainder(state, true)).toBe(false);
  });

  it('blocks non-terminal/double/stale callbacks, retains a failed result and retries without resetting football', async () => {
    const source = career(),
      input = createCareerMatchInput(source, world),
      initial = startCareerMatch(input);
    const departing = initial.players.filter((p) => p.team === 'home').slice(0, 5);
    const terminal = enforceMinimumPlayers({
      ...initial,
      players: initial.players.filter((p) => !departing.includes(p)),
      departedPlayers: departing,
    });
    const container = document.createElement('div'),
      root = createRoot(container);
    let release: ((success: boolean) => void) | undefined;
    const saves: CareerState[] = [];
    const commit = vi.fn((next: CareerState) => {
      saves.push(next);
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });
    await act(async () => root.render(<MatchGame career={source} onCareer={commit} />));
    const start = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Rozegraj mecz 3D',
    )!;
    expect(start).toBeTruthy();
    await act(async () => {
      start.click();
      await vi.dynamicImportSettled();
    });
    const session = runtime.props!.session;
    const stale = runtime.props!.onComplete;
    await act(async () => runtime.props!.onComplete(initial));
    expect(commit).not.toHaveBeenCalled();
    await act(async () => {
      runtime.props!.onComplete(terminal);
      runtime.props!.onComplete(terminal);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    await act(async () => release!(false));
    expect(container.textContent).toContain('do ponowienia zapisu');
    expect(runtime.props!.session).toBe(session);
    await act(async () => runtime.props!.onComplete(terminal));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(saves[1]).toEqual(saves[0]);
    await act(async () => release!(true));
    await act(async () => root.unmount());
    await act(async () => stale(terminal));
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
