import { z } from 'zod';
import type { MatchAction, TacticalMatchState } from './matchState';
import type { TeamSide } from './matchSpace';
import type { PitchPoint } from './matchSpace';
import { awardNaturalRestart } from './restartScenarios';
import { restartLawContract } from './restartLaws';
import { isRestartSetup } from './restartPhase';

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
  else if (action.type === 'space_pass')
    relevantAttackerIds = state.players
      .filter((player) => player.team === state.possessionTeam && player.id !== action.actorId)
      .map((player) => player.id);
  else if (action.type === 'cross' || action.type === 'header')
    relevantAttackerIds = action.intendedTargetId ? [action.intendedTargetId] : [];
  else return;
  const passer = state.players.find((p) => p.id === action.actorId);
  if (!passer) return;
  const line = secondLastOpponentLine(state, passer.team);
  const offsideLineX =
    passer.team === 'home' ? Math.max(state.ball.x, line) : Math.min(state.ball.x, line);
  const exemptRestart = Boolean(isDirectOffsideExemptRestart(state));
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
  Boolean(snapshot && snapshot.offsidePlayerIds.includes(playerId));

/** Both goal-kick scenario variants represent the same direct-reception law exemption. */
export const isDirectOffsideExemptRestart = (state: TacticalMatchState) =>
  isRestartSetup(state) &&
  restartLawContract(state.scenario, state.restart?.indirect).offsideExempt;

/** A reachable aerial contest is active participation even when the offside attacker loses it. */
export const findOffsideContestant = (
  state: TacticalMatchState,
  contestantIds: readonly string[],
): string | undefined => {
  const snapshot = state.offsideSnapshot;
  if (
    !snapshot ||
    !contestantIds.some((id) =>
      state.players.some((player) => player.id === id && player.team !== snapshot.attackingTeam),
    )
  )
    return undefined;
  return contestantIds.find((id) => isOffsideOffence(snapshot, id));
};

/** Called only for meaningful ball competition/contact. Merely standing beyond the line is passive.
 * The recorded launch geometry survives a defender stepping or an attacker running back onside. */
export const awardOffsideRestart = (
  state: TacticalMatchState,
  playerId: string,
  point: PitchPoint,
  reason: 'attempted_receive' | 'challenged_opponent' | 'interfered' = 'attempted_receive',
): TacticalMatchState => {
  const snapshot = state.offsideSnapshot;
  if (!isOffsideOffence(snapshot, playerId) || !snapshot) return state;
  const restartTeam = snapshot.attackingTeam === 'home' ? 'away' : 'home';
  const cleaned = { ...state };
  delete cleaned.offsideSnapshot;
  delete cleaned.pendingReceptionIntent;
  delete cleaned.receptionPreparation;
  delete cleaned.playerMovementIntent;
  delete cleaned.ballCarrierIntent;
  delete cleaned.humanPossessionEpisode;
  delete cleaned.postActionAgencyCheckpoint;
  delete cleaned.onBallPreparation;
  if (cleaned.lastPassDiagnostic && !cleaned.lastPassDiagnostic.finalResult) {
    cleaned.lastPassDiagnostic = {
      ...cleaned.lastPassDiagnostic,
      actualContactPoint: { ...point },
      resolvedAt: state.time,
      finalResult: 'unclaimed',
    };
    cleaned.lastResolvedPass = cleaned.lastPassDiagnostic;
  }
  const next = awardNaturalRestart(cleaned, 'free_kick_far', {
    restartTeam,
    restartPoint: point,
    incidentPoint: point,
    incidentId: `${state.seed}:offside:${snapshot.releasedAt}:${playerId}:${state.time}`,
    eventAt: state.time,
    indirect: true,
    cause: 'offside',
    loserId: snapshot.passerId,
  });
  return {
    ...next,
    lastOffsideOffence: {
      playerId,
      at: state.time,
      reason,
      passerId: snapshot.passerId,
      releasedAt: snapshot.releasedAt,
      offsideLineX: snapshot.offsideLineX,
    },
  };
};

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
