import { z } from 'zod';
import { RELEASE_PRESENTATION_DURATION_MS } from '../../../core/matchSimulation/canonicalPresentation';
import type { AnimationCue, TacticalPlayer } from './model';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const locomotionStateSchema = z.enum(['idle', 'walk', 'jog', 'run', 'sprint']);
export const deriveLocomotion = (speed: number): z.infer<typeof locomotionStateSchema> =>
  speed < 0.15
    ? 'idle'
    : speed < 2.4
      ? 'walk'
      : speed < 3.6
        ? 'jog'
        : speed < 5.6
          ? 'run'
          : 'sprint';

export const movementPresentationSchema = z.object({
  locomotion: locomotionStateSchema,
  direction: z.enum(['forward', 'backward', 'lateral', 'stationary']),
  effort: z.enum(['steady', 'accelerating', 'braking', 'stopping']),
  turning: z.boolean(),
});
/** Describe measured movement, never infer another movement target or alter facing. */
export const deriveMovementPresentation = (player: TacticalPlayer) => {
  const velocity = player.velocity ?? { x: 0, y: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  const facing = player.facing ?? 0;
  const forward = velocity.x * Math.sin(facing) + velocity.y * Math.cos(facing);
  const lateral = velocity.x * Math.cos(facing) - velocity.y * Math.sin(facing);
  const alongAcceleration =
    speed > 0.05
      ? ((player.acceleration?.x ?? 0) * velocity.x + (player.acceleration?.y ?? 0) * velocity.y) /
        speed
      : 0;
  return {
    locomotion: deriveLocomotion(speed),
    direction:
      speed < 0.15
        ? ('stationary' as const)
        : Math.abs(lateral) > Math.abs(forward)
          ? ('lateral' as const)
          : forward < 0
            ? ('backward' as const)
            : ('forward' as const),
    effort:
      alongAcceleration < -0.6
        ? speed < 1
          ? ('stopping' as const)
          : ('braking' as const)
        : alongAcceleration > 0.6
          ? ('accelerating' as const)
          : ('steady' as const),
    turning: Math.abs(player.angularVelocity ?? 0) > 0.3,
  };
};

export const bodyDimensionsSchema = z.object({ height: z.number(), width: z.number() });
export const projectBodyDimensions = (player: TacticalPlayer) => ({
  height: clamp((player.heightCm ?? 180) / 100, 1.45, 2.15),
  width: clamp(Math.sqrt((player.weightKg ?? 75) / 75), 0.85, 1.2),
});

export const playerPoseSchema = z.object({
  hipLeft: z.number(),
  hipRight: z.number(),
  kneeLeft: z.number(),
  kneeRight: z.number(),
  armLeft: z.number(),
  armRight: z.number(),
  elbowLeft: z.number(),
  elbowRight: z.number(),
  armSpread: z.number(),
  lean: z.number(),
  roll: z.number(),
  crouch: z.number(),
  lift: z.number(),
  head: z.number(),
  headYaw: z.number(),
  hipSpread: z.number(),
  torsoYaw: z.number(),
});
export type PlayerPose = z.infer<typeof playerPoseSchema>;
export const createPlayerPose = (): PlayerPose => ({
  hipLeft: 0,
  hipRight: 0,
  kneeLeft: 0,
  kneeRight: 0,
  armLeft: 0,
  armRight: 0,
  elbowLeft: 0,
  elbowRight: 0,
  armSpread: 0.08,
  lean: 0,
  roll: 0,
  crouch: 0,
  lift: 0,
  head: 0,
  headYaw: 0,
  hipSpread: 0,
  torsoYaw: 0,
});

export const CUE_DURATION_MS = RELEASE_PRESENTATION_DURATION_MS;
/** Contact is already resolved. This envelope only decays the visible follow-through. */
export const cueWeight = (cue: AnimationCue | undefined, atMs: number) => {
  if (!cue || atMs < cue.atMs) return 0;
  const t = clamp((atMs - cue.atMs) / CUE_DURATION_MS, 0, 1);
  return 1 - t * t * (3 - 2 * t);
};

/** A goal response begins only after its canonical award, never from shot prediction. */
const applyGoalResponsePose = (player: TacticalPlayer, atMs: number, pose: PlayerPose) => {
  const response = player.goalResponse;
  if (!response || atMs < response.startedAtMs) return pose;
  if (
    response.phase === 'celebration' &&
    response.role === 'scorer' &&
    !response.urgent &&
    (response.reactionUntilMs === undefined || atMs <= response.reactionUntilMs)
  ) {
    // Modest recorded scorer reaction: no leap, root displacement or imagined team huddle.
    pose.armLeft = -1.22;
    pose.armRight = -1.35;
    pose.elbowLeft = pose.elbowRight = -0.48;
    pose.armSpread = 0.7;
    pose.head = -0.045;
    pose.lean *= 0.5;
  } else if (
    response.phase === 'urgent_retrieval' &&
    response.urgent &&
    response.retrieverId === player.id
  ) {
    // Urgent retrieval preserves the measured stride. Hands never acquire the canonical ball.
    const speed = Math.hypot(player.velocity?.x ?? 0, player.velocity?.y ?? 0);
    pose.armSpread = 0.14;
    pose.elbowLeft = pose.elbowRight = -0.8;
    pose.head = 0.07;
    if (speed > 0.15) pose.lean = Math.max(pose.lean, 0.15);
  }
  return pose;
};

/** Pure, seekable pose. Optional output is renderer-owned scratch, never canonical state. */
export const derivePlayerPose = (
  player: TacticalPlayer,
  atMs: number,
  out = createPlayerPose(),
): PlayerPose => {
  const speed = player.gaitSpeed ?? Math.hypot(player.velocity?.x ?? 0, player.velocity?.y ?? 0);
  const movement = deriveMovementPresentation(player);
  const amplitude = clamp(speed / 7, 0, 1) * 0.85;
  // Compact context samples carry velocity, not a hidden animation accumulator. Reconstruct
  // cosmetic stride only when this historical frame is actually rendered.
  const phase =
    player.gaitPhase ??
    (((atMs / 1000) * speed) / (1.25 + Math.min(speed, 8) * 0.18)) * Math.PI * 2;
  const stride = Math.sin(phase) * amplitude;
  // Facing remains canonical even while shuffling/backpedalling.
  const facing = player.facing ?? 0;
  const forward =
    (player.velocity?.x ?? 0) * Math.sin(facing) + (player.velocity?.y ?? 0) * Math.cos(facing);
  const sign = forward < -0.1 ? -1 : 1;
  out.hipLeft = stride * sign;
  out.hipRight = -stride * sign;
  out.kneeLeft = Math.max(0, -Math.sin(phase)) * amplitude * 1.35;
  out.kneeRight = Math.max(0, Math.sin(phase)) * amplitude * 1.35;
  out.armLeft = -stride * 0.75;
  out.armRight = stride * 0.75;
  out.elbowLeft = out.elbowRight = -0.15 - amplitude * 0.75;
  out.armSpread = player.goalkeeper ? 0.3 : 0.08;
  out.lean = amplitude * 0.12;
  out.roll = 0;
  out.crouch = player.goalkeeper && speed < 0.4 ? 0.08 : 0;
  out.lift = 0;
  out.head = 0;
  out.headYaw = 0;
  out.hipSpread = 0;
  out.torsoYaw = 0;
  const lateral =
    (player.velocity?.x ?? 0) * Math.cos(facing) - (player.velocity?.y ?? 0) * Math.sin(facing);
  if (movement.direction === 'lateral') {
    out.hipLeft *= 0.4;
    out.hipRight *= 0.4;
    out.hipSpread = Math.sin(phase) * Math.min(0.42, speed * 0.08) * Math.sign(lateral);
    out.armSpread = 0.4;
    out.crouch += 0.045;
    out.roll = clamp(lateral * -0.015, -0.12, 0.12);
  } else if (movement.direction === 'backward') {
    out.lean = -amplitude * 0.07;
    out.kneeLeft *= 0.75;
    out.kneeRight *= 0.75;
  }
  if (movement.effort === 'accelerating') out.lean += 0.15;
  if (movement.effort === 'braking' || movement.effort === 'stopping') {
    out.lean -= 0.17;
    out.crouch += 0.05;
    out.armSpread += 0.14;
  }
  if (movement.turning) {
    const turn = clamp(player.angularVelocity ?? 0, -5, 5);
    out.torsoYaw = -turn * 0.035;
    out.roll += -turn * Math.min(0.02, speed * 0.004);
    if (speed < 0.4) {
      // Short planted-foot adjustment; root still uses the actual canonical orientation.
      out.hipSpread = Math.sin(atMs * 0.012) * Math.min(0.11, Math.abs(turn) * 0.025);
      out.kneeLeft += 0.06;
      out.kneeRight += 0.06;
    }
  }
  const fitness = player.fitness;
  const fatigue = fitness
    ? clamp(
        (1 - fitness.capacity) * 0.25 +
          (1 - fitness.burstReadiness / Math.max(0.05, fitness.capacity)) * 0.75,
        0,
        1,
      )
    : 0;
  // Modest posture/breathing only: the engine already determines fatigue-limited speed.
  out.lean += fatigue * (speed < 0.4 ? 0.085 : 0.025);
  out.head += fatigue * 0.035;
  out.armLeft += fatigue * 0.07;
  out.armRight += fatigue * 0.07;
  if (speed < 0.4) out.lean += Math.sin(atMs * 0.0045) * (0.006 + fatigue * 0.01);
  if (player.injury) {
    const restriction =
      player.injury.status === 'discomfort'
        ? 0.04
        : player.injury.status === 'playable'
          ? 0.09
          : 0.18;
    // The canonical injury does not record a left/right limb, so show general restriction.
    out.lean += restriction * 0.4;
    out.hipLeft *= 0.88;
    out.hipRight *= 0.88;
    out.kneeLeft += restriction;
    out.kneeRight += restriction;
    out.armSpread += restriction;
    if (player.injury.assessmentRequired && speed < 0.15) {
      out.crouch += 0.14;
      out.head += 0.2;
    }
  }
  if (player.participation === 'staged') {
    out.armSpread = 0.18;
    out.headYaw = Math.sin(atMs * 0.0015) * 0.12;
  }
  if (player.defensive?.intent === 'contain') {
    out.crouch += 0.055;
    out.armSpread = Math.max(out.armSpread, 0.44);
    out.kneeLeft += 0.11;
    out.kneeRight += 0.11;
  } else if (player.defensive?.intent === 'engage') {
    out.lean += 0.12;
    out.armSpread = Math.max(out.armSpread, 0.3);
  }
  if (player.defensive?.outcome === 'missed' || player.defensive?.outcome === 'beaten') {
    out.roll += 0.12;
    out.armSpread = 0.65;
    out.headYaw = -0.3;
  }
  const preparationElapsed = Math.max(0, atMs - (player.preparationSinceMs ?? atMs)) / 1000;
  if (player.preparation === 'controlling' || player.preparation === 'directional_touch') {
    out.lean += 0.13;
    out.armSpread = 0.38;
    out.head = 0.12;
    if (player.dominantFoot === 'left') {
      out.hipLeft -= 0.24;
      out.kneeLeft += 0.18;
    } else {
      out.hipRight -= 0.24;
      out.kneeRight += 0.18;
    }
  }
  if (player.preparation === 'scanning') {
    // A seekable look over either shoulder communicates the canonical scanning phase.
    out.headYaw = Math.sin(preparationElapsed * 2.1) * 0.58;
    out.armSpread = 0.16;
    out.lean += 0.025;
  }
  if (player.preparation === 'carrying') {
    out.armSpread = 0.3;
    out.lean += 0.08;
    out.head = 0.06;
  }
  if (player.preparation === 'shielding') {
    out.armSpread = 0.78;
    out.armLeft = -0.28;
    out.armRight = -0.12;
    out.crouch = 0.07;
    out.lean = 0.16;
    out.kneeLeft += 0.22;
    out.kneeRight += 0.35;
    out.headYaw = 0.38;
  }
  if (player.preparation === 'turning' || player.preparation === 'adjusting') {
    out.roll = player.preparation === 'turning' ? 0.08 : 0.035;
    out.armSpread = 0.42;
    out.headYaw = Math.sin(preparationElapsed * 2) * 0.28;
    out.lean += 0.07;
  }
  if (player.preparation === 'recovering') {
    out.lean = 0.22;
    out.armSpread = 0.65;
    out.kneeLeft += 0.55;
    out.kneeRight += 0.25;
    out.crouch = 0.09;
  }
  if (player.preparation === 'receive' || player.preparation === 'claim') {
    out.lean += 0.1;
    out.armSpread = 0.35;
    if (player.preparation === 'claim') out.armLeft = out.armRight = -1.2;
  }
  if (player.preparation === 'throw') {
    // Two planted feet; both hands move together from in front to behind/above the head.
    const t = clamp((atMs - (player.preparationSinceMs ?? atMs)) / 650, 0, 1);
    out.hipLeft = out.hipRight = out.kneeLeft = out.kneeRight = 0;
    out.armLeft = out.armRight = -1.1 - 1.9 * t;
    out.elbowLeft = out.elbowRight = -1.05;
    out.armSpread = -0.42;
    out.lean = -0.08 * t;
  }
  if (player.preparation === 'save_low' || player.preparation === 'save_high') {
    const low = player.preparation === 'save_low';
    out.armLeft = out.armRight = low ? -0.7 : -2.1;
    out.roll = (player.preparationSide ?? 0) * Math.min(0.55, speed * 0.09);
    out.crouch = low ? 0.16 : 0;
    if (low) {
      out.hipLeft = out.hipRight = -0.7;
      out.kneeLeft = out.kneeRight = 1.4;
    }
  }
  const contact = player.contact;
  if (contact) {
    const untilNext = (contact.plannedAtMs ?? Infinity) - atMs;
    const prepareWeight = untilNext >= 0 && untilNext < 280 ? (1 - untilNext / 280) * 0.45 : 0;
    const elapsed = atMs - (contact.lastAtMs ?? -Infinity);
    const actualWeight = elapsed >= 0 && elapsed < 200 ? 1 - elapsed / 200 : 0;
    const failedElapsed = atMs - (contact.failedAtMs ?? -Infinity);
    const failedWeight = failedElapsed >= 0 && failedElapsed < 420 ? 1 - failedElapsed / 420 : 0;
    const region = actualWeight > 0 ? contact.lastRegion : contact.region;
    const weight = actualWeight || prepareWeight;
    // Only the recorded foot moves. Repeated contacts never become a named skill animation.
    if (region === 'left_foot') {
      out.hipLeft -= weight * 0.38;
      out.kneeLeft += weight * 0.2;
    } else if (region === 'right_foot') {
      out.hipRight -= weight * 0.38;
      out.kneeRight += weight * 0.2;
    } else if (region === 'lower_leg') {
      // A lower-leg region has no canonical left/right limb, so avoid assigning a foot.
      out.kneeLeft += weight * 0.12;
      out.kneeRight += weight * 0.12;
    }
    if (actualWeight > 0) out.armSpread = Math.max(out.armSpread, 0.28);
    const lossWeight = Math.max(failedWeight, contact.retained === false ? actualWeight : 0);
    if (lossWeight > 0) {
      out.roll += lossWeight * 0.19;
      out.lean += lossWeight * 0.16;
      out.armSpread = 0.7;
      out.kneeLeft += lossWeight * 0.2;
    }
    if (contact.balance !== undefined && contact.balance < 0.75) {
      out.roll += (0.75 - contact.balance) * 0.2;
      out.armSpread = Math.max(out.armSpread, 0.5);
    }
  }
  const keeperAction = player.goalkeeperIntervention;
  if (keeperAction) {
    const kind = keeperAction.kind;
    const low = (keeperAction.height ?? 0) < 0.8;
    const keeperSide = keeperAction.target
      ? Math.sign(
          (keeperAction.target.x - player.x) * Math.cos(facing) -
            (keeperAction.target.y - player.y) * Math.sin(facing),
        )
      : (player.preparationSide ?? player.cue?.side ?? 0);
    if (kind === 'ready' || kind === 'penalty_ready') {
      out.crouch = Math.max(out.crouch, kind === 'penalty_ready' ? 0.13 : 0.08);
      out.armSpread = kind === 'penalty_ready' ? 0.55 : 0.35;
      out.kneeLeft += 0.15;
      out.kneeRight += 0.15;
    } else if (kind === 'catch' || kind === 'claim') {
      out.armLeft = out.armRight = low ? -0.68 : -2.1;
      out.elbowLeft = out.elbowRight = -0.7;
      out.armSpread = 0.18;
      if (low) out.crouch += 0.13;
    } else if (kind === 'punch' || kind === 'parry' || kind === 'parry_away') {
      // Extended separate hands show redirection, never the closed holding pose of a catch.
      out.armLeft = low ? -0.75 : -2.35;
      out.armRight = low ? -0.95 : -2.1;
      out.elbowLeft = out.elbowRight = -0.05;
      out.armSpread = 0.6;
      out.roll = keeperSide * (low ? 0.25 : 0.65);
    } else if (kind === 'failed_save' || kind === 'keeper_miss') {
      out.armLeft = -2.05;
      out.armRight = -1.35;
      out.elbowLeft = -0.08;
      out.armSpread = 0.82;
      out.roll = keeperSide * 0.62;
      out.head = 0.15;
    } else if (kind === 'no_chance') {
      out.headYaw = 0.3;
      out.armSpread = 0.15;
    }
  }
  if (player.wallResponse) {
    // Canonical wall lift already participates in the shot collision model.
    out.lift = player.wallResponse.jumpHeight;
    out.armSpread = 0.12;
    out.armLeft = out.armRight = -0.22;
    out.elbowLeft = out.elbowRight = -1.05;
    if (player.wallResponse.jumpHeight > 0) {
      out.hipLeft = out.hipRight = 0.08;
      out.kneeLeft = out.kneeRight = 0.18;
    }
  }
  const weight = cueWeight(player.cue, atMs);
  if (!weight || !player.cue) return applyGoalResponsePose(player, atMs, out);
  const blend = (base: number, target: number) => base + (target - base) * weight;
  const kind = player.cue.kind;
  if (['pass', 'shot', 'cross', 'distribution', 'receive'].includes(kind)) {
    const volley = kind === 'shot' && player.cue.shotContact === 'volley';
    const halfVolley = kind === 'shot' && player.cue.shotContact === 'half_volley';
    const firstTime = kind === 'shot' && player.cue.shotContact === 'first_time';
    const chip = kind === 'shot' && player.cue.shotIntent === 'chip';
    const kick =
      kind === 'receive'
        ? -0.3
        : volley
          ? -1.75
          : halfVolley
            ? -1.35
            : chip
              ? -0.7
              : firstTime
                ? -1.0
                : kind === 'shot'
                  ? player.cue.shotIntent === 'placed'
                    ? -0.95
                    : -1.15
                  : -0.8;
    const knee = volley || chip ? 0.55 : halfVolley ? 0.35 : 0.2;
    const releaseRegion =
      player.contact?.lastAtMs !== undefined &&
      Math.abs(player.contact.lastAtMs - player.cue.atMs) < 50
        ? player.contact.lastRegion
        : undefined;
    if (releaseRegion === 'left_foot' || (!releaseRegion && player.dominantFoot === 'left')) {
      out.hipLeft = blend(out.hipLeft, kick);
      out.kneeLeft = blend(out.kneeLeft, knee);
    } else {
      out.hipRight = blend(out.hipRight, kick);
      out.kneeRight = blend(out.kneeRight, knee);
    }
    out.lean = blend(out.lean, kind === 'receive' ? 0.16 : volley ? -0.22 : -0.13);
    out.armSpread = blend(out.armSpread, kind === 'cross' || volley ? 0.8 : 0.45);
  } else if (kind === 'tackle' || kind === 'slide' || kind === 'recover') {
    const slide = kind === 'slide';
    out.lean = blend(out.lean, slide ? -0.8 : 0.35);
    out.crouch = blend(out.crouch, slide ? 0.5 : 0.12);
    out.roll = blend(out.roll, slide ? 0.48 : 0.1);
    out.hipRight = blend(out.hipRight, slide ? -1.35 : -0.65);
    out.hipLeft = blend(out.hipLeft, slide ? -0.75 : 0.12);
    out.kneeLeft = blend(out.kneeLeft, slide ? 1.3 : 0.55);
    out.armSpread = blend(out.armSpread, slide ? 0.85 : 0.65);
  } else if (kind === 'throw') {
    out.armLeft = out.armRight = blend(out.armLeft, -1.65);
    out.elbowLeft = out.elbowRight = blend(out.elbowLeft, -0.15);
    out.armSpread = -0.42;
    out.lean = blend(out.lean, 0.18);
  } else if (kind === 'header' || kind === 'contest') {
    out.head = weight * 0.32;
    out.lean = blend(out.lean, 0.22);
    out.armSpread = blend(out.armSpread, 0.8);
    // Bounded body articulation, never move the root or pull the ball toward the head.
    out.lift =
      clamp(
        (player.cue.contactHeight ?? 1.7) - projectBodyDimensions(player).height + 0.12,
        0,
        0.45,
      ) * weight;
  } else if (
    !keeperAction ||
    !['parry', 'parry_away', 'punch', 'failed_save', 'keeper_miss', 'no_chance'].includes(
      keeperAction.kind,
    )
  ) {
    const low = kind === 'low_save';
    out.crouch = blend(out.crouch, low ? 0.16 : 0.05);
    if (low) {
      out.hipLeft = out.hipRight = blend(out.hipLeft, -0.7);
      out.kneeLeft = out.kneeRight = blend(out.kneeLeft, 1.4);
    }
    const catchHeight = keeperAction?.height ?? player.cue.contactHeight ?? 1;
    out.armLeft = out.armRight = blend(
      out.armLeft,
      low
        ? -0.65
        : kind === 'catch'
          ? catchHeight < 0.8
            ? -0.68
            : catchHeight > 1.5
              ? -2.1
              : -1.3
          : -2.4,
    );
    out.elbowLeft = out.elbowRight = blend(out.elbowLeft, -0.25);
    out.roll = (player.cue.side ?? 0) * weight * (kind === 'high_save' ? 0.95 : low ? 0.4 : 0.1);
    out.armSpread = blend(out.armSpread, 0.25);
  }
  if (player.wallResponse) out.lift = player.wallResponse.jumpHeight;
  return applyGoalResponsePose(player, atMs, out);
};
