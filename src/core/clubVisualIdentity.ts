import type { ClubVisualIdentity } from '../types/domain';

/** Restrained, kit-like pairs. White/white is deliberately valid canonical data. */
export const CLUB_COLOR_PAIRS: readonly ClubVisualIdentity[] = [
  { primaryColor: '#285f8f', secondaryColor: '#ffffff' },
  { primaryColor: '#a33135', secondaryColor: '#ffffff' },
  { primaryColor: '#376b4a', secondaryColor: '#171b1d' },
  { primaryColor: '#7b3f57', secondaryColor: '#203550' },
  { primaryColor: '#e0b52d', secondaryColor: '#244f83' },
  { primaryColor: '#202426', secondaryColor: '#c59b35' },
  { primaryColor: '#276c70', secondaryColor: '#ffffff' },
  { primaryColor: '#a33135', secondaryColor: '#641f27' },
  { primaryColor: '#326da0', secondaryColor: '#203550' },
  { primaryColor: '#ffffff', secondaryColor: '#ffffff' },
];

const stableHash = (value: string) =>
  [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);

export const generateClubVisualIdentity = (seed: string, clubId: string): ClubVisualIdentity =>
  CLUB_COLOR_PAIRS[stableHash(`${seed}:${clubId}`) % CLUB_COLOR_PAIRS.length]!;

export const resolveClubVisualIdentity = (
  seed: string,
  club: { id: string; visualIdentity?: ClubVisualIdentity | undefined },
): ClubVisualIdentity => club.visualIdentity ?? generateClubVisualIdentity(seed, club.id);

const luminance = (hex: string) => {
  const values = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
};
const contrast = (a: string, b: string) => {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright! + 0.05) / (dark! + 0.05);
};
/** Neutral presentation outline; canonical club colours are never rewritten. */
export const getClubIdentityOutline = (identity: ClubVisualIdentity, background = '#f2f2f2') =>
  contrast(identity.primaryColor, background) < 2 ||
  contrast(identity.primaryColor, identity.secondaryColor) < 1.35
    ? luminance(identity.primaryColor) > 0.45
      ? '#171b1d'
      : '#ffffff'
    : identity.secondaryColor;
