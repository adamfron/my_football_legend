// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { RandomGenerator } from '../random/RandomGenerator';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { applyRestartScenario } from './restartScenarios';
import { enumerateRestartActions, resolveMatchAction, scoreActionForAI } from './matchActions';
import {
  applyPlayerDecision,
  projectPlayerDecisionOpportunity,
  resolveDevPlayerDecision,
} from './playerDecision';
import {
  MATCH_PRESENTATION_POLICIES,
  projectMatchMoment,
  shouldSurfaceMatchMoment,
} from './matchMoment';
import { derivePassDifficulty, interpretPassExecution } from './passExecution';
import { evaluatePassDecision } from './passDecision';
import { createMatchFlowTelemetry, observeMatchFlow } from './matchFlowTelemetry';
import { PassingConnectivityTracker } from './passingConnectivityDiagnostics';
import { resolveContinuousGroundPassClaim } from './passClaimResolver';
import { derivePassLaunchPlan } from './passLaunchPlan';
import type { MatchAction, TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr156-contract',
      control: { mode: 'spectator' },
    }),
  );
const scenarios = [
  'kick_off',
  'goal_kick',
  'gk_short',
  'corner',
  'free_kick',
  'free_kick_far',
  'free_kick_close',
  'free_kick_wide',
  'penalty',
] as const;
const sources = [
  'autonomous_npc',
  'autonomous_routine',
  'dev_ai_selected',
  'restart_liveness_watchdog',
] as const;
const withoutIdentity = (s: TacticalMatchState) => {
  const { controlledFootballerId: _id, playerAgencyEnabled: _agency, ...football } = s;
  void _id;
  void _agency;
  return football;
};

describe('PR156 restart ownership', () => {
  it.each(
    scenarios.flatMap((scenario) =>
      Object.entries(MATCH_PRESENTATION_POLICIES).map(([name, policy]) => ({
        scenario,
        name,
        policy,
      })),
    ),
  )('$scenario across $name', ({ scenario, policy }) => {
    const state = applyRestartScenario(fixture(), scenario, { restartTeam: 'home' });
    state.controlledFootballerId = state.restart!.takerId;
    state.time = state.restart!.startedAt + 20;
    const first = projectPlayerDecisionOpportunity(state)!;
    expect(first.kind).toBe('restart');
    state.playerDecisionGate = {
      lastSituationSignature: first.signature,
      lastResolvedAt: state.time,
    };
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity).toBeDefined();
    const random = vi.spyOn(RandomGenerator.prototype, 'float');
    for (const action of enumerateRestartActions(state))
      for (const source of sources) {
        random.mockClear();
        const original = structuredClone(state);
        const blocked = resolveMatchAction(state, action, source);
        expect(blocked).toBe(state);
        expect(state).toEqual(original);
        expect(stepTacticalMatch(blocked, 0.025)).toEqual(blocked);
        expect(stepTacticalMatchAfterDecisionProbe(blocked, 0.025)).toEqual(blocked);
        expect(random).not.toHaveBeenCalled();
        const moment = projectMatchMoment(blocked);
        expect(moment.requiresHumanDecision).toBe(true);
        expect(shouldSurfaceMatchMoment(moment, policy)).toBe(true);
      }
    random.mockClear();
    expect(resolveDevPlayerDecision(state, opportunity).state).toBe(state);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    const actionOption = opportunity.options.find((o) => o.kind === 'action')!;
    const human = applyPlayerDecision(state, opportunity, actionOption.id);
    if (scenario === 'penalty') expect(human.ball.shot).toBeDefined();
    else expect(human.restart?.phase).toBe('release');
    expect(human.latestActionSource).toBe('human_selected');
    expect(human.decisionIndex).toBe(state.decisionIndex + 1);
  });
  it('requires an explicit indirect restart and leaves throw-ins autonomous', () => {
    for (const scenario of ['free_kick', 'throw_in'] as const) {
      const state = applyRestartScenario(fixture(), scenario, { restartTeam: 'home' });
      state.controlledFootballerId = state.restart!.takerId;
      if (scenario === 'free_kick') state.restart!.indirect = true;
      const pass = enumerateRestartActions(state).find((a) => a.type === 'pass')!;
      expect(pass).toBeDefined();
      const result = resolveMatchAction(state, pass, 'autonomous_npc');
      if (scenario === 'free_kick') {
        expect(result).toBe(state);
        expect(projectPlayerDecisionOpportunity(state)?.kind).toBe('restart');
      } else expect(result.restart?.phase).toBe('release');
    }
  });
  it('surfaces a single legal restart even after a resolved gate', () => {
    const state = applyRestartScenario(fixture(), 'kick_off', { restartTeam: 'home' });
    state.controlledFootballerId = state.restart!.takerId;
    const taker = state.players.find((p) => p.id === state.controlledFootballerId)!;
    const mate = state.players.find((p) => p.team === taker.team && p.id !== taker.id)!;
    state.players = [taker, mate];
    state.restart!.executionChoices = ['short_pass'];
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity).toBeDefined();
    state.playerDecisionGate = {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    };
    expect(projectPlayerDecisionOpportunity(state)).toBeDefined();
  });
});

describe('PR156 observational identity', () => {
  const initial = fixture();
  const reference: string[] = [];
  let cpu = initial;
  for (let tick = 0; tick < 240; tick++) {
    cpu = stepTacticalMatchAfterDecisionProbe(cpu, 0.025);
    reference.push(JSON.stringify(withoutIdentity(cpu)));
  }
  it.each(initial.players.map((p) => p.id))(
    '%s retains every ordinary football field and action source',
    (playerId) => {
      let variant: TacticalMatchState = {
        ...initial,
        controlledFootballerId: playerId,
        playerAgencyEnabled: false,
      };
      for (let tick = 0; tick < 240; tick++) {
        variant = stepTacticalMatchAfterDecisionProbe(variant, 0.025);
        expect(JSON.stringify(withoutIdentity(variant))).toBe(reference[tick]);
      }
    },
  );
  it('ordinary selection and seeded human/NPC execution have the same physical outcome', () => {
    const state = fixture();
    state.scenario = 'open_play';
    delete state.restart;
    state.time = 30;
    state.actionCooldown = 0;
    const actor = state.players.find(
        (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
      )!,
      receiver = state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!;
    state.ball = { ...actor.position, ownerId: actor.id };
    const action: MatchAction = {
      type: 'pass',
      actorId: actor.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    };
    const marked = { ...state, controlledFootballerId: actor.id };
    expect(scoreActionForAI(marked, actor.id, action)).toBe(
      scoreActionForAI(state, actor.id, action),
    );
    const human = resolveMatchAction(marked, action, 'human_selected'),
      npc = resolveMatchAction(state, action, 'autonomous_npc');
    expect(human.ball).toEqual(npc.ball);
    expect(human.lastPassDiagnostic).toEqual(npc.lastPassDiagnostic);
    expect(human.decisionIndex).toBe(npc.decisionIndex);
  });
});

describe('PR156 ability and difficulty', () => {
  it('honours ground versus lofted delivery on long direct passes', () => {
    const state = fixture(),
      actor = state.players[1]!,
      receiver = state.players[5]!;
    actor.position = { x: 30, y: 6 };
    state.ball = { ...actor.position, ownerId: actor.id };
    receiver.position = { x: 80, y: 6 };
    const ground = derivePassLaunchPlan(
        state,
        actor,
        receiver,
        receiver.position,
        'direct',
        'ground',
      ),
      lofted = derivePassLaunchPlan(state, actor, receiver, receiver.position, 'direct', 'lofted');
    expect(ground.elevation).toBe(0);
    expect(ground.velocity.z).toBe(0);
    expect(lofted.elevation).toBeGreaterThan(0);
    expect(lofted.velocity.z).toBeGreaterThan(0);
  });
  it('uses broad continuous ability and range distributions with no impossible low-skill gate', () => {
    const state = fixture();
    state.scenario = 'open_play';
    delete state.restart;
    const actor = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
    )!;
    actor.position = { x: 30, y: 6 };
    actor.facingAngle = Math.PI / 2;
    state.ball = { ...actor.position, ownerId: actor.id };
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position = { x: 100, y: 65 };
      });
    const uncertainty: number[] = [];
    for (const ability of [0, 5, 10, 20, 40, 60, 80, 100]) {
      for (const key of ['passing', 'technique', 'gameReading', 'composure'] as const)
        actor.profile.attributes[key] = ability;
      const short = derivePassDifficulty(state, actor, { x: 42, y: 6 }, 'support', 'ground');
      const long = derivePassDifficulty(state, actor, { x: 80, y: 6 }, 'support', 'ground');
      expect(long.uncertaintyMetres).toBeGreaterThan(short.uncertaintyMetres * 2);
      expect(long.uncertaintyMetres).toBeGreaterThan(0);
      uncertainty.push(long.uncertaintyMetres);
      const a = interpretPassExecution(state, actor, { x: 80, y: 6 }, 'support', 'ground');
      expect(a).toEqual(interpretPassExecution(state, actor, { x: 80, y: 6 }, 'support', 'ground'));
    }
    expect(uncertainty.every((v, i) => i === 0 || v < uncertainty[i - 1]!)).toBe(true);
    expect(uncertainty[3]!).toBeGreaterThan(uncertainty[7]! * 15);
  });
  it('a weak passing attribute remains costly with otherwise professional attributes', () => {
    const state = fixture(),
      actor = state.players[1]!;
    actor.position = { x: 30, y: 6 };
    actor.facingAngle = Math.PI / 2;
    for (const key of ['technique', 'gameReading', 'composure'] as const)
      actor.profile.attributes[key] = 60;
    actor.profile.attributes.passing = 10;
    const low = derivePassDifficulty(state, actor, { x: 80, y: 50 }, 'lead', 'lofted', {
      receiverSpeed: 3,
    });
    actor.profile.attributes.passing = 90;
    const high = derivePassDifficulty(state, actor, { x: 80, y: 50 }, 'lead', 'lofted', {
      receiverSpeed: 3,
    });
    expect(low.uncertaintyMetres).toBeGreaterThan(high.uncertaintyMetres * 5);
  });
  it('range uncertainty preserves finite foot speed and records actual launch energy', () => {
    const state = fixture();
    state.scenario = 'open_play';
    delete state.restart;
    const actor = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
    )!;
    const receiver = state.players.find((p) => p.team === 'home' && p.id !== actor.id)!;
    actor.position = { x: 20, y: 6 };
    receiver.position = { x: 70, y: 50 };
    for (const key of ['passing', 'technique', 'gameReading', 'composure'] as const)
      actor.profile.attributes[key] = 5;
    state.ball = { ...actor.position, ownerId: actor.id };
    const launched = resolveMatchAction(
      state,
      {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'direct',
        delivery: 'ground',
      },
      'autonomous_npc',
    );
    const velocity = launched.ball.launchVelocity!;
    expect(launched.ball.launchSpeed).toBeLessThanOrEqual(30);
    expect(launched.ball.launchSpeed).toBeCloseTo(Math.hypot(velocity.x, velocity.y, velocity.z));
  });
  it('AI uses the same execution uncertainty and accounts for reception and recovery', () => {
    const state = fixture(),
      actor = state.players[1]!,
      receiver = state.players[5]!;
    actor.position = { x: 30, y: 6 };
    actor.facingAngle = Math.PI / 2;
    state.ball = { ...actor.position, ownerId: actor.id };
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position = { x: 100, y: 65 };
      });
    receiver.position = { x: 80, y: 6 };
    receiver.facingAngle = -Math.PI / 2;
    const physical = derivePassDifficulty(state, actor, receiver.position, 'support', 'ground', {
      receiverSpeed: Math.hypot(receiver.velocity.x, receiver.velocity.y),
    });
    const selected = evaluatePassDecision(state, actor, receiver, receiver.position, 'support');
    expect(selected.executionUncertaintyMetres).toBe(physical.uncertaintyMetres);
    expect(selected.expectedRetainedPossession).toBeLessThanOrEqual(selected.expectedCompletion);
    expect(selected.expectedReceptionQuality).toBeGreaterThanOrEqual(0);
  });
});

describe('PR156 diagnostics integrity', () => {
  it('prefers an open progressive link to a neutral return across the pitch', () => {
    const state = fixture();
    state.scenario = 'open_play';
    delete state.restart;
    state.time = 30;
    const actor = state.players.find((p) => p.team === 'home' && p.slot.position === 'left_back')!;
    const opposite = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'right_back',
    )!;
    const central = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
    )!;
    state.players.forEach((p) => {
      p.position = { x: 100, y: 65 };
      p.target = { ...p.position };
      p.velocity = { x: 0, y: 0 };
    });
    actor.position = { x: 30, y: 20 };
    opposite.position = { x: 30, y: 48 };
    central.position = { x: 40, y: 34 };
    actor.facingAngle = Math.PI / 2;
    opposite.facingAngle = -Math.PI / 2;
    central.facingAngle = -Math.PI / 2;
    state.ball = { ...opposite.position, ownerId: opposite.id };
    const previous = resolveMatchAction(
      state,
      {
        type: 'pass',
        actorId: opposite.id,
        receiverId: actor.id,
        target: actor.position,
        intent: 'support',
      },
      'autonomous_npc',
    );
    previous.ball = { ...actor.position, ownerId: actor.id };
    previous.time = 32;
    previous.lastPassDiagnostic!.resolvedAt = 31;
    const link: MatchAction = {
      type: 'pass',
      actorId: actor.id,
      receiverId: central.id,
      target: central.position,
      intent: 'progressive',
    };
    const neutralReturn: MatchAction = {
      type: 'pass',
      actorId: actor.id,
      receiverId: opposite.id,
      target: opposite.position,
      intent: 'support',
    };
    expect(scoreActionForAI(previous, actor.id, link)).toBeGreaterThan(
      scoreActionForAI(previous, actor.id, neutralReturn),
    );
    // The solution follows geometry, even when the useful receiver is labelled as a defender.
    central.slot = { ...central.slot, position: 'center_back' };
    expect(scoreActionForAI(previous, actor.id, link)).toBeGreaterThan(
      scoreActionForAI(previous, actor.id, neutralReturn),
    );
  });
  it('waiting for a high delivery creates no contact lock and permits the subsequent real control', () => {
    const state = fixture();
    state.scenario = 'open_play';
    delete state.restart;
    state.time = 30;
    state.actionCooldown = 1000;
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!,
      receiver = state.players.find((p) => p.team === actor.team && p.id !== actor.id)!;
    state.players.forEach((p) => {
      p.position = { x: 100, y: 65 };
      p.target = { ...p.position };
      p.velocity = { x: 0, y: 0 };
    });
    receiver.position = { x: 50, y: 34 };
    receiver.target = { ...receiver.position };
    for (const key of [
      'firstTouch',
      'technique',
      'composure',
      'gameReading',
      'concentration',
      'agility',
      'heading',
      'jumping',
      'strength',
    ] as const)
      receiver.profile.attributes[key] = 95;
    state.currentActorId = actor.id;
    state.ball = {
      x: 50,
      y: 34,
      from: { x: 30, y: 34 },
      target: { x: 52, y: 34 },
      travelKind: 'pass',
      sourceAction: 'pass',
      intendedReceiverId: receiver.id,
      lastTouchPlayerId: actor.id,
      height: 1.8,
      airborne: true,
      velocity: { x: 1, y: 0, z: -2 },
    };
    state.pendingReceptionIntent = {
      actorId: receiver.id,
      action: { type: 'hold', actorId: receiver.id },
      actionSource: 'autonomous_npc',
      createdAt: 30,
      expiresAt: 33,
      ballEpisode: 'pr156-high-wait',
    };
    let live = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(live.ball.ownerId).toBeUndefined();
    expect(live.lastAerialContact).toBeUndefined();
    expect(live.aerialContactLocks?.some((lock) => lock.playerId === receiver.id)).not.toBe(true);
    for (let tick = 0; tick < 30 && !live.ball.ownerId; tick++)
      live = stepTacticalMatchAfterDecisionProbe(live, 0.025);
    expect(live.ball.ownerId).toBe(receiver.id);
  });
  it('clips continuous low-airborne contact to reachable foot height', () => {
    const state = fixture();
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    const receiver = state.players.find((p) => p.team === actor.team && p.id !== actor.id)!;
    state.players.forEach((p) => {
      p.position = { x: 100, y: 65 };
    });
    receiver.position = { x: 50, y: 34 };
    state.currentActorId = actor.id;
    const high = resolveContinuousGroundPassClaim(
      state,
      { x: 49, y: 34, z: 0.9 },
      { x: 51, y: 34, z: 0.8 },
    );
    expect(high).toBeUndefined();
    const low = resolveContinuousGroundPassClaim(
      state,
      { x: 49, y: 34, z: 0.9 },
      { x: 51, y: 34, z: 0.4 },
    );
    expect(low?.playerId).toBe(receiver.id);
    expect(low?.segmentFraction).toBeGreaterThanOrEqual(0.5);
    expect(low!.segmentFraction * 0.4 + (1 - low!.segmentFraction) * 0.9).toBeLessThanOrEqual(0.65);
  });
  it('an overlap completion retains its release relationship after receiver movement', () => {
    const before = fixture();
    before.scenario = 'open_play';
    delete before.restart;
    const actor = before.players.find(
        (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
      )!,
      receiver = before.players.find((p) => p.team === 'home' && p.slot.position === 'left_back')!;
    before.ball = { ...actor.position, ownerId: actor.id };
    const launched = resolveMatchAction(
      before,
      {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      },
      'autonomous_npc',
    );
    launched.lastPassDiagnostic!.receiverRelationshipAtRelease = 'overlap';
    const a = observeMatchFlow(createMatchFlowTelemetry(before.seed), before, launched);
    const received = {
      ...launched,
      time: launched.time + 2,
      ball: { ...receiver.position, ownerId: receiver.id },
      lastResolvedPass: {
        ...launched.lastPassDiagnostic!,
        finalResult: 'completed' as const,
        actualReceiverId: receiver.id,
        actualContactPoint: receiver.position,
        resolvedAt: launched.time + 2,
      },
    };
    received.players = received.players.map((p) =>
      p.id === receiver.id ? { ...p, position: { x: 95, y: 34 } } : p,
    );
    const b = observeMatchFlow(a, launched, received);
    expect(b.overlapPassAttempts).toBe(1);
    expect(b.overlapPassCompleted).toBe(1);
  });
  it('network and central diagnostics leave the canonical snapshot untouched', () => {
    const before = fixture();
    const next = stepTacticalMatchAfterDecisionProbe(before, 0.025);
    const snapshot = structuredClone(next);
    const observer = new PassingConnectivityTracker();
    observer.observe(before, next);
    observer.snapshot();
    expect(next).toEqual(snapshot);
  });
});
