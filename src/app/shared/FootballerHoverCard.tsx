import { getCareerNpcPlayStyles } from '../../core/npcCareerIdentity';
import { describeNpcDevelopment } from '../../core/npcFootballIdentity';
import { PLAY_STYLE_PRESENTATION } from '../../core/playStyles';
import { createPortal } from 'react-dom';
import type { CareerState, Contract, FootballerProfile } from '../../types/domain';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_PRESENTATION } from '../../core/attributePresentation';
import { getRankedFootballArchetypes } from '../../core/footballArchetypes';
import { translate } from '../../core/narrative/localization';
import { getPlayerOverall } from '../../core/playerOverall';
import { squadRoleLabel } from '../../core/careerPresentation';
import { RadarChart } from './PlayerCard';
import { positionLabel } from '../../core/positionPresentation';

export const FootballerHoverCard = ({
  player,
  career,
  contract,
  clubName,
  anchor,
  onClose,
}: {
  player: FootballerProfile;
  career?: CareerState;
  contract?: Contract | undefined;
  clubName: string;
  anchor: DOMRect;
  onClose: () => void;
}) => {
  const width = Math.min(560, window.innerWidth - 16);
  const estimatedHeight = Math.min(720, window.innerHeight - 16);
  const preferredLeft =
    anchor.right + 8 + width <= window.innerWidth - 8 ? anchor.right + 8 : anchor.left - width - 8;
  const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - estimatedHeight - 8));
  const archetype = getRankedFootballArchetypes(player)[0]?.definition;
  return createPortal(
    <aside
      className="footballer-hover-card"
      role="dialog"
      aria-label={`Profil: ${player.firstName} ${player.lastName}`}
      style={{ left, top, width }}
    >
      <header>
        <div>
          <strong>
            {player.firstName} {player.lastName}
          </strong>
          <span>
            {player.age} lat · {translate(`nationality.${player.nationality}`)}
          </span>
        </div>
        <button type="button" aria-label="Zamknij podgląd zawodnika" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="hover-card-identity">
        <p>
          {player.heightCm} cm / {player.weightKg} kg · {positionLabel(player.primaryPosition)}
        </p>
        <p>
          Inne pozycje:{' '}
          {player.secondaryPositions.length
            ? player.secondaryPositions.map(positionLabel).join(', ')
            : '—'}
        </p>
        <p>
          Noga: {translate(player.dominantFoot === 'left' ? 'foot.left' : 'foot.right')} · słabsza
          noga {player.weakFootProficiency}/100
        </p>
        <p>
          <strong>OVR {getPlayerOverall(player, player.primaryPosition)}</strong> ·{' '}
          {archetype?.label ?? '—'}
        </p>
      </div>
      {career && player.id !== career.player.id && (
        <div>
          <p>{describeNpcDevelopment(player)}</p>
          {getCareerNpcPlayStyles(career, player).map(({ style, source }) => (
            <p key={style} title={PLAY_STYLE_PRESENTATION[style].effect}>
              {PLAY_STYLE_PRESENTATION[style].name} ·{' '}
              {source === 'established'
                ? 'utrwalony styl'
                : source === 'development'
                  ? 'specjalizacja rozwinięta w karierze'
                  : 'doświadczenie z występów'}
            </p>
          ))}
        </div>
      )}
      <RadarChart
        attributes={player.attributes}
        position={player.primaryPosition}
        heightCm={player.heightCm}
      />
      <div className="compact-attributes">
        {ATTRIBUTE_GROUPS.map((group) => (
          <section key={group}>
            <h4>{ATTRIBUTE_PRESENTATION.find((item) => item.group === group)!.groupLabel}</h4>
            <ul>
              {ATTRIBUTE_PRESENTATION.filter((item) => item.group === group).map((item) => (
                <li key={item.key}>
                  <span>{item.label}</span>
                  <b>{player.attributes[item.key]}</b>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer>
        <strong>KONTRAKT</strong>
        {contract ? (
          <span>
            {clubName} · {contract.monthlySalary.toLocaleString('pl-PL')} zł/mies. · do{' '}
            {contract.endDate} · {squadRoleLabel(contract.squadRole)}
          </span>
        ) : (
          <span>Brak zawodowego kontraktu</span>
        )}
      </footer>
    </aside>,
    document.body,
  );
};
