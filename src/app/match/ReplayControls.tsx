import { formatMatchTime } from './matchTime';
import type { ReplaySpeed } from './replayViewer';

export const ReplayControls = ({
  title,
  eventAt,
  playing,
  speed,
  onPlaying,
  onSpeed,
  onRestart,
  onLive,
}: {
  title: string;
  eventAt?: number | undefined;
  playing: boolean;
  speed: ReplaySpeed;
  onPlaying(value: boolean): void;
  onSpeed(value: ReplaySpeed): void;
  onRestart(): void;
  onLive(): void;
}) => (
  <section className="replay-controls" aria-label="Sterowanie powtórką">
    <strong>
      {title}
      {eventAt !== undefined ? ` · ${formatMatchTime(eventAt)}` : ''}
    </strong>
    <button onClick={() => onPlaying(!playing)}>
      {playing ? 'Pauza powtórki' : 'Odtwórz powtórkę'}
    </button>
    <button onClick={onRestart}>Powtórka od początku</button>
    <label>
      Tempo powtórki{' '}
      <select
        aria-label="Tempo powtórki"
        value={speed}
        onChange={(event) => onSpeed(Number(event.target.value) as ReplaySpeed)}
      >
        {[0.25, 0.5, 1, 2].map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>
    </label>
    <button onClick={onLive}>Wróć do meczu</button>
  </section>
);
