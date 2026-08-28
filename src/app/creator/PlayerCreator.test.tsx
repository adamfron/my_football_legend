// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { generateStartingPlayerProfile } from '../../core/playerCreator';
import { PlayerCreator, type ProfileFormState } from './PlayerCreator';

const identity = {
  firstName: 'Jan',
  lastName: 'Test',
  nationality: 'PL' as const,
  age: 16 as const,
  dominantFoot: 'right' as const,
  customSeed: 'creator-ui',
};
const profile: ProfileFormState = { position: 'winger', heightCm: '174', weightKg: '68' };
const generated = generateStartingPlayerProfile(
  { ...identity, position: 'winger', heightCm: 174, weightKg: 68, seed: 'creator-ui' },
  'creator-ui',
  0,
);
const props = (step: number) => ({
  step,
  identity,
  profile,
  errors: {},
  generated,
  variants: [generated],
  selectedVariant: 0,
  seed: 'creator-ui',
  weightRange: { min: 55, max: 78 },
  setStep: vi.fn(),
  setIdentity: vi.fn(),
  setProfile: vi.fn(),
  selectVariant: vi.fn(),
  nextIdentity: vi.fn(),
  nextProfile: vi.fn(),
  reroll: vi.fn(),
  finish: vi.fn(),
});

describe('compact player creator', () => {
  it('uses the application header and renders every creator feature step', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    for (let step = 0; step < 4; step++) {
      act(() => root.render(<PlayerCreator {...props(step)} />));
      expect(container.textContent).toContain('MY FOOTBALL LEGEND');
      expect(container.textContent).toContain(
        ['Tożsamość', 'Profil', 'Atrybuty', 'Podsumowanie'][step],
      );
      expect(container.querySelectorAll('.creator-steps li')).toHaveLength(4);
    }
    act(() => root.unmount());
  });

  it('keeps navigation and final creation actions semantic and callable', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const first = props(0);
    act(() => root.render(<PlayerCreator {...first} />));
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Dalej'))!
        .click(),
    );
    expect(first.nextIdentity).toHaveBeenCalledOnce();
    const summary = props(3);
    act(() => root.render(<PlayerCreator {...summary} />));
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Rozpocznij karierę')!
        .click(),
    );
    expect(summary.finish).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
