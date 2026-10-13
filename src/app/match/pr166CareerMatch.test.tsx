// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('../../core/worldDatabase', async (original) => ({
  ...(await original<object>()),
  loadWorldDatabase: async () => world,
}));
const career = () =>
  advanceCareerFlow(
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

describe('PR166 career runtime save transaction', () => {
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
      (b) => b.textContent === 'Rozpocznij mecz 3D',
    )!;
    expect(start).toBeTruthy();
    await act(async () => start.click());
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
