import { translate } from '../../core/narrative/localization';
import {
  defaultBodyForPosition,
  positionIds,
  STARTING_AGE,
  type IdentityInput,
  type PositionId,
  type StartingPlayerProfile,
} from '../../core/playerCreator';
import { PlayerCard } from '../shared/PlayerCard';
import { CreatorHeader } from './CreatorHeader';
import { CreatorSteps } from './CreatorSteps';

export type ProfileFormState = { position: PositionId; heightCm: string; weightKg: string };
export type CreatorFieldErrors = Partial<
  Record<
    | 'firstName'
    | 'lastName'
    | 'nationality'
    | 'dominantFoot'
    | 'customSeed'
    | 'heightCm'
    | 'weightKg'
    | 'position',
    string[]
  >
>;
type Props = {
  step: number;
  identity: IdentityInput;
  profile: ProfileFormState;
  errors: CreatorFieldErrors;
  generated: StartingPlayerProfile | null;
  variants: StartingPlayerProfile[];
  selectedVariant: number;
  seed: string;
  weightRange: { min: number; max: number };
  setStep: (step: number) => void;
  setIdentity: (value: IdentityInput) => void;
  setProfile: (value: ProfileFormState) => void;
  selectVariant: (index: number) => void;
  nextIdentity: () => void;
  nextProfile: () => void;
  finish: () => void;
};
const ErrorText = ({ errors }: { errors?: string[] | undefined }) =>
  errors?.map((error) => (
    <p className="field-error" key={error}>
      {error}
    </p>
  )) ?? null;
export const PlayerCreator = (p: Props) => (
  <main className="creator-shell">
    <CreatorHeader />
    <CreatorSteps step={p.step} />
    <div className="creator-workspace">
      <section className="creator-panel">
        {p.step === 0 && (
          <div className="form">
            <h1>Tożsamość</h1>
            <label>
              Imię
              <input
                value={p.identity.firstName}
                onChange={(e) => p.setIdentity({ ...p.identity, firstName: e.target.value })}
              />
              <ErrorText errors={p.errors.firstName} />
            </label>
            <label>
              Nazwisko
              <input
                value={p.identity.lastName}
                onChange={(e) => p.setIdentity({ ...p.identity, lastName: e.target.value })}
              />
              <ErrorText errors={p.errors.lastName} />
            </label>
            <label>
              Narodowość
              <select
                value={p.identity.nationality}
                onChange={(e) =>
                  p.setIdentity({
                    ...p.identity,
                    nationality: e.target.value as IdentityInput['nationality'],
                  })
                }
              >
                <option value="PL">Polska</option>
              </select>
            </label>
            <p>
              <strong>Wiek startowy:</strong> {STARTING_AGE} lat
            </p>
            <label>
              Dominująca noga
              <select
                value={p.identity.dominantFoot}
                onChange={(e) =>
                  p.setIdentity({
                    ...p.identity,
                    dominantFoot: e.target.value as IdentityInput['dominantFoot'],
                  })
                }
              >
                <option value="right">Prawa noga</option>
                <option value="left">Lewa noga</option>
              </select>
            </label>
            <label>
              Trudność kariery
              <select
                value={p.identity.difficulty ?? 'normal'}
                onChange={(e) =>
                  p.setIdentity({
                    ...p.identity,
                    difficulty: e.target.value as IdentityInput['difficulty'],
                  })
                }
              >
                <option value="easy">Łatwa — cudowne dziecko</option>
                <option value="normal">Normalna — absolwent akademii</option>
                <option value="hard">Trudna — surowy talent</option>
              </select>
            </label>
            <label>
              Seed kariery
              <input
                value={p.identity.customSeed}
                onChange={(e) => p.setIdentity({ ...p.identity, customSeed: e.target.value })}
              />
              <small>
                Pusty seed zostanie utworzony automatycznie. Ten sam seed odtwarza tę samą karierę.
              </small>
              <ErrorText errors={p.errors.customSeed} />
            </label>
            <nav className="creator-actions">
              <button onClick={p.nextIdentity}>Dalej &gt;</button>
            </nav>
          </div>
        )}
        {p.step === 1 && (
          <div className="form">
            <h1>Profil</h1>
            <div className="positions">
              {positionIds.map((id) => (
                <button
                  className={p.profile.position === id ? 'active' : ''}
                  key={id}
                  onClick={() => {
                    const [heightCm, weightKg] = defaultBodyForPosition(id);
                    p.setProfile({
                      position: id,
                      heightCm: String(heightCm),
                      weightKg: String(weightKg),
                    });
                  }}
                >
                  <strong>{translate(`position.${id}`)}</strong>
                  <span>{translate(`position.${id}.description`)}</span>
                </button>
              ))}
            </div>
            <label>
              Wzrost
              <div className="unit-field">
                <input
                  inputMode="numeric"
                  value={p.profile.heightCm}
                  onChange={(e) => p.setProfile({ ...p.profile, heightCm: e.target.value })}
                />
                <span>cm</span>
              </div>
              <ErrorText errors={p.errors.heightCm} />
            </label>
            <label>
              Masa ciała
              <div className="unit-field">
                <input
                  inputMode="numeric"
                  value={p.profile.weightKg}
                  onChange={(e) => p.setProfile({ ...p.profile, weightKg: e.target.value })}
                />
                <span>kg</span>
              </div>
              <small>
                Dozwolony zakres: {p.weightRange.min}–{p.weightRange.max} kg.
              </small>
              <ErrorText errors={p.errors.weightKg} />
            </label>
            <nav className="creator-actions">
              <button onClick={() => p.setStep(0)}>&lt; Wstecz</button>
              <button onClick={p.nextProfile}>Dalej &gt;</button>
            </nav>
          </div>
        )}
        {p.step === 2 && p.generated && (
          <div>
            <h1>Atrybuty</h1>
            <PlayerCard profile={p.generated} seed={p.seed} />
            <div className="variant-picker">
              {p.variants.map((_, index) => (
                <button
                  className={p.selectedVariant === index ? 'active' : ''}
                  key={index}
                  onClick={() => p.selectVariant(index)}
                >
                  Profil {index + 1}
                </button>
              ))}
            </div>
            <nav className="creator-actions">
              <button onClick={() => p.setStep(1)}>&lt; Wstecz</button>
              <button onClick={() => p.setStep(3)}>Akceptuj &gt;</button>
            </nav>
          </div>
        )}
        {p.step === 3 && p.generated && (
          <div>
            <h1>Podsumowanie</h1>
            <PlayerCard profile={p.generated} seed={p.seed} />
            <p>Wiek startowy: {p.generated.player.age} lat</p>
            <nav className="creator-actions">
              <button onClick={() => p.setStep(1)}>&lt; Wróć i popraw</button>
              <button onClick={p.finish}>Rozpocznij karierę</button>
            </nav>
          </div>
        )}
      </section>
    </div>
  </main>
);
