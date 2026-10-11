import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import {
  chooseNpcRoutineAction,
  npcPossessionDecisionDelay,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan';
import { createMatchStatistics } from '../src/core/matchSimulation/playerMatchStats';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics';
import { estimatePlayerArrivalTime } from '../src/core/matchSimulation/playerArrival';
import { deriveOnBallPreparation } from '../src/core/matchSimulation/onBallPreparation';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
const world = createCanonicalWorldDatabase();
const initial = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'pr164-pass',
    control: { mode: 'spectator' },
  }),
);
const passerId = initial.players.find(
  (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
)!.id;
const receiverId = initial.players.find(
  (p) => p.team === 'home' && p.slot.position === 'striker',
)!.id;
const conditions = [
  {
    id: 'baseline',
    skill: 70,
    pressure: 0,
    orientation: 0,
    firstTime: false,
    phase: 'positional_attack',
    zone: 'middle',
  },
  { id: 'low-skill', skill: 40 },
  { id: 'high-skill', skill: 90 },
  { id: 'pressure', pressure: 0.65 },
  { id: 'turn', orientation: Math.PI },
  { id: 'first-time', firstTime: true },
  { id: 'transition', phase: 'attacking_transition' },
  { id: 'own-third', zone: 'own' },
  { id: 'final-third', zone: 'final' },
  { id: 'progressive', intent: 'progressive' as const },
  { id: 'direct', intent: 'direct' as const },
].map((c) => ({
  skill: 70,
  pressure: 0,
  orientation: 0,
  firstTime: false,
  phase: 'positional_attack' as const,
  zone: 'middle',
  intent: 'support' as 'support' | 'progressive' | 'direct',
  ...c,
}));
const rows: Record<string, unknown>[] = [];
for (const length of [5, 15, 25, 35, 45, 60])
  for (const delivery of ['ground', 'lofted'] as const)
    for (const condition of conditions.filter(
      (c) =>
        c.id === 'baseline' ||
        length === 25 ||
        ((c.id === 'progressive' || c.id === 'direct') && (length === 35 || length === 45)),
    ))
      for (let repetition = 0; repetition < 3; repetition++) {
        let state: TacticalMatchState = structuredClone(initial);
        delete state.restart;
        state.scenario = 'open_play';
        state.seed = `pr164-pass-${repetition}`;
        state.playerAgencyEnabled = false;
        state.time = 30;
        state.actionCooldown = 1000;
        state.teams.home.phase = condition.phase as TacticalMatchState['teams']['home']['phase'];
        for (const p of state.players) {
          p.position = { x: p.team === 'home' ? 5 : 100, y: 65 };
          p.target = { ...p.position };
          p.velocity = { x: 0, y: 0 };
        }
        const actor = state.players.find((p) => p.id === passerId)!,
          receiver = state.players.find((p) => p.id === receiverId)!;
        actor.position = {
          x: condition.zone === 'own' ? 12 : condition.zone === 'final' ? 70 : 30,
          y: 20,
        };
        actor.target = { ...actor.position };
        actor.facingAngle = Math.PI / 2;
        receiver.position = { x: actor.position.x + length, y: 20 };
        receiver.target = { ...receiver.position };
        receiver.facingAngle = -Math.PI / 2 + condition.orientation;
        for (const p of [actor, receiver])
          for (const key of [
            'passing',
            'technique',
            'firstTouch',
            'gameReading',
            'composure',
          ] as const)
            p.profile.attributes[key] = condition.skill;
        const defender = state.players.find(
          (p) => p.team === 'away' && p.slot.position === 'center_back',
        )!;
        defender.position = {
          x: actor.position.x,
          y: actor.position.y + (condition.pressure ? 2 : 25),
        };
        defender.target = { ...defender.position };
        state.ball = {
          ...actor.position,
          ownerId: actor.id,
          height: 0.11,
          lastTouchPlayerId: actor.id,
        };
        state.possessionTeam = 'home';
        state.currentPressure = condition.pressure;
        state.ballOwnershipStartedAt = 30;
        state.onBallPreparation = deriveOnBallPreparation(state, actor, 'clean_control');
        state.statistics = createMatchStatistics(state);
        const gainAt = state.time;
        if (!condition.firstTime)
          for (
            let tick = 0;
            tick < 100 &&
            state.time - (state.ballOwnershipStartedAt ?? state.time) <
              npcPossessionDecisionDelay(state, actor);
            tick++
          )
            state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        else {
          delete state.onBallPreparation;
          state.ball = {
            x: actor.position.x - 0.3,
            y: actor.position.y,
            height: 0.11,
            velocity: { x: 14, y: 0, z: 0 },
            from: { x: actor.position.x - 10, y: actor.position.y },
            target: actor.position,
            travelKind: 'pass',
            sourceAction: 'pass',
            lastTouchPlayerId: state.players[0]!.id,
            intendedReceiverId: actor.id,
          };
        }
        const currentActor = state.players.find((p) => p.id === actor.id)!,
          currentReceiver = state.players.find((p) => p.id === receiver.id)!;
        const prediction = derivePassLaunchPlan(
          state,
          currentActor,
          currentReceiver,
          currentReceiver.position,
          condition.intent,
          delivery,
        );
        const selectedAt = state.time,
          preparationReadyAt = state.onBallPreparation?.readyAt ?? null;
        state = resolveMatchAction(
          state,
          {
            type: 'pass',
            actorId: actor.id,
            receiverId: receiver.id,
            target: currentReceiver.position,
            intent: condition.intent,
            delivery,
            firstTime: condition.firstTime,
          },
          'autonomous_npc',
        );
        const pass = state.lastPassDiagnostic;
        if (!pass || pass.passerId !== actor.id) {
          rows.push({ length, delivery, ...condition, repetition, rejected: true });
          continue;
        }
        const forecast = projectFutureBallTrajectory(
          {
            position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 },
            velocity: {
              x: state.ball.velocity!.x,
              y: state.ball.velocity!.y,
              z: state.ball.velocity!.z ?? 0,
            },
            airborne: state.ball.airborne ?? false,
            bounceCount: 0,
          },
          Math.min(5, prediction.predictedArrivalTime + 1),
          0.1,
        );
        const possible =
          forecast.find(
            (s) =>
              s.ball.position.z <= 0.65 &&
              s.ball.position.x >= 0 &&
              s.ball.position.x <= 105 &&
              s.ball.position.y >= 0 &&
              s.ball.position.y <= 68 &&
              estimatePlayerArrivalTime(state, defender, s.ball.position, 'intercept')
                .estimatedTime <= s.at,
          )?.at ?? null;
        state.actionCooldown = 0;
        let contactAt: number | null = null,
          controlAt: number | null = null,
          nextConsideredAt: number | null = null,
          nextSelectedAt: number | null = null,
          nextReleaseAt: number | null = null,
          arrivalSpeed: number | null = null;
        let finalResult: string | null = null;
        for (let tick = 0; tick < 800 && nextReleaseAt === null; tick++) {
          const previous = state;
          state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
          const resolved =
            state.lastResolvedPass?.passId === pass.passId
              ? state.lastResolvedPass
              : state.lastPassDiagnostic?.passId === pass.passId
                ? state.lastPassDiagnostic
                : undefined;
          if (resolved?.finalResult) finalResult = resolved.finalResult;
          if (contactAt === null && resolved?.actualContactPoint) {
            contactAt = resolved.resolvedAt ?? state.time;
            arrivalSpeed = Math.hypot(
              previous.ball.velocity?.x ?? 0,
              previous.ball.velocity?.y ?? 0,
              previous.ball.velocity?.z ?? 0,
            );
          }
          if (controlAt === null && state.ball.ownerId === receiver.id) controlAt = state.time;
          if (
            controlAt !== null &&
            nextConsideredAt === null &&
            state.ball.ownerId === receiver.id &&
            chooseNpcRoutineAction(state, receiver.id)
          )
            nextConsideredAt = state.time;
          if (
            state.decisionIndex !== previous.decisionIndex &&
            state.latestAction?.actorId === receiver.id &&
            nextSelectedAt === null
          )
            nextSelectedAt = state.time;
          const event = state.actionEvents?.find(
            (e) =>
              e.sequence > (previous.actionEventSequence ?? 0) - 1 &&
              e.actorId === receiver.id &&
              ['pass', 'shot', 'cross', 'clearance'].includes(e.kind),
          );
          if (event) nextReleaseAt = event.at;
          if (finalResult && finalResult !== 'completed' && state.time - pass.releasedAt > 8) break;
        }
        rows.push({
          length,
          delivery,
          ...condition,
          repetition,
          rejected: false,
          decisionReadySeconds: selectedAt - gainAt,
          preparationReadyAt,
          initialPreparationSeconds:
            preparationReadyAt === null ? null : preparationReadyAt - gainAt,
          selectionToReleaseSeconds: pass.releasedAt - selectedAt,
          launchSpeed: prediction.speed,
          predictedFlightSeconds: prediction.predictedArrivalTime,
          predictedArrivalSpeed: prediction.predictedArrivalSpeed,
          earliestPossibleDefenderContactSeconds: possible,
          actualContactSeconds: contactAt === null ? null : contactAt - pass.releasedAt,
          actualArrivalSpeed: arrivalSpeed,
          controlSeconds: controlAt === null ? null : controlAt - pass.releasedAt,
          nextDecisionConsideredSeconds:
            nextConsideredAt === null ? null : nextConsideredAt - pass.releasedAt,
          nextSelectionSeconds: nextSelectedAt === null ? null : nextSelectedAt - pass.releasedAt,
          nextPhysicalReleaseSeconds:
            nextReleaseAt === null ? null : nextReleaseAt - pass.releasedAt,
          finalResult,
        });
      }
const distribution = (values: number[]) => {
  const a = values.sort((a, b) => a - b);
  return a.length
    ? {
        n: a.length,
        min: a[0],
        p10: a[Math.floor((a.length - 1) * 0.1)],
        median: a[Math.floor((a.length - 1) * 0.5)],
        p90: a[Math.floor((a.length - 1) * 0.9)],
        max: a.at(-1),
      }
    : null;
};
const grouped = [...new Set(rows.map((r) => `${r.length}:${r.delivery}:${r.id}`))].map((key) => {
  const selected = rows.filter((r) => `${r.length}:${r.delivery}:${r.id}` === key);
  return {
    key,
    attempts: selected.length,
    completed: selected.filter((r) => r.finalResult === 'completed').length,
    rejected: selected.filter((r) => r.rejected).length,
    metrics: Object.fromEntries(
      [
        'decisionReadySeconds',
        'launchSpeed',
        'predictedFlightSeconds',
        'actualContactSeconds',
        'actualArrivalSpeed',
        'controlSeconds',
        'nextDecisionConsideredSeconds',
        'nextPhysicalReleaseSeconds',
      ].map((metric) => [
        metric,
        distribution(
          selected.flatMap((r) => (typeof r[metric] === 'number' ? [r[metric] as number] : [])),
        ),
      ]),
    ),
  };
});
mkdirSync('docs/performance', { recursive: true });
writeFileSync(
  'docs/performance/PR164-passing.json',
  JSON.stringify(
    {
      seed: 'pr164-pass-0..2',
      method:
        'Matched support-pass fixture; one factor varied at 25m; progressive/direct intents also at 35/45m. No forced reception or next release. Initial choice issued at canonical routine readiness; first-time choice at a physical incoming contact. Null means censored/unavailable, not zero.',
      rows,
      grouped,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'passing receipt',
  rows.length,
  'attempts',
  rows.filter((r) => r.finalResult === 'completed').length,
  'completed',
);
