import { z } from 'zod';
import type { BoundedScene } from './boundedPerception';
import { distance, clampPitchPoint, physicalPointSchema } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';

const point = physicalPointSchema;
export const contactRaceEstimateSchema = z.object({
  locationSeconds: z.number().nonnegative(),
  playableSeconds: z.number().nonnegative(),
  actionSeconds: z.number().nonnegative(),
});
export const opportunityWindowSchema = z.object({
  observedAt: z.number(),
  receiverId: z.string(),
  target: point,
  preparationSeconds: z.number().nonnegative(),
  travelSeconds: z.number().positive(),
  opensAt: z.number().nullable(),
  closesAt: z.number().nullable(),
  horizonCensored: z.boolean(),
  receiver: contactRaceEstimateSchema,
  defenderId: z.string().nullable(),
  defender: contactRaceEstimateSchema.nullable(),
  contactMargin: z.number(),
  laneMargin: z.number(),
  samples: z.array(z.object({ delay: z.number(), margin: z.number() })).max(9),
});
export type OpportunityWindow = z.infer<typeof opportunityWindowSchema>;
export const transitionRunSchema = z.object({
  actorId: z.string(),
  sourceId: z.string(),
  kind: z.enum(['pass_and_run', 'third_man']),
  origin: point,
  target: point,
  observedAt: z.number(),
  recognisedAt: z.number(),
  expiresAt: z.number(),
  reason: z.string(),
});
export const transitionRuntimeSchema = z.object({
  defenceScanAt: z.number().optional(),
  lastScanAt: z.number(),
  runs: z.array(transitionRunSchema).max(2),
});
export const transitionMarkSchema = z.object({
  runnerId: z.string(),
  observedAt: z.number(),
  target: point,
  runnerThreat: z.number().nonnegative(),
  ballThreat: z.number().nonnegative(),
});

type Body = {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  facing?: number | undefined;
};
/** A bounded engineering estimate, never ownership or an authoritative future replay.
 * Adverse and transverse momentum cost real acceleration; useful contact additionally
 * requires body orientation and preparation. Other players use a common uncertain envelope. */
export const estimateUsefulContact = (
  body: Body,
  target: { x: number; y: number },
  maximumSpeed = 7.6,
  acceleration = 5.2,
  reaction = 0.16,
  preparation = 0.08,
) => {
  const p = {
    x: body.position.x + body.velocity.x * reaction,
    y: body.position.y + body.velocity.y * reaction,
  };
  const dx = target.x - p.x,
    dy = target.y - p.y,
    d = Math.hypot(dx, dy);
  const along = (body.velocity.x * dx + body.velocity.y * dy) / Math.max(0.01, d);
  const across = Math.abs(body.velocity.x * dy - body.velocity.y * dx) / Math.max(0.01, d);
  const turn = Math.abs(
    normalizeAngle(
      angleForVector({ x: dx, y: dy }) - (body.facing ?? angleForVector(body.velocity)),
    ),
  );
  const brake = Math.hypot(Math.max(0, -along), across) / acceleration;
  const initial = Math.max(0, Math.min(maximumSpeed, along));
  const metres = Math.max(0, d - 0.65);
  const ramp = (maximumSpeed - initial) / acceleration;
  const rampDistance = initial * ramp + (acceleration * ramp * ramp) / 2;
  const travel =
    metres <= rampDistance
      ? (Math.sqrt(initial * initial + 2 * acceleration * metres) - initial) / acceleration
      : ramp + (metres - rampDistance) / maximumSpeed;
  const locationSeconds = reaction + Math.max(brake, travel);
  const playableSeconds = Math.max(locationSeconds, reaction + turn / 4.5 + preparation);
  return { locationSeconds, playableSeconds, actionSeconds: playableSeconds + preparation };
};

const shifted = (p: Body, seconds: number): Body => ({
  ...p,
  position: { x: p.position.x + p.velocity.x * seconds, y: p.position.y + p.velocity.y * seconds },
});
export const boundedPositionThreat = (direction: number, p: { x: number; y: number }) => {
  const metres = distance(p, { x: direction === 1 ? 105 : 0, y: 34 });
  return 0.015 + 0.32 / (1 + Math.exp((metres - 21) / 8));
};

/** An incomplete sighting cannot establish the second-last opponent. An unseen
 * keeper is an uncertainty, never proof that the nearest visible defender is
 * the offside line. The canonical law check still uses the actual release. */
export const observedOffsideAssessment = (s: BoundedScene, receiver: { x: number; y: number }) => {
  const foes = s.visible.filter((p) => p.team !== s.team);
  const ordered = foes.map((p) => s.direction * p.position.x).sort((a, b) => b - a);
  const line = ordered[foes.some((p) => p.keeper) ? 1 : 0];
  const beyond =
    line === undefined
      ? 0
      : Math.max(
          0,
          s.direction * receiver.x -
            Math.max(52.5 * s.direction, s.direction * (s.ball?.position.x ?? s.position.x), line),
        );
  return { line: line ?? null, uncertain: foes.length < 11, risk: Math.min(0.7, beyond / 6) };
};

/** Nine release samples, four points per lane. It sees only this player's scene.
 * Linear extrapolation is intentionally uncertain; no exact future ball flight, private
 * opponent targets, ratings, future RNG or omniscient team organisation is available. */
export const estimatePassWindow = (
  s: BoundedScene,
  receiverId: string,
  target: { x: number; y: number },
  travelSeconds: number,
  preparationSeconds: number,
  loft?: { verticalSpeed: number; releaseHeight: number },
): OpportunityWindow | undefined => {
  const receiver = s.visible.find((p) => p.id === receiverId && p.team === s.team);
  if (!receiver || !s.ball) return;
  const foes = s.visible.filter((p) => p.team !== s.team);
  const reaction = 0.3 - ((s.attributes.gameReading + s.attributes.concentration) / 200) * 0.18;
  const sample = (delay: number) => {
    const receive = estimateUsefulContact(shifted(receiver, delay), target, 7.6, 5.2, reaction);
    let laneMargin = 4,
      defenderId: string | null = null;
    let defender: ReturnType<typeof estimateUsefulContact> | null = null;
    for (const p of foes) {
      const body = shifted(p, delay);
      for (const f of [0.25, 0.5, 0.75, 1]) {
        // A proposed loft is not a ground ray. This approximate common aerial
        // envelope is uncertainty, never a scheduled jump or awarded interception.
        const time = travelSeconds * f;
        const height = loft
          ? loft.releaseHeight + loft.verticalSpeed * time - (9.81 * time * time) / 2
          : 0;
        if (loft && height > 1.9) continue;
        const contact = estimateUsefulContact(body, {
          x: s.ball!.position.x + (target.x - s.ball!.position.x) * f,
          y: s.ball!.position.y + (target.y - s.ball!.position.y) * f,
        });
        const margin = contact.playableSeconds - travelSeconds * f;
        if (margin < laneMargin) {
          laneMargin = margin;
          defenderId = p.id;
          defender = contact;
        }
      }
    }
    return {
      receive,
      defender,
      defenderId,
      laneMargin,
      margin: Math.min(laneMargin, travelSeconds + 0.2 - receive.playableSeconds),
    };
  };
  const samples = Array.from({ length: 9 }, (_, i) => {
    const delay = i * 0.2,
      value = sample(delay);
    return { delay, margin: value.margin };
  });
  const first = samples.findIndex((p) => p.margin >= 0);
  const end = first < 0 ? -1 : samples.findIndex((p, i) => i > first && p.margin < 0);
  const now = sample(preparationSeconds);
  return {
    observedAt: s.at,
    receiverId,
    target: { ...target },
    preparationSeconds,
    travelSeconds,
    opensAt: first < 0 ? null : s.at + samples[first]!.delay,
    closesAt: first < 0 ? null : s.at + (end < 0 ? 1.6 : samples[end]!.delay),
    horizonCensored: first >= 0 && end < 0,
    receiver: now.receive,
    defender: now.defender,
    defenderId: now.defenderId,
    contactMargin: now.margin,
    laneMargin: now.laneMargin,
    samples,
  };
};

/** One local continuation, in the SAME threat units as the immediate outcome.
 * Space, territory and organisation are constraints on that continuation, not
 * separately accumulated bonuses. A backward release can unlock a visible option. */
export const boundedContinuationThreat = (
  s: BoundedScene,
  at: { x: number; y: number },
  receiverId?: string,
) => {
  let best = boundedPositionThreat(s.direction, at);
  const foes = s.visible.filter((p) => p.team !== s.team);
  const options = [
    clampPitchPoint({ x: at.x + s.direction * 7, y: at.y }),
    ...s.visible
      .filter(
        (p) => p.team === s.team && p.id !== receiverId && s.direction * (p.position.x - at.x) > 3,
      )
      .slice(0, 4)
      .map((p) =>
        clampPitchPoint({
          x: p.position.x + p.velocity.x * 0.6,
          y: p.position.y + p.velocity.y * 0.6,
        }),
      ),
  ];
  for (const target of options) {
    const travel = Math.max(0.5, distance(at, target) / 12);
    let margin = 2;
    for (const p of foes) {
      for (const f of [0.5, 1]) {
        const q = { x: at.x + (target.x - at.x) * f, y: at.y + (target.y - at.y) * f };
        margin = Math.min(margin, estimateUsefulContact(p, q).playableSeconds - travel * f);
      }
    }
    const access = Math.max(0, Math.min(1, (margin + 0.15) / 0.75));
    best = Math.max(
      best,
      best + Math.max(0, boundedPositionThreat(s.direction, target) - best) * access,
    );
  }
  return best;
};
