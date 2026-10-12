import { z } from 'zod';
import { createFormationBenchmarkSession } from '../src/core/matchSimulation/benchmarkFixtures';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import {
  evaluatePressure,
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions';
import { deriveOnBallPreparation } from '../src/core/matchSimulation/onBallPreparation';
import { createMatchStatistics } from '../src/core/matchSimulation/playerMatchStats';
import {
  classifyPass,
  passClassificationSchema,
} from '../src/core/matchSimulation/passClassification';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';
import { deriveTacticalTargets } from '../src/core/matchSimulation/tacticalPositioning';
import { advanceMatchFitness } from '../src/core/matchSimulation/matchFitness';
import { deriveMovementCapability } from '../src/core/matchSimulation/locomotion';
import {
  angleForVector,
  integrateFacing,
  normalizeAngle,
} from '../src/core/matchSimulation/playerOrientation';
import {
  clampPitchPoint,
  distance,
  distanceToSegment,
  pitchPointSchema,
  physicalPointSchema,
} from '../src/core/matchSimulation/matchSpace';
import type {
  MatchAction,
  MatchPlayerState,
  TacticalMatchState,
} from '../src/core/matchSimulation/matchState';

const finite = z.number().finite();
const count = z.number().int().nonnegative();
export const passOutletSchema = z.enum([
  'central_short',
  'lateral_switch',
  'behind_defence',
  'shielding_striker',
  'fast_winger',
]);
export const passConditionSchema = z.enum([
  'baseline',
  'low_passer',
  'elite_passer',
  'low_midfield',
  'elite_midfield',
  'shorter',
  'longer',
  'ground',
  'lofted',
  'covered_lane',
  'stationary',
  'pressure',
  'possession',
  'direct',
  'no_second_ball',
  'blocked_build_up',
]);
export type PassOutlet = z.infer<typeof passOutletSchema>;
export type PassCondition = z.infer<typeof passConditionSchema>;

export const physicalProbeSchema = z.object({
  released: z.boolean(),
  releaseAt: finite.nullable(),
  predictedCompletionAtRelease: finite.nullable(),
  predictedRetentionAtRelease: finite.nullable(),
  predictedProgressionMetres: finite.nullable(),
  actualFlightSeconds: finite.nullable(),
  maxHeightMetres: finite,
  flightSamples: z.array(z.object({ at: finite, x: finite, y: finite, z: finite })).max(6),
  result: z.string().nullable(),
  receptionOutcome: z.string().nullable(),
  actualReceiverId: z.string().nullable(),
  actualContact: physicalPointSchema.nullable(),
  actualProgressionMetres: finite.nullable(),
  intendedReceiverControlled: z.boolean(),
  intendedReceiverContact: z.boolean(),
  defensiveInterception: z.boolean(),
  continuationAction: z.string().nullable(),
  retainedTwoSecondsAfterCompletion: z.boolean().nullable(),
  possessionLost: z.boolean(),
  censored: z.boolean(),
  interceptions: count,
  fouls: count,
});
export const passLabRowSchema = z.object({
  seed: z.string(),
  condition: passConditionSchema,
  outlet: passOutletSchema,
  generated: z.boolean(),
  rank: count.nullable(),
  score: finite.nullable(),
  topChoice: z.string(),
  lengthMetres: finite.nullable(),
  delivery: z.string().nullable(),
  intent: z.string().nullable(),
  classification: passClassificationSchema.nullable(),
  pressure: finite,
  secondBallSupportCount: count.nullable(),
  availability: z.enum(['not_offered', 'offered_first', 'offered_not_first']),
  predictedCompletion: finite.nullable(),
  predictedRetention: finite.nullable(),
  predictedFutureProgressionMetres: finite.nullable(),
  physical: physicalProbeSchema.nullable(),
});

const player = (state: TacticalMatchState, team: 'home' | 'away', role: string, index = 0) =>
  state.players.filter((p) => p.team === team && p.slot.position === role)[index]!;
const place = (p: MatchPlayerState, x: number, y: number) => {
  p.position = { x, y };
  p.target = { x, y };
  p.velocity = { x: 0, y: 0 };
};
const setAbility = (p: MatchPlayerState, value: number) => {
  for (const key of ['passing', 'technique', 'firstTouch', 'gameReading', 'composure'] as const)
    p.profile.attributes[key] = value;
};
const readyPossession = (state: TacticalMatchState, actor: MatchPlayerState) => {
  state.ball = { ...actor.position, ownerId: actor.id, height: 0.11, lastTouchPlayerId: actor.id };
  state.possessionTeam = actor.team;
  state.ballOwnershipStartedAt = state.time - 3;
  state.currentPressure = evaluatePressure(state, actor).value;
  state.onBallPreparation = deriveOnBallPreparation(
    { ...state, time: state.time - 3 },
    actor,
    'clean_control',
  );
  state.statistics = createMatchStatistics(state);
};

/** All five alternatives coexist. Each condition changes one factor from the shared geometry;
 * blocked_build_up is the explicitly combined adaptation scenario, not a calibration sample. */
export const createPassLabFixture = (condition: PassCondition, seed: string) => {
  const state = createTacticalMatch(
    createFormationBenchmarkSession({ anchor: '4-3-3', opponent: '4-4-2', attributes: 70, seed }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 20;
  state.actionCooldown = 0;
  state.playerAgencyEnabled = false;
  state.timeSincePossessionChanged = 8;
  state.teams.home.phase = 'positional_attack';
  state.teams.away.phase = 'defensive_block';
  for (const p of state.players) {
    place(
      p,
      p.team === 'home' ? 8 + (p.slotIndex % 3) * 4 : 78 + (p.slotIndex % 3) * 4,
      4 + p.slotIndex * 5.5,
    );
    p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
    if (p.slot.position === 'goalkeeper') place(p, p.team === 'home' ? 3 : 102, 34);
  }
  const actor = player(state, 'home', 'center_back');
  place(actor, 20, 20);
  setAbility(actor, 80);
  const midfield = player(state, 'home', 'central_midfielder', 1);
  place(midfield, 32, 26);
  setAbility(midfield, 91);
  const lateral = player(state, 'home', 'right_back');
  place(lateral, 20, 59);
  const behind = player(state, 'home', 'right_winger');
  place(behind, 60, 44);
  behind.velocity = { x: 4, y: 0 };
  const striker = player(state, 'home', 'striker');
  place(striker, 57, 35);
  striker.profile.attributes.strength = 95;
  const winger = player(state, 'home', 'left_winger');
  place(winger, 56, 7);
  winger.velocity = { x: 5, y: 0 };
  winger.profile.attributes.pace = 95;
  const support = player(state, 'home', 'central_midfielder', 2);
  place(support, 49, 34);
  const pivot = player(state, 'home', 'central_midfielder');
  place(pivot, 25, 39);
  const fullback = player(state, 'away', 'right_back');
  place(fullback, 59, 16);
  const marker = player(state, 'away', 'center_back');
  place(marker, 60, 38);
  const line = player(state, 'away', 'center_back', 1);
  place(line, 63, 51);
  const pressure = player(state, 'away', 'striker');
  place(pressure, 20, 42);
  const lane = player(state, 'away', 'central_midfielder');
  place(lane, 48, 54);
  if (condition === 'low_passer') setAbility(actor, 40);
  if (condition === 'elite_passer') setAbility(actor, 97);
  if (condition === 'low_midfield') setAbility(midfield, 40);
  if (condition === 'elite_midfield') setAbility(midfield, 97);
  if (condition === 'shorter' || condition === 'longer') {
    const scale = condition === 'shorter' ? 0.8 : 1.15;
    for (const p of [midfield, lateral, behind, striker, winger]) {
      const velocity = p.velocity;
      place(
        p,
        actor.position.x + (p.position.x - actor.position.x) * scale,
        actor.position.y + (p.position.y - actor.position.y) * scale,
      );
      p.velocity = velocity;
    }
  }
  if (condition === 'stationary') for (const p of [behind, winger]) p.velocity = { x: 0, y: 0 };
  if (condition === 'covered_lane' || condition === 'blocked_build_up') {
    place(lane, 26, 23);
    place(player(state, 'away', 'central_midfielder', 1), 24, 34);
    if (condition === 'blocked_build_up') {
      place(player(state, 'away', 'striker', 1), 13, 19);
      place(player(state, 'away', 'left_winger'), 13, 30);
      place(player(state, 'away', 'right_winger'), 18, 47);
      place(fullback, 42, 14);
      place(marker, 62, 38);
    }
  }
  if (condition === 'pressure' || condition === 'blocked_build_up') place(pressure, 21.8, 20.5);
  if (condition === 'no_second_ball') place(support, 8, 34);
  const style =
    condition === 'possession' ? 'possession' : condition === 'direct' ? 'direct' : 'balanced';
  state.teams.home.style = style;
  state.teams.home.tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS[style] };
  readyPossession(state, actor);
  return {
    state,
    actorId: actor.id,
    outlets: {
      central_short: midfield.id,
      lateral_switch: lateral.id,
      behind_defence: behind.id,
      shielding_striker: striker.id,
      fast_winger: winger.id,
    },
  };
};

/** Executes an offered option as a counterfactual physical probe. The ranking remains a separate
 * observation: these forced selections are NOT presented as autonomous AI choices. */
export const probePass = (
  initial: TacticalMatchState,
  action: Extract<MatchAction, { type: 'pass' }>,
  seconds = 12,
) => {
  let state = resolveMatchAction(structuredClone(initial), action, 'autonomous_npc');
  const pass = state.lastPassDiagnostic;
  const released = Boolean(
    pass && pass.passerId === action.actorId && pass.releasedAt >= initial.time,
  );
  let resolved: TacticalMatchState['lastPassDiagnostic'];
  const samples: { at: number; x: number; y: number; z: number }[] = [];
  let maxHeight = 0,
    contactAt: number | null = null,
    lost = false,
    controlled = false;
  let continuation: string | null = null,
    retained: boolean | null = null,
    contactOwner: string | undefined;
  if (released) {
    state.actionCooldown = 0;
    for (let tick = 0; tick < seconds / FIXED_MATCH_DT; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      if (state.ball.travelKind && state.ball.lastTouchPlayerId === action.actorId) {
        maxHeight = Math.max(maxHeight, state.ball.height ?? 0);
        if (samples.length < 6 && tick % 40 === 0)
          samples.push({
            at: state.time - pass!.releasedAt,
            x: state.ball.x,
            y: state.ball.y,
            z: state.ball.height ?? 0,
          });
      }
      const diagnostic = [state.lastResolvedPass, state.lastPassDiagnostic].find(
        (p) => p?.passId === pass!.passId && p.finalResult,
      );
      if (diagnostic) {
        resolved = diagnostic;
        if (contactAt === null) {
          contactAt = diagnostic.resolvedAt ?? state.time;
          contactOwner = diagnostic.actualReceiverId;
        }
      }
      if (state.ball.ownerId === action.receiverId) controlled = true;
      if (
        state.ball.ownerId &&
        state.players.find((p) => p.id === state.ball.ownerId)?.team !== 'home'
      )
        lost = true;
      if (
        contactOwner &&
        state.decisionIndex !== previous.decisionIndex &&
        state.latestAction?.actorId === contactOwner &&
        continuation === null
      )
        continuation = state.latestAction.type;
      if (contactAt !== null && state.time >= contactAt + 2 && retained === null)
        retained =
          resolved?.finalResult === 'completed'
            ? !lost && state.possessionTeam === 'home' && state.scenario === 'open_play'
            : null;
      if (contactAt !== null && state.time >= contactAt + 3) break;
    }
  }
  const stats =
    state.statistics?.players.filter(
      (p) => state.statistics!.playerTeams?.[p.playerId] === 'away',
    ) ?? [];
  return physicalProbeSchema.parse({
    released,
    releaseAt: released ? pass!.releasedAt : null,
    predictedCompletionAtRelease: pass?.selectionQuality?.expectedCompletion ?? null,
    predictedRetentionAtRelease: pass?.selectionQuality?.expectedRetainedPossession ?? null,
    predictedProgressionMetres: pass ? pass.predictedReceptionPoint.x - initial.ball.x : null,
    actualFlightSeconds: contactAt === null ? null : contactAt - pass!.releasedAt,
    maxHeightMetres: maxHeight,
    flightSamples: samples,
    result: resolved?.finalResult ?? null,
    receptionOutcome: resolved?.receptionOutcome ?? null,
    actualReceiverId: resolved?.actualReceiverId ?? null,
    actualContact: resolved?.actualContactPoint ?? null,
    actualProgressionMetres: resolved?.actualContactPoint
      ? resolved.actualContactPoint.x - initial.ball.x
      : null,
    intendedReceiverControlled: controlled,
    intendedReceiverContact:
      resolved?.finalResult === 'completed' && resolved.actualReceiverId === action.receiverId,
    defensiveInterception: resolved?.finalResult === 'intercepted',
    continuationAction: continuation,
    retainedTwoSecondsAfterCompletion: retained,
    possessionLost: lost,
    censored: released && !resolved?.finalResult,
    interceptions: stats.reduce((sum, p) => sum + p.interceptions, 0),
    fouls: stats.reduce((sum, p) => sum + p.fouls, 0),
  });
};

export const runPassLab = (
  conditions: readonly PassCondition[] = passConditionSchema.options,
  seeds = ['pr165-tactic-1', 'pr165-tactic-2', 'pr165-tactic-3'],
) => {
  const rows: z.infer<typeof passLabRowSchema>[] = [];
  for (const condition of conditions)
    for (const seed of seeds) {
      const { state, actorId, outlets } = createPassLabFixture(condition, seed);
      const before = JSON.stringify(state);
      const ranking = rankAvailableActionsForAI(state, actorId);
      if (JSON.stringify(state) !== before) throw new Error('Ranking mutated canonical state.');
      for (const outlet of passOutletSchema.options) {
        const desired =
          condition === 'ground'
            ? 'ground'
            : condition === 'lofted'
              ? 'lofted'
              : outlet === 'central_short'
                ? 'ground'
                : 'lofted';
        const candidateIndex = ranking.findIndex(
          (r) =>
            r.action.type === 'pass' &&
            r.action.receiverId === outlets[outlet] &&
            (r.action.delivery ?? 'ground') === desired,
        );
        const candidate = ranking[candidateIndex];
        const action = candidate?.action.type === 'pass' ? candidate.action : undefined;
        const physical = action ? probePass(state, action) : null;
        const completion = physical?.predictedCompletionAtRelease ?? null;
        const progression = physical?.predictedProgressionMetres ?? null;
        rows.push(
          passLabRowSchema.parse({
            seed,
            condition,
            outlet,
            generated: Boolean(action),
            rank: action ? candidateIndex + 1 : null,
            score: candidate?.canonicalScore ?? null,
            topChoice: JSON.stringify(ranking[0]?.action),
            lengthMetres: action ? distance(state.ball, action.target) : null,
            delivery: action ? desired : null,
            intent: action?.intent ?? null,
            classification: action
              ? classifyPass(state.ball, action.target, 'home', action.intent, action.delivery)
              : null,
            pressure: state.currentPressure,
            secondBallSupportCount: action
              ? state.players.filter(
                  (p) =>
                    p.team === 'home' &&
                    p.id !== actorId &&
                    p.id !== action.receiverId &&
                    distance(p.position, action.target) < 15,
                ).length
              : null,
            availability: !action
              ? 'not_offered'
              : candidateIndex === 0
                ? 'offered_first'
                : 'offered_not_first',
            predictedCompletion: completion,
            predictedRetention: physical?.predictedRetentionAtRelease ?? null,
            predictedFutureProgressionMetres:
              progression === null || completion === null ? null : completion * progression,
            physical,
          }),
        );
      }
    }
  return rows;
};

export const markingScenarioSchema = z.enum([
  'winger_switch',
  'striker_drops',
  'two_corridor',
  'behind_fullback',
  'fullback_overlap',
  'dm_flank_cover',
  'handoff',
]);
export type MarkingScenario = z.infer<typeof markingScenarioSchema>;
export const markingAssignmentSchema = z.object({
  defenderId: z.string(),
  threatId: z.string(),
  target: pitchPointSchema,
  cost: finite,
  reason: z.enum(['local_threat', 'flank_cover']),
});

export const createMarkingFixture = (scenario: MarkingScenario, seed: string) => {
  const fixture = createPassLabFixture('baseline', seed),
    state = fixture.state;
  const carrier = player(state, 'home', 'central_midfielder', 1);
  place(carrier, 55, 34);
  for (const p of state.players.filter((p) => p.team === 'away')) {
    const y =
      p.slot.position === 'left_back'
        ? 54
        : p.slot.position === 'right_back'
          ? 14
          : p.slotIndex === 2
            ? 27
            : p.slotIndex === 3
              ? 41
              : 9 + (p.slotIndex % 5) * 11;
    place(p, p.slot.position === 'goalkeeper' ? 102 : p.slotIndex <= 4 ? 75 : 63, y);
  }
  const left = player(state, 'home', 'left_winger');
  place(left, 71, 15);
  const right = player(state, 'home', 'right_winger');
  place(right, 71, 52);
  const striker = player(state, 'home', 'striker');
  place(striker, 72, 34);
  const overlap = player(state, 'home', 'right_back');
  place(overlap, 62, 60);
  const pivot = player(state, 'away', 'central_midfielder');
  pivot.duty = 'defend';
  place(pivot, 67, 34);
  if (scenario === 'two_corridor') place(right, 70, 31);
  if (scenario === 'dm_flank_cover') {
    place(player(state, 'away', 'right_back'), 59, 12);
    place(pivot, 69, 21);
  }
  const start = new Map(state.players.map((p) => [p.id, { ...p.position }]));
  const endpoints = new Map<string, { x: number; y: number }>();
  if (scenario === 'winger_switch') {
    endpoints.set(left.id, { x: 73, y: 51 });
    endpoints.set(right.id, { x: 73, y: 16 });
  }
  if (scenario === 'striker_drops') endpoints.set(striker.id, { x: 60, y: 34 });
  if (scenario === 'two_corridor') {
    endpoints.set(striker.id, { x: 79, y: 32 });
    endpoints.set(right.id, { x: 79, y: 36 });
  }
  if (scenario === 'behind_fullback' || scenario === 'dm_flank_cover')
    endpoints.set(left.id, { x: 86, y: 12 });
  if (scenario === 'dm_flank_cover')
    endpoints.set(player(state, 'away', 'right_back').id, { x: 52, y: 10 });
  if (scenario === 'fullback_overlap') endpoints.set(overlap.id, { x: 84, y: 59 });
  if (scenario === 'handoff') endpoints.set(striker.id, { x: 77, y: 49 });
  readyPossession(state, carrier);
  return {
    state,
    start,
    endpoints,
    pivotId: pivot.id,
    carrierId: carrier.id,
    threatIds: [
      left.id,
      right.id,
      striker.id,
      ...(scenario === 'fullback_overlap' ? [overlap.id] : []),
    ],
  };
};

/** Greedy, local, one-to-one zone/man experiment. Hysteresis discourages needless switches;
 * centrebacks may not follow a dropping striker out of the line. No production hook. */
export const experimentalMarkingAssignments = (
  state: TacticalMatchState,
  threatIds: string[],
  previous = new Map<string, string>(),
) => {
  const defenders = state.players.filter(
    (p) =>
      p.team === 'away' &&
      (p.slotIndex <= 4 || (p.slot.position === 'central_midfielder' && p.duty === 'defend')) &&
      p.slot.position !== 'goalkeeper',
  );
  const line =
    state.players
      .filter((p) => p.team === 'away' && p.slot.position === 'center_back')
      .reduce((s, p) => s + p.position.x, 0) / 2;
  const assigned = new Set<string>();
  const threats = state.players
    .filter((p) => threatIds.includes(p.id))
    .sort((a, b) => b.position.x - a.position.x || a.id.localeCompare(b.id));
  const result: z.infer<typeof markingAssignmentSchema>[] = [];
  for (const threat of threats) {
    const candidates = defenders
      .filter((d) => !assigned.has(d.id))
      .map((d) => {
        const zone = d.idealTarget ?? d.target;
        const centreback = d.slot.position === 'center_back';
        const abandoningLine = centreback
          ? Math.max(0, line - threat.position.x - 4) * 2 +
            Math.max(0, Math.abs(threat.position.y - 34) - 15)
          : 0;
        const target = clampPitchPoint({
          x: Math.max(centreback ? line - 4 : 55, threat.position.x + 1.8),
          y: threat.position.y,
        });
        const lane = distanceToSegment(d.position, state.ball, threat.position);
        const cost =
          distance(d.position, target) +
          distance(zone, target) * 0.4 +
          abandoningLine +
          Math.min(8, lane) * 0.2 -
          (previous.get(d.id) === threat.id ? 3 : 0);
        return {
          defenderId: d.id,
          threatId: threat.id,
          target,
          cost,
          reason:
            d.duty === 'defend' &&
            d.slot.position === 'central_midfielder' &&
            Math.abs(threat.position.y - 34) > 18
              ? ('flank_cover' as const)
              : ('local_threat' as const),
        };
      })
      .sort((a, b) => a.cost - b.cost || a.defenderId.localeCompare(b.defenderId));
    if (candidates[0]) {
      assigned.add(candidates[0].defenderId);
      result.push(markingAssignmentSchema.parse(candidates[0]));
    }
  }
  return result;
};

/** Isolated motion harness: shared capability/turning/fitness, acceleration/braking and small
 * body separation. It is not a substitute match integrator and makes no ball/contact claims. */
const advanceFixtureBody = (state: TacticalMatchState, p: MatchPlayerState, dt: number) => {
  const dx = p.target.x - p.position.x,
    dy = p.target.y - p.position.y;
  const d = Math.max(0.001, Math.hypot(dx, dy)),
    capability = deriveMovementCapability(p);
  const speed = Math.hypot(p.velocity.x, p.velocity.y);
  const desired = Math.min(
    capability.runSpeed,
    Math.sqrt(2 * capability.acceleration * Math.max(0, d - 0.1)),
  );
  const desiredVelocity = { x: (dx / d) * desired, y: (dy / d) * desired };
  const delta = { x: desiredVelocity.x - p.velocity.x, y: desiredVelocity.y - p.velocity.y };
  const scale = Math.min(
    1,
    (capability.acceleration * dt) / Math.max(0.001, Math.hypot(delta.x, delta.y)),
  );
  const velocity = { x: p.velocity.x + delta.x * scale, y: p.velocity.y + delta.y * scale };
  const position = clampPitchPoint({
    x: p.position.x + velocity.x * dt,
    y: p.position.y + velocity.y * dt,
  });
  const nextSpeed = Math.hypot(velocity.x, velocity.y);
  const turn =
    speed > 0.1 && nextSpeed > 0.1
      ? Math.abs(normalizeAngle(angleForVector(velocity) - angleForVector(p.velocity)))
      : 0;
  const facingAngle = integrateFacing(
    p.facingAngle,
    angleForVector({ x: dx, y: dy }),
    p.profile.attributes.agility,
    speed,
    dt,
  );
  const fitness = advanceMatchFitness(p, {
    dt,
    speed: nextSpeed,
    previousSpeed: speed,
    distance: distance(p.position, position),
    turnRadians: turn,
  });
  for (const other of state.players)
    if (other.id !== p.id) {
      const metres = distance(position, other.position);
      if (metres > 0.01 && metres < 1.15) {
        const separation = Math.min(1.15 - metres, 0.65 * dt);
        position.x += ((position.x - other.position.x) / metres) * separation;
        position.y += ((position.y - other.position.y) / metres) * separation;
      }
    }
  return { ...p, position, velocity, facingAngle, fitness };
};

export const markingMetricsSchema = z.object({
  markingDistanceMetres: finite,
  accessibleLanes: count,
  widthMetres: finite,
  lineSpreadMetres: finite,
  spaceBehindLineMetres: finite,
  missedThreats: count,
  centralGapMetres: finite,
  movementMetres: finite,
  excessMovementMetres: finite,
  capacitySpent: finite,
  burstSpent: finite,
});
export const markingLabRowSchema = z.object({
  scenario: markingScenarioSchema,
  seed: z.string(),
  policy: z.enum(['baseline', 'experimental']),
  final: markingMetricsSchema,
  handoffs: count,
  pivotPosition: pitchPointSchema,
  centralCoverCount: count,
  history: z
    .array(
      z.object({
        at: finite,
        assignments: z.array(markingAssignmentSchema).max(4),
        metrics: markingMetricsSchema,
      }),
    )
    .max(4),
  physicalProbe: physicalProbeSchema,
});
export const measureMarking = (
  state: TacticalMatchState,
  threats: string[],
  start: Map<string, { x: number; y: number }>,
) => {
  const defenders = state.players.filter(
    (p) => p.team === 'away' && p.slot.position !== 'goalkeeper',
  );
  const backline = defenders.filter((p) => p.slotIndex <= 4);
  const distances = threats.map((id) =>
    Math.min(
      ...defenders.map((d) =>
        distance(d.position, state.players.find((p) => p.id === id)!.position),
      ),
    ),
  );
  const laneAccess = threats.filter((id) => {
    const threat = state.players.find((p) => p.id === id)!;
    return !defenders.some((d) => distanceToSegment(d.position, state.ball, threat.position) < 2.1);
  }).length;
  const line = backline.reduce((sum, p) => sum + p.position.x, 0) / backline.length;
  const movement = defenders.reduce(
    (sum, p) =>
      sum +
      (p.fitness!.workload.distanceWalk +
        p.fitness!.workload.distanceJog +
        p.fitness!.workload.distanceRun +
        p.fitness!.workload.distanceSprint),
    0,
  );
  const displacement = defenders.reduce(
    (sum, p) => sum + distance(p.position, start.get(p.id)!),
    0,
  );
  const central = defenders
    .filter((p) => Math.abs(p.position.y - 34) < 14)
    .sort((a, b) => a.position.y - b.position.y);
  const gaps = central.slice(1).map((p, i) => p.position.y - central[i]!.position.y);
  return markingMetricsSchema.parse({
    markingDistanceMetres: distances.reduce((sum, n) => sum + n, 0) / distances.length,
    accessibleLanes: laneAccess,
    widthMetres:
      Math.max(...backline.map((p) => p.position.y)) -
      Math.min(...backline.map((p) => p.position.y)),
    lineSpreadMetres:
      Math.max(...backline.map((p) => p.position.x)) -
      Math.min(...backline.map((p) => p.position.x)),
    spaceBehindLineMetres: Math.max(0, 105 - line),
    missedThreats: distances.filter((d) => d > 5).length,
    centralGapMetres: Math.max(0, ...gaps),
    movementMetres: movement,
    excessMovementMetres: Math.max(0, movement - displacement),
    capacitySpent: defenders.reduce((s, p) => s + p.fitness!.capacitySpent, 0),
    burstSpent: defenders.reduce((s, p) => s + p.fitness!.burstSpent, 0),
  });
};

export const runMarkingLab = (
  scenarios: readonly MarkingScenario[] = markingScenarioSchema.options,
  seeds = ['pr165-mark-1', 'pr165-mark-2', 'pr165-mark-3'],
) => {
  const rows = [];
  for (const scenario of scenarios)
    for (const seed of seeds)
      for (const policy of ['baseline', 'experimental'] as const) {
        const fixture = createMarkingFixture(scenario, seed);
        let state = fixture.state;
        let previous = new Map<string, string>(),
          handoffs = 0;
        const history: {
          at: number;
          assignments: z.infer<typeof markingAssignmentSchema>[];
          metrics: z.infer<typeof markingMetricsSchema>;
        }[] = [];
        for (let tick = 0; tick < 320; tick++) {
          const dt = FIXED_MATCH_DT,
            progress = Math.min(1, (tick * dt) / 7);
          // Prescribed attacker routes (and one advancing fullback) create known tactical threats.
          for (const [id, endpoint] of fixture.endpoints) {
            const p = state.players.find((p) => p.id === id)!,
              origin = fixture.start.get(id)!;
            const previousPosition = p.position;
            const previousSpeed = Math.hypot(p.velocity.x, p.velocity.y);
            p.position = {
              x: origin.x + (endpoint.x - origin.x) * progress,
              y: origin.y + (endpoint.y - origin.y) * progress,
            };
            p.velocity =
              progress < 1
                ? { x: (endpoint.x - origin.x) / 7, y: (endpoint.y - origin.y) / 7 }
                : { x: 0, y: 0 };
            if (p.team === 'away')
              p.fitness = advanceMatchFitness(p, {
                dt,
                speed: Math.hypot(p.velocity.x, p.velocity.y),
                previousSpeed,
                distance: distance(previousPosition, p.position),
                turnRadians: 0,
              });
          }
          let assignments: z.infer<typeof markingAssignmentSchema>[] = [];
          if (tick % 10 === 0) {
            state.players = deriveTacticalTargets(state);
            if (policy === 'experimental') {
              assignments = experimentalMarkingAssignments(state, fixture.threatIds, previous);
              for (const assignment of assignments) {
                const oldDefender = [...previous.entries()].find(
                  ([, id]) => id === assignment.threatId,
                )?.[0];
                if (oldDefender && oldDefender !== assignment.defenderId) handoffs++;
              }
              previous = new Map(assignments.map((a) => [a.defenderId, a.threatId]));
              for (const a of assignments)
                state.players.find((p) => p.id === a.defenderId)!.target = a.target;
            }
            if (tick % 80 === 0)
              history.push({
                at: tick * dt,
                assignments,
                metrics: measureMarking(state, fixture.threatIds, fixture.start),
              });
          }
          state = {
            ...state,
            time: state.time + dt,
            players: state.players.map((p) =>
              p.team === 'away' && p.slot.position !== 'goalkeeper' && !fixture.endpoints.has(p.id)
                ? advanceFixtureBody(state, p, dt)
                : p,
            ),
          };
        }
        const final = measureMarking(state, fixture.threatIds, fixture.start);
        const pivot = state.players.find((p) => p.id === fixture.pivotId)!;
        const probeReceiver = fixture.endpoints.keys().next().value ?? fixture.threatIds[0]!;
        const receiver = state.players.find((p) => p.id === probeReceiver)!;
        const probe = probePass(
          state,
          {
            type: 'pass',
            actorId: fixture.carrierId,
            receiverId: receiver.id,
            target: receiver.position,
            intent: 'progressive',
            delivery: 'ground',
          },
          8,
        );
        rows.push(
          markingLabRowSchema.parse({
            scenario,
            seed,
            policy,
            final,
            handoffs,
            pivotPosition: pivot.position,
            centralCoverCount: state.players.filter(
              (p) =>
                p.team === 'away' &&
                p.slot.position !== 'goalkeeper' &&
                Math.abs(p.position.y - 34) < 12 &&
                p.position.x >= 60,
            ).length,
            history,
            physicalProbe: probe,
          }),
        );
      }
  return rows;
};
