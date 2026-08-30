import type { ClubVisualIdentity } from '../types/domain';
import { getClubIdentityOutline } from '../core/clubVisualIdentity';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

/** One deterministic presentation of a club's canonical, static identity. */
export const ClubCrest = ({
  name,
  identity,
  size = 'large',
}: {
  name: string;
  identity: ClubVisualIdentity;
  size?: 'small' | 'large';
}) => (
  <svg
    className={`club-crest club-crest-${size}`}
    viewBox="0 0 100 120"
    role="img"
    aria-label={`Herb ${name}`}
    data-club-crest={name}
  >
    <path
      d="M12 10h76v48c0 29-18 45-38 54C30 103 12 87 12 58z"
      fill={identity.primaryColor}
      stroke={getClubIdentityOutline(identity)}
      strokeWidth="5"
    />
    <path
      d="M25 24h50v16H25zM28 51l22 35 22-35"
      fill={identity.secondaryColor}
      stroke={getClubIdentityOutline(identity)}
      strokeWidth="1.5"
    />
    <text
      x="50"
      y="103"
      textAnchor="middle"
      fontSize="14"
      fontWeight="900"
      fill={identity.secondaryColor}
      stroke={getClubIdentityOutline(identity)}
      strokeWidth="0.8"
    >
      {initials(name)}
    </text>
  </svg>
);
