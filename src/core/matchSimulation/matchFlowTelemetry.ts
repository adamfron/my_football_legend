import { z } from 'zod';
import { distance } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import type { TacticalMatchState } from './matchState';

const passEdgeSchema = z.object({
  passerId: z.string(),
  receiverId: z.string(),
  attempted: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});
export const matchFlowTelemetrySchema = z.object({
  canonicalMinutes: z.number().nonnegative(),
  goals: z.number().int().nonnegative(),
  shots: z.number().int().nonnegative(),
  shotsOnTarget: z.number().int().nonnegative(),
  shotsBlocked: z.number().int().nonnegative(),
  shotDistances: z.array(z.number().nonnegative()),
  longShots: z.number().int().nonnegative(),
  longShotGoals: z.number().int().nonnegative(),
  shootingOpportunityValues: z.array(z.number().min(0).max(1)),
  saves: z.number().int().nonnegative(),
  failedSaves: z.number().int().nonnegative(),
  possessionChanges: z.number().int().nonnegative(),
  passesAttempted: z.number().int().nonnegative(),
  passesCompleted: z.number().int().nonnegative(),
  throughBalls: z.number().int().nonnegative(),
  carries: z.number().int().nonnegative(),
  controlled: z.object({
    touches: z.number().int().nonnegative(),
    passesReceived: z.number().int().nonnegative(),
    passesAttempted: z.number().int().nonnegative(),
    shots: z.number().int().nonnegative(),
    carries: z.number().int().nonnegative(),
    decisionOpportunities: z.record(z.string(), z.number().int().nonnegative()),
    humanSelectedActions: z.number().int().nonnegative(),
    autonomousRoutineActions: z.number().int().nonnegative(),
    preventedByEscalation: z.number().int().nonnegative(),
  }),
  passingNetwork: z.array(passEdgeSchema),
});
export type MatchFlowTelemetry = z.infer<typeof matchFlowTelemetrySchema>;

export const createMatchFlowTelemetry = (): MatchFlowTelemetry =>
  matchFlowTelemetrySchema.parse({
    canonicalMinutes: 0,
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    shotsBlocked: 0,
    shotDistances: [],
    longShots: 0,
    longShotGoals: 0,
    shootingOpportunityValues: [],
    saves: 0,
    failedSaves: 0,
    possessionChanges: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    throughBalls: 0,
    carries: 0,
    controlled: {
      touches: 0,
      passesReceived: 0,
      passesAttempted: 0,
      shots: 0,
      carries: 0,
      decisionOpportunities: {},
      humanSelectedActions: 0,
      autonomousRoutineActions: 0,
      preventedByEscalation: 0,
    },
    passingNetwork: [],
  });

/** Observes two snapshots without consuming RNG or feeding statistics back into play. */
export const observeMatchFlow = (
  telemetry: MatchFlowTelemetry,
  previous: TacticalMatchState,
  next: TacticalMatchState,
): MatchFlowTelemetry => {
  const result = structuredClone(telemetry);
  result.canonicalMinutes = next.time / 60;
  if (previous.possessionTeam !== next.possessionTeam) result.possessionChanges++;
  const action = next.latestAction;
  const newAction =
    action && (previous.latestAction !== action || previous.decisionIndex !== next.decisionIndex);
  if (newAction && action.type === 'carry') {
    result.carries++;
    if (action.actorId === next.controlledFootballerId) result.controlled.carries++;
  }
  if (newAction && action.type === 'pass') {
    result.passesAttempted++;
    if (action.intent === 'through') result.throughBalls++;
    if (action.actorId === next.controlledFootballerId) result.controlled.passesAttempted++;
    const edge = result.passingNetwork.find(
      (item) => item.passerId === action.actorId && item.receiverId === action.receiverId,
    );
    if (edge) edge.attempted++;
    else
      result.passingNetwork.push({
        passerId: action.actorId,
        receiverId: action.receiverId,
        attempted: 1,
        completed: 0,
      });
  }
  const ownershipReceived =
    next.ball.ownerId !== previous.ball.ownerId ? next.ball.ownerId : undefined;
  if (ownershipReceived && ownershipReceived === next.controlledFootballerId)
    result.controlled.touches++;
  if (
    ownershipReceived &&
    previous.latestAction?.type === 'pass' &&
    previous.latestAction.receiverId === ownershipReceived
  ) {
    result.passesCompleted++;
    const edge = result.passingNetwork.find(
      (item) =>
        item.passerId === previous.latestAction!.actorId && item.receiverId === ownershipReceived,
    );
    if (edge) edge.completed++;
    if (ownershipReceived === next.controlledFootballerId) result.controlled.passesReceived++;
  }
  if (next.lastShot !== previous.lastShot && next.lastShot) {
    const shot = next.lastShot,
      shooter = next.players.find((player) => player.id === shot.shooterId);
    result.shots++;
    const metres = shooter
      ? distance(shooter.position, { x: shooter.team === 'home' ? 105 : 0, y: 34 })
      : 0;
    result.shotDistances.push(metres);
    if (metres >= 30) result.longShots++;
    if (shot.outcome === 'goal') {
      result.goals++;
      if (metres >= 30) result.longShotGoals++;
    }
    if (['goal', 'save', 'post', 'crossbar'].includes(shot.outcome)) result.shotsOnTarget++;
    if (shot.outcome === 'block') result.shotsBlocked++;
    if (shot.outcome === 'save') result.saves++;
    if (shot.goalkeeperAction === 'failed_save') result.failedSaves++;
    if (shooter)
      result.shootingOpportunityValues.push(evaluateShootingOpportunity(previous, shooter).value);
    if (shot.shooterId === next.controlledFootballerId) result.controlled.shots++;
  }
  return matchFlowTelemetrySchema.parse(result);
};

export const summarizeShotDistances = (telemetry: MatchFlowTelemetry) => {
  const sorted = [...telemetry.shotDistances].sort((a, b) => a - b),
    length = sorted.length;
  return {
    average: length ? sorted.reduce((sum, value) => sum + value, 0) / length : 0,
    median: length
      ? (sorted[Math.floor((length - 1) / 2)]! + sorted[Math.floor(length / 2)]!) / 2
      : 0,
  };
};
