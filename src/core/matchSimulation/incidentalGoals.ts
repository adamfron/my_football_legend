import type { TacticalMatchState } from './matchState';
import { findFirstBallContact } from './ballFlight';
import { beginPostGoalReaction } from './postGoalReactions';
import { resolveRestartGoalOutcome } from './restartLaws';
import { resolveDroppedBallGoalOutcome } from './injuryStoppage';
import { awardNaturalRestart } from './restartScenarios';
import { findMatchParticipant } from './matchParticipants';

/** Opt-in non-shot adjudication after canonical CCD selected a boundary crossing.
 * The same whole-ball goal/frame geometry remains authoritative. No synthetic
 * shot or scoring probability is created, and legal direct-restart restrictions remain. */
export const finishIncidentalGoal = (
  state: TacticalMatchState,
  previous: { x: number; y: number; z?: number },
  segmentSeconds: number,
): TacticalMatchState | undefined => {
  if (
    !state.experimentalIncidentalGoals ||
    state.ball.shot ||
    state.ball.ownerId ||
    state.ball.travelKind ||
    state.ball.looseSince === undefined ||
    state.postGoal
  )
    return;
  const defendingTeam = state.ball.x < 52.5 !== Boolean(state.endsSwitched) ? 'home' : 'away';
  const scoringTeam = defendingTeam === 'home' ? 'away' : 'home';
  const contact = findFirstBallContact({
    previous: { ...previous, z: previous.z ?? state.ball.height ?? 0.11 },
    next: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 },
    attackingTeam: { team: scoringTeam, endsSwitched: state.endsSwitched },
  });
  if (contact?.kind !== 'goal_plane') return;
  const restriction = state.restartTouchRestriction;
  const dropped = resolveDroppedBallGoalOutcome(state, scoringTeam);
  const lawful =
    dropped !== 'goal'
      ? dropped
      : restriction
        ? resolveRestartGoalOutcome(
            restriction.scenario,
            restriction.team,
            scoringTeam,
            restriction.indirect,
            restriction.touchedByOther,
          )
        : 'goal';
  if (lawful !== 'goal')
    return awardNaturalRestart(state, lawful === 'corner' ? 'corner' : 'goal_kick', {
      restartTeam: lawful === 'corner' ? scoringTeam : defendingTeam,
      cause: 'boundary',
      incidentId: `${state.seed}:non-shot-disallowed:${state.time}`,
      incidentPoint: contact.point,
    });
  const last = state.ball.lastTouchPlayerId
    ? findMatchParticipant(state, state.ball.lastTouchPlayerId)
    : undefined;
  const at = Math.max(0, state.time - segmentSeconds + contact.segmentFraction * segmentSeconds);
  const id = `${state.seed}:incidental-goal:${state.ballEpisode ?? 0}:${at.toFixed(6)}:${defendingTeam}`;
  if (state.lastIncidentalGoal?.id === id) return state;
  const next: TacticalMatchState = {
    ...state,
    score: { ...state.score, [scoringTeam]: state.score[scoringTeam] + 1 },
    lastIncidentalGoal: {
      id,
      at,
      scoringTeam,
      lastTouchPlayerId: last?.id ?? null,
      creditedPlayerId: last?.team === scoringTeam ? last.id : null,
      ownGoalPlayerId: last?.team === defendingTeam ? last.id : null,
      point: contact.point,
      classification: 'goal_without_intentional_shot',
    },
    ball: {
      ...state.ball,
      x: contact.point.x,
      y: contact.point.y,
      height: contact.point.z,
      looseSince: state.time,
    },
    pendingKickoffTeam: defendingTeam,
  };
  if (state.lastPassDiagnostic && !state.lastPassDiagnostic.finalResult) {
    const resolved = {
      ...state.lastPassDiagnostic,
      resolvedAt: state.time,
      finalResult: 'out_of_play' as const,
    };
    next.lastPassDiagnostic = resolved;
    next.lastResolvedPass = resolved;
  }
  // Unknown scorer / own goal stays unassigned to an attacker. The ordinary
  // post-goal controller still chooses a real retriever and moves all bodies.
  return beginPostGoalReaction(
    next,
    scoringTeam,
    next.lastIncidentalGoal!.creditedPlayerId ?? '',
    id,
  );
};
