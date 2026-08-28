import { getClubStars } from '../core/clubStrength';
import { StarRating } from './StarRating';

export const ClubStrengthTooltip = ({ name, strength }: { name: string; strength: number }) => {
  const text = `${getClubStars(strength)} z 5 gwiazdek · ${Math.round(strength)}/100`;
  return (
    <span
      className="club-strength-tooltip"
      tabIndex={0}
      title={text}
      aria-label={`${name}: ${text}`}
    >
      <span>{name}</span>
      <span className="club-strength-tooltip__content" aria-hidden="true">
        <StarRating strength={strength} /> · {Math.round(strength)}/100
      </span>
    </span>
  );
};
