import type { FormationId } from '../../core/footballerWorld';

export interface PitchCoordinate {
  x: number;
  y: number;
}
const row = (y: number, xs: number[]): PitchCoordinate[] => xs.map((x) => ({ x, y }));

/** Stable presentation coordinates in the same slot order as canonical FORMATIONS. */
export const FORMATION_COORDINATES: Record<FormationId, readonly PitchCoordinate[]> = {
  '4-3-3': [
    ...row(91, [50]),
    ...row(72, [14, 38, 62, 86]),
    ...row(49, [50]),
    ...row(34, [32, 68]),
    ...row(13, [18, 82]),
    ...row(8, [50]),
  ],
  '4-2-3-1': [
    ...row(91, [50]),
    ...row(72, [14, 38, 62, 86]),
    ...row(52, [37, 63]),
    ...row(30, [16, 50, 84]),
    ...row(9, [50]),
  ],
  '4-4-2': [
    ...row(91, [50]),
    ...row(72, [14, 38, 62, 86]),
    ...row(43, [38, 62]),
    ...row(34, [14, 86]),
    ...row(10, [36, 64]),
  ],
  '3-4-2-1': [
    ...row(91, [50]),
    ...row(70, [25, 50, 75]),
    ...row(47, [13, 87]),
    ...row(48, [38, 62]),
    ...row(27, [35, 65]),
    ...row(8, [50]),
  ],
  '3-5-2': [
    ...row(91, [50]),
    ...row(70, [25, 50, 75]),
    ...row(47, [13, 87]),
    ...row(49, [50]),
    ...row(32, [34, 66]),
    ...row(9, [36, 64]),
  ],
};
