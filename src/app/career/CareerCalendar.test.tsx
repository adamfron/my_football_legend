// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../../core/playerCreator';
import { CareerCalendar } from './CareerCalendar';

const career = createCareerState(
  generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Test',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      difficulty: 'normal',
      position: 'right_back',
      heightCm: 180,
      weightKg: 74,
      seed: 'pr210-calendar',
    },
    'pr210-calendar',
    0,
  ),
  'pr210-calendar',
);
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
const render = (date: string) =>
  act(() => root.render(<CareerCalendar career={{ ...career, currentDate: date }} />));
const day = (date: string) => host.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
});

describe('PR210 calendar follows authoritative today only while requested', () => {
  it('follows a new day, month and year while retaining calendar keyboard focus', () => {
    render('2026-12-31');
    act(() => day('2026-12-31').focus());
    render('2027-01-01');
    expect(day('2027-01-01').getAttribute('aria-pressed')).toBe('true');
    expect(day('2027-01-01').getAttribute('aria-current')).toBe('date');
    expect(document.activeElement).toBe(day('2027-01-01'));
    expect(host.querySelector('h2')!.textContent).toContain('2027');
  });
  it('preserves deliberate selection and month browsing as the career progresses', () => {
    render('2026-07-20');
    act(() => day('2026-07-12').click());
    render('2026-08-01');
    expect(day('2026-07-12').getAttribute('aria-pressed')).toBe('true');
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Poprzedni miesiąc"]')!.click());
    render('2026-09-01');
    expect(day('2026-06-01').getAttribute('aria-pressed')).toBe('true');
  });
  it('Dziś restores following without stealing focus from its button', () => {
    render('2026-07-20');
    act(() => day('2026-07-12').click());
    render('2026-08-01');
    act(() => {
      button('Dziś').focus();
      button('Dziś').click();
    });
    expect(day('2026-08-01').getAttribute('aria-pressed')).toBe('true');
    render('2026-09-01');
    expect(day('2026-09-01').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(button('Dziś'));
  });
  it('arrow navigation keeps manual dates and focus across month boundaries', () => {
    render('2026-07-31');
    act(() => {
      day('2026-07-31').focus();
      day('2026-07-31').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(day('2026-08-01'));
    render('2026-08-03');
    expect(document.activeElement).toBe(day('2026-08-01'));
    expect(day('2026-08-01').getAttribute('aria-pressed')).toBe('true');
  });
});
