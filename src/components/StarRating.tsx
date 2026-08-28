import { getClubStars } from '../core/clubStrength';

export const StarRating = ({ strength }: { strength: number }) => {
  const rating = getClubStars(strength);
  return (
    <span className="star-rating" aria-label={`${rating} z 5 gwiazdek`} role="img">
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, rating - index));
        return (
          <span className="star-rating__star" key={index} aria-hidden="true">
            <span className="star-rating__empty">☆</span>
            <span className="star-rating__fill" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
};
