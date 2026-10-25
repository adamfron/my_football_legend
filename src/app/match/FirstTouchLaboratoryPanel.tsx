import { useEffect, useRef, useState } from 'react';
import type { FootballerProfile } from '../../types/domain';
import { createFirstTouchLabCatalog } from '../../core/matchSimulation/firstTouchLabCatalog';
import {
  runFirstTouchLab,
  type FirstTouchLabResult,
} from '../../core/matchSimulation/firstTouchLaboratory';
import { ballSurfaceSchema } from '../../core/matchSimulation/ballSurfaceContact';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import type { TacticalFrame } from './tacticalRenderer/model';

const labels: Record<string, string> = {
  ground: 'Zwykłe podanie',
  fast_low: 'Szybkie niskie podanie',
  rising: 'Piłka wznosząca',
  flat_aerial: 'Płaskie podanie górą',
  descending_chest: 'Opadająca piłka — klatka',
  descending_thigh: 'Opadająca piłka — udo',
  blocked_thigh: 'Próba uda przerwana kontaktem tułowia',
  knee: 'Kolano',
  lower_leg: 'Goleń',
  bouncing: 'Piłka po koźle',
  side_spin: 'Rotacja boczna',
  top_spin: 'Rotacja w przód',
  back_spin: 'Rotacja wstecz',
  behind: 'Przyjęcie tyłem',
  weak_foot: 'Słabsza stopa',
  late_preparation: 'Spóźnione przygotowanie',
  direction_45: 'Zmiana kierunku o 45°',
  direction_90: 'Zmiana kierunku o 90°',
  direction_180: 'Zmiana kierunku o 180°',
  continue_run: 'Przyjęcie w biegu',
  pressure: 'Przyjęcie pod presją',
  lifted_thigh: 'Kierunkowy kontakt uda pod presją',
  first_time_pass: 'Podanie z pierwszej piłki',
  outside_pass: 'Odegranie zewnętrzną częścią stopy',
  close_shot: 'Strzał z bliska',
  chest_redirect: 'Przekierowanie klatką',
  juggle_2: 'Dwa podbicia',
  juggle_5: 'Pięć podbić',
  juggle_10: 'Dziesięć podbić',
  alternating_juggle: 'Podbicia naprzemienne',
  mixed_juggle: 'Podbicia mieszane',
  unsupported_header: 'Główka — ograniczenie aparatury',
  unsupported_overhead: 'Przewrotka — niedostępna',
  autonomous_ground: 'Autonomiczne przyjęcie dołem',
  autonomous_aerial: 'Autonomiczne przyjęcie górą',
  manual_ground: 'Ręczny wybór kontaktu',
};
const surfaceLabels: Record<string, string> = {
  inside: 'Wewnętrzna część stopy',
  outside: 'Zewnętrzna część stopy',
  instep: 'Podbicie',
  sole: 'Podeszwa',
  cushion: 'Amortyzacja stopą',
  protection: 'Osłona stopą',
  thigh: 'Udo',
  knee: 'Kolano',
  lower_leg: 'Goleń',
  chest: 'Klatka piersiowa',
  head: 'Głowa (historyczny mechanizm)',
  overhead: 'Przewrotka (niedostępna)',
};
const modes = { prescribed: 'Zadany', autonomous: 'Autonomiczny', manual: 'Ręczny' } as const;
const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z).toFixed(2);

/** Read-only trial inspection on the existing pitch renderer. These samples come
 * from execution; animation cues never decide whether a surface made contact. */
export function FirstTouchLaboratoryPanel({ profiles }: { profiles: FootballerProfile[] }) {
  const catalog = createFirstTouchLabCatalog();
  const [id, setId] = useState('ground'),
    [playerId, setPlayerId] = useState(
      profiles.find((p) => p.primaryPosition !== 'goalkeeper')?.id ?? profiles[0]!.id,
    ),
    [zoom, setZoom] = useState(1.2),
    [mode, setMode] = useState<keyof typeof modes>('prescribed'),
    [surface, setSurface] = useState('cushion'),
    [seed, setSeed] = useState('pr191-inspection'),
    [result, setResult] = useState<FirstTouchLabResult>(),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState<string>();
  const profile = profiles.find((p) => p.id === playerId) ?? profiles[0]!;
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<TacticalPitchRenderer | undefined>(undefined);
  const frame = (r: FirstTouchLabResult, i: number): TacticalFrame => {
    const s = r.samples[i] ?? r.samples[0]!;
    return {
      timestampMs: s.at * 1000,
      players: [
        {
          id: r.input.player.id,
          team: 'home',
          ...s.player,
          facing: s.facing,
          velocity: s.playerVelocity,
          heightCm: r.input.player.heightCm,
          weightKg: r.input.player.weightKg,
          protagonist: true,
        },
        ...(s.defender ? [{ id: 'lab-defender', team: 'away' as const, ...s.defender }] : []),
      ],
      ball: { x: s.ball.x, y: s.ball.y, height: s.ball.z, velocity: s.velocity },
      selectedPoint: r.input.config.target,
      showMotionVectors: true,
    };
  };
  useEffect(() => {
    if (!host.current || !result?.samples.length) return;
    const view = new TacticalPitchRenderer(host.current, frame(result, 0), (message) => {
      if (message && !message.includes('waiting_for_layout')) setError(message);
    });
    view.setCameraPreferences({ preset: 'player_focus', zoom: 1.2 }, result.input.player.id);
    renderer.current = view;
    return () => {
      view.dispose();
      renderer.current = undefined;
    };
  }, [result]);
  useEffect(() => {
    if (result?.samples.length) renderer.current?.render(frame(result, index), true);
  }, [result, index]);
  useEffect(() => {
    if (result)
      renderer.current?.setCameraPreferences(
        { preset: 'player_focus', zoom },
        result.input.player.id,
      );
  }, [zoom, result]);
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
  return (
    <section aria-label="Laboratorium pierwszego kontaktu">
      <p>
        Próby PR191: zadanie, rzeczywisty kontakt i dalszy lot. Wykorzystują wybranego zawodnika z
        tego meczu.
      </p>
      <label>
        Zawodnik{' '}
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Ćwiczenie{' '}
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            const c = catalog.find((v) => v.id === e.target.value)!;
            setMode(c.mode);
            setSurface(c.manualSurface ?? c.surface);
          }}
        >
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {labels[c.id]}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Tryb{' '}
        <select value={mode} onChange={(e) => setMode(e.target.value as keyof typeof modes)}>
          {Object.entries(modes).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>{' '}
      {mode === 'manual' && (
        <label>
          Kontakt{' '}
          <select value={surface} onChange={(e) => setSurface(e.target.value)}>
            {ballSurfaceSchema.options.map((s) => (
              <option key={s} value={s}>
                {surfaceLabels[s]}
              </option>
            ))}
          </select>
        </label>
      )}{' '}
      <label>
        Seed <input value={seed} onChange={(e) => setSeed(e.target.value)} />
      </label>{' '}
      <button
        onClick={() => {
          try {
            const c = catalog.find((v) => v.id === id)!;
            const r = runFirstTouchLab(
              {
                ...c,
                mode,
                ...(mode === 'manual' ? { manualSurface: ballSurfaceSchema.parse(surface) } : {}),
              },
              profile,
              seed,
            );
            setResult(r);
            setIndex(0);
            setPlaying(false);
            setError(undefined);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Uruchom próbę
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            Kontakty zawodnika: {result.metrics.actorContacts} · Kontrola:{' '}
            {result.metrics.controlAt === null
              ? 'nieuzyskana'
              : result.metrics.controlAt.toFixed(3) + ' s'}{' '}
            · Kontakt obrońcy: {result.metrics.defenderContact ? 'tak' : 'nie'} · Gol po
            przekroczeniu linii: {result.metrics.goal ? 'tak' : 'nie'}
          </p>
          <div
            ref={host}
            style={{ height: 360, width: '100%', position: 'relative', overflow: 'hidden' }}
          />
          <label>
            Zoom próby{' '}
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <button
            disabled={!result.samples.length}
            onClick={() => {
              if (index === result.samples.length - 1) setIndex(0);
              setPlaying((v) => !v);
            }}
          >
            {playing ? 'Pauza' : 'Odtwórz'}
          </button>{' '}
          <label>
            Przebieg próby{' '}
            <input
              type="range"
              min={0}
              max={Math.max(0, result.samples.length - 1)}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
            />
          </label>{' '}
          <span>{result.samples[index]?.at.toFixed(3)} s</span>
          <p>
            Model pokazuje trajektorię i ruch ciała. Dokładny kontakt uda lub klatki potwierdzają
            współrzędne i impuls w tabeli; animacja nie odtwarza jeszcze tych technik.
          </p>
          <table>
            <thead>
              <tr>
                <th>Czas [s]</th>
                <th>Zamiar</th>
                <th>Kontakt</th>
                <th>Punkt [m]</th>
                <th>Prędkość przed → po [m/s]</th>
                <th>Odbudowa [s]</th>
              </tr>
            </thead>
            <tbody>
              {result.contacts.map((c, i) => (
                <tr key={i}>
                  <td>{c.at.toFixed(3)}</td>
                  <td>{surfaceLabels[c.intendedSurface]}</td>
                  <td>{c.actualSurface ? surfaceLabels[c.actualSurface] : 'brak'}</td>
                  <td>{[c.point.x, c.point.y, c.point.z].map((v) => v.toFixed(3)).join(', ')}</td>
                  <td>
                    {length(c.incomingVelocity)} → {length(c.outgoingVelocity)}
                  </td>
                  <td>{c.recoverySeconds.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Konfiguracja, atrybuty i wynik</summary>
            <pre>
              {JSON.stringify(
                {
                  input: result.input,
                  metrics: result.metrics,
                  status: result.status,
                  reason: result.reason,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'pr191-' + id + '.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 0);
            }}
          >
            Zapisz próbę JSON
          </button>
        </>
      )}
    </section>
  );
}
