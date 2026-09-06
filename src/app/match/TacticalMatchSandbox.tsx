import { useEffect, useRef, useState } from 'react';
import { createTacticalScenarios } from './tacticalRenderer/scenarios';
import { interpolateFrame, type TacticalFrame } from './tacticalRenderer/model';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import './TacticalMatchSandbox.css';

const scenarios = createTacticalScenarios();

export const TacticalMatchSandbox = () => {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = scenarios[scenarioIndex]!;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TacticalPitchRenderer | undefined>(undefined);
  const frameRef = useRef<TacticalFrame>(scenario.sequence.frames[0]!);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const renderer = new TacticalPitchRenderer(host, frameRef.current);
      rendererRef.current = renderer;
      return () => {
        renderer.dispose();
        rendererRef.current = undefined;
      };
    } catch {
      queueMicrotask(() => setRenderError(true));
      host.replaceChildren();
    }
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime: number | undefined;
    const animate = (time: number) => {
      if (previousTime === undefined) previousTime = time;
      const delta = time - previousTime;
      previousTime = time;
      setElapsedMs((current) => {
        const next = Math.min(current + delta, scenario.sequence.durationMs);
        if (next === scenario.sequence.durationMs) setPlaying(false);
        return next;
      });
      animationFrame = requestAnimationFrame(animate);
    };
    if (playing) animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing, scenario.sequence]);

  useEffect(() => {
    const frame = interpolateFrame(scenario.sequence, elapsedMs);
    frameRef.current = frame;
    rendererRef.current?.render(frame);
  }, [elapsedMs, scenario.sequence]);

  const selectScenario = (index: number) => {
    setPlaying(false);
    setScenarioIndex(index);
    setElapsedMs(0);
    frameRef.current = scenarios[index]!.sequence.frames[0]!;
  };
  const restart = () => {
    setPlaying(false);
    setElapsedMs(0);
  };
  const complete = () => {
    setPlaying(false);
    setElapsedMs(scenario.sequence.durationMs);
  };
  const ended = elapsedMs >= scenario.sequence.durationMs;

  return (
    <main className="tactical-sandbox">
      <header>
        <div>
          <span className="dev-badge">DEV · PR86</span>
          <h1>Izometryczna tablica meczowa</h1>
        </div>
        <p>Stała kamera · atak gospodarzy →</p>
      </header>
      <nav aria-label="Scenariusze demonstracyjne">
        {scenarios.map((item, index) => (
          <button
            className={index === scenarioIndex ? 'active' : ''}
            key={item.id}
            onClick={() => selectScenario(index)}
          >
            {String.fromCharCode(65 + index)}. {item.title}
          </button>
        ))}
      </nav>
      <section className="sandbox-grid">
        <div
          className="pitch-stage"
          ref={hostRef}
          aria-label="Animowana taktyczna wizualizacja boiska"
        >
          {renderError && (
            <p role="alert">
              Nie udało się uruchomić WebGL. Opis sytuacji i wynik pozostają dostępne obok boiska.
            </p>
          )}
        </div>
        <aside className="decision-board">
          <small>SYTUACJA TAKTYCZNA</small>
          <h2>{scenario.title}</h2>
          <p>{scenario.situation}</p>
          {!ended ? (
            <button className="primary-choice" onClick={() => setPlaying(true)} disabled={playing}>
              {playing ? 'Akcja trwa…' : scenario.choice}
            </button>
          ) : (
            <div className="sandbox-result" aria-live="polite">
              <small>WYNIK SEKWENCJI</small>
              <strong>{scenario.sequence.result}</strong>
            </div>
          )}
          <div className="playback-controls">
            <button onClick={() => setPlaying((value) => !value)}>
              {playing ? 'Pauza' : 'Odtwórz'}
            </button>
            <button onClick={restart}>Od początku</button>
            <button onClick={complete}>Do końca</button>
          </div>
          <label>
            Przebieg <progress max={scenario.sequence.durationMs} value={elapsedMs} />{' '}
            {Math.round(elapsedMs / 100) / 10}s
          </label>
          <p className="legend">
            <i className="home-dot" /> Gospodarze <i className="away-dot" /> Goście <b>○</b>{' '}
            protagonista
          </p>
          <p className="sandbox-note">
            Renderer wyświetla wyłącznie wcześniej rozstrzygnięte klatki. Nie oblicza powodzenia
            akcji.
          </p>
        </aside>
      </section>
    </main>
  );
};
