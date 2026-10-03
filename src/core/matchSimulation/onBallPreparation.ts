import { z } from 'zod';
import { clampPitchPoint, distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { shotPreparationSeconds } from './shotIntent';

export const possessionMicroBehaviourSchema = z.object({
  phase: z.enum([
    'controlling',
    'directional_touch',
    'turning',
    'shielding',
    'adjusting',
    'scanning',
    'recovering',
  ]),
  startedAt: z.number().nonnegative(),
  origin: pitchPointSchema,
  localTarget: pitchPointSchema,
  orientationTarget: z.number().finite(),
  passingAngle: z.number().finite().optional(),
  touchDirection: z
    .object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) })
    .optional(),
  shielding: z.boolean(),
  ballOffset: z.object({ x: z.number().finite(), y: z.number().finite() }),
  pressure: z.number().min(0).max(1),
  reason: z.enum([
    'first_touch',
    'directional_reception',
    'poor_control',
    'open_passing_angle',
    'protect_from_pressure',
    'check_surroundings',
    'controlled_pause',
  ]),
});
export type PossessionMicroBehaviour = z.infer<typeof possessionMicroBehaviourSchema>;

export const onBallPreparationSchema = z.object({
  actorId: z.string(),
  gainedAt: z.number().nonnegative(),
  readyAt: z.number().nonnegative(),
  kind: z.enum(['immediate_control', 'directional_touch', 'settling', 'shielding']),
  receptionKind: z.enum(['clean_control', 'directional_control', 'heavy_touch']).optional(),
  incomingSpeed: z.number().nonnegative(),
  micro: possessionMicroBehaviourSchema.optional(),
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
  const incomingAngle = angleForVector(
    incomingSpeed > 0.2
      ? { x: -(state.ball.velocity?.x ?? 0), y: -(state.ball.velocity?.y ?? 0) }
      : { x: state.ball.x - actor.position.x, y: state.ball.y - actor.position.y },
  );
  const facingError = Math.abs(normalizeAngle(incomingAngle - actor.facingAngle));
  const technique = (a.firstTouch + a.technique + a.composure + a.agility) / 400;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const duration = Math.max(
    0.12,
    0.34 +
      incomingSpeed / 24 +
      (facingError / Math.PI) * 0.7 +
      pressure * 0.35 -
      technique * 0.52 +
      (receptionKind === 'directional_control'
        ? -0.18
        : receptionKind === 'heavy_touch'
          ? 0.75
          : 0),
  );
  const preparation: OnBallPreparation = {
    actorId: actor.id,
    gainedAt: state.time,
    readyAt: state.time + duration,
    kind:
      pressure > 0.68
        ? 'shielding'
        : receptionKind === 'directional_control'
          ? 'directional_touch'
          : duration <= 0.25
            ? 'immediate_control'
            : 'settling',
    ...(receptionKind ? { receptionKind } : {}),
    incomingSpeed,
  };
  return onBallPreparationSchema.parse({
    ...preparation,
    micro: projectPossessionMicroBehaviour(state, actor, preparation),
  });
};

/** The scan remains the PR148 major-decision delay. Its small football movements are a bounded
 * control intention, never another action choice, carry episode or human menu boundary. */
export const projectPossessionMicroBehaviour = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  preparation: OnBallPreparation,
): PossessionMicroBehaviour => {
  const previous = preparation.micro;
  const origin = previous?.origin ?? { ...actor.position };
  const age = Math.max(0, state.time - preparation.gainedAt);
  const controlDuration = preparation.readyAt - preparation.gainedAt;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const nearest = state.players
    .filter((player) => player.team !== actor.team)
    .reduce<
      MatchPlayerState | undefined
    >((best, player) => (!best || distance(player.position, actor.position) < distance(best.position, actor.position) ? player : best), undefined);
  const forward = actor.team === 'home' ? 1 : -1;
  const away = nearest
    ? { x: actor.position.x - nearest.position.x, y: actor.position.y - nearest.position.y }
    : { x: forward, y: 0 };
  const awayLength = Math.max(0.001, Math.hypot(away.x, away.y));
  const awayDirection = { x: away.x / awayLength, y: away.y / awayLength };
  // Choose a plausible local passing angle once. Replanning a 6s scan every 25ms would itself
  // cause jitter and make a nominal micro-adjustment an unbounded tactical carry.
  const receiver = previous
    ? undefined
    : state.players
        .filter(
          (player) =>
            player.team === actor.team &&
            player.id !== actor.id &&
            distance(player.position, origin) >= 5 &&
            distance(player.position, origin) < 30,
        )
        .map((player) => ({
          player,
          value:
            Math.min(
              10,
              ...state.players
                .filter((foe) => foe.team !== actor.team)
                .map((foe) => distance(player.position, foe.position)),
            ) -
            distance(player.position, origin) * 0.12 +
            (player.position.x - origin.x) * forward * 0.1,
        }))
        .sort((a, b) => b.value - a.value || a.player.id.localeCompare(b.player.id))[0]?.player;
  const openAngle =
    previous?.passingAngle ??
    (receiver
      ? angleForVector({ x: receiver.position.x - origin.x, y: receiver.position.y - origin.y })
      : actor.team === 'home'
        ? Math.PI / 2
        : -Math.PI / 2);
  const turnError = Math.abs(normalizeAngle(openAngle - actor.facingAngle));
  const shield =
    nearest &&
    (previous?.phase === 'shielding'
      ? pressure > 0.6 && distance(nearest.position, actor.position) < 2.75
      : pressure > 0.7 && distance(nearest.position, actor.position) < 2.3);
  const phase: PossessionMicroBehaviour['phase'] =
    age < controlDuration
      ? preparation.receptionKind === 'heavy_touch'
        ? 'recovering'
        : preparation.receptionKind === 'directional_control'
          ? 'directional_touch'
          : 'controlling'
      : shield
        ? 'shielding'
        : age < controlDuration + 0.65 && turnError > 0.2
          ? 'turning'
          : age < controlDuration + 1.6
            ? 'adjusting'
            : 'scanning';
  const scanning = phase === 'scanning';
  const orientationTarget = shield
    ? angleForVector(awayDirection)
    : phase === 'controlling' || phase === 'recovering'
      ? (previous?.orientationTarget ??
        angleForVector(
          preparation.incomingSpeed > 0.2
            ? { x: -(state.ball.velocity?.x ?? 0), y: -(state.ball.velocity?.y ?? 0) }
            : { x: Math.sin(actor.facingAngle), y: Math.cos(actor.facingAngle) },
        ))
      : scanning
        ? openAngle + Math.sin(age * 1.4) * 0.28
        : openAngle;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
  const movementDirection =
    previous?.touchDirection ??
    (preparation.receptionKind === 'directional_control' && speed > 0.7
      ? { x: actor.velocity.x / speed, y: actor.velocity.y / speed }
      : { x: forward * 0.15, y: origin.y < 34 ? 1 : -1 });
  const adjustment =
    phase === 'adjusting' || scanning ? 0.7 : phase === 'directional_touch' ? 0.8 : 0;
  const localTarget = shield
    ? clampPitchPoint({
        x: origin.x + awayDirection.x * 0.55,
        y: origin.y + awayDirection.y * 0.55,
      })
    : clampPitchPoint({
        x: origin.x + movementDirection.x * adjustment,
        y: origin.y + movementDirection.y * adjustment,
      });
  const ballDistance = shield ? 0.38 : phase === 'directional_touch' ? 0.72 : 0.45;
  // A receiver can face the incoming pass while guiding it into their run. Keep that first
  // touch in its canonical movement direction while the body turns toward the next action.
  const ballAngle = shield
    ? angleForVector(awayDirection)
    : phase === 'directional_touch'
      ? angleForVector(movementDirection)
      : actor.facingAngle;
  return {
    phase,
    startedAt: previous?.phase === phase ? previous.startedAt : state.time,
    origin,
    localTarget,
    orientationTarget: normalizeAngle(orientationTarget),
    passingAngle: openAngle,
    touchDirection: movementDirection,
    shielding: Boolean(shield),
    ballOffset: { x: Math.sin(ballAngle) * ballDistance, y: Math.cos(ballAngle) * ballDistance },
    pressure,
    reason:
      phase === 'recovering'
        ? 'poor_control'
        : phase === 'directional_touch'
          ? 'directional_reception'
          : phase === 'controlling'
            ? 'first_touch'
            : shield
              ? 'protect_from_pressure'
              : phase === 'scanning'
                ? 'check_surroundings'
                : 'open_passing_angle',
  };
};

export const advanceOnBallPreparation = (state: TacticalMatchState): TacticalMatchState => {
  const actor = state.players.find((player) => player.id === state.ball.ownerId);
  const preparation = state.onBallPreparation;
  if (
    !actor ||
    !preparation ||
    preparation.actorId !== actor.id ||
    state.scenario !== 'open_play' ||
    state.ball.travelKind
  )
    return state;
  if (
    state.ballCarrierIntent?.actorId === actor.id ||
    state.playerMovementIntent?.actorId === actor.id
  ) {
    if (!preparation.micro) return state;
    // A committed movement replaces the old local footwork destination. Keeping its origin
    // would pull the player back to the reception spot when the carry/run ends. Clear only this
    // local intention; physical readiness and the PR148 possession clock stay uninterrupted.
    const { micro: _replaced, ...withoutMicro } = preparation;
    void _replaced;
    return { ...state, onBallPreparation: withoutMicro };
  }
  return {
    ...state,
    onBallPreparation: {
      ...preparation,
      micro: projectPossessionMicroBehaviour(state, actor, preparation),
    },
  };
};

const actionTarget = (action: MatchAction, actor: MatchPlayerState): PitchPoint =>
  action.type === 'hold' || action.type === 'challenge' ? actor.position : action.target;

/** Action-specific readiness: simple aligned football can be first-time; power/redirection waits. */
export const preparationMarginForAction = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
) => {
  const shotContact =
    action.type === 'shot'
      ? (action.contact ?? 'settled')
      : action.type === 'header' && action.intent === 'header_shot'
        ? 'header'
        : undefined;
  // First-time execution is a contact/timing problem, never a settled-possession waiting period.
  if (shotContact && shotContact !== 'settled') return 0;
  const preparation = state.onBallPreparation;
  if (
    !preparation ||
    preparation.actorId !== actor.id ||
    action.type === 'hold' ||
    action.type === 'carry'
  )
    return 0;
  const target = actionTarget(action, actor);
  const direction = angleForVector({
    x: target.x - actor.position.x,
    y: target.y - actor.position.y,
  });
  const turn = Math.abs(normalizeAngle(direction - actor.facingAngle));
  const length = distance(actor.position, target);
  const a = actor.profile.attributes;
  const skill = (a.firstTouch + a.technique + a.composure) / 300;
  const actionNeed =
    (turn / Math.PI) * 0.55 +
    Math.max(0, length - 10) / 70 +
    (action.type === 'shot'
      ? shotPreparationSeconds(action.intent, action.contact ?? 'settled')
      : action.type === 'cross'
        ? 0.14
        : 0) -
    skill * 0.22;
  return state.time - (preparation.readyAt + Math.max(0, actionNeed));
};
