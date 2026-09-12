import { z } from 'zod';
import type { FormationSlot } from '../footballerWorld';

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

export const teamSideSchema = z.enum(['home', 'away']);
export type TeamSide = z.infer<typeof teamSideSchema>;

/** Canonical team-space direction: home attacks increasing x, away decreasing x. */
export const attackDirection = (side: TeamSide): 1 | -1 => (side === 'home' ? 1 : -1);

export const signedForwardDistance = (from: PitchPoint, to: PitchPoint, side: TeamSide) =>
  (to.x - from.x) * attackDirection(side);

export const isAheadOf = (from: PitchPoint, to: PitchPoint, side: TeamSide) =>
  signedForwardDistance(from, to, side) > 0;
export const pitchPointSchema = z.object({
  x: z.number().min(0).max(PITCH_LENGTH),
  y: z.number().min(0).max(PITCH_WIDTH),
});
export type PitchPoint = z.infer<typeof pitchPointSchema>;
/** A finite physical coordinate which is not necessarily inside the pitch. */
export const physicalPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type PhysicalPoint = z.infer<typeof physicalPointSchema>;
export const teamPointSchema = z.object({
  depth: z.number().min(0).max(1),
  lateral: z.number().min(-1).max(1),
});
export type TeamPoint = z.infer<typeof teamPointSchema>;

export const formationSlotToTeamSpace = (slot: FormationSlot): TeamPoint => ({
  depth: 1 - slot.y / 100,
  lateral: (slot.x - 50) / 50,
});

/** Team-relative left/right rotates with attack direction; camera orientation is irrelevant. */
export const teamSpaceToPitch = (point: TeamPoint, side: TeamSide): PitchPoint => ({
  x: side === 'home' ? point.depth * PITCH_LENGTH : (1 - point.depth) * PITCH_LENGTH,
  y:
    side === 'home'
      ? ((point.lateral + 1) * PITCH_WIDTH) / 2
      : ((1 - point.lateral) * PITCH_WIDTH) / 2,
});

export const formationSlotToPitch = (slot: FormationSlot, side: TeamSide) =>
  teamSpaceToPitch(formationSlotToTeamSpace(slot), side);

export const clampPitchPoint = ({ x, y }: PitchPoint): PitchPoint => ({
  x: Math.max(0.4, Math.min(PITCH_LENGTH - 0.4, x)),
  y: Math.max(0.4, Math.min(PITCH_WIDTH - 0.4, y)),
});

export const distance = (a: PhysicalPoint, b: PhysicalPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** A deliberately small, team-relative territorial model (not xG). */
export const fieldValue = (point: PitchPoint, side: TeamSide) => {
  const depth = side === 'home' ? point.x / PITCH_LENGTH : 1 - point.x / PITCH_LENGTH;
  const centrality = 1 - Math.min(1, Math.abs(point.y - PITCH_WIDTH / 2) / (PITCH_WIDTH / 2));
  const finalThird = Math.max(0, (depth - 2 / 3) * 3);
  return depth * 70 + centrality * (5 + finalThird * 15) + finalThird * 10;
};

export const distanceToSegment = (point: PitchPoint, start: PitchPoint, end: PitchPoint) => {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
      )
    : 0;
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
};
