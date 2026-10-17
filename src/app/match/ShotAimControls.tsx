import { useState } from 'react';

/** A goal point is chosen first. Choosing a technique keeps the decision paused until
 * explicit confirmation; the parent resolves the current target through canonical actions. */
export const ShotAimControls = ({
  aim,
  onAimChange,
  techniques,
  onConfirm,
  onCancel,
}: {
  aim: { horizontal: number; vertical: number };
  onAimChange: (aim: { horizontal: number; vertical: number }) => void;
  techniques: { id: string; label: string }[];
  onConfirm: (id: string) => void;
  onCancel: () => void;
}) => {
  const [technique, setTechnique] = useState<string>();
  const selected = techniques.some((item) => item.id === technique);
  return (
    <div
      className="shot-aim__actions"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p>Wskaż punkt w bramce, wybierz technikę i potwierdź strzał.</p>
      <label>
        Kierunek strzału
        <input
          aria-label="Kierunek strzału"
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value={aim.horizontal}
          onChange={(event) => onAimChange({ ...aim, horizontal: Number(event.target.value) })}
        />
      </label>
      <label>
        Wysokość strzału
        <input
          aria-label="Wysokość strzału"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={aim.vertical}
          onChange={(event) => onAimChange({ ...aim, vertical: Number(event.target.value) })}
        />
      </label>
      <div role="group" aria-label="Technika strzału">
        {techniques.map((item) => (
          <button
            key={item.id}
            aria-pressed={technique === item.id}
            onClick={() => setTechnique(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        disabled={!selected}
        onClick={() => {
          if (selected && technique) onConfirm(technique);
        }}
      >
        Wykonaj strzał
      </button>
      <button onClick={onCancel}>Anuluj</button>
    </div>
  );
};
