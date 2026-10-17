// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../core/singleMatch';
import { createTacticalMatch, projectPlayerDecisionOpportunity } from '../../core/matchSimulation';
import { DecisionTargets } from './DecisionTargets';
import { MatchOccasion } from './MatchOccasion';
import { DEFAULT_KITS } from './tacticalRenderer/model';
const world = createCanonicalWorldDatabase();
beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
const spectator = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr170-hud',
  control: { mode: 'spectator' },
});
describe('PR170 accessible HUD', () => {
  it('uses canonical contextual targets, exposes pitch coordinates and emits only a presentation selection', async () => {
    const state = createTacticalMatch(spectator),
      actor = state.players.find(
        (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
      )!;
    delete state.restart;
    state.scenario = 'open_play';
    state.time = 60;
    state.controlledFootballerId = actor.id;
    state.playerAgencyEnabled = true;
    actor.position = { x: 99, y: 34 };
    actor.facingAngle = Math.PI / 2;
    state.ball = { ...actor.position, ownerId: actor.id };
    state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!.position = { x: 103, y: 34 };
    const opportunity = projectPlayerDecisionOpportunity(state);
    expect(opportunity).toBeDefined();
    if (!opportunity) throw Error('Meaningful close-range choice');
    const before = structuredClone(state),
      target = vi.fn(),
      host = document.createElement('div'),
      root = createRoot(host);
    await act(async () =>
      root.render(<DecisionTargets state={state} opportunity={opportunity} onTarget={target} />),
    );
    const selector = host.querySelector<HTMLSelectElement>('select')!;
    const options = [...selector.options].map((option) => option.value).filter(Boolean);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((option) => JSON.parse(option).kind === 'goal')).toBe(true);
    await act(async () => {
      selector.value = options[0]!;
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(target).toHaveBeenCalledWith(JSON.parse(options[0]!));
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(target).toHaveBeenLastCalledWith({ kind: 'space', point: { x: 52.5, y: 34 } });
    expect(state).toEqual(before);
    await act(async () => root.unmount());
  });
  it('dismisses a canonical transition without changing time, score, positions or invoking a commit', async () => {
    const state = createTacticalMatch(spectator),
      before = structuredClone(state),
      host = document.createElement('div'),
      root = createRoot(host);
    await act(async () =>
      root.render(<MatchOccasion state={state} session={spectator} kits={DEFAULT_KITS} />),
    );
    expect(host.textContent).toContain('ZACZYNAMY');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Pomiń oprawę"]')!.click(),
    );
    expect(host.textContent).toBe('');
    expect(state).toEqual(before);
    await act(async () => root.unmount());
  });
});
