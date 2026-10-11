// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../../core/playerCreator';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createVisualIdentity, deriveAppearance } from '../../core/visualIdentity';
import { AppearanceEditor } from './AppearanceEditor';
import { ProfileAppearanceEditor } from './ProfileAppearanceEditor';

vi.mock('./PlayerPreview', () => ({ PlayerPreview: () => <div data-preview="shared-model" /> }));
const source = { id: 'editor-player', dateOfBirth: '2010-04-14', heightCm: 180, weightKg: 75 };
const initial = createVisualIdentity(source.id);
const select = (container: HTMLElement, label: string, value: string) => {
  const input = Array.from(container.querySelectorAll('label'))
    .find((node) => node.textContent?.startsWith(label))!
    .querySelector('select')!;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('appearance editing', () => {
  it('presets and hair controls edit separate layers and deterministic reset restores initial appearance', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const Harness = () => {
      const [value, setValue] = useState(initial);
      return (
        <>
          <AppearanceEditor
            source={source}
            date="2026-07-01"
            value={value}
            onChange={setValue}
            onReset={() => setValue(initial)}
          />
          <output>{JSON.stringify(value)}</output>
        </>
      );
    };
    await act(async () => root.render(<Harness />));
    const read = () => JSON.parse(container.querySelector('output')!.textContent!);
    select(container, 'Fryzura', 'long');
    expect(read().cosmetics.hairstyle).toBe('long');
    expect(read().faceSeed).toBe(initial.faceSeed);
    expect(read().faceGenome).toBeUndefined();
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Kanciasta')!
        .click(),
    );
    expect(read().faceGenome.jawWidth).toBe(0.86);
    expect(read().cosmetics.hairstyle).toBe('long');
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(9);
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Przywróć początkowy wygląd')!
        .click(),
    );
    expect(read()).toEqual(initial);
    act(() => root.unmount());
  });

  it('career editor persists cosmetics only after explicit save and preserves morphology and football data', async () => {
    const generated = generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'left_winger',
        heightCm: 174,
        weightKg: 68,
        seed: 'profile-visual',
      },
      'profile-visual',
      0,
    );
    const career = createCareerState(generated, 'profile-visual', createCanonicalWorldDatabase());
    const date = career.currentDate ?? `${career.currentSeason}-07-01`;
    const original = deriveAppearance(career.player, date);
    const onCareer = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <ProfileAppearanceEditor
          career={career}
          onCareer={onCareer}
          onClose={onClose}
          persistencePending={false}
        />,
      ),
    );
    select(container, 'Fryzura', 'long');
    select(container, 'Prezentacja', 'feminine');
    expect(onCareer).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Dokładne proporcje twarzy');
    await act(async () =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Zapisz wygląd')!
        .click(),
    );
    const next = onCareer.mock.calls[0]![0];
    expect(next.player.attributes).toEqual(career.player.attributes);
    expect(next.seed).toBe(career.seed);
    expect(deriveAppearance(next.player, date).baseFace).toEqual(original.baseFace);
    expect(next.player.visualIdentity.cosmetics).toMatchObject({
      hairstyle: 'long',
      presentation: 'feminine',
    });
    expect(onClose).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
