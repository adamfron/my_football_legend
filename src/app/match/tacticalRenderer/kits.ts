import {
  resolveClubVisualIdentity,
  getClubIdentityOutline,
} from '../../../core/clubVisualIdentity';
import type { ClubVisualIdentity } from '../../../types/domain';
import { kitPresentationSchema, type KitPresentation } from './model';

type ClubIdentitySource = Parameters<typeof resolveClubVisualIdentity>[1];
const valid = (color: string) => /^#[0-9a-f]{6}$/i.test(color);
const channels = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
export const kitColorDistance = (a: string, b: string) =>
  Math.hypot(...channels(a).map((value, i) => value - channels(b)[i]!));
const alternates = ['#ffffff', '#171b1d', '#f2ca38', '#8b4cba', '#28bac4'];
const mostDistinct = (candidates: string[], occupied: string[]) =>
  [...candidates].sort(
    (a, b) =>
      Math.min(...occupied.map((c) => kitColorDistance(b, c))) -
      Math.min(...occupied.map((c) => kitColorDistance(a, c))),
  )[0]!;

/** Club identity stays canonical. Changed away/keeper colours are match-only kit choices. */
export const projectMatchKits = (
  home: ClubIdentitySource,
  away: ClubIdentitySource,
): Record<'home' | 'away', KitPresentation> => {
  const identity = (club: ClubIdentitySource): ClubVisualIdentity => {
    const resolved = resolveClubVisualIdentity('club-identity', club);
    return valid(resolved.primaryColor) && valid(resolved.secondaryColor)
      ? resolved
      : resolveClubVisualIdentity('club-identity', { id: club.id });
  };
  const homeIdentity = identity(home),
    awayIdentity = identity(away);
  const homeShirt = homeIdentity.primaryColor;
  const awayShirt =
    kitColorDistance(homeShirt, awayIdentity.primaryColor) >= 0.55
      ? awayIdentity.primaryColor
      : kitColorDistance(homeShirt, awayIdentity.secondaryColor) >= 0.55
        ? awayIdentity.secondaryColor
        : mostDistinct(alternates, [homeShirt]);
  const homeKeeper = mostDistinct(alternates, [homeShirt, awayShirt]);
  const awayKeeper = mostDistinct(alternates, [homeShirt, awayShirt, homeKeeper]);
  const kit = (visual: ClubVisualIdentity, primary: string, keeper: string) =>
    kitPresentationSchema.parse({
      primary,
      secondary: visual.secondaryColor,
      accent: getClubIdentityOutline({ ...visual, primaryColor: primary }),
      shorts: visual.secondaryColor,
      socks: primary,
      pattern: 'solid',
      goalkeeper: {
        primary: keeper,
        accent: getClubIdentityOutline({ primaryColor: keeper, secondaryColor: keeper }),
      },
    });
  return {
    home: kit(homeIdentity, homeShirt, homeKeeper),
    away: kit(awayIdentity, awayShirt, awayKeeper),
  };
};
