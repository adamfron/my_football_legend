import { useMemo, useState } from 'react';
import { buildWorldBrowserRows } from '../../core/clubObservability';
import { positionCode } from '../../core/positionPresentation';
import type { CareerState, PlayerPosition } from '../../types/domain';

export const WorldBrowser = ({ career }: { career: CareerState }) => {
  const rows = useMemo(() => buildWorldBrowserRows(career), [career]);
  const [tier, setTier] = useState(0);
  const [position, setPosition] = useState('');
  const [maxAge, setMaxAge] = useState(99);
  const visible = rows
    .filter(
      (row) =>
        (!tier || row.leagueTier === tier) &&
        (!position || row.position === position) &&
        row.age <= maxAge,
    )
    .slice(0, 50);
  return (
    <section className="world-browser" aria-label="DEV World Browser">
      <h2>DEV · Przegląd świata (tylko odczyt)</h2>
      <label>
        Liga{' '}
        <select value={tier} onChange={(e) => setTier(Number(e.target.value))}>
          <option value={0}>Wszystkie</option>
          {[1, 2, 3, 4].map((v) => (
            <option key={v} value={v}>
              Poziom {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Pozycja{' '}
        <select value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="">Wszystkie</option>
          {[...new Set(rows.map((r) => r.position))].map((v) => (
            <option key={v} value={v}>
              {positionCode(v as PlayerPosition)}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => setMaxAge(21)}>Najlepsi U21</button>
      <button onClick={() => setMaxAge(18)}>Najlepsi U18</button>
      <button onClick={() => setMaxAge(99)}>Top 50</button>
      <table>
        <thead>
          <tr>
            <th>Zawodnik</th>
            <th>Wiek</th>
            <th>Klub</th>
            <th>Liga</th>
            <th>Poz.</th>
            <th>OVR</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={`${row.clubId}:${row.id}`}>
              <td>{row.name}</td>
              <td>{row.age}</td>
              <td>{row.clubName}</td>
              <td>{row.leagueTier}</td>
              <td>{positionCode(row.position)}</td>
              <td>
                <strong>{row.overall}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
