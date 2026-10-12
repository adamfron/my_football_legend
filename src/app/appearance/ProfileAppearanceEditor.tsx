import { useState } from 'react';
import { updateCareerAppearance } from '../../core/visualIdentity';
import type { CareerState } from '../../types/domain';
import type { CareerCommit } from '../careerCommit';
import { AppearanceEditor } from './AppearanceEditor';
import { initialAppearanceFor } from './appearanceDraft';

export const ProfileAppearanceEditor = ({
  career,
  onCareer,
  onClose,
  persistencePending,
}: {
  career: CareerState;
  onCareer: CareerCommit;
  onClose: () => void;
  persistencePending: boolean;
}) => {
  const initial = initialAppearanceFor(career.player);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = saving || persistencePending;
  return (
    <section className="profile-appearance" aria-label="Edytor wyglądu">
      <h2>Zmień wygląd</h2>
      <AppearanceEditor
        source={career.player}
        date={career.currentDate ?? `${career.currentSeason}-07-01`}
        value={draft}
        onChange={setDraft}
        onReset={() => setDraft(initial)}
        cosmeticsOnly
        disabled={pending}
      />
      <nav className="creator-actions">
        <button type="button" disabled={pending} onClick={onClose}>
          Anuluj
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setSaving(true);
            setError(false);
            try {
              if (await onCareer(updateCareerAppearance(career, draft.cosmetics ?? {}))) onClose();
              else setError(true);
            } catch {
              setError(true);
            } finally {
              setSaving(false);
            }
          }}
        >
          {pending ? 'Zapisywanie…' : 'Zapisz wygląd'}
        </button>
      </nav>
      {error && (
        <p role="alert" className="field-error">
          Nie udało się zapisać wyglądu. Spróbuj ponownie.
        </p>
      )}
    </section>
  );
};
