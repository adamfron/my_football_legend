// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { resolveRegularSeasonEvent } from '../core/events/regularSeasonEvents';
import { advanceCareerFlow } from '../core/careerFlow';
import { createCareerState, generateStartingPlayerProfile } from '../core/playerCreator';
import type { CareerState, ProfessionalOffer } from '../types/domain';
import { CareerWeekGame, SeasonEndSummary } from './App';
import { SeasonView } from './career/SeasonView';
import { CareerView } from './career/CareerView';
import { scheduleEvent } from '../core/careerCalendar';
import { generateProfessionalClubPool } from '../core/professionalClubs';

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
          position: 'left_winger',
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
  it('presents a current-club proposal as accept plus one negotiation, without continuation', () => {
    const base = initializedCareer();
    const club = generateProfessionalClubPool(base.seed)[0]!;
    const contract = {
      clubId: club.id,
      startDate: '2026-07-01',
      endDate: '2029-06-30',
      monthlySalary: 4_000,
      signingBonus: 1_000,
      squadRole: 'rotation' as const,
      contractType: 'professional' as const,
    };
    const renewal: ProfessionalOffer = {
      id: 'renewal_test',
      offerType: 'renewal',
      club,
      contract: { ...contract, monthlySalary: 5_000, endDate: '2030-06-30' },
      plannedPosition: base.player.primaryPosition,
      interestReasons: ['Dobra współpraca.'],
      opportunity: 'Dalszy rozwój.',
      risk: 'Konkurencja.',
      competitionAssessment: 'Umiarkowana',
    };
    const career: CareerState = {
      ...base,
      currentClub: { ...base.currentClub, id: club.id, name: club.name },
      currentProfessionalClub: club,
      currentContract: contract,
      professionalOffers: [renewal],
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<SeasonEndSummary career={career} onCareer={() => undefined} />));
    const proposal = container.querySelector('.contract-proposal')!;
    expect(proposal.textContent).toContain('Przyjmij');
    expect(proposal.textContent).toContain('Negocjuj');
    expect(container.textContent).not.toContain('Kontynuuj na obecnej umowie');

    act(() =>
      root.render(
        <SeasonEndSummary
          career={{
            ...career,
            renegotiation: {
              season: career.currentSeason,
              result: 'accepted',
              proposedContract: { ...renewal.contract, monthlySalary: 5_500 },
            },
          }}
          onCareer={() => undefined}
        />,
      ),
    );
    expect(container.textContent).toContain('Wynegocjowana propozycja');
    expect(container.textContent).toContain('Przyjmij');
    expect(container.textContent).not.toContain('Negocjuj');
    expect(container.textContent).not.toContain('Kontynuuj na obecnej umowie');
    act(() => root.unmount());
  });

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

  it('keeps fixtures and scheduled decisions in the season timeline but hides internal facts', () => {
    const initial = initializedCareer();
    const scheduled = scheduleEvent(initial, {
      id: 'visible_decision',
      eventDefinitionId: 'side_job_offer',
      date: initial.careerCalendar!.weeks[1]!.startDate,
    });
    const career: CareerState = {
      ...scheduled,
      historyFacts: [
        ...scheduled.historyFacts,
        {
          id: 'internal_week_fact',
          factType: 'career_week_completed',
          season: scheduled.currentSeason,
          date: scheduled.currentDate!,
          actors: [scheduled.player.id],
          targets: [],
          clubs: [scheduled.currentClub.id],
          competitions: [],
          data: {},
          causes: [],
          tags: ['technical'],
          visibility: 'partial',
          narrativeImportance: 1,
          emotionalTone: 'neutral',
        },
      ],
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<CareerView career={career} onCareer={() => undefined} />));
    expect(container.querySelectorAll('.season-timeline li').length).toBe(
      career.careerCalendar!.fixtures.length + 1,
    );
    expect(container.querySelector('.timeline-event')).not.toBeNull();
    expect(container.querySelector('.timeline-fact')).toBeNull();
    act(() => root.unmount());
  });

  it('updates the canonical match preference and closes details when Play is pressed', () => {
    const initial = initializedCareer();
    let updated: CareerState | undefined;
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(<CareerView career={initial} onCareer={(career) => (updated = career)} />),
    );
    act(() => container.querySelectorAll<HTMLButtonElement>('.summary-strip > button')[0]!.click());
    const simulateAll = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (input) => input.parentElement?.textContent?.includes('Symuluj wszystkie'),
    )!;
    act(() => simulateAll.click());
    expect(updated?.player.matchPresentation).toBe('simulate_all');
    expect(container.querySelector('.detail-panel')).not.toBeNull();
    const play = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Graj'),
    )!;
    act(() => play.click());
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
