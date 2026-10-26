import { z } from 'zod';
import type { BoundedScene } from './boundedPerception';
import { physicalPointSchema, clampPitchPoint, distance } from './matchSpace';
import { boundedPositionThreat, estimateUsefulContact } from './opportunityWindows';

export const clearanceIntentionSchema = z.object({
  kind: z.enum(['control', 'into_play', 'touchline', 'goal_line']),
  target: physicalPointSchema,
});
export const defensiveConsequenceSchema = z.object({
  kind: z.enum(['control', 'into_play', 'touchline', 'goal_line', 'delay']),
  target: physicalPointSchema,
  opponentThreat: z.number().nonnegative(),
  possession: z.enum(['secure', 'second_ball', 'opponent_restart', 'opponent_live']),
  estimatedPhaseSeconds: z.number().nonnegative(),
  recoveryFraction: z.number().min(0).max(1),
});
export const strategicClearanceDecisionSchema = z.object({
  observedAt: z.number(),
  beforeThreat: z.number().nonnegative(),
  alternatives: z.array(defensiveConsequenceSchema).max(5),
  selected: defensiveConsequenceSchema,
});

/** All alternatives compare subsequent opponent threat in the same units. Territory,
 * possession, recovery and restart are causal conditions on threat, not additive rewards.
 * This is a prediction from one scene, not a forecast of the canonical outcome. */
export const evaluateStrategicClearance = (s: BoundedScene) => {
  if (!s.ball) return;
  const ball = s.ball.position;
  const friends = s.visible.filter((p) => p.team === s.team && !p.keeper);
  const foes = s.visible.filter((p) => p.team !== s.team && !p.keeper);
  const central = friends.filter(
    (p) => s.direction * (ball.x - p.position.x) > 0 && Math.abs(p.position.y - 34) < 14,
  );
  const threat = boundedPositionThreat(-s.direction, ball);
  const support = foes.filter((p) => distance(p.position, ball) < 12).length;
  const exposed = Math.min(1, (support + 1) / (central.length + support + 1));
  const beforeThreat = threat * exposed;
  const relativeSpeed = Math.hypot(
    s.ball.velocity.x - s.velocity.x,
    s.ball.velocity.y - s.velocity.y,
  );
  const skill = (s.attributes.firstTouch + s.attributes.technique + s.attributes.tackling) / 300;
  const control = Math.max(
    0,
    Math.min(1, (0.5 + skill * 0.5) / (1 + relativeSpeed / 4 + support * 0.25)),
  );
  const alternatives: z.infer<typeof defensiveConsequenceSchema>[] = [
    {
      kind: 'control',
      target: ball,
      opponentThreat: beforeThreat * (1 - control),
      possession: 'secure',
      estimatedPhaseSeconds: 0.25 + relativeSpeed / 10,
      recoveryFraction: 0,
    },
  ];
  const field = clampPitchPoint({
    x: ball.x + s.direction * 16,
    y: ball.y + (ball.y < 34 ? 8 : -8),
  });
  const ownArrival = Math.min(
    5,
    ...friends.map((p) => estimateUsefulContact(p, field).playableSeconds),
  );
  const foeArrival = Math.min(
    5,
    ...foes.map((p) => estimateUsefulContact(p, field).playableSeconds),
  );
  const secondBallLoss = Math.max(0, Math.min(1, 0.5 + (ownArrival - foeArrival) / 2));
  alternatives.push({
    kind: 'into_play',
    target: field,
    opponentThreat: boundedPositionThreat(-s.direction, field) * secondBallLoss,
    possession: 'second_ball',
    estimatedPhaseSeconds: distance(ball, field) / 10,
    recoveryFraction: 0,
  });
  const touch = {
    x: Math.max(0.2, Math.min(104.8, ball.x + s.direction * 4)),
    y: ball.y < 34 ? -1 : 69,
  };
  const goalLine = { x: s.direction === 1 ? -1 : 106, y: ball.y < 34 ? 8 : 60 };
  for (const [kind, target] of [
    ['touchline', touch],
    ['goal_line', goalLine],
  ] as const) {
    const spot = clampPitchPoint(target);
    const taker = Math.min(8, ...foes.map((p) => distance(p.position, spot) / 6));
    const phase = distance(ball, spot) / 10 + taker + 1.1;
    // Actual bodies still move in the restart lifecycle; this only estimates the
    // fraction of visible covering jobs reachable before a legal restart.
    const recovered = friends.filter((p) => {
      const anchor = {
        x: Math.max(1, Math.min(104, ball.x - s.direction * 6)),
        y: 34 + (p.position.y - 34) * 0.5,
      };
      return estimateUsefulContact(p, anchor).locationSeconds <= phase;
    }).length;
    const fraction = friends.length ? recovered / friends.length : 0;
    const costPoint =
      kind === 'goal_line' ? { x: s.direction === 1 ? 0 : 105, y: ball.y < 34 ? 0 : 68 } : spot;
    const threatAfter = boundedPositionThreat(-s.direction, costPoint) * (1 - fraction * 0.65);
    alternatives.push({
      kind,
      target,
      opponentThreat: threatAfter,
      possession: 'opponent_restart',
      estimatedPhaseSeconds: phase,
      recoveryFraction: fraction,
    });
  }
  alternatives.push({
    kind: 'delay',
    target: ball,
    opponentThreat: beforeThreat / (1 + central.length * 0.25),
    possession: 'opponent_live',
    estimatedPhaseSeconds: 0.5,
    recoveryFraction: 0,
  });
  const selected = [...alternatives].sort((a, b) => a.opponentThreat - b.opponentThreat)[0]!;
  return { observedAt: s.at, beforeThreat, alternatives, selected };
};
