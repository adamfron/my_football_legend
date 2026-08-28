// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { resolveRegularSeasonEvent } from '../core/events/regularSeasonEvents';
import { advanceCareerFlow } from '../core/careerFlow';
import { createCareerState, generateStartingPlayerProfile } from '../core/playerCreator';
import type { CareerState } from '../types/domain';
import { CareerWeekGame } from './App';
import { SeasonView } from './career/SeasonView';
import { CareerView } from './career/CareerView';

const initializedCareer = () =>
  advanceCareerFlow(
    createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Test',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'winger',
          heightCm: 175,
          weightKg: 68,
          seed: 'render-regression',
        },
        'render-regression',
        0,
      ),
      'render-regression',
    ),
  );

const renderWithoutThrowing = (view: React.ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  expect(() => act(() => root.render(view))).not.toThrow();
  act(() => root.unmount());
};

describe('canonical career season rendering', () => {
  it('keeps the table and timeline visible while swapping expanded summary cards', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<CareerView career={initializedCareer()} onCareer={() => undefined} />));

    expect(container.textContent).toContain('TABELA LIGOWA');
    expect(container.textContent).toContain('OŚ SEZONU');
    expect(container.querySelector('tr[aria-current="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain('GraZawodnikKlubSezonHistoria');

    const cards = container.querySelectorAll<HTMLButtonElement>('.summary-strip > button');
    expect(container.querySelector('.player-placeholder')).not.toBeNull();
    expect(container.querySelector('.crest-placeholder')).not.toBeNull();
    act(() => cards[0]!.click());
    expect(container.querySelector('.detail-panel')?.textContent).toContain('Jan Test');
    expect(container.textContent).toContain('TABELA LIGOWA');
    act(() => cards[1]!.click());
    expect(container.querySelector('.detail-panel')?.textContent).toContain('Vistula Nova');
    expect(container.querySelectorAll('.detail-panel')).toHaveLength(1);
    act(() => cards[1]!.click());
    expect(container.querySelector('.detail-panel')).toBeNull();
    act(() => cards[0]!.click());
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Zamknij"]')!;
    expect(close.textContent).toBe('×');
    act(() => close.click());
    expect(container.querySelector('.detail-panel')).toBeNull();
    act(() => root.unmount());
  });

  it('renders the fixture list before and after the first completed match', () => {
    const career = initializedCareer();
    renderWithoutThrowing(<SeasonView career={career} />);

    const fixture = career
      .leagueSeason!.rounds.flatMap((round) => round.fixtures)
      .find((item) => item.id === career.seasonParticipation![0]!.fixtureId)!;
    const completed: CareerState = {
      ...career,
      leagueSeason: {
        ...career.leagueSeason!,
        rounds: career.leagueSeason!.rounds.map((round) => ({
          ...round,
          fixtures: round.fixtures.map((item) =>
            item.id === fixture.id
              ? { ...item, completed: true, homeGoals: 1, awayGoals: 0 }
              : item,
          ),
        })),
      },
      seasonParticipation: career.seasonParticipation!.map((record) =>
        record.fixtureId === fixture.id
          ? { ...record, fixtureStatus: 'completed', status: 'starter', minutes: 90, started: true }
          : record,
      ),
    };
    renderWithoutThrowing(<SeasonView career={completed} />);
  });

  it('renders CareerWeekGame after resolving side_job_offer -> light', () => {
    const career = initializedCareer();
    const week = career.careerCalendar!.weeks[career.careerCalendar!.currentWeekIndex]!;
    const eventCareer: CareerState = {
      ...career,
      decisionPoint: {
        type: 'off_field_event',
        date: week.startDate,
        sourceId: 'side_job_offer',
      },
      // Exercise the UI fallback as well as the repaired canonical path.
      seasonParticipation: [],
    };
    const resolved = resolveRegularSeasonEvent(
      eventCareer,
      'side_job_offer',
      'light',
      week.startDate,
    );

    renderWithoutThrowing(<CareerWeekGame career={resolved} onCareer={() => undefined} />);
  });
});
