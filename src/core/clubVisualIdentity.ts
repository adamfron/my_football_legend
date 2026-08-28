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
