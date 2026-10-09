// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { advanceBackgroundBatch, MATCH_PRESENTATION_POLICIES, projectMatchMoment } from '.';
import { evaluateActionImpact } from './actionImpact';
import {
  enumerateAvailableActions,
  rankAvailableActionsForAI,
  resolveMatchAction,
} from './matchActions';
import { distance, fieldValue } from './matchSpace';
import { createTacticalMatch, stepTacticalMatch } from './matchSimulation';
import {
  evaluateOnBallDecisionRelevance,
  evaluateDefensiveCommitment,
  projectPlayerAgency,
  resolveDevPlayerDecision,
} from './playerDecision';
import { hasActiveHumanPossession, humanPossessionRedecisionReason } from './possessionAgency';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { deriveStructuralPosition } from './tacticalPositioning';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const spectator = createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'pr148:balanced-balanced:agency-fixture',
    control: { mode: 'spectator' },
  });
  const player = spectator.home.players.find(
    (entry) => entry.profile.primaryPosition === 'central_midfielder',
  )!;
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      ...spectator.setup,
      control: {
        mode: 'player',
        clubId: world.clubs[0]!.id,
        footballerId: player.footballerId,
        forceIntoXI: false,
      },
    }),
  );
  state.time = 20;
  state.scenario = 'open_play';
  delete state.restart;
  state.actionCooldown = 0;
  state.ballOwnershipStartedAt = 10;
  delete state.onBallPreparation;
  state.players = state.players.map((player) => ({
    ...player,
    position: { x: player.team === 'home' ? 10 : 95, y: 8 + player.slotIndex * 4 },
    target: { x: player.team === 'home' ? 10 : 95, y: 8 + player.slotIndex * 4 },
    velocity: { x: 0, y: 0 },
  }));
  const actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
  const mates = state.players.filter(
    (player) =>
      player.team === actor.team &&
      player.id !== actor.id &&
      player.profile.primaryPosition !== 'goalkeeper',
  );
  const defender = state.players.find(
    (player) => player.team !== actor.team && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  actor.position = { x: 47, y: 25 };
  actor.target = actor.position;
  actor.facingAngle = Math.PI / 2;
  const forward = mates[0]!;
  const recycle = mates[1]!;
  forward.position = { x: 67, y: 32 };
  forward.target = forward.position;
  recycle.position = { x: 49, y: 44 };
  recycle.target = recycle.position;
  defender.position = { x: 59, y: 35 };
  defender.target = defender.position;
  state.ball = { ...actor.position, ownerId: actor.id };
  state.teams.home.phase = 'positional_attack';
  state.teams.home.style = 'balanced';
  return { state, actor, forward, recycle, defender };
};

describe('PR148 substantial midfield route choices', () => {
  it('surfaces a near-best line-breaking outlet even when recycling ranks first', () => {
    const { state, actor, forward, recycle } = fixture();
    const canonical = rankAvailableActionsForAI(state, actor.id);
    const recycling = canonical.find(
      ({ action }) => action.type === 'pass' && action.receiverId === recycle.id,
    )!;
    // Exercise the relevance projection's supplied-ranking contract. PR156 can rank the
    // forward link first physically; this fixture must still cover a near-best alternative
    // when a safe recycle leads, without requiring the former unconditional width bonus.
    const ranked = [
      { ...recycling, canonicalScore: canonical[0]!.canonicalScore + 2 },
      ...canonical.filter((r) => r !== recycling),
    ];
    expect(evaluateActionImpact(state, ranked[0]!.action).family).toBe('routine');
    expect(fieldValue(forward.position, actor.team)).toBeLessThan(55);
    expect(evaluateOnBallDecisionRelevance(state, actor.id, ranked)).toMatchObject({
      relevant: true,
      reasons: expect.arrayContaining(['line_breaking_outlet_choice']),
    });
    expect(projectPlayerAgency(state).opportunity?.kind).toBe('on_ball');
  });

  it('keeps short recycling and forward passes without a defensive line routine', () => {
    const short = fixture();
    short.forward.position = { x: 64.9, y: 32 };
    short.forward.target = short.forward.position;
    expect(evaluateOnBallDecisionRelevance(short.state, short.actor.id).relevant).toBe(false);
    const open = fixture();
    open.defender.position = { x: 95, y: 60 };
    expect(evaluateOnBallDecisionRelevance(open.state, open.actor.id).relevant).toBe(false);
  });

  it('recognizes distinct competitive forward receivers within one action family', () => {
    const { state, actor, recycle } = fixture();
    recycle.position = { x: 65, y: 50 };
    recycle.target = recycle.position;
    const passes = rankAvailableActionsForAI(state, actor.id).filter(
      ({ action }) => action.type === 'pass' && ['progressive'].includes(action.intent),
    );
    expect(
      new Set(passes.map(({ action }) => (action.type === 'pass' ? action.receiverId : ''))).size,
    ).toBeGreaterThan(1);
    expect(evaluateOnBallDecisionRelevance(state, actor.id).reasons).toContain(
      'line_breaking_outlet_choice',
    );
  });

  it('retains the same midfield decision and canonical state across every viewing policy', () => {
    const { state } = fixture();
    const snapshot = structuredClone(state);
    const opportunity = projectPlayerAgency(state).opportunity!;
    for (const policy of Object.values(MATCH_PRESENTATION_POLICIES)) {
      const stopped = advanceBackgroundBatch({
        state,
        maxTicks: 80,
        policy,
        project: (current) => projectMatchMoment(current, opportunity),
        advance: stepTacticalMatch,
        isRunning: () => true,
      });
      expect(stopped.stopReason).toBe('human_decision');
      expect(stopped.state).toBe(state);
      expect(projectPlayerAgency(stopped.state).opportunity).toEqual(opportunity);
    }
    expect(state).toEqual(snapshot);
  });
});

describe('PR148 defensive responsibility', () => {
  const defensiveFixture = () => {
    const { state } = fixture();
    const actor = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'left_back',
    )!;
    const cover = state.players.find(
      (player) => player.team === actor.team && player.profile.primaryPosition === 'center_back',
    )!;
    state.possessionTeam = 'away';
    state.teams.home.phase = 'defensive_block';
    state.players
      .filter((player) => player.team === 'home')
      .forEach((player) => {
        player.position = { x: 10, y: 60 };
      });
    const structure = deriveStructuralPosition(state, actor);
    actor.position = { ...structure };
    return { state, actor, cover, structure };
  };

  it('measures a line adjustment against the moving team block', () => {
    const { state, actor, structure } = defensiveFixture();
    actor.position = { x: structure.x - 6, y: structure.y };
    actor.anchor = { x: structure.x - 8, y: structure.y };
    expect(distance(actor.anchor, structure) - distance(actor.anchor, actor.position)).toBe(6);
    expect(evaluateDefensiveCommitment(state, actor.id, structure, 'intercept')).toMatchObject({
      meaningful: false,
      reason: 'routine_line_adjustment',
      shapeDeparture: 0,
    });
  });

  it('distinguishes a safely covered interception from an uncovered step out', () => {
    const { state, actor, cover, structure } = defensiveFixture();
    const point = { x: structure.x + 8, y: structure.y };
    expect(evaluateDefensiveCommitment(state, actor.id, point, 'intercept')).toMatchObject({
      meaningful: true,
      reason: 'significant_step_out',
    });
    cover.position = { x: structure.x - 6, y: structure.y + 7 };
    expect(evaluateDefensiveCommitment(state, actor.id, point, 'intercept').meaningful).toBe(false);
    cover.position.y = structure.y + 20;
    expect(evaluateDefensiveCommitment(state, actor.id, point, 'intercept').meaningful).toBe(true);
  });

  it('preserves dangerous receivers and protected runners even with another defender covering', () => {
    const { state, actor, cover, structure } = defensiveFixture();
    cover.position = { x: structure.x - 6, y: structure.y + 7 };
    expect(
      evaluateDefensiveCommitment(state, actor.id, { x: 20, y: 34 }, 'intercept'),
    ).toMatchObject({
      meaningful: true,
      reason: 'dangerous_receiver',
    });
    const runner = state.players.find(
      (player) => player.team !== actor.team && player.id !== state.ball.ownerId,
    )!;
    runner.position = { x: structure.x - 10, y: structure.y };
    expect(
      evaluateDefensiveCommitment(
        state,
        actor.id,
        { x: structure.x + 8, y: structure.y },
        'intercept',
      ),
    ).toMatchObject({
      meaningful: true,
      reason: 'protect_dangerous_space',
    });
  });

  it.each([3, 4.4])('keeps a harmless %.1f m close-down autonomous', (metres) => {
    const { state, actor, defender } = fixture();
    defender.position = { x: actor.position.x + metres, y: actor.position.y };
    state.ball = { ...defender.position, ownerId: defender.id };
    state.possessionTeam = defender.team;
    expect(projectPlayerAgency(state).probe).toMatchObject({
      blockedReason: 'routine',
      ownershipReason: 'routine_close_down',
    });
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
  });
});

describe('PR148 explicit DEV possession continuity', () => {
  it('commits a canonical DEV-ranked hold without opening another menu on the next tick', () => {
    const { state, actor, recycle, forward } = fixture();
    state.ballOwnershipStartedAt = state.time;
    state.decisionIndex = 2;
    recycle.position = { x: 35, y: 44 };
    recycle.target = recycle.position;
    // Preserve a near-best meaningful release while hold wins the seeded DEV ranking.
    // PR158's independent patience/progression axes move the old 67m route below that band.
    forward.position = { x: 68, y: 32 };
    forward.target = forward.position;
    expect(evaluateOnBallDecisionRelevance(state, actor.id).reasons).toContain(
      'line_breaking_outlet_choice',
    );
    const opportunity = projectPlayerAgency(state).opportunity!;
    expect(opportunity?.kind).toBe('on_ball');
    expect(rankAvailableActionsForAI(state, actor.id)[0]?.action.type).toBe('hold');
    const result = resolveDevPlayerDecision(state, opportunity);
    expect(result.status).toBe('resolved_action');
    expect(result.state.latestAction?.type).toBe('hold');
    expect(result.state.latestActionSource).toBe('dev_ai_selected');
    expect(hasActiveHumanPossession(result.state)).toBe(true);
    const snapshot = structuredClone(result.state);
    const duplicate = resolveDevPlayerDecision(result.state, opportunity);
    expect(duplicate.status).toBe('terminal_or_no_longer_relevant');
    expect(duplicate.state).toBe(result.state);
    expect(result.state).toEqual(snapshot);
    expect(projectPlayerAgency(stepTacticalMatch(result.state, 0.025)).probe.blockedReason).toBe(
      'possession_continuity',
    );
  });

  it('retains a delegated hold until a substantial physical situation changes', () => {
    const { state, actor, defender } = fixture();
    const opportunity = projectPlayerAgency(state).opportunity!;
    const held = resolveMatchAction(
      {
        ...state,
        playerDecisionGate: {
          lastSituationSignature: opportunity.signature,
          lastResolvedAt: state.time,
        },
      },
      { type: 'hold', actorId: actor.id },
      'dev_ai_selected',
    );
    expect(hasActiveHumanPossession(held)).toBe(true);
    expect(held.latestActionSource).toBe('dev_ai_selected');
    const advanced = stepTacticalMatch(held, 0.025);
    expect(advanced.time).toBeCloseTo(held.time + 0.025);
    expect(projectPlayerAgency(advanced).probe.blockedReason).toBe('possession_continuity');
    expect(advanced.latestAction).toEqual(held.latestAction);
    expect(advanced.decisionIndex).toBe(held.decisionIndex);
    const pressured = {
      ...advanced,
      players: advanced.players.map((player) =>
        player.id === defender.id
          ? { ...player, position: { x: actor.position.x, y: actor.position.y + 2 } }
          : player,
      ),
    };
    expect(humanPossessionRedecisionReason(pressured)).toBe('major_pressure');
    expect(projectPlayerAgency(pressured).opportunity?.kind).toBe('on_ball');
  });

  it('treats a delegated carry as one committed destination and resurfaces its waypoint', () => {
    const { state, actor } = fixture();
    const opportunity = projectPlayerAgency(state).opportunity!;
    const target = { x: 55, y: 25 };
    const carried = resolveMatchAction(
      {
        ...state,
        playerDecisionGate: {
          lastSituationSignature: opportunity.signature,
          lastResolvedAt: state.time,
        },
      },
      { type: 'carry', actorId: actor.id, target },
      'dev_ai_selected',
    );
    expect(carried.ballCarrierIntent?.humanSelected).toBe(true);
    expect(carried.postActionAgencyCheckpoint?.actorId).toBe(actor.id);
    expect(hasActiveHumanPossession(carried)).toBe(true);
    expect(projectPlayerAgency(carried).opportunity).toBeUndefined();
    const advanced = stepTacticalMatch(carried, 0.025);
    expect(advanced.time).toBeGreaterThan(carried.time);
    expect(advanced.latestActionSource).toBe('dev_ai_selected');
    const waypoint = {
      ...advanced,
      players: advanced.players.map((player) =>
        player.id === actor.id ? { ...player, position: { x: target.x - 1, y: target.y } } : player,
      ),
      ball: { ...advanced.ball, x: target.x - 1, y: target.y },
    };
    expect(projectPlayerAgency(waypoint).opportunity?.triggerReason).toBe(
      'carry_decision_waypoint',
    );
    expect(stepTacticalMatch(waypoint, 0.025)).toBe(waypoint);
  });

  it('does not let a physically available speculative shot bypass the resolved-situation gate', () => {
    const { state, actor } = fixture();
    expect(
      enumerateAvailableActions(state, actor.id).some((action) => action.type === 'shot'),
    ).toBe(true);
    expect(['speculative', 'non_viable']).toContain(
      evaluateShootingOpportunity(state, actor).category,
    );
    expect(projectPlayerAgency(state).opportunity?.kind).toBe('on_ball');
    const gated = {
      ...state,
      playerDecisionGate: {
        lastSituationSignature: 'different_prior_situation',
        lastResolvedAt: state.time,
      },
    };
    expect(projectPlayerAgency(gated).probe.blockedReason).toBe('cooldown');
    const credible = {
      ...gated,
      players: gated.players.map((player) =>
        player.id === actor.id ? { ...player, position: { x: 94, y: 34 } } : player,
      ),
      ball: { ...gated.ball, x: 94, y: 34 },
    };
    expect(['credible', 'high_value']).toContain(
      evaluateShootingOpportunity(
        credible,
        credible.players.find((player) => player.id === actor.id)!,
      ).category,
    );
    expect(projectPlayerAgency(credible).opportunity?.kind).toBe('on_ball');
  });

  it.each(['half_time', 'full_time', 'abandoned'] as const)(
    'preserves %s state on a stale DEV selection',
    (status) => {
      const { state } = fixture();
      const opportunity = projectPlayerAgency(state).opportunity!;
      const terminal = { ...state, status };
      const snapshot = structuredClone(terminal);
      const result = resolveDevPlayerDecision(terminal, opportunity);
      expect(result.status).toBe('terminal_or_no_longer_relevant');
      expect(result.state).toBe(terminal);
      expect(terminal).toEqual(snapshot);
    },
  );
});
