import { useEffect, useRef, useState } from 'react';
import {
  runTransitionLab,
  transitionLabConfigSchema,
  type TransitionLabResult,
} from '../../core/matchSimulation/transitionLaboratory';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import type { TacticalFrame } from './tacticalRenderer/model';

const labels = {
  counterattack: 'Kontra i ruch po podaniu',
  contact_race: 'Wyścig do użytecznego kontaktu',
  clearance: 'Porównanie wybić obronnych',
  wing: 'Ryzyko w centrum i przy linii',
  crowded: 'Trzech obrońców przy linii',
  deflection: 'Dośrodkowanie i przypadkowe odbicie',
};
const variants = {
  autonomous: 'Autonomicznie',
  control: 'Odzyskanie kontroli',
  into_play: 'Wybicie w boisko',
  touchline: 'Wybicie na aut',
  goal_line: 'Wybicie za bramkę',
  late: 'Spóźniona interwencja',
  organised: 'Zorganizowana obrona',
  press_escape: 'Uwolnienie spod pressingu',
  fatigued: 'Zmęczenie',
  chasing: 'Odrabianie wyniku',
  protecting: 'Obrona wyniku',
  passive: 'Bierny początek obrońców',
  none: 'Początek bez obrońców',
};
const scenarioVariants: Record<keyof typeof labels, (keyof typeof variants)[]> = {
  counterattack: [
    'autonomous',
    'organised',
    'press_escape',
    'fatigued',
    'chasing',
    'protecting',
    'passive',
    'none',
  ],
  contact_race: ['autonomous', 'organised'],
  clearance: ['autonomous', 'control', 'into_play', 'touchline', 'goal_line', 'late'],
  wing: ['autonomous', 'organised'],
  crowded: ['autonomous', 'organised'],
  deflection: ['autonomous'],
};
const actionLabels: Record<string, string> = {
  hold: 'utrzymanie',
  carry: 'prowadzenie',
  pass: 'podanie',
  space_pass: 'podanie w przestrzeń',
  shot: 'strzał',
  challenge: 'interwencja',
  cross: 'dośrodkowanie',
  header: 'główka',
};
const restartLabels: Record<string, string> = {
  throw_in: 'aut',
  corner: 'rzut rożny',
  goal_kick: 'od bramki',
  free_kick: 'rzut wolny',
  free_kick_far: 'rzut wolny',
  penalty: 'rzut karny',
  kick_off: 'rozpoczęcie',
};
const projectTransitionFrame = (
  r: TransitionLabResult,
  index: number,
  overlays: boolean,
): TacticalFrame => {
  const s = r.samples[Math.min(index, r.samples.length - 1)]!;
  const lines: NonNullable<TacticalFrame['laboratoryLines']> = [];
  if (overlays) {
    const trail = r.samples.slice(0, index + 1).map((p) => p.ball);
    if (trail.length > 1) lines.push({ color: '#ffd65c', points: trail });
    for (const run of s.runs) {
      const p = s.players.find((p) => p.id === run.actorId);
      if (p)
        lines.push({
          color: run.kind === 'pass_and_run' ? '#7bff9a' : '#ef83ff',
          points: [run.origin, p.position, run.target],
        });
    }
    const candidate = r.candidates
      .filter((p) => p.opportunity)
      .sort((a, b) => b.benefit - a.benefit)[0];
    if (candidate && 'target' in candidate.action)
      lines.push({ color: '#76d8ff', points: [r.samples[0]!.ball, candidate.action.target] });
    for (const p of s.players.filter((p) => p.team === 'away').slice(0, 3))
      lines.push({ color: '#ee8899', points: [p.position, p.target] });
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
    showMotionVectors: overlays,
    laboratoryLines: lines,
  };
};

export function TransitionLaboratoryPanel() {
  const [scenario, setScenario] = useState<keyof typeof labels>('counterattack');
  const [variant, setVariant] = useState<keyof typeof variants>('autonomous');
  const [attacker, setAttacker] = useState(80),
    [defender, setDefender] = useState(80);
  const [lane, setLane] = useState<'central' | 'left' | 'right'>('central');
  const [delay, setDelay] = useState(0),
    [mirror, setMirror] = useState(false);
  const [result, setResult] = useState<TransitionLabResult>(),
    [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false),
    [overlays, setOverlays] = useState(false),
    [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<TacticalPitchRenderer | undefined>(undefined);
  useEffect(() => {
    if (!host.current || !result) return;
    const view = new TacticalPitchRenderer(
      host.current,
      projectTransitionFrame(result, 0, false),
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
    if (result) renderer.current?.render(projectTransitionFrame(result, index, overlays), true);
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
  const sample = result?.samples[index];
  return (
    <section aria-label="Laboratorium przejść i wybić">
      <p>
        Kontrolowane ustawienia początkowe, zwykłe decyzje zawodników i kanoniczna fizyka. Wynik
        próby nie jest z góry ustalony.
      </p>
      <label>
        Próba{' '}
        <select
          aria-label="Próba przejścia"
          value={scenario}
          onChange={(e) => {
            const next = transitionLabConfigSchema.shape.scenario.parse(e.target.value);
            setScenario(next);
            setVariant('autonomous');
            setLane(next === 'crowded' ? 'left' : 'central');
            setDelay(0);
            setPlaying(false);
            setResult(undefined);
          }}
        >
          {Object.entries(labels).map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Warunek{' '}
        <select
          aria-label="Warunek próby"
          value={variant}
          onChange={(e) =>
            setVariant(transitionLabConfigSchema.shape.variant.parse(e.target.value))
          }
        >
          {Object.entries(variants)
            .filter(([key]) => scenarioVariants[scenario].includes(key as keyof typeof variants))
            .map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
        </select>
      </label>{' '}
      <label>
        Atakujący{' '}
        <select value={attacker} onChange={(e) => setAttacker(Number(e.target.value))}>
          <option>40</option>
          <option>80</option>
        </select>
      </label>{' '}
      <label>
        Obrońca{' '}
        <select value={defender} onChange={(e) => setDefender(Number(e.target.value))}>
          <option>40</option>
          <option>80</option>
        </select>
      </label>{' '}
      <label>
        Korytarz{' '}
        <select
          value={lane}
          disabled={!['clearance', 'wing', 'crowded'].includes(scenario)}
          onChange={(e) => setLane(transitionLabConfigSchema.shape.lane.parse(e.target.value))}
        >
          <option value="central">Środek</option>
          <option value="left">Lewa linia</option>
          <option value="right">Prawa linia</option>
        </select>
      </label>{' '}
      <label>
        Opóźnienie próby{' '}
        <select
          value={delay}
          disabled={!['counterattack', 'contact_race', 'clearance'].includes(scenario)}
          onChange={(e) => setDelay(Number(e.target.value))}
        >
          {[0, 0.2, 0.5, 1].map((n) => (
            <option key={n} value={n}>
              {n} s
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />{' '}
        Odbicie geometrii
      </label>{' '}
      <button
        onClick={() => {
          try {
            setError('');
            setPlaying(false);
            setIndex(0);
            setResult(
              runTransitionLab({
                id: 'human-pr193',
                scenario,
                variant,
                attacker,
                defender,
                lane,
                delay,
                mirror,
              }),
            );
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Uruchom próbę przejścia
      </button>
      {error && <p role="alert">{error}</p>}
      <div ref={host} style={{ height: result ? 440 : 0, minWidth: 300 }} />
      {result && sample && (
        <>
          <button onClick={() => setPlaying(!playing)}>{playing ? 'Pauza' : 'Odtwórz'}</button>{' '}
          <label>
            Czas próby{' '}
            <input
              aria-label="Czas próby przejścia"
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
            Trajektoria, biegi i cele
          </label>
          <p>
            Akcja: {sample.action ? (actionLabels[sample.action] ?? 'inna') : 'brak'} · wznowienie:{' '}
            {sample.restart
              ? (restartLabels[sample.restart] ?? 'przygotowanie wznowienia')
              : 'piłka w grze'}{' '}
            · kontakty stopy do tej chwili:{' '}
            {result.contactFacts.filter((p) => p.executed && p.at <= sample.at).length} · odbicia
            ciała: {result.collisions.filter((p) => p.playerId && p.at <= sample.at).length}
          </p>
          <p>
            Obrona: szerokość {sample.away.width.toFixed(1)} m · głębokość{' '}
            {sample.away.depth.toFixed(1)} m · osłony środka {sample.away.centralScreens} · powroty{' '}
            {sample.away.recoveryRunners} · krycie biegów {sample.away.trackingRunners}.
          </p>
          <details>
            <summary>Prognozy okien i wyścigów</summary>
            <p>
              Estymacje odnoszą się do pierwszej obserwacji. Tor i kontakty w odtwarzaniu pokazują
              rzeczywisty przebieg.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Opcja</th>
                  <th>Przygotowanie</th>
                  <th>Wygaśnięcie</th>
                  <th>Margines kontaktu</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates
                  .filter((p) => p.opportunity)
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.opportunity!.preparationSeconds.toFixed(2)} s</td>
                      <td>
                        {p.opportunity!.closesAt === null
                          ? 'brak okna'
                          : `${(p.opportunity!.closesAt! - p.observedAt).toFixed(2)} s${p.opportunity!.horizonCensored ? '+' : ''}`}
                      </td>
                      <td>{p.opportunity!.contactMargin.toFixed(2)} s</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p>
              Prognoza nie przyznaje kontaktu ani posiadania. Geometria nóg nie pozwala jeszcze
              potwierdzić pełnej, fizycznej siatki. Powrót piłki, udany drybling i bramka nie są
              gwarantowane.
            </p>
          </details>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'mfl-pr193-lab.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Eksportuj zapis próby JSON
          </button>
        </>
      )}
    </section>
  );
}
