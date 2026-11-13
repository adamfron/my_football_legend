import type { MatchPlayerState, TacticalMatchState } from './matchState';
import type { PitchPoint } from './matchSpace';
import { forecastObservedBallStep } from './ballOrientedMovement';
import { deriveLowerBodyGeometry, neutralLowerBodyPose } from './lowerBodyGeometry';
import { angleForVector } from './playerOrientation';
import { clampPitchPoint } from './matchSpace';
import { chooseContactFoot, FOOT_CONTACT_PHYSICS } from './footContact';
import { TEMPORAL_STRIKE } from './temporalFootTrajectory';
import { observedPassBall } from './pendingStrike';

type Foot = 'left' | 'right';

export const placeBodyForLowPass = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  target: PitchPoint,
  anticipate: boolean,
  requestedFoot?: Foot,
) => {
  const observation = observedPassBall(state, actor);
  if (!observation || !actor.articulatedStance) return;
  const contact = anticipate
    ? forecastObservedBallStep(
        observation,
        TEMPORAL_STRIKE.nominalOnset + TEMPORAL_STRIKE.swingSeconds,
      ).position
    : observation.position;
  if (contact.z > 0.24) return;

  const dx = target.x - contact.x;
  const dy = target.y - contact.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return;
  const facing = angleForVector({ x: dx, y: dy });
  const support = actor.articulatedStance.support;
  const activeFoot =
    requestedFoot ??
    (support ? (support === 'left' ? 'right' : 'left') : chooseContactFoot(actor, contact));
  const { articulatedStance: _stance, verticalJump: _jump, ...body } = actor;
  void [_stance, _jump];
  const desiredPose = deriveLowerBodyGeometry({
    ...body,
    position: { x: 0, y: 0 },
    facingAngle: facing,
    lowerBodyPose: neutralLowerBodyPose(),
  });
  // Place the swing origin behind the ball with room for a finite acceleration
  // stroke. The nominal offset is an engineering objective measured in metres.
  const approach = FOOT_CONTACT_PHYSICS.radius + TEMPORAL_STRIKE.footRadius + 0.12;
  const boot = desiredPose[activeFoot].foot;
  const root = clampPitchPoint({
    x: contact.x - (dx / length) * approach - boot.x,
    y: contact.y - (dy / length) * approach - boot.y,
  });
  const otherFoot = activeFoot === 'left' ? 'right' : 'left';
  const plant = desiredPose[otherFoot].foot;
  return {
    root,
    facing,
    activeFoot,
    supportFoot: otherFoot,
    plant: { x: root.x + plant.x, y: root.y + plant.y },
    contact,
  };
};
