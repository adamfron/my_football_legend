import { z } from 'zod';
import type { FormationSlot } from '../footballerWorld';

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

export const teamSideSchema = z.enum(['home', 'away']);
export type TeamSide = z.infer<typeof teamSideSchema>;
export const pitchPointSchema = z.object({
  x: z.number().min(0).max(PITCH_LENGTH),
  y: z.number().min(0).max(PITCH_WIDTH),
});
export type PitchPoint = z.infer<typeof pitchPointSchema>;
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

export const distance = (a: PitchPoint, b: PitchPoint) => Math.hypot(a.x - b.x, a.y - b.y);
