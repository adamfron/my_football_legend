import { getClubStrengthPresentation } from '../core/clubStrength';
import { StarRating } from './StarRating';

export const ClubStrengthTooltip = ({ name, strength }: { name: string; strength: number }) => {
  const presentation = getClubStrengthPresentation(strength);
  const text = `${presentation.stars} z 5 gwiazdek · ${presentation.displayedInteger}/100`;
  return (
    <span
      className="club-strength-tooltip"
      tabIndex={0}
      title={text}
      aria-label={`${name}: ${text}`}
    >
      <span>{name}</span>
      <span className="club-strength-tooltip__content" aria-hidden="true">
        <StarRating strength={strength} /> · {presentation.displayedInteger}/100
      </span>
    </span>
  );
};
