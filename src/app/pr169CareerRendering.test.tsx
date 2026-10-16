// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { createPr167Career } from '../../scripts/pr167Fixtures';
import { generateSummerWindowOffers } from '../core/professionalClubs';
import { SeasonEndSummary } from './CareerApp';
import { HistoryView } from './career/HistoryView';
import { CareerMatchDetails } from '../components/CareerMatchDetails';
import type { CareerState } from '../types/domain';

const completed = () => {
  const c = createPr167Career(true, 'pr169-ui');
  const state: CareerState = {
    ...c,
    activeMatch: undefined,
    leagueSeason: { ...c.leagueSeason!, completed: true },
    seasonOutcome: {
      finalPosition: 8,
      champion: false,
      competitionType: 'professional',
      leagueOutcome: 'stayed',
    },
    seasonParticipation: c.seasonParticipation!.map((r) => ({
      ...r,
      fixtureStatus: 'completed',
      status: 'starter',
      minutes: 90,
      started: true,
    })),
    currentDate: `${c.currentSeason + 1}-06-30`,
  };
  state.professionalOffers = generateSummerWindowOffers(state);
  return state;
};
describe('PR169 actionable renewal UI', () => {
  it('reports invalid renewal dates instead of an apparent successful click', async () => {
    const c = completed(),
      renewal = c.professionalOffers!.find((o) => o.offerType === 'renewal')!;
    renewal.contract.startDate = '2099-07-01';
    const host = document.createElement('div'),
      root = createRoot(host),
      commit = vi.fn(async () => true);
    await act(async () => root.render(<SeasonEndSummary career={c} onCareer={commit} />));
    expect(host.textContent).toContain('Oferta dotyczy innego okna kontraktowego.');
    const accept = host.querySelector<HTMLButtonElement>('.contract-proposal button')!;
    await act(async () => accept.click());
    expect(commit).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('retains the original career after save failure, permits retry and locks repeated clicks', async () => {
    const c = completed(),
      original = structuredClone(c),
      host = document.createElement('div'),
      root = createRoot(host);
    let release!: (value: boolean) => void;
    const commit = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          release = done;
        }),
    );
    await act(async () => root.render(<SeasonEndSummary career={c} onCareer={commit} />));
    const accept = host.querySelector<HTMLButtonElement>('.contract-proposal button')!;
    await act(async () => {
      accept.click();
      accept.click();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    await act(async () => release(false));
    expect(host.textContent).toContain('Nie udało się zapisać decyzji');
    expect(c).toEqual(original);
    await act(async () => accept.click());
    expect(commit).toHaveBeenCalledTimes(2);
    const first = commit.mock.calls[0] as unknown as CareerState[],
      second = commit.mock.calls[1] as unknown as CareerState[];
    expect(second[0]).toEqual(first[0]);
    await act(async () => release(true));
    await act(async () => root.unmount());
  });
  it('opens historical participation with no mutation, settlement or technical identifiers', async () => {
    const c = completed(),
      before = structuredClone(c),
      host = document.createElement('div'),
      root = createRoot(host);
    await act(async () =>
      root.render(
        <>
          <HistoryView career={c} />
          <CareerMatchDetails record={c.seasonParticipation![0]!} playerId={c.player.id} />
        </>,
      ),
    );
    for (const details of host.querySelectorAll('details')) details.open = true;
    expect(c).toEqual(before);
    expect(host.textContent).not.toMatch(/Kanoniczny zapis|first_senior|senior_debut/);
    expect(host.querySelector('.history-controls select')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
