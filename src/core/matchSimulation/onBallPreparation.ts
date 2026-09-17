import { z } from 'zod';
import { distance, type PitchPoint } from './matchSpace';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';

export const onBallPreparationSchema = z.object({
  actorId: z.string(),
  gainedAt: z.number().nonnegative(),
  readyAt: z.number().nonnegative(),
  kind: z.enum(['immediate_control', 'directional_touch', 'settling', 'shielding']),
  receptionKind: z.enum(['clean_control', 'directional_control', 'heavy_touch']).optional(),
  incomingSpeed: z.number().nonnegative(),
});
export type OnBallPreparation = z.infer<typeof onBallPreparationSchema>;

/** Seeds canonical possession preparation from the existing reception outcome and geometry. */
export const deriveOnBallPreparation = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  receptionKind?: 'clean_control' | 'directional_control' | 'heavy_touch',
): OnBallPreparation => {
  const a = actor.profile.attributes;
  const incomingSpeed = Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0);
  const incomingAngle = angleForVector({
    x: state.ball.x - actor.position.x,
    y: state.ball.y - actor.position.y,
  });
  const facingError = Math.abs(normalizeAngle(incomingAngle - actor.facingAngle));
  const technique = (a.firstTouch + a.technique + a.composure + a.agility) / 400;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const duration = Math.max(
    0.12,
    0.34 + incomingSpeed / 24 + (facingError / Math.PI) * 0.7 + pressure * 0.35 - technique * 0.52 +
      (receptionKind === 'directional_control' ? -0.18 : receptionKind === 'heavy_touch' ? 0.75 : 0),
  );
  return onBallPreparationSchema.parse({
    actorId: actor.id,
    gainedAt: state.time,
    readyAt: state.time + duration,
    kind:
      pressure > 0.68 ? 'shielding' : receptionKind === 'directional_control' ? 'directional_touch' :
        duration <= 0.25 ? 'immediate_control' : 'settling',
    ...(receptionKind ? { receptionKind } : {}),
    incomingSpeed,
  });
};

const actionTarget = (action: MatchAction, actor: MatchPlayerState): PitchPoint =>
  action.type === 'hold' ? actor.position : action.target;

/** Action-specific readiness: simple aligned football can be first-time; power/redirection waits. */
export const preparationMarginForAction = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
) => {
  const preparation = state.onBallPreparation;
  if (!preparation || preparation.actorId !== actor.id || action.type === 'hold' || action.type === 'carry')
    return 0;
  const target = actionTarget(action, actor);
  const direction = angleForVector({ x: target.x - actor.position.x, y: target.y - actor.position.y });
  const turn = Math.abs(normalizeAngle(direction - actor.facingAngle));
  const length = distance(actor.position, target);
  const a = actor.profile.attributes;
  const skill = (a.firstTouch + a.technique + a.composure) / 300;
  const actionNeed =
    turn / Math.PI * 0.55 + Math.max(0, length - 10) / 70 +
    (action.type === 'shot' ? 0.18 : action.type === 'cross' ? 0.14 : 0) - skill * 0.22;
  return state.time - (preparation.readyAt + Math.max(0, actionNeed));
};
