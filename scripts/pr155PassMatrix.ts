import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import {
  stepTacticalMatchAfterDecisionProbe,
  FIXED_MATCH_DT,
} from '../src/core/matchSimulation/matchSimulation';
import { incomingBallIntentKey } from '../src/core/matchSimulation/playerDecision';
import {
  createMatchStatistics,
  observePlayerMatchStats,
  assertMatchStatisticsInvariants,
} from '../src/core/matchSimulation/playerMatchStats';
import { distance } from '../src/core/matchSimulation/matchSpace';

const rowSchema = z.object({
  context: z.string(),
  passing: z.number(),
  source: z.enum(['human_selected', 'autonomous_npc']),
  attempts: z.number().int(),
  completed: z.number().int(),
  unresolved: z.number().int(),
  meanExecutionError: z.number(),
  meanQuality: z.number(),
  zeroPreparation: z.boolean(),
});
export const pr155PassMatrixSchema = z.object({
  repetitions: z.number().int().positive(),
  rows: z.array(rowSchema),
  physicalParityFailures: z.number().int(),
  errorMonotonicityFailures: z.array(z.string()),
});
export const runFirstTimePassMatrix = (input: TacticalMatchState, repetitions = 4) => {
  const rows: z.infer<typeof rowSchema>[] = [];
  let physicalParityFailures = 0;
  const ids = [
    input.players.find((p) => p.team === 'home' && p.slot.position === 'central_midfielder')!.id,
    input.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!.id,
    input.players.find((p) => p.team === 'away' && p.slot.position === 'center_back')!.id,
  ];
  for (const intent of ['support', 'progressive', 'direct', 'lead', 'through'] as const)
    for (const delivery of ['ground', 'lofted'] as const)
      for (const speed of [6, 20])
        for (const height of [0.11, 0.5])
          for (const pressureMetres of [2, 14])
            for (const angle of [Math.PI / 2, -Math.PI / 2]) {
              const context = `${intent}:${delivery}:speed-${speed}:height-${height}:pressure-${pressureMetres}:angle-${angle}`;
              for (const passing of [20, 60, 100]) {
                const pairRows = (['human_selected', 'autonomous_npc'] as const).map((source) => ({
                  context,
                  passing,
                  source,
                  attempts: repetitions,
                  completed: 0,
                  unresolved: 0,
                  meanExecutionError: 0,
                  meanQuality: 0,
                  zeroPreparation: true,
                }));
                for (let repetition = 0; repetition < repetitions; repetition++) {
                  let physical: string | undefined;
                  for (const row of pairRows) {
                    const state: TacticalMatchState = structuredClone(input);
                    state.seed = `pr155-first-time:${context}:${repetition}`;
                    state.time = 30;
                    state.actionCooldown = 0;
                    state.possessionTeam = 'home';
                    state.scenario = 'open_play';
                    delete state.restart;
                    delete state.planningSchedule;
                    delete state.onBallPreparation;
                    state.players.forEach((p) => {
                      p.position = { x: p.team === 'home' ? 5 : 100, y: 65 };
                      p.velocity = { x: 0, y: 0 };
                      for (const key of Object.keys(
                        p.profile.attributes,
                      ) as (keyof typeof p.profile.attributes)[])
                        p.profile.attributes[key] = 60;
                    });
                    const actor = state.players.find((p) => p.id === ids[0])!,
                      receiver = state.players.find((p) => p.id === ids[1])!,
                      defender = state.players.find((p) => p.id === ids[2])!;
                    actor.position = { x: 50, y: 34 };
                    actor.facingAngle = angle;
                    actor.profile.attributes.passing = passing;
                    receiver.position = { x: 64, y: 26 };
                    receiver.target = { x: 75, y: 26 };
                    receiver.velocity = {
                      x: intent === 'lead' || intent === 'through' ? 2 : 0,
                      y: 0,
                    };
                    receiver.facingAngle = -Math.PI / 2;
                    defender.position = { x: 50, y: 34 + pressureMetres };
                    const donor = state.players.find(
                      (p) => p.team === 'home' && !ids.includes(p.id),
                    )!;
                    state.currentActorId = donor.id;
                    state.ball = {
                      x: 49.7,
                      y: 34,
                      height,
                      airborne: height > 0.2,
                      from: { x: 40, y: 34 },
                      target: { x: 50, y: 34 },
                      velocity: { x: speed, y: 0, z: 0 },
                      travelKind: 'pass',
                      sourceAction: 'pass',
                      lastTouchPlayerId: donor.id,
                      intendedReceiverId: actor.id,
                    };
                    if (row.source === 'human_selected') state.controlledFootballerId = actor.id;
                    else delete state.controlledFootballerId;
                    state.statistics = createMatchStatistics(state);
                    let launched = resolveMatchAction(
                      state,
                      {
                        type: 'pass',
                        actorId: actor.id,
                        receiverId: receiver.id,
                        target: receiver.position,
                        intent,
                        delivery,
                        firstTime: true,
                      },
                      row.source,
                    );
                    if (launched === state) throw new Error(`Missing physical release ${context}`);
                    launched.statistics = observePlayerMatchStats(
                      state.statistics,
                      state,
                      launched,
                    );
                    const signature = JSON.stringify(launched.ball);
                    if (physical !== undefined && physical !== signature) physicalParityFailures++;
                    physical = signature;
                    const pass = launched.lastPassDiagnostic!;
                    row.zeroPreparation &&=
                      pass.releasedAt === state.time && pass.executionType === 'first_time';
                    row.meanExecutionError += distance(pass.intendedTarget!, pass.physicalTarget!);
                    row.meanQuality += pass.executionQuality!;
                    launched.actionCooldown = 1000;
                    launched.pendingReceptionIntent = {
                      actorId: receiver.id,
                      action: { type: 'hold', actorId: receiver.id },
                      actionSource: 'autonomous_npc',
                      createdAt: launched.time,
                      expiresAt: launched.time + 12,
                      ballEpisode: incomingBallIntentKey(launched),
                    };
                    const result = () =>
                      launched.lastResolvedPass?.passId === pass.passId
                        ? launched.lastResolvedPass
                        : launched.lastPassDiagnostic?.passId === pass.passId
                          ? launched.lastPassDiagnostic
                          : undefined;
                    for (let tick = 0; tick < 12 / FIXED_MATCH_DT && !result()?.finalResult; tick++)
                      launched = stepTacticalMatchAfterDecisionProbe(launched, FIXED_MATCH_DT);
                    row.completed += Number(result()?.finalResult === 'completed');
                    row.unresolved += Number(!result()?.finalResult);
                    assertMatchStatisticsInvariants(launched.statistics!, launched);
                  }
                }
                for (const row of pairRows) {
                  row.meanExecutionError /= repetitions;
                  row.meanQuality /= repetitions;
                  rows.push(row);
                }
              }
            }
  const failures: string[] = [];
  for (const context of new Set(rows.map((r) => r.context))) {
    const bands = rows.filter((r) => r.context === context && r.source === 'human_selected');
    if (
      bands.some((r, i) => i > 0 && r.meanExecutionError > bands[i - 1]!.meanExecutionError + 1e-9)
    )
      failures.push(context);
  }
  return pr155PassMatrixSchema.parse({
    repetitions,
    rows,
    physicalParityFailures,
    errorMonotonicityFailures: failures,
  });
};
