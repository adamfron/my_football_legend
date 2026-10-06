import { z } from 'zod';
import { BALL_RADIUS } from './ballFlight';
import { projectFutureBallTrajectory } from './ballPhysics';
import { evaluateAerialContact } from './aerialPlay';
import { goalIntentToPitch } from './goalCoordinates';
import { estimatePlayerArrivalTime } from './playerArrival';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { distance, pitchPointSchema, PITCH_LENGTH, PITCH_WIDTH } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import {
  shotExecutionProfileSchema,
  shotPreparationSeconds,
  type ShotExecutionProfile,
} from './shotIntent';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';

type ShotAction = Extract<MatchAction, { type: 'shot' | 'header' }>;
export const incomingShotContactSchema = z.object({
  point: pitchPointSchema,
  height: z.number().nonnegative(),
  arrivalTime: z.number().nonnegative(),
  incomingSpeed: z.number().nonnegative(),
  verticalSpeed: z.number(),
  bounceCount: z.number().int().nonnegative(),
  facingDifficulty: z.number().min(0).max(1),
  footDifficulty: z.number().min(0).max(1),
  executionDifficulty: z.number().nonnegative(),
});
export type IncomingShotContact = z.infer<typeof incomingShotContactSchema>;

const bodyDifficulty = (actor: MatchPlayerState, point: { x: number; y: number }) => {
  const goal = { x: actor.team === 'home' ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  const facingDifficulty =
    Math.abs(
      normalizeAngle(
        angleForVector({
          x: goal.x - point.x,
          y: goal.y - point.y,
        }) - actor.facingAngle,
      ),
    ) / Math.PI;
  const incoming = { x: point.x - actor.position.x, y: point.y - actor.position.y };
  // Signed lateral contact in the body's canonical basis; crossing the weaker side costs skill.
  const lateral =
    incoming.x * Math.cos(actor.facingAngle) - incoming.y * Math.sin(actor.facingAngle);
  const weakerSide = actor.profile.dominantFoot === 'right' ? lateral < -0.15 : lateral > 0.15;
  return {
    facingDifficulty,
    footDifficulty: weakerSide ? 1 - actor.profile.weakFootProficiency / 100 : 0,
  };
};

/** Forecasts only the committed ball through the shared integrator and the player's reachable ETA. */
export const incomingBallContact = (
  state: TacticalMatchState,
  actorId: string,
  purpose: 'shot' | 'pass' = 'shot',
): IncomingShotContact | undefined => {
  const actor = state.players.find((player) => player.id === actorId);
  if (
    !actor ||
    (purpose === 'shot' && actor.profile.primaryPosition === 'goalkeeper') ||
    (state.ball.ownerId && state.ball.ownerId !== actorId) ||
    !state.ball.travelKind ||
    state.ball.shot ||
    state.ball.lastTouchPlayerId === actorId
  )
    return undefined;
  if (
    state.aerialContactLocks?.some(
      (lock) =>
        lock.playerId === actorId &&
        lock.at < state.time &&
        distance(actor.position, state.ball) < 1.6 &&
        distance(state.ball, lock.point) < 2.4,
    )
  )
    return undefined;
  const speed = Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0);
  if (speed < 0.1) return undefined;
  const current = {
    position: {
      x: state.ball.x,
      y: state.ball.y,
      z: Math.max(BALL_RADIUS, state.ball.height ?? BALL_RADIUS),
    },
    velocity: {
      x: state.ball.velocity?.x ?? 0,
      y: state.ball.velocity?.y ?? 0,
      z: state.ball.velocity?.z ?? 0,
    },
    airborne: state.ball.airborne ?? false,
    bounceCount: state.ball.bounceCount ?? 0,
  };
  function* samples() {
    yield { at: 0, ball: current };
    // Most committed contacts are already local. Forecast only if this first sample fails.
    yield* projectFutureBallTrajectory(current, purpose === 'pass' ? 1.8 : 1.4, 0.05);
  }
  const a = actor.profile.attributes;
  for (const sample of samples()) {
    const point = { x: sample.ball.position.x, y: sample.ball.position.y };
    if (point.x < 0 || point.x > PITCH_LENGTH || point.y < 0 || point.y > PITCH_WIDTH) continue;
    const height = sample.ball.position.z;
    const reachableHeight = actor.profile.heightCm / 100 + 0.18 + a.jumping * 0.004;
    if (height > reachableHeight || (height > 1.1 && height < 1.45 && a.agility + a.technique < 65))
      continue;
    const metres = distance(actor.position, point);
    const arrival = estimatePlayerArrivalTime(state, actor, point);
    if (metres > 1.05 && (!arrival.reachable || arrival.estimatedTime > sample.at + 0.08)) continue;
    const body = bodyDifficulty(actor, point);
    if (height >= 1.45) body.footDifficulty = 0;
    const incomingSpeed = Math.hypot(sample.ball.velocity.x, sample.ball.velocity.y);
    if (
      incomingSpeed > 32 + a.technique * 0.15 ||
      (purpose === 'shot' && body.facingDifficulty > 0.94)
    )
      continue;
    const quality =
      height >= 1.45
        ? (a.heading * 0.4 + a.jumping * 0.15 + a.technique * 0.2 + a.composure * 0.25) / 100
        : (a.firstTouch + a.finishing + a.technique + a.composure) / 400;
    const executionDifficulty =
      incomingSpeed / 38 +
      body.facingDifficulty * 0.65 +
      body.footDifficulty * 0.35 +
      (1 - quality) * 0.55 +
      Math.abs(sample.ball.velocity.z) / 22;
    return incomingShotContactSchema.parse({
      point,
      height,
      arrivalTime: sample.at,
      incomingSpeed,
      verticalSpeed: sample.ball.velocity.z,
      bounceCount: sample.ball.bounceCount,
      ...body,
      executionDifficulty,
    });
  }
  return undefined;
};
export const incomingShotContact = (state: TacticalMatchState, actorId: string) =>
  incomingBallContact(state, actorId, 'shot');

/** One legal family for both menu projection and AI ranking; no control-mode input. */
export const enumerateCanonicalShootingOptions = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction[] => {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor || actor.profile.primaryPosition === 'goalkeeper') return [];
  const settled =
    state.ball.ownerId === actorId && !state.ball.travelKind && (state.ball.height ?? 0) <= 0.45;
  const incoming = settled ? undefined : incomingShotContact(state, actorId);
  if (!settled && !incoming) return [];
  const point = incoming?.point ?? actor.position;
  const goal = { x: actor.team === 'home' ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  const range = distance(point, goal);
  if (range > (incoming ? 29 : 60)) return [];
  const keeper = state.players.find(
    (player) => player.team !== actor.team && player.profile.primaryPosition === 'goalkeeper',
  );
  const goalTarget = (intent: 'driven' | 'placed' | 'chip') => ({
    horizontal:
      intent === 'chip'
        ? 0
        : (keeper && keeper.position.y > PITCH_WIDTH / 2 ? -1 : 1) *
          (intent === 'placed' ? 0.62 : 0.24),
    vertical: intent === 'chip' ? 0.62 : intent === 'placed' ? 0.34 : 0.24,
  });
  if (incoming && incoming.height >= 1.45) {
    const projectedActor = { ...actor, position: point };
    if (!evaluateAerialContact(projectedActor, { ...point, height: incoming.height }, 0)) return [];
    return [
      {
        type: 'header',
        actorId,
        target: goal,
        intent: 'header_shot',
        firstTime: true,
        decisionBallHeight: state.ball.height ?? 0,
      },
    ];
  }
  const bouncing =
    incoming &&
    incoming.bounceCount > 0 &&
    (incoming.height > 0.2 || Math.abs(incoming.verticalSpeed) > 0.6);
  const contact = !incoming
    ? 'settled'
    : incoming.height > 0.65
      ? 'volley'
      : bouncing || incoming.height > 0.35
        ? 'half_volley'
        : 'first_time';
  const intents: ('driven' | 'placed' | 'chip')[] = ['driven'];
  if (!incoming || incoming.executionDifficulty <= 1.75) intents.push('placed');
  const nearbyDefender = state.players.some(
    (player) =>
      player.team !== actor.team &&
      player.profile.primaryPosition !== 'goalkeeper' &&
      distance(player.position, point) < 6,
  );
  const keeperOut = keeper ? Math.abs(keeper.position.x - goal.x) >= 2.5 : true;
  if (settled && range >= 4 && range <= 24 && (keeperOut || (!nearbyDefender && range <= 20)))
    intents.push('chip');
  return intents.map((intent) => {
    const aim = goalTarget(intent);
    const goalPoint = goalIntentToPitch(actor.team, aim);
    return {
      type: 'shot',
      actorId,
      intent,
      contact,
      goalTarget: aim,
      target: { x: goalPoint.x, y: goalPoint.y },
      decisionBallHeight: state.ball.height ?? 0,
    };
  });
};

/** Revalidates physical contact at execution, rather than trusting a menu that opened earlier. */
export const canExecuteCanonicalShot = (state: TacticalMatchState, action: ShotAction) => {
  // A launched shot owns its physical episode until a canonical contact resolves it. A nearby
  // player cannot create a second terminal launch by resubmitting an old contact intention.
  if (state.ball.shot) return false;
  const actor = state.players.find((player) => player.id === action.actorId);
  if (!actor || (state.ball.ownerId && state.ball.ownerId !== actor.id)) return false;
  if (action.type === 'header') {
    return (
      action.intent !== 'header_shot' ||
      (Boolean(evaluateAerialContact(actor, state.ball, 0)) &&
        (state.ball.height ?? 0) >= 1.45 &&
        (!action.firstTime ||
          enumerateCanonicalShootingOptions(state, actor.id).some(
            (option) => option.type === 'header',
          )))
    );
  }
  if ((action.contact ?? 'settled') !== 'settled') {
    const incoming = incomingShotContact(state, actor.id);
    if (!incoming || incoming.arrivalTime !== 0 || distance(actor.position, state.ball) > 1.05)
      return false;
  }
  return enumerateCanonicalShootingOptions(state, actor.id).some(
    (option) =>
      option.type === 'shot' &&
      option.intent === action.intent &&
      option.contact === (action.contact ?? 'settled'),
  );
};

/** Mechanical styles stay separate; contextual execution and keeper contacts are calibrated independently. */
export const deriveShotExecutionProfile = (
  state: TacticalMatchState,
  action: ShotAction,
): ShotExecutionProfile => {
  const actor = state.players.find((player) => player.id === action.actorId)!;
  const header = action.type === 'header';
  const intent = header ? 'header' : action.intent;
  const contact = header ? 'header' : (action.contact ?? 'settled');
  const incoming = incomingShotContact(state, actor.id);
  const body = bodyDifficulty(actor, state.ball);
  const firstTime = contact !== 'settled';
  const a = actor.profile.attributes;
  const contactDifficulty =
    contact === 'volley'
      ? 0.18 + (1 - (a.technique + a.agility) / 200) * 0.3
      : contact === 'half_volley'
        ? 0.1 + (1 - (a.firstTouch + a.technique) / 200) * 0.2
        : contact === 'header'
          ? 0.08 + (1 - a.heading / 100) * 0.3
          : 0;
  const difficulty = firstTime ? (incoming?.executionDifficulty ?? 0.35) + contactDifficulty : 0;
  return shotExecutionProfileSchema.parse({
    intent,
    contact,
    nominalSpeed:
      (intent === 'driven' ? 31 : intent === 'placed' ? 25 : intent === 'chip' ? 17 : 19) +
      actor.profile.attributes.technique * 0.045,
    errorMultiplier:
      (intent === 'driven' ? 1.12 : intent === 'placed' ? 0.88 : intent === 'chip' ? 1.05 : 1) *
      (1 + difficulty * 0.22),
    pressureSensitivity: intent === 'placed' ? 0.4 : intent === 'driven' ? 0.34 : 0.38,
    preparationSeconds: shotPreparationSeconds(intent, contact),
    firstTimeDifficulty: difficulty,
    orientationDifficulty: body.facingDifficulty,
    dominantFootDifficulty: header ? 0 : body.footDifficulty,
    minimumVerticalSpeed: intent === 'chip' ? 8.1 + actor.profile.attributes.technique * 0.012 : 0,
  });
};

/** Style-specific ranking of the same legal action, using observable geometry and attributes. */
export const canonicalShotStyleUtility = (state: TacticalMatchState, action: ShotAction) => {
  const actor = state.players.find((player) => player.id === action.actorId)!;
  const profile = deriveShotExecutionProfile(state, action);
  const incoming = incomingShotContact(state, actor.id);
  const opportunity = evaluateShootingOpportunity(
    state,
    incoming ? { ...actor, position: incoming.point } : actor,
  );
  const executionPenalty =
    profile.firstTimeDifficulty * 9 +
    profile.orientationDifficulty * 5 +
    profile.dominantFootDifficulty * 5;
  if (profile.intent === 'header')
    return -8 - executionPenalty + actor.profile.attributes.heading / 20;
  if (profile.intent === 'chip')
    return Math.min(22, opportunity.goalkeeper.distanceFromGoalLine * 3) - 8 - executionPenalty;
  if (profile.intent === 'placed')
    return (
      actor.profile.attributes.finishing / 30 +
      opportunity.angle * 3 -
      opportunity.pressure * 7 -
      executionPenalty
    );
  return (
    Math.max(0, 20 - opportunity.distance) * 0.22 + opportunity.pressure * 3 - executionPenalty
  );
};
