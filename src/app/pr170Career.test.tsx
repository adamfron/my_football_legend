// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createPr167Career, pr167World } from '../../scripts/pr167Fixtures';
import { financeOverviewSchema, projectFinances } from './career/financePresentation';
import { CareerCalendar } from './career/CareerCalendar';
import { calendarDays, shiftCalendarMonth } from './career/calendarPresentation';
import { FinanceView } from './career/FinanceView';
import { CareerView } from './career/CareerView';
import { generateProfessionalOffers, generateSummerWindowOffers } from '../core/professionalClubs';
import { MAX_EXTERNAL_OFFERS, limitProfessionalOffers } from '../core/professionalOfferPolicy';
import {
  hydrateCareerWithWorld,
  parseCareerSave,
  serializeCurrentCareerSave,
} from '../core/persistence';
import { validateProfessionalOfferAcceptance } from '../core/careerSeasons';

const base = createPr167Career(false, 'pr170-career');
describe('PR170 career presentation', () => {
  it('projects every real ledger category, chronological duplicate dates and signed running balances without writing', () => {
    const career = {
      ...base,
      finances: [
        { id: 'z', date: '2026-09-02', category: 'salary' as const, amount: 1000 },
        { id: 'b', date: '2026-09-01', category: 'development' as const, amount: -80 },
        { id: 'a', date: '2026-09-01', category: 'stipend' as const, amount: 30 },
        { id: 'c', date: '2026-09-01', category: 'side_job' as const, amount: 20 },
        { id: 'd', date: '2026-09-01', category: 'education' as const, amount: -10 },
        { id: 'e', date: '2026-09-01', category: 'recovery' as const, amount: -15 },
        { id: 'f', date: '2026-09-01', category: 'lifestyle' as const, amount: -5 },
        { id: 'g', date: '2026-09-01', category: 'signing_bonus' as const, amount: 200 },
        { id: 'h', date: '2026-09-01', category: 'stipend' as const, amount: 0 },
      ],
    };
    const before = structuredClone(career),
      view = projectFinances(career);
    expect(view).toMatchObject({ balance: 1140, income: 1250, expenditure: 110 });
    expect(view.rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'z']);
    expect(view.rows[1]!.balance).toBe(-50);
    expect(view.categories).toHaveLength(8);
    expect(financeOverviewSchema.safeParse(view).success).toBe(true);
    expect(projectFinances({ ...base, finances: [] }).balance).toBe(0);
    expect(projectFinances({ ...base, finances: undefined }).balance).toBeUndefined();
    const saved = parseCareerSave(serializeCurrentCareerSave(career));
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw Error('save');
    expect(projectFinances(hydrateCareerWithWorld(saved.save.career, pr167World))).toEqual(view);
    expect(career).toEqual(before);
  });
  it('opens finance and navigates calendar months/dates using the keyboard without changing career or committing', async () => {
    const before = structuredClone(base),
      host = document.createElement('div'),
      root = createRoot(host),
      commit = vi.fn(async () => true);
    document.body.append(host);
    await act(async () => root.render(<CareerView career={base} onCareer={commit} />));
    expect(
      host.querySelector('.season-left-column > .season-pane + .career-calendar'),
    ).not.toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.summary-strip > button:nth-child(3)')!.click(),
    );
    expect(host.textContent).toContain('Zapisane wydatki');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Następny miesiąc"]')!.click(),
    );
    const chosen = host.querySelector<HTMLButtonElement>(
      '.calendar-days button[aria-pressed="true"]',
    )!;
    await act(async () =>
      chosen.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(
      host.querySelector('.calendar-days button[aria-pressed="true"]')?.getAttribute('data-date'),
    ).not.toBe(chosen.dataset.date);
    expect(host.contains(document.activeElement)).toBe(true);
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.career-calendar button')].find((button) => button.textContent === 'Dziś')!.click());
    const current = host.querySelector<HTMLButtonElement>('.calendar-days button[aria-pressed="true"]')!;
    await act(async () => current.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(host.querySelector('.calendar-days button[aria-pressed="true"]'));
    expect(commit).not.toHaveBeenCalled();
    expect(base).toEqual(before);
    await act(async () => root.unmount());
    host.remove();
  });
  it('uses existing upcoming/completed fixtures and events after reload, with no fixture execution callback', async () => {
    const fixture = base.careerCalendar!.fixtures[0]!;
    const career = {
      ...base,
      currentDate: fixture.date,
      seasonParticipation: base.seasonParticipation!.map((row) =>
        row.fixtureId === fixture.id
          ? {
              ...row,
              fixtureStatus: 'completed' as const,
              status: 'starter' as const,
              minutes: 90,
              started: true,
            }
          : row,
      ),
    };
    const original = structuredClone(career),
      host = document.createElement('div'),
      root = createRoot(host);
    await act(async () =>
      root.render(
        <>
          <CareerCalendar career={career} />
          <FinanceView career={career} />
        </>,
      ),
    );
    expect(
      host.querySelector(`button[data-date="${fixture.date}"]`)?.getAttribute('aria-label'),
    ).toContain('rozegrany mecz');
    expect(host.querySelector('.calendar-date-details')?.textContent).toContain(
      fixture.opponent.name,
    );
    expect(career).toEqual(original);
    await act(async () => root.unmount());
    expect(calendarDays('2028-02')).toContain('2028-02-29');
    expect(calendarDays('2028-02')).toHaveLength(42);
    expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftCalendarMonth('2027-01', -1)).toBe('2026-12');
  });
  it.each([0, 1, 3, 6, 12])(
    'limits generation with %i eligible external clubs, without filling a quota',
    (count) => {
      const interested = generateProfessionalOffers(base);
      const clubs =
        count > 6 ? pr167World.clubs : interested.slice(0, count).map((offer) => offer.club);
      const offers = generateProfessionalOffers({ ...base, clubWorld: clubs });
      expect(offers.length).toBeLessThanOrEqual(MAX_EXTERNAL_OFFERS);
      if (count <= 6) expect(offers).toHaveLength(Math.min(count, interested.length));
      expect(offers.every((offer) => offer.club.id !== base.currentClub.id)).toBe(true);
    },
  );
  it('retains renewal separately, caps older shortlists, normalizes old saves and rejects no-longer-presented offers', () => {
    const pro = createPr167Career(true, 'pr170-renewal');
    const career = {
      ...pro,
      activeMatch: undefined,
      currentDate: `${pro.currentSeason + 1}-06-30`,
      seasonParticipation: [
        {
          ...pro.seasonParticipation![0]!,
          fixtureStatus: 'completed' as const,
          status: 'starter' as const,
          minutes: 900,
          started: true,
        },
      ],
    };
    const offers = generateSummerWindowOffers(career);
    expect(offers.some((offer) => offer.offerType === 'renewal')).toBe(true);
    expect(offers.filter((offer) => offer.offerType !== 'renewal').length).toBeLessThanOrEqual(6);
    expect(
      generateProfessionalOffers({ ...career, player: { ...career.player, age: 36 } }).length,
    ).toBeLessThanOrEqual(5);
    const external = offers.filter((offer) => offer.offerType !== 'renewal')[0]!;
    const legacy = Array.from({ length: 8 }, (_, index) => ({
      ...external,
      id: `legacy-${index}`,
      club: { ...external.club, id: `external-${index}` },
      contract: { ...external.contract, clubId: `external-${index}` },
    }));
    const renewal = offers.find((offer) => offer.offerType === 'renewal')!;
    const state = { ...career, professionalOffers: [...legacy, renewal] };
    expect(limitProfessionalOffers(state.professionalOffers, state.currentClub.id)).toHaveLength(7);
    expect(validateProfessionalOfferAcceptance(state, legacy[7]!.id).valid).toBe(false);
    expect(limitProfessionalOffers(state.professionalOffers).at(-1)).toBe(renewal);
  });
});
