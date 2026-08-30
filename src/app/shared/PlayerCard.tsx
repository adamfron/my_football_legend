import { getRadarAxes } from '../../core/radar';
import { translate } from '../../core/narrative/localization';
import type { PlayerAttributes } from '../../types/domain';
import { attributeKeys, type StartingPlayerProfile } from '../../core/playerCreator';
import { formatAttributeDelta, getSeasonAttributeDelta } from '../../core/developmentFeedback';

const RADAR_RADIUS = 75;
const RADAR_LABEL_RADIUS = 104;
const RADAR_MARGIN = 44;
const RADAR_CENTER = RADAR_RADIUS + RADAR_MARGIN;
const RADAR_VIEWBOX_SIZE = (RADAR_RADIUS + RADAR_MARGIN) * 2;

const tParam = (key: string, params: Record<string, string>) =>
  translate(key, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, translate(v)])));
const initials = (first: string, last: string) =>
  `${first[0] ?? 'M'}${last[0] ?? 'F'}`.toUpperCase();
export const RadarChart = ({
  attributes,
  baseline,
  baselineLabel = 'początek sezonu',
  currentLabel = 'obecnie',
}: {
  attributes: PlayerAttributes;
  baseline?: PlayerAttributes | undefined;
  baselineLabel?: string;
  currentLabel?: string;
}) => {
  const axes = getRadarAxes(attributes);
  const polygon = (values: ReturnType<typeof getRadarAxes>) =>
    values
      .map(({ value }, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
        const radius = (value / 100) * RADAR_RADIUS;
        return `${RADAR_CENTER + Math.cos(angle) * radius},${RADAR_CENTER + Math.sin(angle) * radius}`;
      })
      .join(' ');
  return (
    <figure className="radar">
      <svg
        viewBox={`0 0 ${RADAR_VIEWBOX_SIZE} ${RADAR_VIEWBOX_SIZE}`}
        role="img"
        aria-label="Porównanie profilu atrybutów"
      >
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle
            className="radar-grid"
            key={scale}
            cx={RADAR_CENTER}
            cy={RADAR_CENTER}
            r={RADAR_RADIUS * scale}
            fill="none"
          />
        ))}
        {axes.map(({ label }, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
          return (
            <g key={label}>
              <line
                className="radar-axis"
                x1={RADAR_CENTER}
                y1={RADAR_CENTER}
                x2={RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS}
                y2={RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS}
              />
              <text
                x={RADAR_CENTER + Math.cos(angle) * RADAR_LABEL_RADIUS}
                y={RADAR_CENTER + Math.sin(angle) * RADAR_LABEL_RADIUS}
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}
        {baseline && (
          <polygon
            className="radar-baseline"
            points={polygon(getRadarAxes(baseline))}
            strokeWidth="1.5"
          />
        )}
        <polygon className="radar-current" points={polygon(axes)} strokeWidth="3" />
      </svg>
      <figcaption>
        {axes.map(({ label, value }) => `${label} ${Math.round(value)}`).join(', ')}
      </figcaption>
      {baseline && (
        <div className="radar-legend">
          <span>— {baselineLabel}</span>
          <strong>— {currentLabel}</strong>
        </div>
      )}
    </figure>
  );
};

export const PlayerCard = ({
  profile,
  seed,
  baseline,
}: {
  profile: StartingPlayerProfile;
  seed: string;
  baseline?: PlayerAttributes | undefined;
}) => (
  <section className="card">
    <div className={`portrait portrait-${seed.length % 4}`}>
      <span>{initials(profile.player.firstName, profile.player.lastName)}</span>
    </div>
    <div>
      <h3>
        {profile.player.firstName} {profile.player.lastName}
      </h3>
      <p>
        {profile.player.age} lat · {translate(`nationality.${profile.player.nationality}`)} ·{' '}
        {translate(`position.${profile.player.primaryPosition}`)}
      </p>
      <p>
        {profile.player.heightCm} cm · {profile.player.weightKg} kg ·{' '}
        {translate(profile.player.dominantFoot === 'left' ? 'foot.left' : 'foot.right')}
      </p>
      <p>{tParam(profile.profileDescriptionKey, profile.profileDescriptionParams)}</p>
      <p>
        <strong>Seed kariery:</strong> <code>{seed}</code>
      </p>
      <p>
        <strong>Pierwszy klub:</strong> Vistula Nova
      </p>
    </div>
    <RadarChart attributes={profile.player.attributes} baseline={baseline} />
    <ul className="attrs">
      {attributeKeys.map((key) => (
        <li key={key}>
          <span>{translate(`attribute.${key}`)}</span>
          <strong>
            {profile.player.attributes[key]}{' '}
            {formatAttributeDelta(
              getSeasonAttributeDelta(profile.player.attributes, baseline, key),
            )}
          </strong>
        </li>
      ))}
    </ul>
  </section>
);
