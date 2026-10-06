import { z } from 'zod';
import type { PlayerAttributes } from '../../types/domain';
import type { TacticalMatchState, MatchPlayerState } from './matchState';
import { RandomGenerator } from '../random/RandomGenerator';
import { deriveMovementCapability } from './locomotion';
import { estimatePlayerArrivalTime } from './playerArrival';
import { resolveReceptionOutcome } from './passReception';
import { interpretPassExecution } from './passExecution';
import { resolveCanonicalShot } from './shotResolver';
import { resolveDefensiveChallenge } from './defensiveChallenges';
import { projectGoalkeeperIntervention, resolveGoalkeeperContact } from './goalkeeperIntervention';
import { arbitrateGoalkeeperClaim } from './goalkeeperClaim';
import { distance } from './matchSpace';

export const attributeMicroLabConfigSchema = z.object({
  seed: z.string().default('pr154-attribute-micro-lab'),
  repetitions: z.number().int().min(16).max(512).default(64),
  bands: z.array(z.number().min(1).max(100)).min(2).default([20, 40, 60, 80, 100]),
});
export const microDistributionSchema = z.object({
  samples: z.number().int().positive(),
  mean: z.number(),
  p05: z.number(),
  median: z.number(),
  p95: z.number(),
});
export const attributeMicroLabResultSchema = z.object({
  config: attributeMicroLabConfigSchema,
  rows: z.array(
    z.object({
      metric: z.string(),
      attribute: z.string(),
      band: z.number(),
      context: z.string(),
      better: z.enum(['higher', 'lower']),
      distribution: microDistributionSchema,
    }),
  ),
});
export type AttributeMicroLabResult = z.infer<typeof attributeMicroLabResultSchema>;
const distribution = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.floor((sorted.length - 1) * p)]!;
  return {
    samples: values.length,
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p05: at(0.05),
    median: at(0.5),
    p95: at(0.95),
  };
};
const neutral = (player: MatchPlayerState): MatchPlayerState => ({
  ...player,
  velocity: { x: 0, y: 0 },
  facingAngle: player.team === 'home' ? Math.PI / 2 : -Math.PI / 2,
  profile: {
    ...player.profile,
    attributes: Object.fromEntries(
      Object.keys(player.profile.attributes).map((key) => [key, 60]),
    ) as unknown as PlayerAttributes,
  },
});

/** Isolated canonical resolvers, paired seeds and identical geometry per attribute band.
 * Results distinguish execution error/quality/ETA from natural match completion percentages. */
export const runAttributeMicroLab = (
  input: TacticalMatchState,
  rawConfig: z.input<typeof attributeMicroLabConfigSchema> = {},
): AttributeMicroLabResult => {
  const config = attributeMicroLabConfigSchema.parse(rawConfig);
  const home = input.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  const away = input.players.find((p) => p.team === 'away' && p.slot.position === 'center_back')!;
  const goalkeeper = input.players.find(
    (p) => p.team === 'away' && p.slot.position === 'goalkeeper',
  )!;
  const receiver = input.players.find(
    (p) => p.team === 'home' && p.id !== home.id && p.slot.position !== 'goalkeeper',
  )!;
  const base: TacticalMatchState = {
    ...input,
    scenario: 'open_play',
    time: 30,
    actionCooldown: 0,
    players: [neutral(home), neutral(away), neutral(goalkeeper), neutral(receiver)],
    ball: { x: 60, y: 34, ownerId: home.id },
    currentPressure: 0.4,
  };
  delete base.restart;
  delete base.onBallPreparation;
  delete base.defensiveChallenge;
  const rows: AttributeMicroLabResult['rows'] = [];
  const measure = (
    metric: string,
    attribute: keyof PlayerAttributes,
    better: 'higher' | 'lower',
    context: string,
    run: (state: TacticalMatchState, band: number, rng: RandomGenerator) => number,
  ) => {
    for (const band of config.bands) {
      const values = Array.from({ length: config.repetitions }, (_, repetition) => {
        const seed = `${config.seed}:${metric}:${context}:${repetition}`;
        const state = {
          ...base,
          seed,
          players: base.players.map((p) => ({
            ...p,
            position: { ...p.position },
            profile: { ...p.profile, attributes: { ...p.profile.attributes } },
          })),
        };
        return run(state, band, RandomGenerator.fromSeed(seed));
      });
      rows.push({ metric, attribute, band, context, better, distribution: distribution(values) });
    }
  };
  for (const attribute of ['pace', 'agility'] as const)
    measure(
      attribute === 'pace' ? 'sprint_arrival_seconds' : 'acceleration_m_s2',
      attribute,
      attribute === 'pace' ? 'lower' : 'higher',
      'standing-start-40m',
      (s, band, rng) => {
        const p = s.players[0]!;
        p.position = { x: 30, y: 34 };
        p.profile.attributes[attribute] = band;
        p.velocity = { x: rng.float() * 0.4, y: 0 };
        return attribute === 'pace'
          ? estimatePlayerArrivalTime(s, p, { x: 70, y: 34 }, 'intercept').estimatedTime
          : deriveMovementCapability(p).acceleration;
      },
    );
  measure('reception_quality', 'firstTouch', 'higher', 'matched-speed-pressure', (s, band, rng) => {
    const p = s.players[0]!;
    p.position = { x: 60, y: 34 };
    p.profile.attributes.firstTouch = band;
    s.currentPressure = rng.float() * 0.8;
    s.ball = {
      x: 60,
      y: 34,
      velocity: { x: 5 + rng.float() * 20, y: 0, z: 0 },
      height: rng.float() * 0.5,
    };
    return resolveReceptionOutcome(s, p, p.position).quality!.score;
  });
  // Standardized intent x pressure x distance x one passer attribute matrices.
  for (const intent of ['support', 'progressive', 'direct', 'lead', 'through'] as const)
    for (const pressureMetres of [14, 6, 2])
      for (const metres of [8, 22, 40])
        for (const attribute of ['passing', 'technique', 'composure'] as const)
          measure(
            'pass_execution_error_metres',
            attribute,
            'lower',
            `${intent}:pressure-${pressureMetres}:length-${metres}`,
            (s, band) => {
              const p = s.players[0]!,
                foe = s.players[1]!;
              p.position = { x: 35, y: 34 };
              p.profile.attributes[attribute] = band;
              foe.position = { x: 35, y: 34 + pressureMetres };
              s.players[2]!.position = { x: 103, y: 34 };
              const execution = interpretPassExecution(
                s,
                p,
                { x: 35 + metres, y: 34 },
                intent,
                'ground',
              );
              return distance(execution.intendedTarget, execution.physicalTarget);
            },
          );
  for (const attribute of ['dribbling', 'tackling', 'positioning', 'gameReading'] as const)
    measure(
      'duel_clean_win',
      attribute,
      attribute === 'dribbling' ? 'lower' : 'higher',
      'same-standing-contact',
      (s, band, rng) => {
        const carrier = s.players[0]!,
          defender = s.players[1]!;
        carrier.position = { x: 60, y: 34 };
        defender.position = { x: 60.6, y: 34 };
        defender.facingAngle = -Math.PI / 2;
        (attribute === 'dribbling' ? carrier : defender).profile.attributes[attribute] = band;
        s.ball = { x: 60.2, y: 34, ownerId: carrier.id };
        s.defensiveChallenge = {
          id: `${s.seed}:duel`,
          actorId: defender.id,
          opponentId: carrier.id,
          technique: 'standing',
          source: 'dev_ai_selected',
          startedAt: s.time - 0.2,
          expiresAt: s.time + 0.5,
          target: { x: 60.2, y: 34 },
        };
        carrier.velocity = { x: rng.float(), y: 0 };
        return resolveDefensiveChallenge(s).diagnostic?.outcome === 'clean_win' ? 1 : 0;
      },
    );
  measure('finishing_target_error', 'finishing', 'lower', '18m-placed', (s, band) => {
    const p = s.players[0]!;
    p.position = { x: 87, y: 34 };
    p.profile.attributes.finishing = band;
    s.ball = { x: 87, y: 34, ownerId: p.id };
    const shot = resolveCanonicalShot(s, {
      type: 'shot',
      actorId: p.id,
      target: { x: 105, y: 34 },
      intent: 'placed',
    });
    return Math.hypot(shot.error.horizontal, shot.error.vertical);
  });
  for (const attribute of ['reflexes', 'handling', 'oneOnOnes'] as const)
    measure(
      attribute === 'handling' ? 'keeper_catch' : 'keeper_available_reach',
      attribute,
      'higher',
      '12m-breakaway-flight',
      (s, band, rng) => {
        const p = s.players[0]!,
          keeper = s.players[2]!;
        p.position = { x: 93, y: 34 };
        keeper.position = { x: 103, y: 34 };
        keeper.profile.attributes[attribute] = band;
        const shot = resolveCanonicalShot(s, {
          type: 'shot',
          actorId: p.id,
          target: { x: 105, y: 34 },
          intent: 'placed',
          goalTarget: { horizontal: (rng.float() - 0.5) * 1.1, vertical: 0.35 },
        });
        s.ball = {
          x: 93,
          y: 34,
          height: 0.11,
          shot,
          velocity: shot.launchVelocity,
          airborne: true,
          flightTime: 0,
        };
        const projection = projectGoalkeeperIntervention(s);
        if (!projection) return 0;
        return attribute === 'handling'
          ? resolveGoalkeeperContact(s, projection, shot.speed) === 'catch'
            ? 1
            : 0
          : projection.availableReach;
      },
    );
  measure('keeper_sweep_eta', 'goalkeeperSweeping', 'lower', 'loose-ball-claim', (s, band) => {
    const keeper = s.players[2]!;
    keeper.position = { x: 102, y: 34 };
    keeper.profile.attributes.goalkeeperSweeping = band;
    s.ball = { x: 94, y: 34, looseSince: s.time };
    return arbitrateGoalkeeperClaim(s, keeper, { x: 94, y: 34 }).keeperEta;
  });
  measure('keeper_distribution_error', 'goalkeeperKicking', 'lower', '45m-goal-kick', (s, band) => {
    const keeper = s.players[2]!;
    keeper.position = { x: 99, y: 34 };
    keeper.profile.attributes.goalkeeperKicking = band;
    s.scenario = 'goal_kick';
    s.restart = {
      restartTeam: 'away',
      takerId: keeper.id,
      phase: 'setup',
      startedAt: s.time,
      targets: {},
      executionChoices: ['long_delivery'],
      roles: {},
    };
    const execution = interpretPassExecution(s, keeper, { x: 54, y: 34 }, 'direct', 'lofted');
    return distance(execution.intendedTarget, execution.physicalTarget);
  });
  // The same error profile feeds xG diagnostics and actual target-plane execution.
  return attributeMicroLabResultSchema.parse({ config, rows });
};
