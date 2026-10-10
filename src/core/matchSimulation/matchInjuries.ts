import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { createMatchFitness, recordPhysicalContactFitness } from './matchFitness';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export const matchInjurySchema = z.object({
  id: z.string(),
  playerId: z.string(),
  at: z.number().nonnegative(),
  status: z.enum(['discomfort', 'playable', 'unable', 'absence']),
  mechanism: z.enum(['movement', 'contact', 'tackle']),
  injuryType: z.enum(['muscle', 'impact', 'joint']),
  expiresAt: z.number().nonnegative().optional(),
  recoveryDays: z.number().int().nonnegative().max(28),
  assessmentRequired: z.boolean(),
});
export type MatchInjury = z.infer<typeof matchInjurySchema>;
export const canParticipatePhysically = (player: Pick<MatchPlayerState, 'injury'>) =>
  player.injury?.status !== 'unable' && player.injury?.status !== 'absence';

export const injuryRiskContextSchema = z.object({
  seed: z.string(),
  at: z.number().nonnegative(),
  mechanism: z.enum(['movement', 'contact', 'tackle']),
  exposure: z.number().nonnegative(),
  force: z.number().nonnegative().optional(),
});
export type InjuryRiskContext = z.infer<typeof injuryRiskContextSchema>;
/** A seeded hazard draw requires evidenced physical exposure. Fatigue alone is insufficient.
 * Separate episode seeds do not consume or perturb shot/pass execution RNG. */
export const rollContextualInjury = (
  player: MatchPlayerState,
  context: InjuryRiskContext,
): MatchInjury | undefined => {
  if (context.exposure <= 0 || !canParticipatePhysically(player)) return;
  const rng = RandomGenerator.fromSeed(context.seed);
  if (!rng.bool(1 - Math.exp(-context.exposure))) return;
  const severity = rng.float() + Math.min(0.08, (context.force ?? 0) * 0.005);
  const status: MatchInjury['status'] =
    severity < 0.67
      ? 'discomfort'
      : severity < 0.88
        ? 'playable'
        : severity < 0.975
          ? 'unable'
          : 'absence';
  // Do not replace an existing playable injury with a less serious discomfort episode.
  if (player.injury?.status === 'playable' && status === 'discomfort') return;
  return {
    id: `${context.seed}:injury`,
    playerId: player.id,
    at: context.at,
    status,
    mechanism: context.mechanism,
    injuryType:
      context.mechanism === 'movement' ? 'muscle' : (context.force ?? 0) > 5 ? 'joint' : 'impact',
    ...(status === 'discomfort' ? { expiresAt: context.at + rng.int(60, 240) } : {}),
    recoveryDays:
      status === 'discomfort'
        ? 0
        : status === 'playable'
          ? rng.int(1, 3)
          : status === 'unable'
            ? rng.int(2, 7)
            : rng.int(8, 28),
    assessmentRequired: status === 'unable' || status === 'absence',
  };
};

/** One-second movement assessment + exactly-once actual tackle/body-contact episodes. Fixed
 * accumulators and the final 32 events bound storage. The caller handles the legal injury
 * stoppage/removal before offering another action to a footballer unable to continue. */
export const advanceMatchInjuries = (
  previous: TacticalMatchState,
  input: TacticalMatchState,
): TacticalMatchState => {
  if (input.status === 'half_time' || input.status === 'full_time' || input.status === 'abandoned')
    return input;
  const assessMovement = Math.floor(input.time) > Math.floor(previous.time);
  const contact = input.lastChallenge;
  const newContact =
    contact && contact.id !== previous.lastChallenge?.id && contact.opponentContact;
  const injuries: MatchInjury[] = [];
  let changed = false;
  const players = input.players.map((original) => {
    let player = original;
    if (player.injury?.expiresAt !== undefined && input.time >= player.injury.expiresAt) {
      const { injury: _expired, ...recovered } = player;
      void _expired;
      player = recovered;
      changed = true;
    }
    if (!canParticipatePhysically(player) || input.discipline?.[player.id]?.sentOff) return player;
    let fitness = player.fitness;
    if (assessMovement && fitness) {
      const injury = rollContextualInjury(player, {
        seed: `${input.seed}:movement-injury:${player.id}:${Math.floor(input.time)}`,
        at: input.time,
        mechanism: 'movement',
        exposure: Math.max(0, fitness.movementRiskExposure - fitness.assessedRiskExposure),
      });
      fitness = { ...fitness, assessedRiskExposure: fitness.movementRiskExposure };
      player = { ...player, fitness, ...(injury ? { injury } : {}) };
      if (injury) injuries.push(injury);
      changed = true;
    }
    if (
      newContact &&
      (contact.actorId === player.id || contact.opponentId === player.id) &&
      fitness?.lastInjuryContactId !== contact.id
    ) {
      fitness ??= createMatchFitness();
      const depleted = 1 - fitness.burstReadiness / Math.max(0.05, fitness.longTermCapacity);
      const force = contact.force;
      const exposure =
        Math.max(0, force - 0.8) *
        0.00045 *
        (1 + depleted * 0.5 + (1 - fitness.longTermCapacity) * 0.35) *
        (contact.fromBehind ? 1.2 : 1);
      const injury = rollContextualInjury(player, {
        seed: `${contact.id}:physical-injury:${player.id}`,
        at: input.time,
        mechanism: 'tackle',
        exposure,
        force,
      });
      player = recordPhysicalContactFitness(
        {
          ...player,
          fitness: { ...fitness, lastInjuryContactId: contact.id },
          ...(injury ? { injury } : {}),
        },
        Math.min(1, force / 7),
        0.3,
      );
      if (injury) injuries.push(injury);
      changed = true;
    }
    return player;
  });
  if (!changed) return input;
  const assessment = injuries.find((injury) => injury.assessmentRequired);
  return {
    ...input,
    players,
    ...(injuries.length ? { injuries: [...(input.injuries ?? []), ...injuries].slice(-32) } : {}),
    ...(assessment && !input.pendingInjuryAssessment
      ? { pendingInjuryAssessment: assessment.id }
      : {}),
  };
};
