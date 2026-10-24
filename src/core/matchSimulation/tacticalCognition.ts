import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { distance, clampPitchPoint, pitchPointSchema, physicalPointSchema } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { tacticalRoleFor, tacticalRoleIdSchema, TACTICAL_ROLES } from './tacticalRoles';
import { perceptionLatency } from './decisionReadiness';
import { RandomGenerator } from '../random/RandomGenerator';

/** Research-only contracts. Nothing here is imported by the live match/career scheduler.
 * All constants are experimental assumptions, not calibrated human response estimates. */
const unit = z.number().min(0).max(1);
export const patternIdSchema = z.enum(['counter_support', 'playmaker_run', 'press_triangle']);
export type PatternId = z.infer<typeof patternIdSchema>;
export const coachDemandsSchema = z.object({
  complexity: unit,
  changeFrequency: unit,
  discipline: unit,
  creativeFreedom: unit,
  rehearsal: unit,
});
export type CoachDemands = z.infer<typeof coachDemandsSchema>;
export const RESEARCH_COACHES = {
  system: coachDemandsSchema.parse({
    complexity: 0.9,
    changeFrequency: 0.1,
    discipline: 0.9,
    creativeFreedom: 0.15,
    rehearsal: 0.9,
  }),
  tinkerer: coachDemandsSchema.parse({
    complexity: 0.7,
    changeFrequency: 0.9,
    discipline: 0.7,
    creativeFreedom: 0.35,
    rehearsal: 0.6,
  }),
  trusting: coachDemandsSchema.parse({
    complexity: 0.4,
    changeFrequency: 0.1,
    discipline: 0.45,
    creativeFreedom: 0.85,
    rehearsal: 0.5,
  }),
} as const;

export const patternDefinitionSchema = z.object({
  id: patternIdSchema,
  trigger: z.string(),
  instructions: z.array(z.string()).max(4),
  dependencies: z.array(z.string()).max(4),
  cancellation: z.array(z.string()).max(8),
  lifetime: z.number().positive().max(5),
  radius: z.number().positive().max(40),
  minimumCover: z.number().int().min(1),
});
export const RESEARCH_PATTERNS = patternDefinitionSchema.array().parse([
  {
    id: 'counter_support',
    trigger: 'visible new carrier advancing after regain',
    instructions: ['counter', 'depth', 'central_support'],
    dependencies: ['carrier retains ball', 'cover remains'],
    cancellation: ['lost_owner', 'expired', 'no_cover', 'not_visible', 'offside_risk'],
    lifetime: 2.4,
    radius: 36,
    minimumCover: 2,
  },
  {
    id: 'playmaker_run',
    trigger: 'visible deep playmaker preparing distribution',
    instructions: ['depth', 'box', 'counter'],
    dependencies: ['observed preparation', 'on-side start'],
    cancellation: ['lost_owner', 'expired', 'no_cover', 'not_visible', 'offside_risk'],
    lifetime: 2.4,
    radius: 36,
    minimumCover: 2,
  },
  {
    id: 'press_triangle',
    trigger: 'visible teammate approached by an opponent',
    instructions: ['come_short', 'combine', 'central_support'],
    dependencies: ['reachable short angle', 'staggered support', 'cover remains'],
    cancellation: ['lost_owner', 'expired', 'no_cover', 'not_visible', 'lane_blocked'],
    lifetime: 2.4,
    radius: 26,
    minimumCover: 2,
  },
]);

export const familiaritySchema = z.object({
  pattern: patternIdSchema,
  signature: z.string().min(1),
  roleId: tacticalRoleIdSchema,
  partnerId: z.string(),
  system: unit.default(0),
  role: unit.default(0),
  partner: unit.default(0),
  relevantExposures: z.number().int().nonnegative().default(0),
});
export type Familiarity = z.infer<typeof familiaritySchema>;
export const exposureSchema = z.object({
  kind: z.enum(['training', 'compatible_match', 'cooperation', 'idle']),
  meaningful: z.boolean(),
  compatibility: unit,
});
/** A relevant episode, never elapsed match minutes. Adaptability controls acquisition;
 * reading controls recognition below. Familiarity cannot improve physical execution. */
export const learnPattern = (
  input: Familiarity,
  actor: MatchPlayerState,
  raw: z.input<typeof exposureSchema>,
): Familiarity => {
  const f = familiaritySchema.parse(input),
    e = exposureSchema.parse(raw);
  if (!e.meaningful || e.kind === 'idle') return f;
  const a = actor.profile.attributes;
  const rate =
    (0.025 + actor.profile.hiddenProfile.adaptability / 1800) *
    e.compatibility *
    (e.kind === 'training' ? 0.5 + a.professionalism / 200 : 1);
  return familiaritySchema.parse({
    ...f,
    system: f.system + (1 - f.system) * rate,
    role: f.role + (1 - f.role) * rate * 0.8,
    partner: f.partner + (1 - f.partner) * rate * (e.kind === 'cooperation' ? 1 : 0.15),
    relevantExposures: f.relevantExposures + 1,
  });
};
/** Only affected knowledge is discounted; unrelated pattern records remain untouched. */
export const revisePattern = (
  f: Familiarity,
  signature: string,
  compatibility: number,
): Familiarity =>
  familiaritySchema.parse({ ...f, signature, system: f.system * unit.parse(compatibility) });

const visiblePlayerSchema = z.object({
  id: z.string(),
  team: z.enum(['home', 'away']),
  position: pitchPointSchema,
  velocity: physicalPointSchema,
  role: tacticalRoleIdSchema.optional(),
});
export const tacticalObservationSchema = z.object({
  observerId: z.string(),
  team: z.enum(['home', 'away']),
  at: z.number().nonnegative(),
  position: pitchPointSchema,
  direction: z.union([z.literal(-1), z.literal(1)]),
  ball: pitchPointSchema.nullable(),
  ownerId: z.string().nullable(),
  visible: z.array(visiblePlayerSchema).max(22),
  trigger: patternIdSchema.nullable(),
  sourceId: z.string().nullable(),
});
export type TacticalObservation = z.infer<typeof tacticalObservationSchema>;
/** Local current geometry only, with an independent observation stream. Opponent profiles,
 * hidden attributes, RNG state, targets and future actions are deliberately absent. */
export const observeTacticalScene = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  pattern: PatternId,
): TacticalObservation => {
  const rng = RandomGenerator.fromSeed(`${state.seed}:pr186:observation:${actor.id}:${state.time}`);
  const sees = (point: { x: number; y: number }) => {
    const d = distance(actor.position, point);
    const angle = angleForVector({ x: point.x - actor.position.x, y: point.y - actor.position.y });
    return d <= 36 && (d < 7 || Math.abs(normalizeAngle(angle - actor.facingAngle)) < 1.92);
  };
  const visible = state.players
    .filter((p) => p.id !== actor.id && sees(p.position) && !state.discipline?.[p.id]?.sentOff)
    .map((p) => ({
      id: p.id,
      team: p.team,
      position: clampPitchPoint({
        x: p.position.x + (rng.float() - 0.5) * 0.3,
        y: p.position.y + (rng.float() - 0.5) * 0.3,
      }),
      velocity: { ...p.velocity },
      ...(p.team === actor.team ? { role: tacticalRoleFor(state, p).id } : {}),
    }));
  const ball = sees(state.ball) ? { x: state.ball.x, y: state.ball.y } : null;
  const source = visible.find((p) => p.id === state.ball.ownerId && p.team === actor.team);
  const pressed =
    source &&
    visible.some((p) => p.team !== actor.team && distance(p.position, source.position) < 5);
  const prepared =
    source?.role === 'deep_playmaker' &&
    state.onBallPreparation?.actorId === source.id &&
    state.onBallPreparation.readyAt > state.time;
  const regain =
    source &&
    state.timeSincePossessionChanged < 2.5 &&
    Math.hypot(source.velocity.x, source.velocity.y) > 1;
  const triggered =
    ball &&
    source &&
    (pattern === 'press_triangle' ? pressed : pattern === 'playmaker_run' ? prepared : regain);
  return tacticalObservationSchema.parse({
    observerId: actor.id,
    team: actor.team,
    at: state.time,
    position: actor.position,
    direction: (actor.team === 'home') !== Boolean(actor.endsSwitched) ? 1 : -1,
    ball,
    ownerId: source?.id ?? null,
    visible,
    trigger: triggered ? pattern : null,
    sourceId: triggered ? source.id : null,
  });
};

export const tacticalAdviceSchema = z
  .object({
    sourceId: z.string(),
    recipientId: z.string(),
    evidencePlayerId: z.string(),
    observedAt: z.number().nonnegative(),
    sentAt: z.number().nonnegative(),
    expiresAt: z.number().nonnegative(),
    pattern: patternIdSchema,
    target: pitchPointSchema,
    confidence: unit,
    authority: unit,
  })
  .refine((m) => m.observedAt <= m.sentAt && m.sentAt < m.expiresAt);
export type TacticalAdvice = z.infer<typeof tacticalAdviceSchema>;
export const makeTacticalAdvice = (
  o: TacticalObservation,
  leader: MatchPlayerState,
  recipientId: string,
  pattern: PatternId,
  target: { x: number; y: number },
): TacticalAdvice | undefined => {
  const recipient = o.visible.find((p) => p.id === recipientId && p.team === o.team);
  const evidence = o.visible.find((p) => p.team !== o.team);
  if (
    o.observerId !== leader.id ||
    !recipient ||
    !evidence ||
    distance(o.position, recipient.position) > 22 ||
    distance(recipient.position, target) > 22 ||
    o.trigger !== pattern
  )
    return undefined;
  return tacticalAdviceSchema.parse({
    sourceId: leader.id,
    recipientId,
    evidencePlayerId: evidence.id,
    observedAt: o.at,
    sentAt: o.at,
    expiresAt: o.at + 1.2,
    pattern,
    target,
    confidence: leader.profile.attributes.gameReading / 100,
    authority: leader.profile.attributes.leadership / 100,
  });
};
export const receiveTacticalAdvice = (
  raw: TacticalAdvice,
  o: TacticalObservation,
  actor: MatchPlayerState,
) => {
  const advice = tacticalAdviceSchema.parse(raw);
  const source = o.visible.find((p) => p.id === advice.sourceId && p.team === o.team);
  if (
    advice.recipientId !== actor.id ||
    !source ||
    o.at < advice.sentAt ||
    o.at >= advice.expiresAt ||
    distance(source.position, o.position) > 22 ||
    distance(o.position, advice.target) > 22
  )
    return 'unavailable' as const;
  const trust =
    advice.authority * 0.4 + advice.confidence * 0.4 + actor.profile.attributes.concentration / 500;
  if (trust < 0.45) return 'rejected' as const;
  const rng = RandomGenerator.fromSeed(
    `pr186:comprehension:${actor.id}:${advice.sourceId}:${advice.sentAt}`,
  );
  return rng.float() > 0.7 + actor.profile.attributes.gameReading / 400
    ? ('misunderstood' as const)
    : ('accepted' as const);
};

export const cognitionTraceSchema = z.object({
  pattern: patternIdSchema,
  actorId: z.string(),
  observationAt: z.number().nonnegative(),
  recognitionAt: z.number().nonnegative().nullable(),
  intentionAt: z.number().nonnegative().nullable(),
  mode: z.enum(['motor', 'prepared', 'deliberate']),
  target: pitchPointSchema.nullable(),
  expiresAt: z.number().nonnegative(),
  reasons: z.array(z.string()).max(12),
  advice: z.enum(['none', 'unavailable', 'rejected', 'misunderstood', 'accepted']),
});
export type CognitionTrace = z.infer<typeof cognitionTraceSchema>;
export const recognisePattern = (
  o: TacticalObservation,
  actor: MatchPlayerState,
  f: Familiarity,
  coach: CoachDemands,
  mode: CognitionTrace['mode'],
  advice?: TacticalAdvice,
): CognitionTrace => {
  tacticalObservationSchema.parse(o);
  familiaritySchema.parse(f);
  coachDemandsSchema.parse(coach);
  const definition = RESEARCH_PATTERNS.find((p) => p.id === f.pattern)!;
  const reasons: string[] = [];
  const received = advice ? receiveTacticalAdvice(advice, o, actor) : 'none';
  const source = o.visible.find((p) => p.id === o.sourceId);
  const role = TACTICAL_ROLES.find((r) => r.id === f.roleId)!;
  if (o.observerId !== actor.id || o.trigger !== f.pattern || !source || !o.ball)
    reasons.push('not_visible');
  if (!definition.instructions.some((i) => role.instructions.some((r) => r === i)))
    reasons.push('role_obligation');
  const cover = o.visible.filter(
    (p) =>
      p.team === o.team && p.id !== source?.id && o.direction * (o.position.x - p.position.x) > 3,
  ).length;
  if (cover < definition.minimumCover) reasons.push('no_cover');
  if (source && distance(o.position, source.position) > definition.radius) reasons.push('too_far');
  // This represents recognition time only. It does not claim physical release is ready.
  const familiarity = (f.system + f.role + f.partner) / 3;
  const latency =
    mode === 'motor'
      ? 0.04 + perceptionLatency(actor) * 0.2
      : mode === 'prepared'
        ? perceptionLatency(actor) + (1 - familiarity) * coach.complexity * 0.75
        : perceptionLatency(actor) +
          0.3 +
          coach.complexity * (1 - actor.profile.attributes.gameReading / 100) * 0.5;
  const recognitionAt = o.at + Math.max(0.025, latency - (received === 'accepted' ? 0.12 : 0));
  const side = o.position.y < (source?.position.y ?? 34) ? -1 : 1;
  let target = source
    ? clampPitchPoint(
        f.pattern === 'press_triangle'
          ? { x: source.position.x - o.direction * 3, y: source.position.y + side * 8 }
          : {
              x: o.position.x + o.direction * (f.pattern === 'playmaker_run' ? 12 : 10),
              y: o.position.y + side * 2,
            },
      )
    : null;
  if (received === 'accepted' && advice?.pattern === f.pattern) target = { ...advice.target };
  const defenders = o.visible
    .filter((p) => p.team !== o.team)
    .map((p) => o.direction * p.position.x)
    .sort((a, b) => b - a);
  const offsideLine = defenders[1];
  if (
    f.pattern !== 'press_triangle' &&
    offsideLine !== undefined &&
    o.direction * o.position.x >
      Math.max(52.5 * o.direction, offsideLine, o.direction * (o.ball?.x ?? o.position.x))
  )
    reasons.push('offside_risk');
  if (target && o.visible.some((p) => p.team !== o.team && distance(p.position, target!) < 1.2))
    reasons.push('lane_blocked');
  return cognitionTraceSchema.parse({
    pattern: f.pattern,
    actorId: actor.id,
    observationAt: o.at,
    recognitionAt: reasons.length ? null : recognitionAt,
    intentionAt: reasons.length ? null : recognitionAt,
    mode,
    target: reasons.length ? null : target,
    expiresAt: o.at + definition.lifetime,
    reasons: reasons.length ? reasons : ['recognised', `familiarity:${familiarity.toFixed(3)}`],
    advice: received,
  });
};

export const judgmentOptionSchema = z.object({
  id: z.string(),
  value: z.number().finite(),
  personalAppeal: unit,
  risk: unit,
  compliant: z.boolean(),
  feasible: z.boolean(),
  observed: z.boolean(),
});
export const judgmentContextSchema = z.object({
  match: z.enum(['neutral', 'protecting', 'chasing']),
  personalIncentive: unit,
  fatigue: unit,
  pressure: unit,
  confidence: unit,
  coach: coachDemandsSchema,
});
export const judgmentResultSchema = z.object({
  selected: z.string().nullable(),
  instructionCompliance: z.boolean().nullable(),
  teamValueRegret: z.number().nonnegative().nullable(),
  reason: z.string(),
  executionQuality: z.null(),
  outcomeQuality: z.null(),
});
/** Near-tie discretion is bounded; no ambition-to-shot or aggression-to-foul rule.
 * Decision value/compliance are separate from as-yet unexecuted quality/outcome. */
export const judgeContextualOptions = (
  raw: z.infer<typeof judgmentOptionSchema>[],
  context: z.infer<typeof judgmentContextSchema>,
  actor: MatchPlayerState,
) => {
  const c = judgmentContextSchema.parse(context);
  const riskBudget = c.match === 'protecting' ? 0.35 : c.match === 'chasing' ? 0.85 : 0.6;
  const options = judgmentOptionSchema
    .array()
    .max(48)
    .parse(raw)
    .filter((o) => o.feasible && o.observed && o.risk <= riskBudget);
  const best = [...options].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0];
  if (!best)
    return judgmentResultSchema.parse({
      selected: null,
      instructionCompliance: null,
      teamValueRegret: null,
      reason: 'no_observed_feasible_option',
      executionQuality: null,
      outcomeQuality: null,
    });
  const tolerance =
    Math.min(0.02, c.personalIncentive * 0.012 + c.coach.creativeFreedom * 0.008) *
    (0.5 + c.confidence * 0.5) *
    (1 - c.fatigue * 0.3) *
    (1 - c.pressure * (1 - actor.profile.attributes.composure / 100) * 0.4);
  const allowed = options.filter(
    (o) =>
      best.value - o.value <= tolerance &&
      (o.compliant || c.coach.creativeFreedom >= c.coach.discipline),
  );
  const selected =
    [...allowed].sort(
      (a, b) =>
        b.personalAppeal - a.personalAppeal || b.value - a.value || a.id.localeCompare(b.id),
    )[0] ?? best;
  return judgmentResultSchema.parse({
    selected: selected.id,
    instructionCompliance: selected.compliant,
    teamValueRegret: Math.max(0, best.value - selected.value),
    reason: selected.id === best.id ? 'best_within_risk_budget' : 'bounded_personal_discretion',
    executionQuality: null,
    outcomeQuality: null,
  });
};
