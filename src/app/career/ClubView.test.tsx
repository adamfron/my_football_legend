// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../../core/playerCreator';
import { FORMATIONS, deriveSquadHierarchy, resolveFootballer } from '../../core/footballerWorld';
import type { CareerState } from '../../types/domain';
import { ClubView } from './ClubView';
import { SquadPitch } from './SquadPitch';
import { FORMATION_COORDINATES } from './formationCoordinates';

const career = (): CareerState => {
  const state = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        difficulty: 'normal',
        position: 'attacking_midfielder',
        heightCm: 180,
        weightKg: 74,
        seed: 'club-view-test',
      },
      'club-view-test',
      0,
    ),
    'club-view-test',
  );
  const original = state.clubWorld![0]!;
  const club = {
    ...original,
    squadPlayerIds: [...original.squadPlayerIds!.slice(0, -1), state.player.id],
  };
  const contract = {
    clubId: club.id,
    startDate: '2026-07-01',
    endDate: '2029-06-30',
    monthlySalary: 5000,
    signingBonus: 0,
    squadRole: 'rotation' as const,
    contractType: 'professional' as const,
  };
  return {
    ...state,
    currentClub: {
      ...state.currentClub,
      id: club.id,
      name: club.name,
      region: club.region,
      country: club.country,
    },
    currentProfessionalClub: club,
    currentContract: contract,
    clubWorld: state.clubWorld!.map((item) => (item.id === club.id ? club : item)),
  };
};

describe('ClubView squad presentation', () => {
  it('renders the canonical hierarchy once and in XI, bench, reserve order', () => {
    const state = career();
    const hierarchy = deriveSquadHierarchy(state, state.currentProfessionalClub!);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ClubView career={state} />));
    const groups = [...container.querySelectorAll('[data-squad-group]')];
    expect(groups.map((group) => group.getAttribute('data-squad-group'))).toEqual([
      'PIERWSZA XI',
      'ŁAWKA',
      'GŁĘBOKA REZERWA',
    ]);
    expect(groups[0]!.querySelectorAll('.squad-list-row')).toHaveLength(11);
    expect(groups[1]!.querySelectorAll('.squad-list-row')).toHaveLength(7);
    expect(groups[2]!.querySelectorAll('.squad-list-row')).toHaveLength(
      hierarchy.deepReserve.length,
    );
    const ids = [...container.querySelectorAll('.squad-list-row')].map((row) =>
      row.getAttribute('data-footballer-id'),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === state.player.id)).toHaveLength(1);
    expect(container.querySelectorAll('.pitch-player')).toHaveLength(11);
    expect(container.querySelectorAll('.pitch-player.protagonist')).toHaveLength(
      hierarchy.preferredXI.some((item) => item.footballerId === state.player.id) ? 1 : 0,
    );
    expect(container.textContent).not.toContain('center_back');
    expect(container.textContent).not.toContain('goalkeeper');
    expect(container.querySelector('input, select, [draggable="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it('uses stable eleven-slot coordinates for every supported formation', () => {
    for (const formation of Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[]) {
      expect(FORMATION_COORDINATES[formation]).toHaveLength(11);
      expect(FORMATION_COORDINATES[formation]).toEqual([...FORMATION_COORDINATES[formation]]);
    }
  });

  it('keeps 4-4-2 goalkeeper and left/right defenders in their canonical pitch slots', () => {
    const state = career();
    const hierarchy = deriveSquadHierarchy(state, state.currentProfessionalClub!, '4-4-2');
    const shuffled = [...hierarchy.preferredXI].reverse();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <ClubView
          career={{
            ...state,
            currentProfessionalClub: {
              ...state.currentProfessionalClub!,
              managerId: 'manager_4_4_2_test',
            },
          }}
        />,
      ),
    );
    // The component-level contract is asserted directly with deliberately non-canonical input.
    const pitchContainer = document.createElement('div');
    const pitchRoot = createRoot(pitchContainer);
    act(() =>
      pitchRoot.render(
        <SquadPitch
          formation="4-4-2"
          assignments={shuffled}
          resolvePlayer={(id) => resolveFootballer(state, id)}
          protagonistId={state.player.id}
        />,
      ),
    );
    const bySlot = (slotIndex: number) =>
      pitchContainer.querySelector(
        `[data-footballer-id="${hierarchy.preferredXI[slotIndex]!.footballerId}"]`,
      ) as HTMLElement;
    expect(bySlot(0).style.getPropertyValue('--pitch-y')).toBe('91%');
    expect(bySlot(1).style.getPropertyValue('--pitch-x')).toBe('14%');
    expect(bySlot(4).style.getPropertyValue('--pitch-x')).toBe('86%');
    act(() => pitchRoot.unmount());
    act(() => root.unmount());
  });

  it('orders every list canonically and separates assigned from mastered positions', () => {
    const state = career();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ClubView career={state} />));
    const groups = [...container.querySelectorAll('[data-squad-group]')];
    const hierarchy = deriveSquadHierarchy(state, state.currentProfessionalClub!);
    expect(
      [...groups[0]!.querySelectorAll('.squad-list-row')].map((row) =>
        row.getAttribute('data-footballer-id'),
      ),
    ).toEqual(hierarchy.preferredXI.map((item) => item.footballerId));
    expect(groups[0]!.querySelector('.squad-list-head')?.textContent).toContain('Ust.');
    expect(groups[0]!.querySelector('.squad-list-head')?.textContent).toContain('Pozycje');
    const assigned = groups[0]!.querySelector('.squad-list-row b')!.textContent;
    const mastered = groups[0]!.querySelector('.mastered-positions')!.textContent;
    expect(assigned).toBeTruthy();
    expect(mastered).toBeTruthy();
    act(() => root.unmount());
  });

  it('presents current sporting status separately from the promised contract role', () => {
    const state = career();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ClubView career={state} />));
    expect(container.textContent).toContain('Status sportowy:');
    expect(container.textContent).toContain('Rola kontraktowa: Zawodnik rotacji');
    act(() => root.unmount());
  });

  it('shows the real U-17 workspace without professional semantics', () => {
    const base = createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Junior',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'attacking_midfielder',
          heightCm: 180,
          weightKg: 74,
          seed: 'academy-view',
        },
        'academy-view',
        0,
      ),
      'academy-view',
    );
    const state = { ...base, currentProfessionalClub: undefined, currentContract: undefined };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ClubView career={state} />));
    expect(container.textContent).toContain('Polska Liga U-17');
    expect(container.textContent).toContain('PIERWSZA XI');
    expect(container.textContent).toContain('ŁAWKA');
    expect(container.textContent).toContain('GŁĘBOKA REZERWA');
    expect(container.textContent).not.toContain('Kadra akademii nie jest jeszcze częścią');
    expect(container.querySelector('.club-squad-workspace')).not.toBeNull();
    act(() => root.unmount());
  });

  it('opens one shared NPC preview on pointer hover and closes it', () => {
    const state = career();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<ClubView career={state} />));
    const name = container.querySelector('.footballer-name') as HTMLButtonElement;
    act(() => name.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const preview = document.body.querySelector('.footballer-hover-card');
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain('KONTRAKT');
    expect(preview?.textContent).not.toContain('injuryProneness');
    act(() => name.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(document.body.querySelector('.footballer-hover-card')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
