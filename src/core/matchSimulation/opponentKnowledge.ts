import { z } from 'zod';
import type { BoundedScene } from './boundedPerception';
import { distance } from './matchSpace';
import { normalizeAngle } from './playerOrientation';

const unit = z.number().min(0).max(1);
export const opponentExpectationSchema = z.object({
  mobility: unit.default(0.5),
  control: unit.default(0.5),
  strength: z.number().min(0).max(12).default(0),
  lastEvent: z.string().default(''),
  lastContactKey: z.string().default(''),
  lastAt: z.number().default(-10),
  moving: z.boolean().default(false),
  heading: z.number().default(0),
});
export type OpponentExpectation = z.infer<typeof opponentExpectationSchema>;
export const opponentMemorySchema = z.record(z.string(), opponentExpectationSchema);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Only copied visible motion and distinct observed ball contacts enter temporary memory.
 * A stationary tick is never another observation. Score/hidden ratings are not inputs.
 * Neutral uncertain priors are deliberate: persistent scouting is a separate career feature.
 */
export const updateOpponentKnowledge = (s: BoundedScene) => {
  const memory = { ...s.opponents };
  for (const p of s.visible.filter((p) => p.team !== s.team)) {
    const old = memory[p.id] ?? opponentExpectationSchema.parse({});
    const speed = Math.hypot(p.velocity.x, p.velocity.y);
    const heading = Math.atan2(p.velocity.y, p.velocity.x);
    const moving = speed > 2;
    const motion = moving && (!old.moving || Math.abs(normalizeAngle(heading - old.heading)) > 0.8);
    const touch =
      s.observedContact?.actorId === p.id && s.observedContact.key !== old.lastContactKey;
    if ((!motion && !touch) || s.at - old.lastAt < 1.5) {
      if (memory[p.id] && !moving && old.moving) memory[p.id] = { ...old, moving: false };
      continue;
    }
    const weight = 1 / (5 + old.strength);
    memory[p.id] = {
      ...old,
      mobility: motion ? old.mobility + (clamp(speed / 9) - old.mobility) * weight : old.mobility,
      control:
        touch && s.ball
          ? old.control +
            (clamp(1 - distance(p.position, s.ball.position) / 2) - old.control) * weight
          : old.control,
      strength: Math.min(12, old.strength + 1),
      lastAt: s.at,
      lastEvent: touch ? s.observedContact!.key : `motion:${s.at}`,
      lastContactKey: touch ? s.observedContact!.key : old.lastContactKey,
      moving,
      heading,
    };
  }
  return opponentMemorySchema.parse(memory);
};

export const relativeSituationSchema = z.object({
  horizon: z.number().positive(),
  pressure: unit,
  waitingRisk: unit,
  arriving: z.number().int().nonnegative(),
  uncertainty: unit,
});
/** Bounded prediction of approach, body protection and a second angle of intervention.
 * This is a subjective forecast, never tackle eligibility or a physical success roll.
 */
export const assessRelativeSituation = (s: BoundedScene) => {
  const horizon = 1.2;
  const foes = s.visible.filter((p) => p.team !== s.team);
  const ball = s.ball?.position ?? s.position;
  const threats = foes.map((p) => {
    const estimate = s.opponents[p.id] ?? opponentExpectationSchema.parse({});
    const d = distance(p.position, ball);
    const radial = Math.max(
      0,
      ((ball.x - p.position.x) * p.velocity.x + (ball.y - p.position.y) * p.velocity.y) /
        Math.max(0.1, d),
    );
    const acceleration = 2.5 + estimate.mobility * 3;
    const approach = radial * horizon + 0.5 * acceleration * horizon * horizon;
    const protectedSide = distance(p.position, s.position) + 0.15 < d;
    const resistance = clamp(1 - (d - approach - 0.7) / 3) * (protectedSide ? 0.4 : 1);
    return {
      resistance,
      uncertainty: 4 / (4 + estimate.strength),
      x: p.position.x - s.position.x,
      y: p.position.y - s.position.y,
    };
  });
  const arriving = threats.filter((p) => p.resistance > 0.35);
  const twoAngles = arriving.some((a, i) =>
    arriving
      .slice(i + 1)
      .some(
        (b) =>
          (a.x * b.x + a.y * b.y) / Math.max(0.1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) <
          0.3,
      ),
  );
  return relativeSituationSchema.parse({
    horizon,
    pressure: clamp(1 - Math.min(7, ...foes.map((p) => distance(p.position, s.position))) / 7),
    waitingRisk: clamp(Math.max(0, ...threats.map((p) => p.resistance)) * (twoAngles ? 1 : 0.65)),
    arriving: arriving.length,
    uncertainty: threats.length
      ? threats.reduce((v, p) => v + p.uncertainty, 0) / threats.length
      : 1,
  });
};

export const psychologicalContextSchema = z.object({
  urgency: z.number().min(-1).max(1),
  anxiety: unit,
  discretion: unit,
});
/** Experimental preference only. Neither technical attributes nor opponent beliefs change. */
export const psychologicalContext = (s: BoundedScene) => {
  const a = s.attributes;
  const late = clamp((s.at - 3000) / 2400);
  const tacticalUrgency = clamp(-s.scoreDifference) * late - clamp(s.scoreDifference) * late * 0.5;
  const surprise = Math.max(0, s.config.expectedAdvantage) * clamp(-s.scoreDifference);
  const urgency = Math.min(1, tacticalUrgency + surprise * 0.2);
  const anxiety = clamp(
    (1 - a.composure / 100) * Math.max(0, urgency) * (1 - a.determination / 200) +
      Math.max(0, -s.ownForm) * (1 - a.composure / 100) * 0.1,
  );
  return psychologicalContextSchema.parse({
    urgency,
    anxiety,
    discretion: clamp(
      (s.confidence * (1 - anxiety) * (a.ambition + a.determination)) / 200 + s.ownForm * 0.08,
    ),
  });
};
