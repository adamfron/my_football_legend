import { lazy, Suspense, useState } from 'react';
import {
  deriveAppearance,
  resolveFaceGenome,
  type CosmeticOverrides,
  type FootballerVisualIdentity,
  type VisualIdentitySource,
} from '../../core/visualIdentity';
import type { FaceGenome } from '../../types/domain';

const PlayerPreview = lazy(() =>
  import('./PlayerPreview').then((module) => ({ default: module.PlayerPreview })),
);
const hairstyleLabels = {
  cropped: 'Krótko przycięte',
  short: 'Krótkie',
  side_part: 'Przedziałek',
  curly: 'Kręcone',
  long: 'Długie',
  shaved: 'Ogólone',
} as const;
const facialHairLabels = { none: 'Brak', stubble: 'Krótki zarost', beard: 'Broda' } as const;
const accessoryLabels = { none: 'Brak', headband: 'Opaska', glasses: 'Okulary' } as const;
const skinLabels = ['Jasna', 'Ciepła jasna', 'Średnia', 'Śniada', 'Ciemna', 'Głęboka'];
const hairLabels = ['Czarne', 'Ciemnobrązowe', 'Brązowe', 'Kasztanowe', 'Jasny brąz', 'Blond'];
const eyeLabels = ['Brązowe', 'Piwne', 'Zielone', 'Niebieskie', 'Szare'];
const morphologyControls: [keyof FaceGenome, string][] = [
  ['headProportion', 'Proporcje głowy'],
  ['jawWidth', 'Szerokość żuchwy'],
  ['chinLength', 'Długość podbródka'],
  ['eyeSpacing', 'Rozstaw oczu'],
  ['eyeSize', 'Wielkość oczu'],
  ['browShape', 'Brwi'],
  ['noseLength', 'Długość nosa'],
  ['noseWidth', 'Szerokość nosa'],
  ['mouthWidth', 'Szerokość ust'],
];

export const AppearanceEditor = ({
  source,
  date,
  value,
  onChange,
  onReset,
  cosmeticsOnly = false,
  disabled = false,
}: {
  source: VisualIdentitySource;
  date: string;
  value: FootballerVisualIdentity;
  onChange: (value: FootballerVisualIdentity) => void;
  onReset: () => void;
  cosmeticsOnly?: boolean;
  disabled?: boolean;
}) => {
  const [previewMode, setPreviewMode] = useState<'portrait' | 'full'>('portrait');
  const appearance = deriveAppearance({ ...source, visualIdentity: value }, date);
  const base = value.faceGenome ?? resolveFaceGenome(value.faceSeed);
  const cosmetic = (changes: CosmeticOverrides) =>
    onChange({ ...value, cosmetics: { ...value.cosmetics, ...changes } });
  const face = (changes: Partial<FaceGenome>) =>
    onChange({ ...value, faceGenome: { ...base, ...changes } });
  const toneSelect = (
    label: string,
    labels: string[],
    selected: number,
    change: (n: number) => void,
  ) => (
    <label>
      {label}
      <select
        disabled={disabled}
        value={Math.min(labels.length - 1, Math.floor(selected * labels.length))}
        onChange={(event) => change((Number(event.target.value) + 0.5) / labels.length)}
      >
        {labels.map((text, index) => (
          <option key={text} value={index}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section
      className="appearance-editor"
      aria-label={cosmeticsOnly ? 'Zmiana wyglądu' : 'Wygląd zawodnika'}
    >
      <aside className="appearance-preview">
        <Suspense fallback={<p role="status">Wczytywanie podglądu 3D…</p>}>
          <PlayerPreview
            appearance={appearance}
            mode={previewMode}
            label="Podgląd wyglądu zawodnika"
          />
        </Suspense>
        <div className="preview-modes">
          <button
            type="button"
            aria-pressed={previewMode === 'portrait'}
            onClick={() => setPreviewMode('portrait')}
          >
            Portret
          </button>
          <button
            type="button"
            aria-pressed={previewMode === 'full'}
            onClick={() => setPreviewMode('full')}
          >
            Sylwetka
          </button>
        </div>
        <p>
          {appearance.heightCm} cm · {appearance.weightKg} kg · {appearance.ageYears} lat
        </p>
      </aside>
      <div className="appearance-controls">
        <p>Wygląd jest kosmetyczny. Wybierz fryzurę, kolory i styl swojej postaci.</p>
        <fieldset disabled={disabled}>
          <legend>Styl postaci</legend>
          <label>
            Prezentacja
            <select
              value={appearance.cosmetics.presentation}
              onChange={(e) =>
                cosmetic({ presentation: e.target.value as CosmeticOverrides['presentation'] })
              }
            >
              <option value="neutral">Neutralna</option>
              <option value="masculine">Męska</option>
              <option value="feminine">Kobieca</option>
            </select>
          </label>
          <label>
            Fryzura
            <select
              value={appearance.cosmetics.hairstyle}
              onChange={(e) =>
                cosmetic({ hairstyle: e.target.value as CosmeticOverrides['hairstyle'] })
              }
            >
              {Object.entries(hairstyleLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {toneSelect('Kolor włosów', hairLabels, appearance.face.hairColor, (hairColor) =>
            cosmetic({ hairColor }),
          )}
          <label>
            Zarost
            <select
              value={appearance.cosmetics.facialHair}
              onChange={(e) =>
                cosmetic({ facialHair: e.target.value as CosmeticOverrides['facialHair'] })
              }
            >
              {Object.entries(facialHairLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dodatki
            <select
              value={appearance.cosmetics.accessories}
              onChange={(e) =>
                cosmetic({ accessories: e.target.value as CosmeticOverrides['accessories'] })
              }
            >
              {Object.entries(accessoryLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {!cosmeticsOnly && (
          <>
            <fieldset disabled={disabled}>
              <legend>Twarz</legend>
              <div className="appearance-presets">
                <span>Kształt twarzy:</span>
                {[
                  ['Owalna', { headProportion: 0.35, jawWidth: 0.35, chinLength: 0.52 }],
                  ['Kanciasta', { headProportion: 0.66, jawWidth: 0.86, chinLength: 0.37 }],
                  ['Smukła', { headProportion: 0.13, jawWidth: 0.21, chinLength: 0.74 }],
                ].map(([label, parameters]) => (
                  <button
                    type="button"
                    key={String(label)}
                    onClick={() => face(parameters as Partial<FaceGenome>)}
                  >
                    {String(label)}
                  </button>
                ))}
              </div>
              {toneSelect('Odcień skóry', skinLabels, appearance.face.skinTone, (skinTone) =>
                face({ skinTone }),
              )}
              {toneSelect('Kolor oczu', eyeLabels, appearance.face.eyeColor, (eyeColor) =>
                face({ eyeColor }),
              )}
            </fieldset>
            <details className="appearance-advanced">
              <summary>Dokładne proporcje twarzy</summary>
              {morphologyControls.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={disabled}
                    value={Math.round(base[key] * 100)}
                    onChange={(e) => face({ [key]: Number(e.target.value) / 100 })}
                  />
                </label>
              ))}
            </details>
          </>
        )}
        <button type="button" disabled={disabled} onClick={onReset}>
          {cosmeticsOnly ? 'Cofnij zmiany' : 'Przywróć początkowy wygląd'}
        </button>
      </div>
    </section>
  );
};
