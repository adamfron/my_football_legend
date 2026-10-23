import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { distance, type PitchPoint } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { playerContactGeometry } from './ballContactGeometry';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { footSurfaceSchema } from './footContact';

export const firstTouchModeSchema = z.enum(['cushion', 'directional', 'pass', 'shot']);
export type FirstTouchMode = z.infer<typeof firstTouchModeSchema>;
export const firstTouchAssessmentSchema = z.object({
  feasible: z.boolean(),
  region: z.enum(['left_foot', 'right_foot']),
  relativeSpeed: z.number().nonnegative(),
  incomingHeight: z.number().nonnegative(),
  spinSpeed: z.number().nonnegative(),
  surface: footSurfaceSchema,
  incomingAngle: z.number().min(0).max(Math.PI),
  outgoingAngle: z.number().min(0).max(Math.PI),
  redirection: z.number().min(0).max(Math.PI),
  preparationSeconds: z.number().nonnegative(),
  contactSeconds: z.number().positive(),
  recoverySeconds: z.number().nonnegative(),
  weakFootDifficulty: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  difficulty: z.number().nonnegative(),
  quality: z.number().min(0).max(1),
  uncertaintyMetres: z.number().nonnegative(),
});
export type FirstTouchAssessment = z.infer<typeof firstTouchAssessmentSchema>;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Local engineering contact envelope, not a calibrated success probability or limb simulator.
 * No forecasts/RNG here: prediction supplies the actual shared flight sample and body pose.
 * A redirect changes relative momentum; a cushion must absorb it. Preparation helps technique
 * but cannot erase the body's current orientation, foot reach or post-contact recovery. */
export const assessFirstTouch = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint,
  target: PitchPoint,
  mode: FirstTouchMode,
  availableSeconds = 0,
): FirstTouchAssessment => {
  const span = startPerformanceSpan('first_touch');
  const a = actor.profile.attributes,
    geometry = playerContactGeometry(actor);
  const left = distance(point, geometry.leftFoot),
    right = distance(point, geometry.rightFoot);
  const region: FirstTouchAssessment['region'] =
    left < right
      ? 'left_foot'
      : right < left
        ? 'right_foot'
        : actor.profile.dominantFoot === 'left'
          ? 'left_foot'
          : 'right_foot';
  const weak =
    region !== `${actor.profile.dominantFoot}_foot`
      ? 1 - actor.profile.weakFootProficiency / 100
      : 0;
  const v = state.ball.velocity ?? { x: 0, y: 0, z: 0 };
  const relative = { x: v.x - actor.velocity.x, y: v.y - actor.velocity.y };
  const relativeSpeed = Math.hypot(relative.x, relative.y, v.z ?? 0);
  const incomingAngle = Math.abs(
    normalizeAngle(angleForVector({ x: -relative.x, y: -relative.y }) - actor.facingAngle),
  );
  const outgoing = { x: target.x - point.x, y: target.y - point.y };
  const outgoingAngle =
    Math.hypot(outgoing.x, outgoing.y) > 0.01
      ? Math.abs(normalizeAngle(angleForVector(outgoing) - actor.facingAngle))
      : 0;
  const redirection =
    Math.hypot(outgoing.x, outgoing.y) > 0.01 && relativeSpeed > 0.1
      ? Math.abs(normalizeAngle(angleForVector(outgoing) - angleForVector(relative)))
      : 0;
  const preparationSeconds = Math.max(
    0,
    availableSeconds +
      (state.receptionPreparation?.actorId === actor.id
        ? state.time - state.receptionPreparation.awarenessAt
        : 0),
  );
  const nearest = Math.min(
    14,
    ...state.players
      .filter(
        (p) =>
          p.team !== actor.team &&
          !state.discipline?.[p.id]?.sentOff &&
          !['unable', 'absence'].includes(p.injury?.status ?? ''),
      )
      .map((p) => distance(p.position, point)),
  );
  const pressure = clamp(1 - nearest / 4);
  const fitness = deriveFitnessPhysicalModifiers(actor);
  const skill =
    (a.firstTouch * 2 + a.technique * 2 + a.agility + a.composure + a.concentration) / 700;
  const surface =
    state.receptionPreparation?.actorId === actor.id
      ? (state.receptionPreparation.contactSurface ?? 'cushion')
      : 'cushion';
  const n =
    surface === 'sole'
      ? { x: 0, y: 0, z: -1 }
      : {
          x: -relative.x / Math.max(0.01, relativeSpeed),
          y: -relative.y / Math.max(0.01, relativeSpeed),
          z: -(v.z ?? 0) / Math.max(0.01, relativeSpeed),
        };
  const w = state.ball.spin ?? { x: 0, y: 0, z: 0 };
  const tangent = {
    x: (w.y * n.z - w.z * n.y) * 0.11,
    y: (w.z * n.x - w.x * n.z) * 0.11,
    z: (w.x * n.y - w.y * n.x) * 0.11,
  };
  const spinSpeed = Math.hypot(tangent.x, tangent.y, tangent.z);
  const spinSlip = Math.hypot(
    relative.x + tangent.x,
    relative.y + tangent.y,
    (v.z ?? 0) + tangent.z,
  );
  const height = state.ball.height ?? 0.11;
  const redirect = mode === 'pass' || mode === 'shot';
  const momentumDemand =
    (relativeSpeed / 18) * (redirect ? 0.2 + 0.8 * Math.sin(redirection / 2) : 0.65);
  const bodyDemand =
    Math.max(0, incomingAngle / Math.PI - 0.5) + (redirect ? (outgoingAngle / Math.PI) * 0.6 : 0);
  const edge = clamp(
    (Math.min(left, right) - geometry.footReach * 0.55) / (geometry.footReach * 0.45),
  );
  const movement = (Math.hypot(actor.velocity.x, actor.velocity.y) / 10) * (0.2 + bodyDemand);
  const preparationRelief = Math.min(1, preparationSeconds / (0.2 + (1 - skill) * 0.5));
  const difficulty =
    momentumDemand +
    bodyDemand +
    Math.max(0, height - 0.15) * 0.7 +
    Math.abs(v.z ?? 0) / 16 +
    (spinSpeed / 18 + Math.max(-0.08, (spinSlip - relativeSpeed) / 24)) *
      (surface === 'sole' ? 0.65 : 1) +
    weak * 0.45 +
    pressure * 0.5 +
    movement * 0.35 +
    edge * 0.35 +
    fitness.bodyControlImpairment * (momentumDemand + movement);
  const quality = clamp(
    0.18 + skill * 0.9 + preparationRelief * 0.12 - difficulty * (0.2 + (1 - skill) * 0.22),
  );
  // Contact time is the finite local connection window; it is never a post-touch AI timer.
  const contactSeconds = Math.max(0.012, Math.min(0.18, 0.24 / Math.max(1.4, relativeSpeed)));
  const recoverySeconds =
    (0.045 + (outgoingAngle / Math.PI) * 0.13 + movement * 0.06 + weak * 0.05) *
    fitness.contactRecovery;
  const last = state.lastGroundContact;
  const recovered =
    !last ||
    last.actorId !== actor.id ||
    state.time + availableSeconds - last.at >= recoverySeconds - 1e-8;
  const result = {
    feasible: height <= 0.65 && Math.min(left, right) <= geometry.footReach + 1e-8 && recovered,
    region,
    relativeSpeed,
    incomingHeight: height,
    spinSpeed,
    surface,
    incomingAngle,
    outgoingAngle,
    redirection,
    preparationSeconds,
    contactSeconds,
    recoverySeconds,
    weakFootDifficulty: weak,
    pressure,
    difficulty,
    quality,
    uncertaintyMetres: Math.max(0, difficulty - skill * 0.4) * (0.12 + (1 - skill) * 0.65),
  };
  endPerformanceSpan('first_touch', span);
  return result;
};
