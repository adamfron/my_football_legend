import { z } from 'zod';
import { matchActionSchema, type MatchAction } from './matchState';
import { boundedSceneSchema, type BoundedScene } from './boundedPerception';
import {
  boundedPolicySchema,
  BOUNDED_RESEARCH_POLICY_IDS,
  type BoundedIntent,
} from './boundedIntelligenceState';
import { validateResearchDecision } from './decisionResearchProtocol';
import { clampPitchPoint, distance, distanceToSegment } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { shotPreparationSeconds } from './shotIntent';
import {
  assessRelativeSituation,
  psychologicalContext,
  opponentExpectationSchema,
  relativeSituationSchema,
} from './opponentKnowledge';

const unit = z.number().min(0).max(1);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const boundedCandidateSchema = z.object({
  id: z.string(),
  action: matchActionSchema,
  provenance: z.literal('bounded-geometry-v1'),
  evidenceIds: z.string().array().max(22),
  observedAt: z.number(),
  closesAt: z.number(),
  readyAt: z.number(),
  benefit: z.number().finite(),
  risk: unit,
  confidence: unit,
  progress: z.number(),
  goal: z.enum(['retain', 'progress', 'finish', 'escape']),
  compliant: z.boolean(),
  feasible: z.boolean(),
  legal: z.boolean().optional(),
  relative: relativeSituationSchema.optional(),
  forecast: z
    .object({
      scoring: unit,
      travelSeconds: z.number().nonnegative(),
      nominalSpeed: z.number().nonnegative(),
    })
    .nullable(),
});
export type BoundedCandidate = z.infer<typeof boundedCandidateSchema>;
export const boundedDecisionInputSchema = z.object({
  scene: boundedSceneSchema,
  candidates: boundedCandidateSchema.array().max(48),
});
export type BoundedDecisionInput = z.infer<typeof boundedDecisionInputSchema>;
export const boundedDecisionSchema = z.object({
  policy: boundedPolicySchema,
  actorId: z.string(),
  observedAt: z.number(),
  recognisedAt: z.number(),
  selectedCandidateId: z.string().nullable(),
  preparationCandidateId: z.string().nullable().default(null),
  continuation: z.enum(['new', 'continue', 'cancel', 'wait']),
  reasons: z.string().array().min(1).max(12),
  instructionCompliance: z.boolean().nullable(),
  regret: z.number().nonnegative().nullable(),
  intent: z
    .object({
      candidateKey: z.string(),
      goal: z.enum(['retain', 'progress', 'finish', 'escape']),
      dependencies: z.string().array().max(3),
      expiresAt: z.number(),
    })
    .nullable(),
  measured: z.object({
    generated: z.number().int().max(48),
    evaluations: z.number().int().max(48),
    forecasts: z.number().int().max(3),
  }),
});
export type BoundedDecision = z.infer<typeof boundedDecisionSchema>;

const threat = (s: BoundedScene, p: { x: number; y: number }) => {
  const metres = distance(p, { x: s.direction === 1 ? 105 : 0, y: 34 });
  return 0.015 + 0.32 / (1 + Math.exp((metres - 21) / 8));
};
const preparationAt = (s: BoundedScene, a: MatchAction) => {
  if (a.type === 'hold' || a.type === 'carry') return s.at;
  const target = 'target' in a ? a.target : s.position;
  const turn =
    Math.abs(
      normalizeAngle(
        angleForVector({ x: target.x - s.position.x, y: target.y - s.position.y }) - s.facing,
      ),
    ) / Math.PI;
  const skill = (s.attributes.firstTouch + s.attributes.technique + s.attributes.composure) / 300;
  // Conservative copy of the canonical action-specific demand; no PlayStyle relief.
  return (
    s.readyAt +
    Math.max(
      0,
      turn * 0.55 +
        Math.max(0, distance(s.position, target) - 10) / 70 +
        (a.type === 'shot' ? shotPreparationSeconds(a.intent, a.contact ?? 'settled') : 0) -
        skill * 0.22,
    )
  );
};

/** Construction takes a scene, never a match. No privileged generator annotations can enter.
 * Forecasts are cheap local estimates, NOT authoritative feasibility or realised probabilities.
 * Only three shot trajectory estimates; no rollouts or future physical RNG.
 */
export const constructBoundedCandidates = (raw: BoundedScene): BoundedCandidate[] => {
  const s = boundedSceneSchema.parse(raw),
    result: BoundedCandidate[] = [];
  if (!s.ball || s.ball.ownerId !== s.observerId) return result;
  const foes = s.visible.filter((p) => p.team !== s.team);
  const nearest = Math.min(36, ...foes.map((p) => distance(p.position, s.position)));
  const pressure = clamp(1 - nearest / 7),
    before = threat(s, s.position);
  const relative = s.config.relativeOpportunities ? assessRelativeSituation(s) : undefined;
  const closing = foes.reduce((soon, p) => {
    const d = distance(p.position, s.position),
      v = Math.max(
        0,
        -(
          p.velocity.x * (p.position.x - s.position.x) +
          p.velocity.y * (p.position.y - s.position.y)
        ) / Math.max(0.1, d),
      );
    return Math.min(soon, v > 0.2 ? Math.max(0.05, (d - 1) / v) : 4);
  }, 4);
  const add = (
    a: MatchAction,
    values: Omit<
      BoundedCandidate,
      'id' | 'action' | 'provenance' | 'observedAt' | 'readyAt' | 'feasible'
    >,
  ) => {
    if (result.length === 48) return;
    const readyAt = preparationAt(s, a),
      contact = a.type === 'hold' || a.type === 'carry' || s.contactReady;
    const id =
      a.type === 'pass'
        ? `pass:${a.receiverId}:${a.intent}`
        : a.type === 'shot'
          ? `shot:${a.intent}`
          : a.type === 'carry'
            ? `carry:${Math.round(a.target.y)}`
            : a.type;
    if (result.some((c) => c.id === id)) return;
    result.push({
      id,
      action: a,
      provenance: 'bounded-geometry-v1',
      observedAt: s.at,
      readyAt,
      feasible: contact && values.legal !== false && (a.type !== 'shot' || s.ball!.height <= 0.65),
      ...(relative ? { relative } : {}),
      ...values,
    });
  };
  add(
    { type: 'hold', actorId: s.observerId },
    {
      evidenceIds: [s.observerId],
      closesAt: s.at + Math.max(0.1, closing),
      benefit: -(relative?.waitingRisk ?? pressure * 0.45) * (before + 0.07),
      risk: relative?.waitingRisk ?? pressure * 0.45,
      confidence: 1,
      progress: 0,
      goal: 'retain',
      compliant: true,
      forecast: null,
    },
  );
  for (const side of [-1, 0, 1]) {
    const target = clampPitchPoint({
      x: s.position.x + s.direction * 5,
      y: s.position.y + side * 4,
    });
    const clearance = Math.min(
      20,
      ...foes.map((p) => distanceToSegment(p.position, s.position, target)),
    );
    let risk = clamp(
      (1 - clearance / 6) * 0.5 + (1 - s.attributes.dribbling / 100) * pressure * 0.3,
    );
    if (relative) {
      const resistance = foes.reduce((worst, p) => {
        const expectation = s.opponents[p.id] ?? opponentExpectationSchema.parse({});
        const speed = Math.hypot(p.velocity.x, p.velocity.y);
        const reach = 0.7 + speed * 0.45 + ((2.5 + expectation.mobility * 3) * 0.45 ** 2) / 2;
        const lane = distanceToSegment(p.position, s.position, target);
        return Math.max(worst, clamp(1 - lane / (reach + 1.5)));
      }, 0);
      risk = clamp(resistance * 0.6 + (1 - s.attributes.dribbling / 100) * pressure * 0.22);
    }
    add(
      { type: 'carry', actorId: s.observerId, target, movementMode: 'carry' },
      {
        evidenceIds: foes.map((p) => p.id),
        closesAt: s.at + Math.min(2, closing),
        benefit: threat(s, target) * (1 - risk) - before - risk * 0.04,
        risk,
        confidence: 0.8,
        progress: s.direction * (target.x - s.position.x),
        goal: pressure > 0.5 ? 'escape' : 'progress',
        compliant: true,
        forecast: null,
      },
    );
  }
  for (const receiver of s.visible.filter((p) => p.team === s.team)) {
    const metres = distance(s.position, receiver.position);
    if (metres < 2 || metres > 36) continue;
    const target = clampPitchPoint({
      x: receiver.position.x + receiver.velocity.x * Math.min(0.6, metres / 18),
      y: receiver.position.y + receiver.velocity.y * Math.min(0.6, metres / 18),
    });
    const travel = metres / 18,
      progress = s.direction * (target.x - s.position.x);
    const lane = Math.min(
      20,
      ...foes.map((p) =>
        distanceToSegment(
          {
            x: p.position.x + p.velocity.x * travel * 0.5,
            y: p.position.y + p.velocity.y * travel * 0.5,
          },
          s.position,
          target,
        ),
      ),
    );
    const defenders = foes.map((p) => s.direction * p.position.x).sort((a, b) => b - a);
    const offside =
      defenders.length >= 2 &&
      s.direction * receiver.position.x >
        Math.max(52.5 * s.direction, defenders[1]!, s.direction * s.ball.position.x) + 0.15;
    let risk = clamp(
      (1 - lane / 4) * 0.55 +
        ((1 - s.attributes.passing / 100) * metres) / 90 +
        (defenders.length < 2 && progress > 8 ? 0.12 : 0),
    );
    if (relative) {
      // Execution error remains absolute; resistance uses local interception geometry,
      // observed velocity and uncertain individual mobility, never hidden attributes.
      const resistance = foes.reduce((worst, p) => {
        const expectation = s.opponents[p.id] ?? opponentExpectationSchema.parse({});
        const reach =
          0.7 +
          Math.hypot(p.velocity.x, p.velocity.y) * travel * 0.5 +
          (2.5 + expectation.mobility * 3) * travel * travel * 0.25;
        return Math.max(
          worst,
          clamp(1 - distanceToSegment(p.position, s.position, target) / (reach + 0.8)),
        );
      }, 0);
      const executionError = clamp((1 - s.attributes.passing / 100) * (0.07 + metres / 100));
      risk = clamp(
        executionError +
          (1 - executionError) * resistance * 0.7 +
          (defenders.length < 2 && progress > 8 ? 0.12 : 0),
      );
    }
    add(
      {
        type: 'pass',
        actorId: s.observerId,
        receiverId: receiver.id,
        target,
        intent: progress > 8 ? 'progressive' : 'support',
        delivery: 'ground',
      },
      {
        evidenceIds: [receiver.id, ...foes.map((p) => p.id)],
        closesAt:
          s.at + Math.max(0.12, Math.min(3, closing, relative ? lane / 2 + 0.25 : lane / 2)),
        benefit: (1 - risk) * threat(s, target) - before - risk * 0.04,
        risk: offside ? 1 : risk,
        legal: !offside,
        confidence: 0.8,
        progress,
        goal: pressure > 0.5 ? 'escape' : progress > 3 ? 'progress' : 'retain',
        compliant: !s.instructions.includes('depth') || progress >= 0,
        forecast: null,
      },
    );
  }
  const goal = { x: s.direction === 1 ? 105 : 0, y: 34 };
  const metres = distance(s.position, goal);
  if (metres <= 36) {
    const keeper = foes.find((p) => p.keeper);
    for (const intent of ['driven', 'placed', 'chip'] as const) {
      const nominalSpeed =
        (intent === 'driven' ? 31 : intent === 'placed' ? 25 : 17) + s.attributes.technique * 0.045;
      // Chip's canonical vertical-speed floor implies a longer, lofted travel window.
      const flight =
        intent === 'chip'
          ? ((8.1 + s.attributes.technique * 0.012) * 2) / 9.81
          : metres / nominalSpeed;
      const target = { ...goal, y: 34 + (s.position.y <= 34 ? 2 : -2) };
      const blockage = foes.filter(
        (p) =>
          !p.keeper &&
          distanceToSegment(p.position, s.position, target) < 1.65 &&
          distance(p.position, s.position) < metres,
      ).length;
      const placement =
        1 /
        (1 +
          Math.pow(
            ((1 - s.attributes.finishing / 100) * metres) /
              (intent === 'placed' ? 8.5 : intent === 'driven' ? 6.5 : 7),
            2,
          ));
      const keeperRecovery = keeper ? distance(keeper.position, target) / 6.5 : 0;
      // An unseen keeper is uncertain, not an empty goal. No hidden keeper ability.
      const exposure = keeper ? clamp((keeperRecovery - flight + 0.6) / 1.5) : 0.25;
      const scoring = clamp(
        (0.62 / (1 + Math.exp((metres - 15.5) / 4.5))) *
          placement *
          (1 - pressure * 0.5) *
          Math.pow(0.72, blockage) *
          (0.55 + exposure),
      );
      add(
        { type: 'shot', actorId: s.observerId, intent, target, contact: 'settled' },
        {
          evidenceIds: foes.map((p) => p.id),
          closesAt: s.at + Math.max(0.08, Math.min(2, closing)),
          benefit: scoring - before,
          risk: 1 - scoring,
          confidence: keeper ? 0.8 : 0.5,
          progress: 0,
          goal: 'finish',
          compliant: true,
          forecast: { scoring, travelSeconds: flight, nominalSpeed },
        },
      );
    }
  }
  return boundedCandidateSchema.array().max(48).parse(result);
};

/** Measured by the runner, never supplied by the policy. */
class WorkMeter {
  evaluations = 0;
  inspect(candidate: BoundedCandidate) {
    if (++this.evaluations > 48) throw Error('Evaluation budget exceeded');
    return candidate;
  }
}
type PolicyMechanism = (
  input: Readonly<BoundedDecisionInput>,
  meter: WorkMeter,
) => Omit<BoundedDecision, 'policy' | 'actorId' | 'observedAt' | 'recognisedAt' | 'measured'>;
const selected = (
  c: BoundedCandidate | undefined,
  reasons: string[],
  continuation: BoundedDecision['continuation'] = 'new',
) => ({
  selectedCandidateId: c?.id ?? null,
  preparationCandidateId: null,
  continuation: c ? continuation : 'wait',
  reasons,
  instructionCompliance: c?.compliant ?? null,
  regret: null,
  intent: null,
});
const viable = (s: BoundedScene, c: BoundedCandidate) =>
  c.feasible && c.readyAt <= s.at + 1e-8 && c.closesAt > s.at;

// Preparation is an intention with no release. Canonical feet and motor readiness
// still gate every actual action; a low-confidence prediction is not impossibility.
const preparable = (s: BoundedScene, c: BoundedCandidate) =>
  s.config.relativeOpportunities &&
  c.action.type !== 'hold' &&
  c.action.type !== 'carry' &&
  (s.ball?.height ?? 1) <= 0.65 &&
  c.legal !== false &&
  c.closesAt > Math.max(s.at, c.readyAt) &&
  c.readyAt <= s.at + 1.2;
const finishChoice = (
  s: BoundedScene,
  c: BoundedCandidate | undefined,
  reasons: string[],
  continuation: BoundedDecision['continuation'] = 'new',
) =>
  c && !viable(s, c)
    ? {
        ...selected(undefined, [...reasons, 'physical_preparation_required']),
        preparationCandidateId: c.id,
      }
    : selected(c, reasons, continuation);

// A is an expiring-opportunity queue with a benefit/risk admission test. It never
// calls the state-value ranker or the hierarchical objective selector.
const opportunity: PolicyMechanism = ({ scene: s, candidates }, meter) => {
  const holding = candidates.find((c) => c.action.type === 'hold')?.benefit ?? 0;
  const admitted = candidates.filter((c) => {
    meter.inspect(c);
    return (
      (viable(s, c) || preparable(s, c)) &&
      c.benefit >= holding - 1e-8 &&
      (s.config.relativeOpportunities ||
        (c.goal === 'finish' ? c.forecast!.scoring >= threat(s, s.position) : c.risk < 0.55)) &&
      (s.config.relativeOpportunities || c.confidence >= 0.5)
    );
  });
  const transient = admitted.filter(
    (c) => c.goal !== 'retain' && c.closesAt - s.at < 1.2 && c.benefit > holding + 0.005,
  );
  const choice = [...(transient.length ? transient : admitted)].sort((a, b) =>
    transient.length
      ? a.closesAt - b.closesAt || b.benefit - a.benefit
      : b.benefit - a.benefit || a.id.localeCompare(b.id),
  )[0];
  return finishChoice(s, choice, [
    transient.length
      ? 'useful_window_closes_before_next_deliberation'
      : 'no_admitted_transient_window',
    choice ? 'consequences_compared_with_waiting' : 'wait_for_preparation',
  ]);
};
// H first continues a supported commitment, then chooses ONE tactical objective.
// Only its local alternatives are compared; a missing dependency cancels first.
const hierarchical: PolicyMechanism = ({ scene: s, candidates }, meter) => {
  const previous = s.config.planning ? s.intent : null;
  let cancellation: string | undefined;
  if (previous) {
    const current = candidates.find((c) => c.id === previous.candidateKey);
    const cover = s.visible.filter(
      (p) => p.team === s.team && s.direction * (s.position.x - p.position.x) > 3,
    ).length;
    cancellation =
      previous.signature !== s.signature
        ? 'coaching_changed'
        : previous.expiresAt <= s.at
          ? 'expired'
          : previous.dependencies.some((id) => !s.visible.some((p) => p.id === id))
            ? 'receiver_unavailable'
            : previous.goal === 'progress' && cover < 2
              ? 'missing_defensive_cover'
              : !current ||
                  !(viable(s, current) || preparable(s, current)) ||
                  (s.config.relativeOpportunities
                    ? current.legal === false ||
                      current.benefit <
                        (candidates.find((c) => c.action.type === 'hold')?.benefit ?? -1)
                    : current.risk > 0.55)
                ? 'failed_movement_offside_or_lane_closed'
                : undefined;
    if (!cancellation && current) {
      meter.inspect(current);
      return {
        ...finishChoice(s, current, ['supported_objective_continues'], 'continue'),
        intent: {
          candidateKey: current.id,
          goal: previous.goal,
          dependencies: previous.dependencies,
          expiresAt: previous.expiresAt,
        },
      };
    }
  }
  const options = candidates.filter((c) => {
    meter.inspect(c);
    return (
      (viable(s, c) || preparable(s, c)) &&
      (s.config.relativeOpportunities
        ? c.legal !== false
        : c.goal === 'finish'
          ? c.forecast!.scoring > threat(s, s.position)
          : c.risk <= 0.5)
    );
  });
  const knowledge = s.config.players[s.observerId] ?? s.config.knowledge;
  const pressure =
    Math.min(
      36,
      ...s.visible.filter((p) => p.team !== s.team).map((p) => distance(p.position, s.position)),
    ) < 5;
  const objective = pressure
    ? 'escape'
    : knowledge.system >= 0.5 &&
        s.visible.some((p) => p.team === s.team && s.direction * p.velocity.x > 1)
      ? 'progress'
      : s.scoreDifference > 0 && s.at > 4500
        ? 'retain'
        : 'progress';
  const waiting = options.find((c) => c.action.type === 'hold');
  const local = options
    .filter((c) => c.goal === objective)
    .filter((c) => !s.config.relativeOpportunities || !waiting || c.benefit >= waiting.benefit)
    .sort((a, b) => a.risk - b.risk || b.benefit - a.benefit)
    .slice(0, 3);
  const choice = [...(local.length ? local : options)].sort(
    (a, b) => b.benefit - a.benefit || a.id.localeCompare(b.id),
  )[0];
  return {
    ...finishChoice(
      s,
      choice,
      [
        ...(cancellation ? [`cancel:${cancellation}`] : []),
        `objective:${objective}`,
        'bounded_local_continuation',
      ],
      cancellation ? 'cancel' : 'new',
    ),
    intent: choice
      ? {
          candidateKey: choice.id,
          goal: choice.goal,
          dependencies: choice.action.type === 'pass' ? [choice.action.receiverId] : [],
          expiresAt: Math.min(choice.closesAt, s.at + 1.5),
        }
      : null,
  };
};
// C uses a satisficing risk envelope followed by bounded discretion in a near tie.
// Personality never directly names an action; outcome quality is not an input.
const contextual: PolicyMechanism = ({ scene: s, candidates }, meter) => {
  const psychology = s.config.psychology ? psychologicalContext(s) : null;
  const chasing = s.scoreDifference < 0 && s.at > 4200,
    protecting = s.scoreDifference > 0 && s.at > 4200;
  const riskBudget = chasing ? 0.8 : protecting ? 0.35 : 0.6;
  const options = candidates.filter((c) => {
    meter.inspect(c);
    return (
      (viable(s, c) || preparable(s, c)) &&
      (s.config.relativeOpportunities
        ? c.legal !== false
        : (c.goal === 'finish' ? 1 - c.forecast!.scoring * 2 : c.risk) <= riskBudget)
    );
  });
  const best = [...options].sort((a, b) => b.benefit - a.benefit || a.id.localeCompare(b.id))[0];
  if (!best) return selected(undefined, ['no_option_within_subjective_risk_budget']);
  const tolerance = s.config.individuality
    ? Math.min(
        0.02,
        (s.config.coach.creativeFreedom * 0.008 + s.config.personalIncentive * 0.012) *
          (psychology?.discretion ?? s.confidence) *
          (1 - s.fatigue * 0.3),
      )
    : 0;
  const a = s.attributes;
  const appetite = s.config.individuality
    ? (a.determination + a.ambition + a.composure) / 300
    : 0.5;
  const discipline = s.config.individuality ? (a.professionalism + a.concentration) / 200 : 0.5;
  const near = options.filter(
    (c) =>
      best.benefit - c.benefit <= tolerance &&
      (c.compliant || s.config.coach.creativeFreedom > discipline * s.config.coach.discipline),
  );
  const desiredRisk = clamp(
    (chasing ? 0.55 : protecting ? 0.15 : 0.3) +
      (appetite - 0.5) * 0.2 -
      s.fatigue * 0.1 +
      (psychology ? psychology.urgency * 0.08 - psychology.anxiety * 0.06 : 0),
  );
  const choice =
    [...near].sort(
      (x, y) =>
        Math.abs(x.risk - desiredRisk) - Math.abs(y.risk - desiredRisk) ||
        y.benefit - x.benefit ||
        x.id.localeCompare(y.id),
    )[0] ?? best;
  return {
    ...finishChoice(s, choice, [
      choice.id === best.id
        ? 'best_within_subjective_risk_budget'
        : 'bounded_individual_discretion',
      `context:${chasing ? 'chasing' : protecting ? 'protecting' : 'neutral'}`,
    ]),
    regret: Math.max(0, best.benefit - choice.benefit),
  };
};
const mechanisms = {
  'opportunity-driven-v1': opportunity,
  'hierarchical-intent-v1': hierarchical,
  'contextual-judgment-v1': contextual,
} as const;

export const runBoundedPolicy = (
  policy: z.infer<typeof boundedPolicySchema>,
  raw: BoundedDecisionInput,
): BoundedDecision => {
  // Parse/copy BEFORE invocation. No caller-owned candidate/action can be mutated.
  const input = boundedDecisionInputSchema.parse(raw),
    s = input.scene,
    known = new Set([s.observerId, ...s.visible.map((p) => p.id)]);
  if (new Set(input.candidates.map((c) => c.id)).size !== input.candidates.length)
    throw Error('Duplicate candidate');
  for (const c of input.candidates) {
    if (
      c.action.actorId !== s.observerId ||
      c.observedAt !== s.at ||
      c.evidenceIds.some((id) => !known.has(id))
    )
      throw Error('Invalid candidate provenance');
    const action = c.action;
    if (!['hold', 'carry', 'pass', 'shot'].includes(action.type))
      throw Error('Unsupported experimental action');
    if (
      action.type === 'pass' &&
      !s.visible.some((p) => p.id === action.receiverId && p.team === s.team)
    )
      throw Error('Unobserved receiver');
  }
  const meter = new WorkMeter(),
    result = mechanisms[boundedPolicySchema.parse(policy)](input, meter);
  const decision = boundedDecisionSchema.parse({
    ...result,
    policy,
    actorId: s.observerId,
    observedAt: s.at,
    recognisedAt: s.at,
    measured: {
      generated: input.candidates.length,
      evaluations: meter.evaluations,
      forecasts: input.candidates.filter((c) => c.forecast).length,
    },
  });
  const chosen = input.candidates.find((c) => c.id === decision.selectedCandidateId);
  if (decision.selectedCandidateId !== null && (!chosen || !viable(s, chosen)))
    throw Error('Unavailable policy selection');
  validateResearchDecision(
    {
      observation: {
        observerId: s.observerId,
        team: s.team,
        at: s.at,
        position: clampPitchPoint(s.position),
        direction: s.direction,
        ball: s.ball ? clampPitchPoint(s.ball.position) : null,
        ownerId: s.ball?.ownerId ?? null,
        visible: s.visible.map((p) => ({
          id: p.id,
          team: p.team,
          position: clampPitchPoint(p.position),
          velocity: p.velocity,
        })),
        trigger: null,
        sourceId: null,
      },
      patterns: [],
      currentIntent: s.intent
        ? {
            id: s.intent.candidateKey,
            goal: s.intent.goal,
            expiresAt: s.intent.expiresAt,
            dependencies: s.intent.dependencies,
          }
        : null,
      candidates: input.candidates.map((c) => ({
        id: c.id,
        action: c.action,
        feasible: c.feasible,
        evidenceIds: c.evidenceIds,
        closesAt: c.closesAt,
      })),
      budget: { evaluations: 48, forecasts: 3 },
    },
    {
      policy: BOUNDED_RESEARCH_POLICY_IDS[policy],
      observedAt: s.at,
      recognisedAt: s.at,
      selectedCandidateId: decision.selectedCandidateId,
      intention: decision.intent?.goal ?? null,
      continuation: decision.continuation,
      evidenceIds: chosen?.evidenceIds ?? [],
      reasons: decision.reasons,
      evaluations: meter.evaluations,
      forecasts: decision.measured.forecasts,
    },
  );
  return decision;
};
export const intentFromDecision = (s: BoundedScene, d: BoundedDecision): BoundedIntent | null =>
  d.intent
    ? {
        actorId: s.observerId,
        ...d.intent,
        startedAt: d.continuation === 'continue' && s.intent ? s.intent.startedAt : s.at,
        signature: s.signature,
      }
    : null;
