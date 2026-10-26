import { useEffect, useRef, useState } from 'react';
import {
  runPerceptionLab,
  perceptionLabConfigSchema,
  type PerceptionLabResult,
  type PerceptionLabConfig,
} from '../../core/matchSimulation/perceptionLaboratory';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import type { TacticalFrame } from './tacticalRenderer/model';

const conditions: Record<PerceptionLabConfig['condition'], string> = {
  prior_scan: 'Wcześniejsza obserwacja',
  no_scan: 'Bez wcześniejszej obserwacji',
  active_scan: 'Aktywne rozglądanie się',
  stale: 'Stara obserwacja',
  moved: 'Partner zmienił miejsce',
  lane_closed: 'Obrońca zamknął korytarz',
  urgent: 'Pilny pressing',
  wrong_body: 'Niekorzystne ustawienie ciała',
  moving: 'Partner w ruchu',
  fast: 'Szybka piłka',
  far_side: 'Opcja po drugiej stronie',
  wide: 'Przyjęcie szeroko',
  patient: 'Cierpliwe instrukcje',
  counter: 'Przeciwnik w przejściu',
  organised: 'Zorganizowana obrona',
  repeated_effort: 'Po serii fizycznych sprintów',
  fatigued: 'Niska gotowość fizyczna',
  protecting: 'Obrona prowadzenia',
  chasing: 'Odrabianie wyniku',
};
const attributes: Record<PerceptionLabConfig['attribute'], string> = {
  gameReading: 'Czytanie gry',
  concentration: 'Koncentracja',
  composure: 'Opanowanie',
  technique: 'Technika',
  firstTouch: 'Pierwszy kontakt',
  agility: 'Zwinność',
  leadership: 'Przywództwo — kontrola ujemna',
};
const actions: Record<string, string> = {
  hold: 'utrzymanie',
  carry: 'prowadzenie',
  pass: 'podanie',
  shot: 'strzał',
};
const tempo: Record<string, string> = {
  patient: 'cierpliwie',
  balanced: 'równowaga',
  accelerate: 'przyspieszenie',
  recover: 'powrót',
  urgent: 'pilna gra',
};
const source: Record<string, string> = {
  current: 'ostatnia obserwacja',
  remembered: 'pamięć',
  predicted: 'krótka predykcja',
};
const invalidations: Record<string, string> = {
  opportunity_expired: 'okazja wygasła',
  actual_reception_differs: 'inne miejsce rzeczywistego przyjęcia',
  evidence_no_longer_available: 'brak aktualnych informacji',
  observed_offside: 'zaobserwowany spalony',
  observed_lane_closed: 'zaobserwowane zamknięcie korytarza',
  target_moved: 'partner zmienił miejsce',
  latest_observed_lane_or_target_changed: 'zmienił się obserwowany cel lub korytarz',
};
const projectFrame = (r: PerceptionLabResult, index: number, overlays: boolean): TacticalFrame => {
  const s = r.samples[index]!,
    actor = s.players.find((p) => p.id === r.receiverId)!;
  const lines: NonNullable<TacticalFrame['laboratoryLines']> = [];
  if (overlays) {
    const gaze = s.scene.attention ?? s.scene.facing;
    lines.push({
      color: '#72d9ff',
      points: [
        actor.position,
        { x: actor.position.x + Math.sin(gaze) * 9, y: actor.position.y + Math.cos(gaze) * 9 },
      ],
    });
    for (const p of s.scene.remembered ?? [])
      lines.push({ color: '#ffb667', points: [actor.position, p.position] });
    if (s.plan)
      for (const c of s.plan.options)
        if (c.target)
          lines.push({
            color: s.plan.usedId === c.id ? '#78ff9d' : '#d19bff',
            points: [actor.position, c.target],
          });
    if (s.position) lines.push({ color: '#fff17c', points: [actor.position, s.position.target] });
  }
  return {
    timestampMs: s.at * 1000,
    players: s.players.map((p) => ({
      id: p.id,
      team: p.team,
      ...p.position,
      velocity: p.velocity,
      facing: p.facing,
      target: p.target,
    })),
    ball: {
      x: s.ball.x,
      y: s.ball.y,
      height: s.ball.z,
      velocity: s.velocity,
      ...(s.ownerId ? { ownerId: s.ownerId } : {}),
    },
    laboratoryLines: lines,
    showMotionVectors: overlays,
  };
};
export function PerceptionLaboratoryPanel() {
  const [condition, setCondition] = useState<PerceptionLabConfig['condition']>('prior_scan'),
    [attribute, setAttribute] = useState<PerceptionLabConfig['attribute']>('gameReading'),
    [level, setLevel] = useState(60),
    [mirror, setMirror] = useState(false);
  const [perception, setPerception] = useState(true),
    [positions, setPositions] = useState(true),
    [effort, setEffort] = useState(true);
  const [result, setResult] = useState<PerceptionLabResult>(),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [overlays, setOverlays] = useState(true),
    [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<TacticalPitchRenderer | undefined>(undefined);
  useEffect(() => {
    if (!host.current || !result) return;
    const view = new TacticalPitchRenderer(
      host.current,
      projectFrame(result, 0, true),
      (message) => {
        if (message && !message.includes('waiting_for_layout')) setError(message);
      },
    );
    renderer.current = view;
    view.setCameraPreferences({ preset: 'overview', zoom: 1.2 });
    return () => {
      view.dispose();
      renderer.current = undefined;
    };
  }, [result]);
  useEffect(() => {
    if (result) renderer.current?.render(projectFrame(result, index, overlays), true);
  }, [result, index, overlays]);
  useEffect(() => {
    if (!playing || !result) return;
    const timer = setInterval(
      () =>
        setIndex((i) => {
          if (i + 1 >= result.samples.length) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [playing, result]);
  const sample = result?.samples[index],
    latest = result?.actions.filter((a) => a.actorId === result.receiverId).at(-1);
  return (
    <section aria-label="Laboratorium percepcji i przygotowania">
      <p>
        Co zawodnik wiedział przed przyjęciem? Porównaj obserwacje, pamięć i przygotowane opcje z
        rzeczywistym lotem i kontaktem. Pierwsze podanie jest zadanym wejściem próby; dalsza gra
        jest autonomiczna.
      </p>
      <div className="perception-lab-controls">
        <label>
          Sytuacja{' '}
          <select
            aria-label="Sytuacja percepcji"
            value={condition}
            onChange={(e) =>
              setCondition(perceptionLabConfigSchema.shape.condition.unwrap().parse(e.target.value))
            }
          >
            {Object.entries(conditions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Atrybut{' '}
          <select
            aria-label="Atrybut percepcji"
            value={attribute}
            onChange={(e) =>
              setAttribute(perceptionLabConfigSchema.shape.attribute.unwrap().parse(e.target.value))
            }
          >
            {Object.entries(attributes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Poziom{' '}
          <select
            aria-label="Poziom atrybutu"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          >
            {[20, 40, 60, 80, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />{' '}
          Odbicie geometrii
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={perception}
            onChange={(e) => setPerception(e.target.checked)}
          />{' '}
          Percepcja i przygotowanie
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={positions}
            onChange={(e) => setPositions(e.target.checked)}
          />{' '}
          Pozycja do przyjęcia
        </label>{' '}
        <label>
          <input type="checkbox" checked={effort} onChange={(e) => setEffort(e.target.checked)} />{' '}
          Tempo i wysiłek
        </label>{' '}
        <button
          onClick={() => {
            try {
              setError('');
              setPlaying(false);
              setIndex(0);
              setResult(
                runPerceptionLab({
                  id: 'human-pr194',
                  seed: 'pr194-paired-development',
                  condition,
                  attribute,
                  level,
                  mirror,
                  perception,
                  positions,
                  tempo: effort,
                }),
              );
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Uruchom próbę percepcji
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        ref={host}
        style={{
          height: result ? 440 : 0,
          minWidth: 300,
          position: 'relative',
          overflow: 'hidden',
        }}
      />
      {result && sample && (
        <>
          <button onClick={() => setPlaying(!playing)}>{playing ? 'Pauza' : 'Odtwórz'}</button>{' '}
          <label>
            Czas{' '}
            <input
              aria-label="Czas próby percepcji"
              type="range"
              min={0}
              max={result.samples.length - 1}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
            />
          </label>{' '}
          <span>{(sample.at - result.initial.time).toFixed(2)} s</span>{' '}
          <label>
            <input
              type="checkbox"
              checked={overlays}
              onChange={(e) => setOverlays(e.target.checked)}
            />{' '}
            Kierunek uwagi, pamięć i zamiary
          </label>
          <p>
            Niebieska linia: uwaga. Pomarańczowe: zapamiętane pozycje. Fioletowe: przygotowane
            opcje. Żółta: pozycja do przyjęcia. Zawodnicy na boisku pokazują rzeczywisty stan
            świata.
          </p>
          <p>
            Tempo: {sample.tempo ? tempo[sample.tempo.mode] : 'brak oceny'} · zdolność fizyczna{' '}
            {Math.round((sample.fitness?.burst ?? 1) * 100)}% · wydatkowana praca{' '}
            {sample.fitness?.exertion.toFixed(1) ?? '—'}.
          </p>
          <p>
            Kontakt odbiorcy:{' '}
            {result.receiverContactAt === null
              ? 'nie nastąpił'
              : `${(result.receiverContactAt - result.initial.time).toFixed(3)} s`}{' '}
            · ostatni zamiar odbiorcy w całej próbie:{' '}
            {latest ? (actions[latest.type] ?? 'inna akcja') : 'brak'}. Zamiar nie oznacza
            wykonanego kontaktu.
          </p>
          <details open>
            <summary>Wiedza zawodnika w tej chwili</summary>
            <table>
              <thead>
                <tr>
                  <th>Obiekt</th>
                  <th>Źródło</th>
                  <th>Wiek</th>
                  <th>Niepewność</th>
                </tr>
              </thead>
              <tbody>
                {sample.scene.knowledge?.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{source[p.source]}</td>
                    <td>{(sample.at - p.observedAt).toFixed(2)} s</td>
                    <td>±{p.uncertainty.toFixed(2)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details open>
            <summary>Przygotowane opcje ({sample.plan?.options.length ?? 0})</summary>
            <ul>
              {sample.plan?.options.map((p) => (
                <li key={p.id}>
                  {actions[p.kind]} · pewność {Math.round(p.confidence * 100)}% · wygaśnięcie{' '}
                  {(p.expiresAt - result.initial.time).toFixed(2)} s{' '}
                  {sample.plan?.usedId === p.id
                    ? '· zgodne z rzeczywistym wypuszczeniem piłki'
                    : ''}
                </li>
              ))}
            </ul>
            {sample.plan?.invalidated.map((p, i) => (
              <p key={`${p.id}:${i}`}>{invalidations[p.reason] ?? p.reason}</p>
            ))}
            <p>
              Przygotowana opcja podlega ponownej ocenie. Niewidziana zmiana może pozostać nieznana
              i spowodować błąd.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
