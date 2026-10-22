import { z } from 'zod';
import { physicalPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

export const movementProposalSchema = z.object({
  authority: z.enum([
    'shape',
    'press',
    'coordination',
    'reception',
    'keeper',
    'commitment',
    'human',
    'restart',
  ]),
  target: physicalPointSchema,
  validUntil: z.number().finite(),
  episode: z.number().int().nonnegative(),
});
export type MovementProposal = z.infer<typeof movementProposalSchema>;
const priority: Record<MovementProposal['authority'], number> = {
  shape: 10,
  press: 30,
  coordination: 40,
  reception: 60,
  keeper: 70,
  commitment: 80,
  human: 90,
  restart: 100,
};
export const selectMovementProposal = (
  proposals: readonly MovementProposal[],
  time: number,
  episode: number,
) =>
  proposals
    .filter((p) => p.validUntil >= time && p.episode === episode)
    .sort((a, b) => priority[b.authority] - priority[a.authority])[0];

/** One target enters locomotion. Authority replaces destinations, never position or momentum. */
export const authoritativeMovementTarget = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  fallback: PitchPoint,
): PitchPoint => {
  const span = startPerformanceSpan('movement_authority');
  const episode = state.ballEpisode ?? 0;
  const proposals: MovementProposal[] = [
    { authority: 'shape', target: fallback, validUntil: state.time + 0.1, episode },
  ];
  const add = (
    authority: MovementProposal['authority'],
    target: PitchPoint,
    validUntil = state.time + 0.1,
  ) => proposals.push({ authority, target, validUntil, episode });
  const combination = state.combinationIntent;
  if (
    combination?.runnerId === player.id &&
    combination.team === state.possessionTeam &&
    combination.phase !== 'continuation_flight'
  )
    add('coordination', combination.target, combination.expiresAt);
  const reception = state.receptionPreparation;
  if (
    reception?.actorId === player.id &&
    state.time >= reception.awarenessAt &&
    !state.ball.ownerId
  )
    add('reception', player.target, reception.expectedArrivalTime + 1);
  const keeper = state.keeperIntervention;
  if (keeper?.keeperId === player.id && keeper.intention !== 'stay') add('keeper', keeper.target);
  const challenge = state.defensiveChallenge;
  if (challenge?.actorId === player.id) add('commitment', challenge.target);
  const carry = state.ballCarrierIntent;
  if (
    carry?.actorId === player.id &&
    (state.ball.ownerId === player.id || (!state.ball.ownerId && carry.pursuingBall))
  )
    add(
      carry.humanSelected ? 'human' : 'commitment',
      carry.localTarget ?? carry.target,
      carry.expiresAt,
    );
  const human = state.playerMovementIntent;
  if (human?.actorId === player.id) add('human', human.target, human.expiresAt);
  const restart = state.restart;
  // The restart lifecycle already owns retrieval, transport, placement and legal setup. Its
  // current target may be outside the pitch while retrieving a ball; static setup coordinates
  // must never replace that physical route.
  if (restart && restart.phase !== 'release') add('restart', fallback);
  const result = selectMovementProposal(proposals, state.time, episode)?.target ?? player.position;
  endPerformanceSpan('movement_authority', span);
  return result;
};
