import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((s) => {
    const [k, ...v] = s.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [worldModule, sessions, engine, actions, stats, decisions] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/matchActions')>(
    'src/core/matchSimulation/matchActions.ts',
  ),
  load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
    'src/core/matchSimulation/playerMatchStats.ts',
  ),
  load<typeof import('../src/core/matchSimulation/playerDecision')>(
    'src/core/matchSimulation/playerDecision.ts',
  ),
]);
const config = z
  .object({
    repetitions: z.number().int().min(16).max(256),
    bands: z.array(z.number().min(0).max(100)),
    lengths: z.array(z.number().positive()),
  })
  .parse({
    repetitions: Number(args.get('repetitions') ?? 64),
    bands: (args.get('bands') ?? '5,10,20,40,60,80,100').split(',').map(Number),
    lengths: (args.get('lengths') ?? '5,12,22,35,50').split(',').map(Number),
  });
const input = engine.createTacticalMatch(
  sessions.createSingleMatchSession(worldModule.createCanonicalWorldDatabase(), {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'pr156-micro',
    control: { mode: 'spectator' },
  }),
);
const actorId = input.players.find(
  (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
)!.id;
const receiverId = input.players.find(
  (p) => p.team === 'home' && p.slot.position === 'striker',
)!.id;
const defenderId = input.players.find(
  (p) => p.team === 'away' && p.slot.position === 'center_back',
)!.id;
const contexts = [
  {
    id: 'feet-ground',
    intent: 'support',
    delivery: 'ground',
    angle: 0,
    motion: 0,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'progressive-ground',
    intent: 'progressive',
    delivery: 'ground',
    angle: 0.3,
    motion: 0,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'lead-ground',
    intent: 'lead',
    delivery: 'ground',
    angle: 0.3,
    motion: 3,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'through-ground',
    intent: 'through',
    delivery: 'ground',
    angle: 0.3,
    motion: 3,
    turn: 0,
    passerPressure: 6,
    receiverPressure: 5,
    firstTime: false,
  },
  {
    id: 'diagonal-switch',
    intent: 'direct',
    delivery: 'lofted',
    angle: 1.1,
    motion: 2,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'feet-lofted',
    intent: 'support',
    delivery: 'lofted',
    angle: 0,
    motion: 0,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'turning-pressured',
    intent: 'progressive',
    delivery: 'ground',
    angle: 0.3,
    motion: 0,
    turn: 2.4,
    passerPressure: 2,
    receiverPressure: 5,
    firstTime: false,
  },
  {
    id: 'first-time',
    intent: 'support',
    delivery: 'ground',
    angle: 0.3,
    motion: 0,
    turn: 1.2,
    passerPressure: 6,
    receiverPressure: 30,
    firstTime: true,
  },
  {
    id: 'passer-pressure-only',
    intent: 'support',
    delivery: 'ground',
    angle: 0,
    motion: 0,
    turn: 0,
    passerPressure: 2,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'receiver-pressure-only',
    intent: 'support',
    delivery: 'ground',
    angle: 0,
    motion: 0,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 2,
    firstTime: false,
  },
  {
    id: 'turn-only',
    intent: 'support',
    delivery: 'ground',
    angle: 0,
    motion: 0,
    turn: 2.4,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'lateral-ground',
    intent: 'direct',
    delivery: 'ground',
    angle: 1.1,
    motion: 0,
    turn: 0,
    passerPressure: 14,
    receiverPressure: 30,
    firstTime: false,
  },
  {
    id: 'first-time-fast',
    intent: 'support',
    delivery: 'ground',
    angle: 0.3,
    motion: 0,
    turn: 1.2,
    passerPressure: 6,
    receiverPressure: 30,
    firstTime: true,
  },
  {
    id: 'first-time-raised',
    intent: 'support',
    delivery: 'ground',
    angle: 0.3,
    motion: 0,
    turn: 1.2,
    passerPressure: 6,
    receiverPressure: 30,
    firstTime: true,
  },
] as const;
const pointDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const distributionSchema = z.object({
  mean: z.number().nonnegative(),
  p05: z.number().nonnegative(),
  p95: z.number().nonnegative(),
});
const count = z.number().int().nonnegative();
const passingCellSchema = z
  .object({
    context: z.object({
      id: z.string(),
      intent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']),
      delivery: z.enum(['ground', 'lofted']),
      angle: z.number().finite(),
      motion: z.number().nonnegative(),
      turn: z.number().finite(),
      passerPressure: z.number().nonnegative(),
      receiverPressure: z.number().nonnegative(),
      firstTime: z.boolean(),
    }),
    attribute: z.enum(['bundle', 'passing', 'technique', 'gameReading', 'composure']),
    length: z.number().positive(),
    ability: z.number().min(0).max(100),
    attempts: count,
    completed: count,
    intercepted: count,
    outOfPlay: count,
    unresolved: count,
    technicalErrors: count,
    inaccurate: count,
    unclaimed: count,
    securePossession: count,
    secureTeamPossession: count,
    unsecuredCompletion: count,
    possessionLoss: count,
    clean_control: count,
    directional_control: count,
    heavy_touch: count,
    failed_control: count,
    completionRate: z.number().min(0).max(1),
    securePossessionRate: z.number().min(0).max(1),
    executionErrorMetres: distributionSchema,
    angularErrorRadians: distributionSchema,
    travelSeconds: distributionSchema,
    requiredReceiverDisplacementMetres: distributionSchema,
    receiverAdjustmentMetres: distributionSchema,
    momentumRetention: distributionSchema,
    traces: z.array(z.unknown()).max(2).optional(),
  })
  .refine(
    (row) =>
      row.completed +
        row.intercepted +
        row.outOfPlay +
        row.unresolved +
        row.technicalErrors +
        row.inaccurate +
        row.unclaimed ===
        row.attempts &&
      row.securePossession <= row.completed &&
      row.securePossession + row.unsecuredCompletion === row.attempts,
    'Physical outcomes must account for every attempt',
  );
const rows: z.infer<typeof passingCellSchema>[] = [];
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const distribution = (a: number[]) => {
  const sorted = [...a].sort((a, b) => a - b);
  return {
    mean: mean(a),
    p05: sorted[Math.floor((a.length - 1) * 0.05)] ?? 0,
    p95: sorted[Math.floor((a.length - 1) * 0.95)] ?? 0,
  };
};
for (const context of contexts.filter((c, index) =>
  args.has('contexts') ? args.get('contexts')!.split(',').includes(c.id) : index < 8,
))
  for (const length of config.lengths)
    for (const ability of config.bands) {
      const errors: number[] = [],
        angular: number[] = [],
        travel: number[] = [],
        displacement: number[] = [],
        adjustment: number[] = [],
        momentum: number[] = [];
      const counts = {
        completed: 0,
        intercepted: 0,
        outOfPlay: 0,
        securePossession: 0,
        possessionLoss: 0,
        unresolved: 0,
        clean_control: 0,
        directional_control: 0,
        heavy_touch: 0,
        failed_control: 0,
        technicalErrors: 0,
        inaccurate: 0,
        unclaimed: 0,
        secureTeamPossession: 0,
        unsecuredCompletion: 0,
      };
      const traces: unknown[] = [];
      for (let sample = 0; sample < config.repetitions; sample++) {
        const state: TacticalMatchState = structuredClone(input);
        state.seed = `pr156-micro:${context.id}:${length}:${sample}`;
        state.time = 30;
        state.actionCooldown = 0;
        state.scenario = 'open_play';
        state.possessionTeam = 'home';
        state.playerAgencyEnabled = false;
        delete state.restart;
        delete state.planningSchedule;
        delete state.onBallPreparation;
        for (const p of state.players) {
          p.position = { x: p.team === 'home' ? 5 : 100, y: 65 };
          p.velocity = { x: 0, y: 0 };
          p.target = { ...p.position };
          for (const key of Object.keys(
            p.profile.attributes,
          ) as (keyof typeof p.profile.attributes)[])
            p.profile.attributes[key] = 60;
        }
        const actor = state.players.find((p) => p.id === actorId)!,
          receiver = state.players.find((p) => p.id === receiverId)!,
          defender = state.players.find((p) => p.id === defenderId)!;
        actor.position = { x: 30, y: 6 };
        actor.facingAngle = Math.PI / 2 - context.angle + context.turn;
        const attributes = args.get('attribute') ?? 'bundle';
        if (attributes === 'bundle')
          for (const key of ['passing', 'technique', 'gameReading', 'composure'] as const)
            actor.profile.attributes[key] = ability;
        else
          actor.profile.attributes[
            attributes as 'passing' | 'technique' | 'gameReading' | 'composure'
          ] = ability;
        receiver.position = {
          x: 30 + length * Math.cos(context.angle),
          y: 6 + length * Math.sin(context.angle),
        };
        receiver.target = { x: Math.min(100, receiver.position.x + 8), y: receiver.position.y };
        receiver.velocity = { x: context.motion, y: 0 };
        receiver.facingAngle = actor.facingAngle + Math.PI;
        defender.position =
          context.receiverPressure < 30
            ? { x: receiver.position.x + context.receiverPressure, y: receiver.position.y + 2 }
            : { x: actor.position.x, y: actor.position.y + context.passerPressure };
        // Separate pressure at release from pressure around the receiving pocket.
        const press = state.players.find(
          (p) => p.team === 'away' && p.id !== defenderId && p.slot.position !== 'goalkeeper',
        )!;
        press.position = { x: actor.position.x, y: actor.position.y + context.passerPressure };
        state.ball = {
          ...actor.position,
          ownerId: actor.id,
          height: 0.11,
          lastTouchPlayerId: actor.id,
        };
        state.ballOwnershipStartedAt = 28;
        state.currentPressure = Math.max(0, 1 - context.passerPressure / 14);
        if (context.firstTime) {
          const donor = state.players.find(
            (p) => p.team === 'home' && p.id !== actor.id && p.id !== receiver.id,
          )!;
          state.currentActorId = donor.id;
          state.ball = {
            x: actor.position.x - 0.3,
            y: actor.position.y,
            height: context.id === 'first-time-raised' ? 0.45 : 0.11,
            velocity: { x: context.id === 'first-time-fast' ? 26 : 14, y: 0, z: 0 },
            from: { x: 20, y: 6 },
            target: actor.position,
            travelKind: 'pass',
            sourceAction: 'pass',
            lastTouchPlayerId: donor.id,
            intendedReceiverId: actor.id,
          };
        }
        state.statistics = stats.createMatchStatistics(state);
        let live = actions.resolveMatchAction(
          state,
          {
            type: 'pass',
            actorId: actor.id,
            receiverId: receiver.id,
            target: receiver.position,
            intent: context.intent,
            delivery: context.delivery,
            firstTime: context.firstTime,
          },
          'autonomous_npc',
        );
        const pass = live.lastPassDiagnostic;
        if (!pass) throw new Error(`No pass ${context.id}`);
        errors.push(pointDistance(pass.intendedTarget!, pass.physicalTarget!));
        const origin = state.ball,
          intended = pass.intendedTarget!,
          physical = pass.physicalTarget!;
        angular.push(
          Math.abs(
            Math.atan2(
              Math.sin(
                Math.atan2(physical.y - origin.y, physical.x - origin.x) -
                  Math.atan2(intended.y - origin.y, intended.x - origin.x),
              ),
              Math.cos(
                Math.atan2(physical.y - origin.y, physical.x - origin.x) -
                  Math.atan2(intended.y - origin.y, intended.x - origin.x),
              ),
            ),
          ),
        );
        displacement.push(pointDistance(receiver.position, pass.predictedReceptionPoint));
        live.actionCooldown = 1000;
        live.pendingReceptionIntent = {
          actorId: receiver.id,
          action: { type: 'hold', actorId: receiver.id },
          actionSource: 'autonomous_npc',
          createdAt: live.time,
          expiresAt: live.time + 12,
          ballEpisode: decisions.incomingBallIntentKey(live),
        };
        const outcome = () =>
          live.lastResolvedPass?.passId === pass.passId
            ? live.lastResolvedPass
            : live.lastPassDiagnostic?.passId === pass.passId
              ? live.lastPassDiagnostic
              : undefined;
        const trajectory: unknown[] = [];
        for (let tick = 0; tick < 480 && !outcome()?.finalResult; tick++) {
          live = engine.stepTacticalMatchAfterDecisionProbe(live, 0.025);
          if (args.has('trace') && sample < 2 && tick % 4 === 0) {
            const receiverNow = live.players.find((p) => p.id === receiverId)!;
            trajectory.push({
              at: live.time,
              ball: live.ball,
              receiver: {
                position: receiverNow.position,
                velocity: receiverNow.velocity,
                target: receiverNow.target,
              },
              preparation: live.receptionPreparation,
              aerial: live.lastAerialContact,
              locks: live.aerialContactLocks,
            });
          }
        }
        const result = outcome();
        if (args.has('trace') && sample < 2) traces.push({ sample, pass, result, trajectory });
        counts.completed += Number(result?.finalResult === 'completed');
        counts.intercepted += Number(result?.finalResult === 'intercepted');
        counts.outOfPlay += Number(result?.finalResult === 'out_of_play');
        counts.unresolved += Number(!result?.finalResult);
        counts.technicalErrors += Number(result?.finalResult === 'technical_error');
        counts.inaccurate += Number(result?.finalResult === 'inaccurate');
        counts.unclaimed += Number(result?.finalResult === 'unclaimed');
        if (result?.receptionOutcome) counts[result.receptionOutcome]++;
        travel.push((result?.resolvedAt ?? live.time) - pass.releasedAt);
        if (result?.actualContactPoint)
          adjustment.push(pointDistance(result.actualContactPoint, pass.predictedReceptionPoint));
        if (live.lastReceptionOutcome?.receiverId === receiver.id)
          momentum.push(live.lastReceptionOutcome.momentumRetention ?? 0);
        // Secure retention includes the next second of real pressure/loose-ball resolution, with further deliberate actions disabled.
        for (let tick = 0; tick < 40; tick++)
          live = engine.stepTacticalMatchAfterDecisionProbe(live, 0.025);
        const retained =
          result?.finalResult === 'completed' &&
          live.possessionTeam === 'home' &&
          Boolean(live.ball.ownerId) &&
          live.scenario === 'open_play' &&
          !live.restart;
        counts.securePossession += Number(retained);
        counts.unsecuredCompletion += Number(!retained);
        counts.secureTeamPossession += Number(
          live.possessionTeam === 'home' &&
            Boolean(live.ball.ownerId) &&
            live.scenario === 'open_play' &&
            !live.restart,
        );
        counts.possessionLoss += Number(
          Object.values(live.statistics!.teamAccounting!.home.turnoverCauses!).some(
            (value) => value > 0,
          ),
        );
      }
      rows.push(
        passingCellSchema.parse({
          context,
          attribute: args.get('attribute') ?? 'bundle',
          length,
          ability,
          attempts: config.repetitions,
          ...counts,
          completionRate: counts.completed / config.repetitions,
          securePossessionRate: counts.securePossession / config.repetitions,
          executionErrorMetres: distribution(errors),
          angularErrorRadians: distribution(angular),
          travelSeconds: distribution(travel),
          requiredReceiverDisplacementMetres: distribution(displacement),
          receiverAdjustmentMetres: distribution(adjustment),
          momentumRetention: distribution(momentum),
          ...(args.has('trace') ? { traces } : {}),
        }),
      );
      process.stderr.write(
        `${context.id} ${length}m ability ${ability}: ${counts.completed}/${config.repetitions}, error ${mean(errors).toFixed(2)}m\n`,
      );
    }
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr156-passing.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      config,
      root,
      attribute: args.get('attribute') ?? 'bundle',
      definitions: {
        distanceBands:
          '<8 very short; 8–<18 short; 18–<30 medium; 30–<45 long; >=45 very long, in metres',
        securePossession:
          'completed pass retained by a secure home owner in open play one second after resolution; restart awards and recoveries of failed flights excluded; no further deliberate release',
        adjustment: 'actual contact minus desired meeting point; conditional on physical contact',
        possessionLoss:
          'at least one canonical home turnover event by the one-second follow-up; unsecuredCompletion is separately the complement of secure completed retention; secureTeamPossession also includes physical recoveries of failed flights',
        travel: 'release to resolution, including failed flights',
      },
      rows,
    },
    null,
    2,
  ) + '\n',
);
