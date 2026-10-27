import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { physicalPointSchema, attacksRight, distance, type TeamSide } from './matchSpace';
import {
  sampleCanonicalOutcome,
  outcomeContactSchema,
  type OutcomeSample,
} from './canonicalOutcome';
import { normalizeAngle } from './playerOrientation';
import { releaseContactReadiness } from './decisionReadiness';
import { estimatePlayerArrivalTime } from './playerArrival';
import { boundedPositionThreat } from './opportunityWindows';

export const disruptionFrameSchema = z.object({
  at: z.number().nonnegative(),
  ball: physicalPointSchema,
  ownerId: z.string().nullable(),
  loose: z.boolean(),
  reachEstimates: z
    .array(
      z.object({
        team: z.enum(['home', 'away']),
        actorId: z.string(),
        seconds: z.number().nonnegative(),
      }),
    )
    .max(4),
  controllableActorId: z.string().nullable(),
  defenderDisplacement: z.number().nonnegative(),
  defenderReorientation: z.number().nonnegative(),
  defensiveLineSpread: z.number().nonnegative(),
  supportWithin15m: z.number().int().nonnegative(),
  ownCoverBehindBall: z.number().int().nonnegative(),
  ownCentralCover: z.number().int().nonnegative(),
  opponentPositionThreatProxy: z.number().nonnegative(),
  restart: z
    .object({ kind: z.string(), team: z.enum(['home', 'away']), spot: physicalPointSchema })
    .nullable(),
});
export type DisruptionFrame = z.infer<typeof disruptionFrameSchema>;
export const disruptionLedgerSchema = z.object({
  schema: z.literal('pr198-disruption-v1'),
  information: z.literal('privileged_research_observer'),
  startedAt: z.number(),
  firstIntendedContact: outcomeContactSchema.nullable(),
  firstUnexpectedContact: outcomeContactSchema.nullable(),
  physicalDeflections: z.number().int().nonnegative(),
  looseBallEpisodes: z.number().int().nonnegative(),
  goalkeeperCatches: z.number().int().nonnegative(),
  goalkeeperParries: z.number().int().nonnegative(),
  goalkeeperRebounds: z.number().int().nonnegative(),
  opponentShots: z.number().int().nonnegative(),
  restarts: z.record(z.string(), z.number().int().nonnegative()),
  lastControlledTeam: z.enum(['home', 'away']).nullable(),
  firstControllableAt: z.number().nullable(),
  firstControllableTeam: z.enum(['home', 'away']).nullable(),
  turnovers: z.array(
    z.object({
      at: z.number(),
      point: physicalPointSchema,
      threatProxy: z.number(),
      ownCover: z.number().int(),
    }),
  ),
  frames: z.array(disruptionFrameSchema),
});
export type DisruptionLedger = z.infer<typeof disruptionLedgerSchema>;
export const createDisruptionLedger = (initial: TacticalMatchState): DisruptionLedger => ({
  schema: 'pr198-disruption-v1',
  information: 'privileged_research_observer',
  startedAt: initial.time,
  firstIntendedContact: null,
  firstUnexpectedContact: null,
  physicalDeflections: 0,
  looseBallEpisodes: 0,
  goalkeeperCatches: 0,
  goalkeeperParries: 0,
  goalkeeperRebounds: 0,
  opponentShots: 0,
  restarts: {},
  lastControlledTeam: initial.players.find((p) => p.id === initial.ball.ownerId)?.team ?? null,
  firstControllableAt: null,
  firstControllableTeam: null,
  turnovers: [],
  frames: [],
});

/** Describes observed canonical states. Shape changes have no causal label or utility.
 * Reach ETAs use only the nearest two current bodies per team; they are engineering
 * positional estimates, not proof of a future contact or controllable second action. */
export const sampleDisruptionFrame = (
  initial: TacticalMatchState,
  state: TacticalMatchState,
  team: TeamSide,
  reach = true,
): DisruptionFrame => {
  const direction = attacksRight(team, state) ? 1 : -1;
  const opponents = state.players.filter(
    (p) => p.team !== team && p.slot.position !== 'goalkeeper',
  );
  const defenders = opponents.filter((p) => /back|defender/.test(p.slot.position));
  const own = state.players.filter((p) => p.team === team && p.slot.position !== 'goalkeeper');
  const loose = !state.ball.ownerId && !state.ball.travelKind && !state.restart && !state.postGoal;
  const cover = own.filter((p) => direction * (state.ball.x - p.position.x) > 0);
  const depths = defenders.map((p) => p.position.x),
    mean = depths.reduce((a, b) => a + b, 0) / Math.max(1, depths.length);
  const owner = state.players.find((p) => p.id === state.ball.ownerId);
  return {
    at: state.time,
    ball: { x: state.ball.x, y: state.ball.y },
    ownerId: state.ball.ownerId ?? null,
    loose,
    reachEstimates:
      loose && reach
        ? (['home', 'away'] as const).flatMap((side) =>
            state.players
              .filter((p) => p.team === side)
              .sort((a, b) => distance(a.position, state.ball) - distance(b.position, state.ball))
              .slice(0, 2)
              .map((p) => ({
                team: side,
                actorId: p.id,
                seconds: estimatePlayerArrivalTime(
                  state,
                  p,
                  {
                    x: Math.max(0, Math.min(105, state.ball.x)),
                    y: Math.max(0, Math.min(68, state.ball.y)),
                  },
                  'loose_ball',
                ).estimatedTime,
              })),
          )
        : [],
    controllableActorId: owner && releaseContactReadiness(state, owner).ready ? owner.id : null,
    defenderDisplacement:
      defenders.reduce(
        (n, p) =>
          n +
          distance(p.position, initial.players.find((q) => q.id === p.id)?.position ?? p.position),
        0,
      ) / Math.max(1, defenders.length),
    defenderReorientation:
      defenders.reduce(
        (n, p) =>
          n +
          Math.abs(
            normalizeAngle(
              p.facingAngle -
                (initial.players.find((q) => q.id === p.id)?.facingAngle ?? p.facingAngle),
            ),
          ),
        0,
      ) / Math.max(1, defenders.length),
    defensiveLineSpread: Math.sqrt(
      depths.reduce((n, x) => n + (x - mean) ** 2, 0) / Math.max(1, depths.length),
    ),
    supportWithin15m: own.filter((p) => distance(p.position, state.ball) <= 15).length,
    ownCoverBehindBall: cover.length,
    ownCentralCover: cover.filter((p) => Math.abs(p.position.y - 34) < 14).length,
    opponentPositionThreatProxy: boundedPositionThreat(-direction, state.ball),
    restart: state.restart
      ? {
          kind: state.scenario,
          team: state.restart.restartTeam,
          spot: state.restart.spot ?? { x: state.ball.x, y: state.ball.y },
        }
      : null,
  };
};

/** Mutates only the supplied research ledger. Never writes into either match state. */
export const observeDisruption = (
  ledger: DisruptionLedger,
  initial: TacticalMatchState,
  before: TacticalMatchState,
  after: TacticalMatchState,
  team: TeamSide,
  intendedReceiverId?: string,
  sampled?: OutcomeSample,
  retainFrame = true,
) => {
  const sample = sampled ?? sampleCanonicalOutcome(before, after, 'original-delivery-v3');
  for (const contact of sample.contacts) {
    if (contact.actorId === intendedReceiverId) ledger.firstIntendedContact ??= { ...contact };
    else ledger.firstUnexpectedContact ??= { ...contact };
    if (
      contact.disruption &&
      ['ground', 'flight'].includes(contact.source) &&
      contact.actorId !== before.ball.ownerId &&
      after.ball.ownerId !== contact.actorId &&
      !sample.releaseContact
    )
      ledger.physicalDeflections++;
  }
  const loose = !after.ball.ownerId && !after.ball.travelKind && !after.restart && !after.postGoal;
  const wasLoose =
    !before.ball.ownerId && !before.ball.travelKind && !before.restart && !before.postGoal;
  if (loose && !wasLoose) ledger.looseBallEpisodes++;
  const shot = after.lastShot;
  if (
    shot &&
    (shot.shotId !== before.lastShot?.shotId ||
      shot.goalkeeperAction !== before.lastShot?.goalkeeperAction)
  ) {
    if (shot.goalkeeperAction === 'catch') ledger.goalkeeperCatches++;
    if (shot.goalkeeperAction === 'parry' || shot.goalkeeperAction === 'parry_away')
      ledger.goalkeeperParries++;
    // The old optional reboundSource field is not populated by every live shot path.
    // Require the actual keeper contact and unowned outgoing physical ball instead.
    if (
      after.lastBallContact?.kind === 'goalkeeper' &&
      after.lastBallContact !== before.lastBallContact &&
      !after.ball.ownerId &&
      after.ball.velocity &&
      ['parry', 'parry_away'].includes(shot.goalkeeperAction ?? '')
    )
      ledger.goalkeeperRebounds++;
    if (
      shot.shotId !== before.lastShot?.shotId &&
      after.players.find((p) => p.id === shot.shooterId)?.team !== team
    )
      ledger.opponentShots++;
  }
  if (
    after.restart &&
    (!before.restart ||
      after.restart.startedAt !== before.restart.startedAt ||
      after.restart.awardId !== before.restart.awardId)
  )
    ledger.restarts[after.scenario] = (ledger.restarts[after.scenario] ?? 0) + 1;
  const afterTeam = after.players.find((p) => p.id === after.ball.ownerId)?.team;
  // Ownership commonly passes through a loose interval. Retain the previous team
  // until actual new ownership rather than losing every such turnover denominator.
  const turnover = ledger.lastControlledTeam === team && afterTeam && afterTeam !== team;
  if (afterTeam) ledger.lastControlledTeam = afterTeam;
  const owner = after.players.find((p) => p.id === after.ball.ownerId);
  if (owner && ledger.firstControllableAt === null && releaseContactReadiness(after, owner).ready) {
    ledger.firstControllableAt = after.time;
    ledger.firstControllableTeam = owner.team;
  }
  if (
    (retainFrame || turnover) &&
    (sample.contacts.length ||
      loose !== wasLoose ||
      turnover ||
      Math.round((after.time - ledger.startedAt) * 40) % 10 === 0)
  ) {
    const frame = sampleDisruptionFrame(initial, after, team, loose && !wasLoose);
    if (turnover)
      ledger.turnovers.push({
        at: after.time,
        point: frame.ball,
        threatProxy: frame.opponentPositionThreatProxy,
        ownCover: frame.ownCoverBehindBall,
      });
    if (retainFrame) ledger.frames.push(frame);
  }
};
