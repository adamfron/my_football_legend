// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { resolveRegularSeasonEvent } from '../core/events/regularSeasonEvents';
import { advanceCareerFlow } from '../core/careerFlow';
import { createCareerState, generateStartingPlayerProfile } from '../core/playerCreator';
import type { CareerState } from '../types/domain';
import { CareerWeekGame, SeasonView } from './App';

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
