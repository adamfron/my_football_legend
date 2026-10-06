import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import {
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { createMatchStatistics } from '../src/core/matchSimulation/playerMatchStats';
import { distance } from '../src/core/matchSimulation/matchSpace';

export const passFlightMatrixSchema = z.object({
  seed: z.string(),
  repetitions: z.number().int().min(16),
  rows: z.array(
    z.object({
      intent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']),
      pressureMetres: z.number(),
      length: z.number(),
      passing: z.number(),
      attempted: z.number().int(),
      completed: z.number().int(),
      intercepted: z.number().int(),
      receiverFailures: z.number().int(),
      outOfPlay: z.number().int(),
      unresolved: z.number().int(),
      meanExecutionError: z.number(),
    }),
  ),
});
export const passFlightMatrixConfigSchema = z.object({
  repetitions: z.number().int().min(16).max(256).default(16),
  intents: z
    .array(z.enum(['support', 'progressive', 'direct', 'lead', 'through']))
    .min(1)
    .default(['support', 'progressive', 'direct', 'lead', 'through']),
  pressureMetres: z.array(z.number().positive()).min(1).default([14, 6, 2]),
  lengths: z.array(z.number().positive()).min(1).default([8, 22, 40]),
  bands: z.array(z.number().min(1).max(100)).min(2).default([20, 40, 60, 80, 100]),
});

/** Full 25ms flight/contact runs. Only passer.passing changes; receiver, geometry and seeds
 * remain paired. This isolates execution from natural AI selection and reports failed cells. */
export const runPassFlightMatrix = (
  input: TacticalMatchState,
  rawConfig: z.input<typeof passFlightMatrixConfigSchema> = {},
) => {
  const config = passFlightMatrixConfigSchema.parse(rawConfig),
    repetitions = config.repetitions;
  const seed = 'pr154-paired-flight';
  const ids = [
    input.players.find((p) => p.team === 'home' && p.slot.position === 'central_midfielder')!,
    input.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!,
    input.players.find((p) => p.team === 'away' && p.slot.position === 'center_back')!,
    input.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper')!,
  ];
  const rows: z.infer<typeof passFlightMatrixSchema>['rows'] = [];
  for (const intent of config.intents)
    for (const pressureMetres of config.pressureMetres)
      for (const length of config.lengths)
        for (const passing of config.bands) {
          const row = {
            intent,
            pressureMetres,
            length,
            passing,
            attempted: repetitions,
            completed: 0,
            intercepted: 0,
            receiverFailures: 0,
            outOfPlay: 0,
            unresolved: 0,
            meanExecutionError: 0,
          };
          for (let repetition = 0; repetition < repetitions; repetition++) {
            const participants = [
              ...ids,
              ...input.players.filter((p) => !ids.some((a) => a.id === p.id)),
            ];
            const players = participants.map((p) => ({
              ...p,
              position: { x: p.team === 'home' ? 5 : 100, y: 65 },
              velocity: { x: 0, y: 0 },
              profile: { ...p.profile, attributes: { ...p.profile.attributes } },
            }));
            for (const p of players)
              for (const key of Object.keys(
                p.profile.attributes,
              ) as (keyof typeof p.profile.attributes)[])
                p.profile.attributes[key] = 60;
            const [passer, receiver, defender, keeper] = players;
            passer!.position = { x: 35, y: 34 };
            passer!.facingAngle = Math.PI / 2;
            passer!.profile.attributes.passing = passing;
            receiver!.position = { x: 35 + length, y: 34 };
            receiver!.facingAngle = -Math.PI / 2;
            if (intent === 'lead' || intent === 'through') receiver!.velocity = { x: 2, y: 0 };
            defender!.position = { x: 35, y: 34 + pressureMetres };
            keeper!.position = { x: 103, y: 34 };
            let state: TacticalMatchState = {
              ...input,
              seed: `${seed}:${intent}:${pressureMetres}:${length}:${repetition}`,
              time: 30,
              scenario: 'open_play',
              status: 'first_half',
              players,
              ball: { x: 35.4, y: 34, ownerId: passer!.id },
              possessionTeam: 'home',
              ballOwnershipStartedAt: 28,
              actionCooldown: 0,
              currentPressure: Math.max(0, 1 - pressureMetres / 14),
            };
            delete state.restart;
            delete state.planningSchedule;
            delete state.onBallPreparation;
            delete state.pendingPlayerDecision;
            delete state.defensiveChallenge;
            state.statistics = createMatchStatistics(state);
            state = resolveMatchAction(
              state,
              {
                type: 'pass',
                actorId: passer!.id,
                receiverId: receiver!.id,
                target: receiver!.position,
                intent,
              },
              'autonomous_npc',
            );
            state.actionCooldown = 1000;
            const launch = state.lastPassDiagnostic!;
            row.meanExecutionError += distance(launch.intendedTarget!, launch.physicalTarget!);
            for (
              let tick = 0;
              tick < 12 / FIXED_MATCH_DT && !state.lastPassDiagnostic?.finalResult;
              tick++
            )
              state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
            const outcome =
              state.lastResolvedPass?.passId === launch.passId
                ? state.lastResolvedPass
                : state.lastPassDiagnostic;
            row.completed += Number(outcome?.finalResult === 'completed');
            row.intercepted += Number(outcome?.finalResult === 'intercepted');
            row.receiverFailures += Number(
              ['failed_control', 'heavy_touch'].includes(outcome?.receptionOutcome ?? ''),
            );
            row.outOfPlay += Number(outcome?.finalResult === 'out_of_play');
            row.unresolved += Number(!outcome?.finalResult);
          }
          row.meanExecutionError /= repetitions;
          rows.push(row);
        }
  return passFlightMatrixSchema.parse({ seed, repetitions, rows });
};
