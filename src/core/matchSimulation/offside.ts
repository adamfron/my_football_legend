import { z } from 'zod';
import type { MatchAction, TacticalMatchState } from './matchState';
import type { TeamSide } from './matchSpace';

export const offsideSnapshotSchema = z.object({
  attackingTeam: z.enum(['home', 'away']),
  passerId: z.string(),
  relevantAttackerIds: z.array(z.string()),
  ballX: z.number(),
  secondLastOpponentX: z.number(),
  offsideLineX: z.number(),
  releasedAt: z.number(),
  attackerX: z.record(z.string(), z.number()),
  offsidePlayerIds: z.array(z.string()),
  exemptRestart: z.boolean(),
  opponentTouch: z.enum(['none', 'deliberate_play', 'save', 'deflection', 'rebound']),
});
export type OffsideSnapshot = z.infer<typeof offsideSnapshotSchema>;

export const secondLastOpponentLine = (state: TacticalMatchState, attackingTeam: TeamSide) => {
  const xs = state.players
    .filter((p) => p.team !== attackingTeam)
    .map((p) => p.position.x)
    .sort((a, b) => (attackingTeam === 'home' ? b - a : a - b));
  return xs[1] ?? xs[0] ?? (attackingTeam === 'home' ? 105 : 0);
};

export const captureOffsideSnapshot = (
  state: TacticalMatchState,
  action: MatchAction,
): OffsideSnapshot | undefined => {
  let relevantAttackerIds: string[];
  if (action.type === 'pass') relevantAttackerIds = [action.receiverId];
  else if (action.type === 'cross' || action.type === 'header')
    relevantAttackerIds = action.intendedTargetId ? [action.intendedTargetId] : [];
  else return;
  const passer = state.players.find((p) => p.id === action.actorId);
  if (!passer) return;
  const line = secondLastOpponentLine(state, passer.team);
  const offsideLineX =
    passer.team === 'home' ? Math.max(state.ball.x, line) : Math.min(state.ball.x, line);
  const exemptRestart =
    state.restart?.phase === 'setup' &&
    ['goal_kick', 'corner', 'throw_in'].includes(state.scenario);
  const attackerX = Object.fromEntries(
    state.players
      .filter((p) => p.team === passer.team && p.id !== passer.id)
      .map((p) => [p.id, p.position.x]),
  );
  const offsidePlayerIds = exemptRestart
    ? []
    : Object.entries(attackerX)
        .filter(([, x]) =>
          passer.team === 'home'
            ? x > offsideLineX + 0.01 && x > 52.5
            : x < offsideLineX - 0.01 && x < 52.5,
        )
        .map(([id]) => id);
  return {
    attackingTeam: passer.team,
    passerId: passer.id,
    relevantAttackerIds,
    ballX: state.ball.x,
    secondLastOpponentX: line,
    offsideLineX,
    releasedAt: state.time,
    attackerX,
    offsidePlayerIds,
    exemptRestart,
    opponentTouch: 'none',
  };
};

export const isOffsideOffence = (snapshot: OffsideSnapshot | undefined, playerId: string) =>
  Boolean(
    snapshot &&
      snapshot.relevantAttackerIds.includes(playerId) &&
      snapshot.offsidePlayerIds.includes(playerId),
  );

/** A controlled deliberate play starts a new phase; saves and accidental contacts preserve it. */
export const registerOpponentTouch = (
  snapshot: OffsideSnapshot | undefined,
  kind: OffsideSnapshot['opponentTouch'],
) =>
  kind === 'deliberate_play'
    ? undefined
    : snapshot
      ? { ...snapshot, opponentTouch: kind }
      : undefined;
