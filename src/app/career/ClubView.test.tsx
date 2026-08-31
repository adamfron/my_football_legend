// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../../core/playerCreator';
import { FORMATIONS, deriveSquadHierarchy } from '../../core/footballerWorld';
import type { CareerState } from '../../types/domain';
import { ClubView } from './ClubView';
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
