import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { estimatePlayerArrivalTime } from './playerArrival';

export const goalkeeperClaimSchema = z.object({
  primaryId: z.string(),
  coverId: z.string().optional(),
  target: pitchPointSchema,
  keeperEta: z.number().nonnegative(),
  defenderEta: z.number().nonnegative(),
  attackerEta: z.number().nonnegative(),
  ballEta: z.number().nonnegative(),
  meaningfulChoice: z.boolean(),
  reason: z.enum(['keeper_first', 'defender_first', 'no_threat', 'unreachable']),
});
export type GoalkeeperClaim = z.infer<typeof goalkeeperClaimSchema>;

/** One primary claimant, ordinary physical movement. A spare defender protects the goal/lane. */
export const arbitrateGoalkeeperClaim = (
  state: TacticalMatchState,
  keeper: MatchPlayerState,
  target: PitchPoint,
  ballEta = 0,
): GoalkeeperClaim => {
  const ownGoal = { x: keeper.team === 'home' ? 0 : 105, y: 34 };
  const defenders = state.players
    .filter((p) => p.team === keeper.team && p.id !== keeper.id)
    .map((p) => ({
      player: p,
      eta: estimatePlayerArrivalTime(state, p, target, 'intercept').estimatedTime,
    }))
    .sort((a, b) => a.eta - b.eta || a.player.id.localeCompare(b.player.id));
  const defender = defenders[0];
  const defenderEta = defender?.eta ?? 99;
  const attackerEta = Math.min(
    99,
    ...state.players
      .filter((p) => p.team !== keeper.team)
      .map((p) => estimatePlayerArrivalTime(state, p, target, 'intercept').estimatedTime),
  );
  const a = keeper.profile.attributes;
  const keeperEta =
    estimatePlayerArrivalTime(state, keeper, target, 'intercept').estimatedTime +
    Math.max(0.03, 0.3 - (a.goalkeeperSweeping * 0.65 + a.gameReading * 0.35) / 400);
  const zone = distance(target, ownGoal) < 28 && Math.abs(target.y - 34) < 24;
  const ballApproaching =
    !state.ball.travelKind ||
    (state.ball.velocity?.x ?? 0) * (keeper.team === 'home' ? -1 : 1) > 0.2;
  const reachable = ballEta === 0 || keeperEta <= ballEta + 0.35;
  const risk =
    Math.max(0, distance(target, ownGoal) - 14) * (1 - a.goalkeeperSweeping / 100) * 0.035;
  const keeperFirst = zone && ballApproaching && reachable && keeperEta + risk < defenderEta + 0.12;
  const credibleThreat =
    zone && ballApproaching && attackerEta <= Math.max(ballEta, defenderEta) + 0.75;
  return {
    primaryId: keeperFirst ? keeper.id : (defender?.player.id ?? keeper.id),
    coverId: keeperFirst ? defender?.player.id : keeper.id,
    target,
    keeperEta,
    defenderEta,
    attackerEta,
    ballEta,
    meaningfulChoice:
      credibleThreat &&
      reachable &&
      distance(keeper.position, target) > 2 &&
      Math.abs(keeperEta - defenderEta) > 0.15 &&
      (state.ball.ownerId ? keeperEta < defenderEta + 0.45 : keeperEta < attackerEta + 0.45),
    reason:
      !zone || !ballApproaching || !credibleThreat
        ? 'no_threat'
        : !reachable
          ? 'unreachable'
          : keeperFirst
            ? 'keeper_first'
            : 'defender_first',
  };
};
