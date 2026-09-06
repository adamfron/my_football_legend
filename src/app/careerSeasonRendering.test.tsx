// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveRegularSeasonEvent } from '../core/events/regularSeasonEvents';
import { advanceCareerFlow } from '../core/careerFlow';
import { createCareerState, generateStartingPlayerProfile } from '../core/playerCreator';
import type { CareerState, ProfessionalOffer } from '../types/domain';
import { CareerWeekGame, EventCard, SeasonEndSummary } from './App';
import { SeasonView } from './career/SeasonView';
import { CareerView } from './career/CareerView';
import { scheduleEvent } from '../core/careerCalendar';
import { generateProfessionalClubPool } from '../core/professionalClubs';
import { MatchParticipationSummary } from '../components/MatchParticipationSummary';
import {
  CAREER_SAVE_VERSION,
  parseCareerSave,
  serializeCurrentCareerSave,
} from '../core/persistence';

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
  it.each(['dietitian_contact', 'recovery_needed'])(
    'waits for the delayed commit before presenting and resolving %s',
    async (eventId) => {
      vi.useFakeTimers();
      const initial = initializedCareer();
      const date =
        initial.careerCalendar!.weeks[initial.careerCalendar!.currentWeekIndex]!.startDate;
      const scheduled = scheduleEvent(initial, {
        id: `scheduled_${eventId}`,
        eventDefinitionId: eventId,
        date,
      });
      let committed = scheduled;
      let release!: () => void;
      let calls = 0;
      const commit = vi.fn(async (next: CareerState) => {
        calls += 1;
        await new Promise<void>((resolve) => (release = resolve));
        committed = next;
        return true;
      });
      const container = document.createElement('div');
      const root = createRoot(container);
      act(() => root.render(<CareerView career={scheduled} onCareer={commit} />));
      const play = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.includes('Graj'),
      )!;
      act(() => play.click());
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(calls).toBe(1);
      expect(committed).toBe(scheduled);
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      expect(calls).toBe(1);
      await act(async () => release());
      expect(committed.decisionPoint?.type).toBe('off_field_event');
      act(() =>
        root.render(
          <CareerView
            career={committed}
            onCareer={commit}
            decisionPanel={<EventCard career={committed} onCareer={commit} />}
          />,
        ),
      );
      expect(container.querySelector('.career-decision .choices')).not.toBeNull();
      expect(container.textContent).not.toContain('Career cannot auto-progress');
      expect(
        committed.historyFacts.some((fact) => fact.factType === 'regular_season_decision'),
      ).toBe(false);
      const choice = container.querySelector<HTMLButtonElement>(
        '.career-decision .choices button',
      )!;
      act(() => choice.click());
      expect(commit).toHaveBeenCalledTimes(2);
      await act(async () => release());
      expect(
        committed.historyFacts.filter((fact) => fact.factType === 'regular_season_decision'),
      ).toHaveLength(1);
      expect(committed.decisionPoint).toBeUndefined();
      expect(
        committed.careerCalendar?.scheduledEvents.some(
          (event) => event.eventDefinitionId === eventId && event.status !== 'completed',
        ),
      ).toBe(false);
      act(() => root.unmount());
      vi.useRealTimers();
    },
  );

  it('offers retirement, but not another season, at the age limit', () => {
    const base = initializedCareer();
    const career: CareerState = {
      ...base,
      player: { ...base.player, age: 40 },
      leagueSeason: { ...base.leagueSeason!, completed: true },
      currentContract: {
        clubId: base.currentClub.id,
        startDate: '2026-07-01',
        endDate: '2030-06-30',
        monthlySalary: 4_000,
        signingBonus: 0,
        squadRole: 'rotation',
        contractType: 'professional',
      },
      professionalOffers: undefined,
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<SeasonEndSummary career={career} onCareer={async () => true} />));
    expect(container.textContent).toContain('Osiągnąłeś limit wieku');
    expect(container.textContent).toContain('Zakończ karierę');
    expect(container.textContent).not.toContain('Kontynuuj na obecnej umowie');
    act(() => root.unmount());
  });

  it('persists and cold-renders a completed season without losing its decision UI', async () => {
    const base = initializedCareer();
    const completed: CareerState = {
      ...base,
      leagueSeason: {
        ...base.leagueSeason!,
        completed: true,
        currentRound: base.leagueSeason!.rounds.length,
      },
      decisionPoint: { type: 'season_context', sourceId: 'season_end', date: '2027-05-31' },
    };
    let release!: () => void;
    let visible = base;
    const commit = async (next: CareerState) => {
      await new Promise<void>((resolve) => (release = resolve));
      visible = next;
      return true;
    };
    const pending = commit(completed);
    expect(visible.leagueSeason?.completed).toBe(false);
    release();
    await pending;
    expect(visible.leagueSeason?.completed).toBe(true);

    const serialized = serializeCurrentCareerSave(visible);
    const loaded = parseCareerSave(serialized);
    expect(CAREER_SAVE_VERSION).toBe(7);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.reason);
    const restored = loaded.save.career as CareerState;
    expect(restored.leagueSeason?.completed).toBe(true);
    const container = document.createElement('div');
    const root = createRoot(container);
    expect(() =>
      act(() => root.render(<SeasonEndSummary career={restored} onCareer={async () => true} />)),
    ).not.toThrow();
    expect(container.textContent).toContain('Podsumowanie sezonu');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    act(() => root.unmount());
  });
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
    act(() => root.render(<SeasonEndSummary career={career} onCareer={async () => true} />));
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
          onCareer={async () => true}
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
    act(() => root.render(<CareerView career={initializedCareer()} onCareer={async () => true} />));

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
    act(() => root.render(<CareerView career={career} onCareer={async () => true} />));
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
      root.render(
        <CareerView
          career={initial}
          onCareer={async (career) => {
            updated = career;
            return true;
          }}
        />,
      ),
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

  it('renders direct-red and second-yellow dismissals as accessible card sequences', () => {
    const base = {
      fixtureId: 'cards',
      date: '2027-09-01',
      opponentId: 'other',
      venue: 'home' as const,
      competition: 'Liga',
      status: 'starter' as const,
      plannedMinutes: 90,
      minutes: 82,
      started: true,
      goals: 0,
      assists: 0,
      xG: 0,
      xA: 0,
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <>
          <MatchParticipationSummary participation={{ ...base, redCard: 'direct' }} />
          <MatchParticipationSummary participation={{ ...base, redCard: 'second_yellow' }} />
        </>,
      ),
    );
    const cards = container.querySelectorAll('.card-indicators');
    expect(cards[0]?.getAttribute('aria-label')).toBe('czerwona kartka');
    expect(cards[0]?.querySelectorAll('.red')).toHaveLength(1);
    expect(cards[1]?.getAttribute('aria-label')).toContain('druga żółta');
    expect(cards[1]?.querySelectorAll('.yellow')).toHaveLength(2);
    expect(cards[1]?.querySelectorAll('.red')).toHaveLength(1);
    act(() => root.unmount());
  });

  it('renders assigned position and card indicators on the main timeline without inventing a position', () => {
    const base = initializedCareer();
    const first = base.seasonParticipation![0]!;
    const render = (assignedPosition?: 'center_back') => {
      const career = {
        ...base,
        seasonParticipation: base.seasonParticipation!.map((record) =>
          record.fixtureId === first.fixtureId
            ? {
                ...record,
                fixtureStatus: 'completed' as const,
                status: 'starter' as const,
                minutes: 76,
                started: true,
                goals: 0,
                assists: 0,
                rating: 7.6,
                yellowCards: 1,
                assignedPosition,
              }
            : record,
        ),
      };
      const container = document.createElement('div');
      const root = createRoot(container);
      act(() => root.render(<CareerView career={career} onCareer={async () => true} />));
      return { container, root };
    };
    const assigned = render('center_back');
    expect(assigned.container.querySelector('.season-timeline')?.textContent).toContain(
      "76' · ŚO · 0 G · 0 A · 7,6",
    );
    expect(assigned.container.querySelector('.card-indicators')?.getAttribute('aria-label')).toBe(
      'żółta kartka',
    );
    act(() => assigned.root.unmount());
    const absent = render();
    expect(absent.container.querySelector('.season-timeline')?.textContent).toContain(
      "76' · 0 G · 0 A · 7,6",
    );
    expect(absent.container.querySelector('.season-timeline')?.textContent).not.toContain('ŚO');
    act(() => absent.root.unmount());
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

    renderWithoutThrowing(<CareerWeekGame career={resolved} onCareer={async () => true} />);
  });
});
