import type { MatchMomentumPoint } from '../types/domain';

export const MatchMomentumChart = ({
  points,
  currentMinute = 90,
}: {
  points: MatchMomentumPoint[];
  currentMinute?: number;
}) => {
  const visible = points.filter((point) => point.minute <= currentMinute);
  const path = (side: 'homeThreat' | 'awayThreat', direction: number) =>
    visible
      .map(
        (point, index) =>
          `${index ? 'L' : 'M'} ${point.minute} ${50 - direction * point[side] * 0.42}`,
      )
      .join(' ');
  return (
    <figure
      className="momentum-chart"
      aria-label={`Dynamika meczu od 0 do ${currentMinute} minuty. Gospodarze nad osią, goście pod osią.`}
    >
      <svg viewBox="0 0 90 100" role="img" preserveAspectRatio="none">
        <line x1="0" y1="50" x2="90" y2="50" className="momentum-axis" />
        <path d={path('homeThreat', 1)} className="momentum-home" />
        <path d={path('awayThreat', -1)} className="momentum-away" />
        {visible
          .filter((p) => p.event === 'goal')
          .map((p) => (
            <g key={`goal-${p.minute}`}>
              <line x1={p.minute} y1="8" x2={p.minute} y2="92" className="goal-marker" />
              <text x={p.minute} y="9">
                ⚽
              </text>
            </g>
          ))}
        <line x1={currentMinute} y1="2" x2={currentMinute} y2="98" className="minute-marker" />
      </svg>
      <figcaption>Gospodarze ↑ · Goście ↓ · obecnie {currentMinute}'</figcaption>
    </figure>
  );
};
