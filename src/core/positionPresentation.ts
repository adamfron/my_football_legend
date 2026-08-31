import type { FootballerProfile, PlayerPosition } from '../types/domain';
import { translate } from './narrative/localization';

export const positionLabel = (position: PlayerPosition) => translate(`position.${position}`);

export const positionCode = (position: PlayerPosition) => positionLabel(position).split(' — ')[0]!;

export const CANONICAL_POSITION_ORDER = [
  'goalkeeper',
  'left_back',
  'center_back',
  'right_back',
  'defensive_midfielder',
  'attacking_midfielder',
  'left_winger',
  'right_winger',
  'striker',
] as const satisfies readonly PlayerPosition[];

export const compareCanonicalPositions = (a: PlayerPosition, b: PlayerPosition) =>
  CANONICAL_POSITION_ORDER.indexOf(a) - CANONICAL_POSITION_ORDER.indexOf(b);

/** Familiarity used by the existing primary/secondary model; assignments never modify it. */
export const getMasteredPositions = (player: FootballerProfile) =>
  CANONICAL_POSITION_ORDER.filter((position) => player.positionFamiliarity[position] >= 0.75);
