// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
  stepTacticalMatch,
} from './matchSimulation';
import { evaluatePassDecision } from './passDecision';
import { derivePossessionUrgency, resolveMatchAction, scoreActionForAI } from './matchActions';
import { deriveBuildUpSupport, deriveTacticalTargets } from './tacticalPositioning';
import {
  deriveSolutionPenalty,
  observeTeamThreats,
  teamThreatMemorySchema,
} from './teamThreatMemory';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from './matchFlowTelemetry';
import { assertMatchStatisticsInvariants, createMatchStatistics } from './playerMatchStats';
import { arbitrateGoalkeeperClaim } from './goalkeeperClaim';
import { deriveLooseBallAssignments } from './looseBallPhysics';
import { deriveRestartGeometry } from './restartGeometry';
import { deriveCarryExecution } from './carryExecution';
import { runAttributeMicroLab } from './attributeMicroLab';
import {
  projectFormationConnectivity,
  PressureSupportTracker,
} from './footballIntelligenceDiagnostics';
import { distance } from './matchSpace';
import { runPassFlightMatrix } from '../../../scripts/pr154PassFlightMatrix';
import { estimatePlayerArrivalTime } from './playerArrival';
import { RandomGenerator } from '../random/RandomGenerator';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr154') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 30;
  state.actionCooldown = 0;
  const actor = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  const receiver = state.players.find(
    (p) => p.team === 'home' && p.id !== actor.id && p.slot.position === 'central_midfielder',
  )!;
  const defender = state.players.find((p) => p.team === 'away' && p.slot.position === 'striker')!;
  state.players = state.players.map((p) => ({
    ...p,
    position: { x: p.team === 'home' ? 20 : 100, y: 4 + p.slotIndex * 5 },
    velocity: { x: 0, y: 0 },
    profile: { ...p.profile, attributes: { ...p.profile.attributes } },
  }));
  const get = (id: string) => state.players.find((p) => p.id === id)!;
  get(actor.id).position = { x: 45, y: 34 };
  get(receiver.id).position = { x: 55, y: 30 };
  get(defender.id).position = { x: 70, y: 44 };
  state.ball = { x: 45.4, y: 34, ownerId: actor.id };
  state.possessionTeam = 'home';
  state.ballOwnershipStartedAt = 29;
  state.statistics = createMatchStatistics(state);
  return { state, actor: get(actor.id), receiver: get(receiver.id), defender: get(defender.id) };
};

describe('PR154 football decisions and cooperative pressure', () => {
  it('pruned defender ETA equals exhaustive physical projection across direction, momentum and sprint ability', () => {
    const { state, actor, receiver } = fixture();
    const rng = RandomGenerator.fromSeed('pr154-eta-pruning');
    for (let sample = 0; sample < 20; sample++) {
      for (const p of state.players.filter((p) => p.team !== actor.team)) {
        p.position = { x: rng.float() * 105, y: rng.float() * 68 };
        p.velocity = { x: (rng.float() - 0.5) * 24, y: (rng.float() - 0.5) * 24 };
        p.profile.attributes.pace = 20 + rng.float() * 80;
      }
      const target = { x: 5 + rng.float() * 95, y: 5 + rng.float() * 58 };
      const exhaustive = Math.min(
        ...state.players
          .filter((p) => p.team !== actor.team)
          .map((p) => estimatePlayerArrivalTime(state, p, target, 'intercept').estimatedTime),
      );
      expect(evaluatePassDecision(state, actor, receiver, target, 'lead').defenderEta).toBe(
        exhaustive,
      );
    }
  });
  it('rejects an unreachable boundary target while retaining a reachable progressive run', () => {
    const { state, actor, receiver } = fixture();
    const safe = evaluatePassDecision(state, actor, receiver, receiver.position, 'progressive');
    const out = evaluatePassDecision(state, actor, receiver, { x: 104.5, y: 67.5 }, 'through');
    expect(safe.expectedCompletion).toBeGreaterThan(out.expectedCompletion);
    expect(out.targetPredictedOutOfPlay).toBe(true);
    expect(out.utilityAdjustment).toBeLessThan(-70);
    expect(safe.utilityAdjustment).toBeGreaterThan(-20);
  });
  it('a better reader recognizes the same poor solution more strongly', () => {
    const { state, actor, receiver } = fixture();
    actor.profile.attributes.gameReading = 20;
    actor.profile.attributes.composure = 60;
    const weak = evaluatePassDecision(state, actor, receiver, { x: 104.5, y: 67.5 }, 'through');
    actor.profile.attributes.gameReading = 100;
    const strong = evaluatePassDecision(state, actor, receiver, { x: 104.5, y: 67.5 }, 'through');
    expect(strong.utilityAdjustment).toBeLessThan(weak.utilityAdjustment);
  });
  it('human and NPC release identical canonical physical passes from the same intention', () => {
    const { state, actor, receiver } = fixture();
    const action = {
      type: 'pass' as const,
      actorId: actor.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support' as const,
    };
    const human = resolveMatchAction(state, action, 'human_selected');
    const npc = resolveMatchAction(state, action, 'autonomous_npc');
    expect(human.ball).toEqual(npc.ball);
    expect(human.lastPassDiagnostic).toEqual(npc.lastPassDiagnostic);
  });
  it('a chosen ordinary carry evades instead of repeatedly replacing progress with shielding', () => {
    const { state, actor, defender } = fixture();
    defender.position = { x: 46.2, y: 34 };
    const next = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: { x: 55, y: 34 } },
      'autonomous_npc',
    );
    expect(next.ballCarrierIntent?.movementMode).toBe('carry');
    expect(deriveCarryExecution(next, actor, next.ballCarrierIntent!).mode).toBe('evade');
  });
  it('pressure urgency depends on geometry while late corner retention remains useful', () => {
    const { state, actor } = fixture();
    state.ballOwnershipStartedAt = 10;
    expect(derivePossessionUrgency(state, actor, 0.1)).toBe(0);
    expect(derivePossessionUrgency(state, actor, 0.75)).toBe(1);
    state.time = 85 * 60;
    state.score.home = 1;
    actor.position = { x: 103, y: 2 };
    expect(derivePossessionUrgency(state, actor, 0.75)).toBeLessThan(0.3);
  });
  it('pressure reduces repeated holding value without an unconditional timed release', () => {
    const { state, actor, defender } = fixture();
    defender.position = { x: 46, y: 34 };
    state.currentPressure = 0.8;
    const early = scoreActionForAI(state, actor.id, { type: 'hold', actorId: actor.id });
    state.time += 14;
    expect(scoreActionForAI(state, actor.id, { type: 'hold', actorId: actor.id })).toBeLessThan(
      early - 15,
    );
  });
  it('a weak forward screens protected circulation while a skilled presser can close contact', () => {
    const { state, actor, receiver, defender } = fixture();
    receiver.position = { x: 20, y: 34 };
    defender.position = { x: 48, y: 34 };
    defender.profile.attributes.tackling = 20;
    const weak = deriveTacticalTargets(state).find((p) => p.id === defender.id)!;
    defender.profile.attributes.tackling = 80;
    const skilled = deriveTacticalTargets(state).find((p) => p.id === defender.id)!;
    expect(distance(weak.idealTarget, actor.position)).toBeGreaterThan(1.7);
    expect(distance(skilled.idealTarget, actor.position)).toBeLessThan(1.4);
  });
  it('creates short midfield connections before historical threat evidence and moves physically', () => {
    const { state, defender } = fixture();
    defender.position = { x: 46.5, y: 34 };
    const support = deriveBuildUpSupport(state, 'home');
    expect(support.length).toBeGreaterThanOrEqual(2);
    expect(
      support.some(
        (a) =>
          state.players.find((p) => p.id === a.playerId)?.slot.position === 'central_midfielder',
      ),
    ).toBe(true);
    const positions = state.players.map((p) => ({ id: p.id, position: { ...p.position } }));
    const targets = deriveTacticalTargets(state);
    expect(targets.map((p) => ({ id: p.id, position: p.position }))).toEqual(positions);
    state.actionCooldown = 30;
    let moved = state;
    for (let tick = 0; tick < 80; tick++)
      moved = stepTacticalMatchAfterDecisionProbe(moved, FIXED_MATCH_DT);
    expect(
      support.some(
        (s) =>
          distance(
            moved.players.find((p) => p.id === s.playerId)!.position,
            positions.find((p) => p.id === s.playerId)!.position,
          ) > 1,
      ),
    ).toBe(true);
  });
  it('records failed routes once, decays them and accepts changed geometry', () => {
    const { state, actor, receiver } = fixture();
    const launched = resolveMatchAction(
      state,
      {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      },
      'autonomous_npc',
    );
    const resolved = {
      ...launched,
      time: launched.time + 1,
      lastPassDiagnostic: {
        ...launched.lastPassDiagnostic!,
        finalResult: 'intercepted' as const,
        resolvedAt: launched.time + 1,
      },
    };
    const remembered = observeTeamThreats(launched, resolved);
    expect(teamThreatMemorySchema.safeParse(remembered.teams.home.threatMemory).success).toBe(true);
    expect(remembered.teams.home.threatMemory?.recentSolutions).toHaveLength(1);
    expect(
      observeTeamThreats(remembered, { ...remembered, time: remembered.time + 0.025 }).teams.home
        .threatMemory?.recentSolutions,
    ).toHaveLength(1);
    const penalty = deriveSolutionPenalty(
      remembered,
      actor,
      'support',
      receiver.position,
      receiver.id,
      0.5,
    );
    expect(penalty).toBeGreaterThan(0);
    expect(
      deriveSolutionPenalty(
        { ...remembered, time: remembered.time + 90 },
        actor,
        'support',
        receiver.position,
        receiver.id,
        0.5,
      ),
    ).toBeLessThan(penalty * 0.3);
    const movedActor = { ...actor, position: { x: 68, y: 34 } };
    expect(
      deriveSolutionPenalty(remembered, movedActor, 'support', receiver.position, receiver.id, 0.5),
    ).toBe(0);
  });
  it('retains exact stepping, accounting and observational parity through repeated pressure', () => {
    const { state, actor, defender } = fixture('pr154-pressure-parity');
    defender.position = { x: 46.3, y: 34 };
    state.currentPressure = 0.75;
    state.ballOwnershipStartedAt = 25;
    let normal = structuredClone(state),
      observed = structuredClone(state);
    let telemetry = createMatchFlowTelemetry('pr154');
    const support = new PressureSupportTracker();
    for (let tick = 0; tick < 1200; tick++) {
      normal = stepTacticalMatch(normal, FIXED_MATCH_DT);
      const previous = observed;
      observed = stepTacticalMatchAfterDecisionProbe(observed, FIXED_MATCH_DT);
      telemetry = observeMatchFlow(telemetry, previous, observed);
      support.observe(previous, observed);
    }
    expect(normal).toEqual(observed);
    assertMatchStatisticsInvariants(observed.statistics!, observed);
    assertTelemetryInvariants(telemetry);
    expect(support.snapshot().length).toBeGreaterThan(0);
    expect(Math.max(...support.snapshot().map((p) => p.maximumStationaryStall))).toBeLessThan(20);
    expect(
      observed.statistics!.players.find((p) => p.playerId === actor.id)!.touches,
    ).toBeGreaterThanOrEqual(0);
    expect(projectFormationConnectivity(observed)).toHaveLength(2);
  });
});

describe('PR154 keeper ownership, distance and attributes', () => {
  it('compares actual flight/contact outcomes in paired long-pass geometry', () => {
    const { state } = fixture();
    const report = runPassFlightMatrix(state, {
      intents: ['lead'],
      pressureMetres: [14],
      lengths: [40],
      bands: [20, 100],
    });
    expect(report.rows[1]!.meanExecutionError).toBeLessThan(report.rows[0]!.meanExecutionError);
    expect(report.rows[1]!.completed).toBeGreaterThanOrEqual(report.rows[0]!.completed);
    expect(report.rows.every((r) => r.unresolved === 0)).toBe(true);
  });
  it('appoints either the keeper or the defender, with the other covering', () => {
    const { state } = fixture();
    const keeper = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'goalkeeper',
    )!;
    const back = state.players.find((p) => p.team === 'home' && p.slot.position === 'center_back')!;
    keeper.position = { x: 5, y: 34 };
    back.position = { x: 20, y: 34 };
    state.ball = { x: 8, y: 34, looseSince: state.time };
    const primary = arbitrateGoalkeeperClaim(state, keeper, state.ball);
    expect(primary.primaryId).toBe(keeper.id);
    expect(primary.coverId).toBe(back.id);
    const assignments = deriveLooseBallAssignments(state).filter((p) => p.team === 'home');
    expect(assignments.map((p) => p.playerId)).toEqual([keeper.id]);
    expect(assignments[0]!.coverId).toBe(back.id);
    expect(assignments[0]!.coverTarget!.x).toBeLessThan(assignments[0]!.target.x);
    expect(deriveTacticalTargets(state).find((p) => p.id === back.id)!.position).toEqual(
      back.position,
    );
    back.position = { x: 8.2, y: 34 };
    expect(arbitrateGoalkeeperClaim(state, keeper, state.ball).primaryId).toBe(back.id);
    expect(
      deriveLooseBallAssignments(state)
        .filter((p) => p.team === 'home')
        .some((p) => p.goalkeeper),
    ).toBe(false);
  });
  it('remote distribution moving away from goal offers no keeper response choice', () => {
    const { state } = fixture();
    const keeper = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'goalkeeper',
    )!;
    state.ball = { x: 80, y: 34, travelKind: 'long_distribution', velocity: { x: 20, y: 0, z: 4 } };
    expect(arbitrateGoalkeeperClaim(state, keeper, { x: 65, y: 34 }, 1).meaningfulChoice).toBe(
      false,
    );
  });
  it('retains a real breakaway choice and suppresses it when an outfield defender can safely arrive first', () => {
    const { state, defender } = fixture();
    const keeper = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'goalkeeper',
    )!;
    for (const p of state.players.filter((p) => p.team === 'home')) p.position = { x: 55, y: 50 };
    keeper.position = { x: 5, y: 34 };
    defender.position = { x: 24, y: 34 };
    state.ball = { x: 24, y: 34, ownerId: defender.id };
    expect(arbitrateGoalkeeperClaim(state, keeper, defender.position).meaningfulChoice).toBe(true);
    state.players.find((p) => p.team === 'home' && p.slot.position === 'center_back')!.position = {
      x: 23,
      y: 34,
    };
    expect(arbitrateGoalkeeperClaim(state, keeper, defender.position).meaningfulChoice).toBe(false);
  });
  it('defensive free kicks retain a contextual outlet and penalties keep legal role shape', () => {
    const { state } = fixture();
    const freeKick = deriveRestartGeometry(state, 'free_kick_close', 'home');
    expect(
      Object.values(freeKick.roles).some(
        (p) => p.key === 'counter_outlet' && p.intent === 'counter_outlet',
      ),
    ).toBe(true);
    const penalty = deriveRestartGeometry(state, 'penalty', 'home');
    for (const player of state.players.filter(
      (p) => p.id !== penalty.taker.id && p.slot.position !== 'goalkeeper',
    )) {
      const point = penalty.targets[player.id]!;
      expect(point.x).toBeLessThan(88.5);
      expect(distance(point, penalty.ball)).toBeGreaterThanOrEqual(9.15);
    }
  });
  it('uses recorded shot geometry even after the shooter changes position or restart occurs', () => {
    const { state, actor } = fixture();
    actor.position = { x: 87, y: 34 };
    state.ball = { x: 87, y: 34, ownerId: actor.id };
    const launched = resolveMatchAction(
      state,
      { type: 'shot', actorId: actor.id, target: { x: 105, y: 34 }, intent: 'placed' },
      'autonomous_npc',
    );
    const next = {
      ...launched,
      lastShot: { ...launched.ball.shot!, outcome: 'goal' as const },
      time: state.time + 2,
      players: launched.players.map((p) =>
        p.id === actor.id ? { ...p, position: { x: 45, y: 34 } } : p,
      ),
    };
    const telemetry = observeMatchFlow(createMatchFlowTelemetry(), state, next);
    expect(telemetry.shotDistances).toEqual([next.lastShot.distance]);
    assertTelemetryInvariants(telemetry);
    expect(() => assertTelemetryInvariants({ ...telemetry, shotDistances: [60] })).toThrow(
      /distance/,
    );
  });
  it('paired micro-lab matrices show monotonic distributions and leave the input untouched', () => {
    const { state } = fixture();
    const before = structuredClone(state);
    const report = runAttributeMicroLab(state, { repetitions: 32, bands: [20, 60, 100] });
    expect(state).toEqual(before);
    expect(report).toEqual(runAttributeMicroLab(state, { repetitions: 32, bands: [20, 60, 100] }));
    const groups = new Map<string, typeof report.rows>();
    for (const row of report.rows) {
      const key = `${row.metric}:${row.attribute}:${row.context}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [key, rows] of groups) {
      const sign = rows[0]!.better === 'higher' ? 1 : -1;
      expect(rows[2]!.distribution.mean * sign, key).toBeGreaterThanOrEqual(
        rows[0]!.distribution.mean * sign,
      );
      expect(rows[1]!.distribution.mean * sign, key).toBeGreaterThanOrEqual(
        rows[0]!.distribution.mean * sign - 1e-8,
      );
    }
    expect(new Set(report.rows.map((p) => p.attribute))).toEqual(
      new Set([
        'pace',
        'agility',
        'firstTouch',
        'passing',
        'technique',
        'composure',
        'dribbling',
        'tackling',
        'positioning',
        'gameReading',
        'finishing',
        'reflexes',
        'handling',
        'oneOnOnes',
        'goalkeeperSweeping',
        'goalkeeperKicking',
      ]),
    );
  });
});
