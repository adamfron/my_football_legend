import { z } from 'zod';
import { createFormationBenchmarkMatch } from './benchmarkFixtures';
import { assignTacticalRoles } from './tacticalRoles';
import { integrateCanonicalMovement } from './canonicalMovement';
import { deriveMovementCapability } from './locomotion';
import { angleForVector } from './playerOrientation';
import { distance, physicalPointSchema } from './matchSpace';
import { advanceMatchFitness } from './matchFitness';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { playerContactGeometry } from './ballContactGeometry';
import { enumerateStateValueActions, rankStateValueActions } from './decisionPolicy';
import { evaluateStateValueAction } from './decisionStateValue';
import { canReleaseControlledAction } from './decisionReadiness';
import { preparationMarginForAction } from './onBallPreparation';
import { enumerateCanonicalShootingOptions } from './shootingOptions';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { matchActionSchema, type MatchPlayerState, type TacticalMatchState } from './matchState';
import {
  patternIdSchema,
  type PatternId,
  familiaritySchema,
  type Familiarity,
  coachDemandsSchema,
  RESEARCH_COACHES,
  observeTacticalScene,
  recognisePattern,
  cognitionTraceSchema,
  tacticalAdviceSchema,
} from './tacticalCognition';

const DT = 0.025;
/** Initial placement is an apparatus input. All subsequent displacement is integrated. */
export const createCognitionFixture = (pattern: PatternId, seed: string) => {
  const s = createFormationBenchmarkMatch({ opponent: '4-3-3', attributes: 60, seed }).state;
  s.time = 10;
  s.scenario = 'open_play';
  s.playerAgencyEnabled = false;
  s.actionCooldown = 0;
  delete s.restart;
  const home = s.players.filter((p) => p.team === 'home');
  const source = home.find((p) => p.slot.position === 'central_midfielder')!;
  const runner = home.find((p) => p.slot.position === 'striker')!;
  const second = home.find((p) => p.slot.position === 'striker' && p.id !== runner.id)!;
  const cover = home.filter((p) => p.slot.position === 'center_back');
  const opponent = s.players.find((p) => p.team === 'away' && p.slot.position === 'center_back')!;
  for (const [i, p] of s.players.entries()) {
    p.position = { x: 8 + i, y: 4 };
    p.velocity = { x: 0, y: 0 };
    p.facingAngle = Math.PI / 2;
  }
  source.position = {
    x: pattern === 'press_triangle' ? 64 : pattern === 'playmaker_run' ? 35 : 57,
    y: 34,
  };
  source.velocity = { x: 2, y: 0 };
  runner.position = { x: 60, y: 32 };
  runner.facingAngle = -Math.PI / 2;
  second.position = { x: 60, y: 36 };
  second.facingAngle = -Math.PI / 2;
  cover.forEach((p, i) => {
    p.position = { x: 54, y: 32 + i * 4 };
  });
  opponent.position = { x: pattern === 'press_triangle' ? 66 : 74, y: 34 };
  s.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper')!.position = {
    x: 102,
    y: 34,
  };
  s.players.find(
    (p) => p.team === 'away' && p.slot.position === 'center_back' && p.id !== opponent.id,
  )!.position = { x: 78, y: 48 };
  for (const p of s.players) {
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
  }
  s.rolePlan = assignTacticalRoles(s);
  s.rolePlan.assignments[source.id] = 'deep_playmaker';
  s.rolePlan.assignments[runner.id] =
    pattern === 'press_triangle' ? 'false_nine' : 'advanced_forward';
  s.rolePlan.assignments[second.id] = s.rolePlan.assignments[runner.id]!;
  s.currentActorId = source.id;
  s.possessionTeam = 'home';
  s.timeSincePossessionChanged = 0.5;
  s.ball = {
    ...playerContactGeometry(source).rightFoot,
    ownerId: source.id,
    height: 0.11,
    lastTouchPlayerId: source.id,
  };
  s.ballOwnershipStartedAt = 8;
  s.onBallPreparation = {
    actorId: source.id,
    gainedAt: 8,
    readyAt: pattern === 'playmaker_run' ? 10.6 : 9,
    kind: 'immediate_control',
    incomingSpeed: 0,
  };
  return {
    state: s,
    sourceId: source.id,
    runnerIds: [runner.id, second.id],
    coverIds: cover.map((p) => p.id),
    opponentId: opponent.id,
  };
};

export const tacticalTrialConfigSchema = z.object({
  pattern: patternIdSchema,
  seed: z.string(),
  familiarity: z.number().min(0).max(1),
  roleFamiliarity: z.number().min(0).max(1).optional(),
  gameReading: z.number().min(1).max(100).default(60),
  concentration: z.number().min(1).max(100).default(60),
  mode: z.enum(['motor', 'prepared', 'deliberate']).default('prepared'),
  coach: coachDemandsSchema.default(RESEARCH_COACHES.system),
  physicalSkill: z.number().min(1).max(100).default(60),
  novel: z.boolean().default(false),
  noCover: z.boolean().default(false),
  advice: tacticalAdviceSchema.optional(),
});
export const tacticalTrialResultSchema = z.object({
  config: tacticalTrialConfigSchema,
  initial: z.unknown(),
  traces: cognitionTraceSchema.array().max(2),
  participants: z
    .array(
      z.object({
        id: z.string(),
        movedMetres: z.number().nonnegative(),
        arrivalAt: z.number().nullable(),
        cancellation: z.string().nullable(),
        final: physicalPointSchema,
      }),
    )
    .max(2),
  defensiveCover: z.number().int().nonnegative(),
  passReleased: z.boolean(),
  passOutcome: z.string(),
  receiverId: z.string().nullable(),
  release: z.object({
    unchanged: z.boolean(),
    ball: z.unknown(),
    action: matchActionSchema.nullable(),
  }),
  samples: z
    .array(z.object({ at: z.number(), positions: z.array(physicalPointSchema).max(2) }))
    .max(100),
});
export const runTacticalPatternTrial = (raw: z.input<typeof tacticalTrialConfigSchema>) => {
  const c = tacticalTrialConfigSchema.parse(raw);
  const fixture = createCognitionFixture(c.pattern, c.seed);
  let s = fixture.state;
  if (c.novel) {
    s.timeSincePossessionChanged = 20;
    delete s.onBallPreparation;
    s.players.find((p) => p.id === fixture.opponentId)!.position = { x: 90, y: 50 };
  }
  if (c.noCover) s.players = s.players.filter((p) => !fixture.coverIds.includes(p.id));
  for (const p of s.players.filter((p) => fixture.runnerIds.includes(p.id))) {
    p.profile = structuredClone(p.profile);
    p.profile.attributes.gameReading = c.gameReading;
    p.profile.attributes.concentration = c.concentration;
    p.profile.attributes.pace = c.physicalSkill;
    p.profile.attributes.agility = c.physicalSkill;
  }
  const initial = structuredClone(s);
  const traces = fixture.runnerIds.map((id) => {
    const p = s.players.find((p) => p.id === id)!;
    const f: Familiarity = familiaritySchema.parse({
      pattern: c.pattern,
      signature: 'v1',
      roleId: s.rolePlan!.assignments[id],
      partnerId: fixture.sourceId,
      system: c.familiarity,
      role: c.roleFamiliarity ?? c.familiarity,
      partner: c.familiarity,
    });
    return recognisePattern(observeTacticalScene(s, p, c.pattern), p, f, c.coach, c.mode, c.advice);
  });
  const participants = fixture.runnerIds.map((id) => ({
    id,
    movedMetres: 0,
    arrivalAt: null as number | null,
    cancellation: null as string | null,
    final: { ...s.players.find((p) => p.id === id)!.position },
  }));
  const samples = [];
  for (let tick = 0; tick < 96; tick++) {
    const at = 10 + tick * DT;
    for (const [i, trace] of traces.entries()) {
      const p = s.players.find((p) => p.id === trace.actorId)!,
        row = participants[i]!;
      if (
        !trace.target ||
        trace.recognitionAt === null ||
        at < trace.recognitionAt ||
        row.cancellation
      )
        continue;
      if (at >= trace.expiresAt || s.ball.ownerId !== fixture.sourceId) {
        row.cancellation = at >= trace.expiresAt ? 'expired' : 'lost_owner';
        continue;
      }
      // Finite acceleration, turn, braking, balance and workload are the same as a match.
      const m = integrateCanonicalMovement(p, {
        target: trace.target,
        targetSpeed: deriveMovementCapability(p).runSpeed,
        desiredFacingAngle: angleForVector({
          x: trace.target.x - p.position.x,
          y: trace.target.y - p.position.y,
        }),
        dt: DT,
        balance: 1,
        structural: false,
        receivingMomentum: false,
      });
      const metres = distance(p.position, m.position);
      const moved: MatchPlayerState = {
        ...p,
        position: m.position,
        velocity: m.velocity,
        facingAngle: m.facingAngle,
        plantBalance: m.plantBalance,
        fitness: advanceMatchFitness(p, {
          dt: DT,
          distance: metres,
          speed: Math.hypot(m.velocity.x, m.velocity.y),
          previousSpeed: Math.hypot(p.velocity.x, p.velocity.y),
          turnRadians: 0,
        }),
      };
      s = { ...s, time: at + DT, players: s.players.map((q) => (q.id === p.id ? moved : q)) };
      row.movedMetres += metres;
      row.final = { ...m.position };
      if (row.arrivalAt === null && distance(m.position, trace.target) < 1) row.arrivalAt = at + DT;
    }
    samples.push({ at: (tick + 1) * DT, positions: participants.map((p) => ({ ...p.final })) });
  }
  // Test cooperation through an ordinary pass; neither ownership nor a successful
  // arrival is assigned. The existing match engine owns opponents/contact/offside.
  const target = s.players.find((p) => p.id === fixture.runnerIds[0])!;
  const source = s.players.find((p) => p.id === fixture.sourceId)!;
  const released = resolveMatchAction(
    s,
    {
      type: 'pass',
      actorId: source.id,
      receiverId: target.id,
      target: { ...target.position },
      intent: c.pattern === 'press_triangle' ? 'support' : 'through',
      delivery: 'ground',
    },
    'dev_ai_selected',
  );
  const unchanged = released === s;
  const passReleased = Boolean(
    released.ball.travelKind && !released.ball.ownerId && released.lastPassDiagnostic,
  );
  s = released;
  const passId = s.lastPassDiagnostic?.passId;
  for (let tick = 0; tick < 160 && passReleased; tick++) {
    s = stepTacticalMatchAfterDecisionProbe(s, DT);
    if (s.lastResolvedPass?.passId === passId || s.ball.ownerId || s.restart || s.postGoal) break;
  }
  const result = [s.lastResolvedPass, s.lastPassDiagnostic].find((p) => p?.passId === passId);
  return tacticalTrialResultSchema.parse({
    config: c,
    initial,
    traces,
    participants,
    defensiveCover: c.noCover ? 0 : fixture.coverIds.length,
    passReleased,
    passOutcome: result?.finalResult ?? (passReleased ? 'unresolved' : 'no_release'),
    receiverId: s.ball.ownerId ?? null,
    release: { unchanged, ball: released.ball, action: released.latestAction ?? null },
    samples,
  });
};

export const decisionAuditSchema = z.object({
  actorId: z.string(),
  at: z.number(),
  releaseReady: z.boolean(),
  generated: z.number().int(),
  atCap: z.boolean(),
  shotMenuCount: z.number().int(),
  shotMenuMissing: z.number().int(),
  opportunity: z.number(),
  candidates: z
    .array(
      z.object({
        action: matchActionSchema,
        rank: z.number().int().nullable(),
        value: z.number().nullable(),
        preparationMargin: z.number(),
        rejection: z.enum(['none', 'preparation', 'contact_unavailable', 'valuation_feasibility']),
        goalExpectation: z.number().nullable(),
        reasons: z.string().array(),
      }),
    )
    .max(48),
});
/** Explicit diagnostic invocation only. Do not call this extra ranking each live tick. */
export const auditDecisionSnapshot = (state: TacticalMatchState, actorId: string) => {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) throw Error(`Unknown decision actor ${actorId}`);
  const generated = enumerateStateValueActions(state, actor),
    ranked = rankStateValueActions(state, actor, generated);
  const shots = enumerateCanonicalShootingOptions(state, actor.id);
  const key = (action: z.infer<typeof matchActionSchema>) => JSON.stringify(action);
  const releaseReady = canReleaseControlledAction(state, actor);
  return decisionAuditSchema.parse({
    actorId,
    at: state.time,
    releaseReady,
    generated: generated.length,
    atCap: generated.length === 48,
    shotMenuCount: shots.length,
    shotMenuMissing: shots.filter((a) => !generated.some((g) => key(g) === key(a))).length,
    opportunity: evaluateShootingOpportunity(state, actor).effectiveScoringExpectation,
    candidates: generated.map((action) => {
      const evaluation = evaluateStateValueAction(state, actor, action),
        margin = preparationMarginForAction(state, actor, action);
      const index = ranked.findIndex((r) => key(r.action) === key(action));
      return {
        action,
        rank: index < 0 ? null : index,
        value: evaluation?.value ?? null,
        preparationMargin: margin,
        rejection: evaluation
          ? 'none'
          : margin < 0
            ? 'preparation'
            : !releaseReady && !['hold', 'carry'].includes(action.type)
              ? 'contact_unavailable'
              : 'valuation_feasibility',
        goalExpectation: evaluation?.branches.find((b) => b.kind === 'goal')?.probability ?? null,
        reasons: evaluation?.reasons ?? [],
      };
    }),
  });
};
