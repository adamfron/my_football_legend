import { FORMATIONS, type FormationId } from '../../core/footballerWorld';

export interface PitchCoordinate {
  x: number;
  y: number;
}

/** Compatibility presentation view; canonical geometry lives on formation slots. */
export const FORMATION_COORDINATES: Record<FormationId, readonly PitchCoordinate[]> =
  Object.fromEntries(
    Object.entries(FORMATIONS).map(([formation, slots]) => [
      formation,
      slots.map(({ x, y }) => ({ x, y })),
    ]),
  ) as unknown as Record<FormationId, readonly PitchCoordinate[]>;
