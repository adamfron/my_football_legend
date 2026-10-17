import { createFormationBenchmarkMatch } from '../src/core/matchSimulation/benchmarkFixtures';
import { pushedTouchFixture } from './pr168Fixtures';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import {
  rankAvailableActionsForAI,
  resolveMatchAction,
  chooseNpcAction,
} from '../src/core/matchSimulation/matchActions';
import { canExecuteCanonicalShot } from '../src/core/matchSimulation/shootingOptions';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision';
import { deriveOnBallPreparation } from '../src/core/matchSimulation/onBallPreparation';
import {
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import {
  awardNaturalRestart,
  applyRestartScenario,
} from '../src/core/matchSimulation/restartScenarios';
import { deriveRestartLegalReadiness } from '../src/core/matchSimulation/restartLaws';
import { projectPlayerAgency } from '../src/core/matchSimulation/playerDecision';
import { deriveCarryPursuit } from '../src/core/matchSimulation/carryPursuit';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace';
import type { MatchAction } from '../src/core/matchSimulation/matchState';

export const PR171_SHOT_CASES = [
  'unmarked_striker',
  'edge_midfielder',
  'winger_box',
  'cutback',
  'two_v_one',
  'four_v_line',
  'counter',
  'closed_block',
  'long_range',
  'first_time',
  'pushed_ball',
] as const;
export const shotProbeFixture = (
  name: (typeof PR171_SHOT_CASES)[number],
  seed = 'pr171-case-a',
) => {
  const { state } = createFormationBenchmarkMatch({
    anchor: '4-3-3',
    opponent: '4-4-2',
    attributes: 70,
    seed,
  });
  delete state.restart;
  state.time = 600;
  state.scenario = 'open_play';
  state.actionCooldown = 0;
  state.possessionTeam = 'home';
  state.timeSincePossessionChanged = 8;
  state.ballOwnershipStartedAt = 595;
  for (const p of state.players) {
    p.position = { x: p.team === 'home' ? 48 : 70, y: 4 + (p.slotIndex % 10) * 6 };
    if (p.slot.position === 'goalkeeper') p.position = { x: p.team === 'home' ? 3 : 102, y: 34 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
    p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
  }
  const actor = state.players.find(
    (p) =>
      p.team === 'home' &&
      p.slot.position ===
        (name === 'edge_midfielder' || name === 'long_range'
          ? 'central_midfielder'
          : name === 'winger_box'
            ? 'left_winger'
            : 'striker'),
  )!;
  actor.position = {
    x: name === 'long_range' ? 74 : name === 'edge_midfielder' ? 86 : 93,
    y: name === 'winger_box' ? 19 : 34,
  };
  actor.target = { ...actor.position };
  if (['two_v_one', 'cutback', 'counter', 'four_v_line'].includes(name)) {
    const support = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'right_winger',
    )!;
    support.position = { x: 94, y: 40 };
    support.target = support.position;
  }
  const defender = state.players.find(
    (p) => p.team === 'away' && p.slot.position === 'center_back',
  )!;
  if (name === 'two_v_one') defender.position = { x: 98, y: 34 };
  if (name === 'closed_block')
    for (const [i, p] of state.players
      .filter((p) => p.team === 'away' && p.slot.position !== 'goalkeeper')
      .slice(0, 5)
      .entries())
      p.position = { x: 95 + i * 0.8, y: 32 + i };
  if (name === 'four_v_line') {
    for (const [i, p] of state.players
      .filter((p) => p.team === 'home' && p.id !== actor.id && p.slot.position !== 'goalkeeper')
      .slice(0, 3)
      .entries())
      p.position = { x: 89 + i, y: 24 + i * 9 };
    for (const p of state.players.filter(
      (p) => p.team === 'away' && p.slot.position !== 'goalkeeper',
    )) {
      p.position.x = 83;
      p.velocity.x = 4;
    }
  }
  if (name === 'counter') {
    state.teams.home.phase = 'attacking_transition';
    state.timeSincePossessionChanged = 0.5;
    actor.velocity = { x: 5, y: 0 };
  }
  state.ball = {
    x: actor.position.x + 0.3,
    y: actor.position.y,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
    velocity: { x: 0, y: 0 },
  };
  state.onBallPreparation = deriveOnBallPreparation(state, actor, 'clean_control');
  state.onBallPreparation.readyAt = 599;
  if (name === 'first_time' || name === 'cutback') {
    delete state.ball.ownerId;
    state.ball.velocity = { x: -6, y: 0, z: 0 };
    state.ball.height = 0.11;
    state.ball.travelKind = 'pass';
    state.ball.intendedReceiverId = actor.id;
    state.ball.lastTouchPlayerId = state.players.find(
      (p) => p.team === 'home' && p.id !== actor.id,
    )!.id;
  }
  if (name === 'pushed_ball') {
    state.ball.x += 2.5;
    state.ball.velocity = { x: 7, y: 0 };
  }
  return { state, actorId: actor.id };
};

const shotAction = (a: MatchAction) =>
  a.type === 'shot' || (a.type === 'header' && a.intent === 'header_shot');
export const runShotProbe = (name: (typeof PR171_SHOT_CASES)[number], seed: string) => {
  const { state: initial, actorId } = shotProbeFixture(name, seed);
  const frozen = JSON.stringify(initial);
  const ranking = rankAvailableActionsForAI(initial, actorId);
  const generated = ranking.filter((r) => shotAction(r.action));
  const chosen = chooseNpcAction(initial, actorId);
  const actor = initial.players.find((p) => p.id === actorId)!;
  const opportunity = evaluateShootingOpportunity(initial, actor);
  if (JSON.stringify(initial) !== frozen) throw new Error('Frozen probe mutated canonical state');
  let state = chosen ? resolveMatchAction(initial, chosen, 'autonomous_npc') : initial;
  const releases = new Map<string, unknown>();
  const observe = () => {
    for (const shot of [state.ball.shot, state.lastShot]) if (shot) releases.set(shot.shotId, shot);
  };
  observe();
  for (let i = 0; i < 320; i++) {
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    observe();
  }
  return {
    name,
    seed,
    actorId,
    opportunity,
    generated: generated.length,
    executableAtSnapshot: generated.filter(
      (r) =>
        (r.action.type === 'shot' || r.action.type === 'header') &&
        canExecuteCanonicalShot(initial, r.action),
    ).length,
    initialChosen: chosen ?? null,
    ranking: ranking.slice(0, 8),
    shotCandidates: generated,
    normalAiExecution: true,
    shotsAfterEightSeconds: [...releases.values()],
    canonicalUnchangedByEvaluation: true,
  };
};

export const centralProbe = (
  context: 'open' | 'pressured' | 'wide_competitor' | 'gifted' | 'ordinary',
) => {
  const { state } = shotProbeFixture('edge_midfielder');
  const actor = state.players.find((p) => p.team === 'home' && p.slot.position === 'center_back')!;
  const central = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  const wide = state.players.find((p) => p.team === 'home' && p.slot.position === 'left_winger')!;
  actor.position = { x: 40, y: 34 };
  actor.target = actor.position;
  central.position = { x: 56, y: 34 };
  central.target = central.position;
  wide.position = { x: 49, y: context === 'wide_competitor' ? 22 : 8 };
  wide.target = wide.position;
  if (context === 'pressured')
    state.players.find((p) => p.team === 'away' && p.slot.position !== 'goalkeeper')!.position = {
      x: 56.5,
      y: 34.5,
    };
  if (context === 'gifted' || context === 'ordinary')
    Object.assign(central.profile.attributes, {
      firstTouch: context === 'gifted' ? 90 : 50,
      technique: context === 'gifted' ? 90 : 50,
      passing: context === 'gifted' ? 90 : 50,
      gameReading: context === 'gifted' ? 90 : 50,
    });
  state.ball = {
    ...actor.position,
    x: actor.position.x + 0.3,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
  };
  const frozen = JSON.stringify(state);
  const ranking = rankAvailableActionsForAI(state, actor.id);
  const passes = ranking
    .filter((r) => r.action.type === 'pass')
    .map((r) => {
      const a = r.action as Extract<MatchAction, { type: 'pass' }>;
      const receiver = state.players.find((p) => p.id === a.receiverId)!;
      return {
        ...r,
        position: receiver.slot.position,
        forecast: evaluatePassDecision(state, actor, receiver, a.target, a.intent, a.delivery),
      };
    });
  const tracker = new AttackingFunnelTracker(undefined, true, true);
  tracker.observe({ ...state, time: state.time - 0.025 }, state);
  if (frozen !== JSON.stringify(state)) throw new Error('CM evaluation mutated state');
  return {
    context,
    centralId: central.id,
    actorId: actor.id,
    chosen: ranking[0] ?? null,
    passes,
    audit: tracker.snapshot(state.time).audit,
    canonicalUnchangedByEvaluation: true,
  };
};

export const carryProbe = (name: string) => {
  const { state: initial, actorId } = pushedTouchFixture({
    loose: true,
    pressure: name === 'pressure',
    boundary: name === 'out',
    gap: name === 'unreachable' ? 20 : name === 'destination_reached' ? 5 : 2.6,
  });
  initial.actionCooldown = 0;
  const actor = initial.players.find((p) => p.id === actorId)!;
  if (name === 'intercepted') {
    const opponent = initial.players[15]!;
    opponent.position = { x: initial.ball.x, y: initial.ball.y };
    opponent.velocity = { x: 0, y: 0 };
    initial.ball.ownerId = opponent.id;
    initial.ball.lastTouchPlayerId = opponent.id;
  }
  if (name === 'expired') initial.ballCarrierIntent!.expiresAt = initial.time;
  const target =
    name === 'behind_ball'
      ? { x: actor.position.x - 6, y: actor.position.y }
      : name === 'sharp_turn'
        ? { x: actor.position.x, y: 15 }
        : name === 'destination_reached'
          ? { ...actor.position }
          : { x: 85, y: 34 };
  const initialPursuit = deriveCarryPursuit(initial, actor);
  const initialAgency = projectPlayerAgency(initial);
  let state =
    name === 'straight' || name === 'pressure'
      ? initial
      : resolveMatchAction(
          initial,
          { type: 'carry', actorId, target, movementMode: 'sprint' },
          'human_selected',
        );
  let recoveredAt: number | null = null,
    contactAt: number | null = null,
    firstPrompt: unknown = null;
  for (let i = 0; i < 320; i++) {
    const agency = projectPlayerAgency(state);
    if (agency.opportunity && !firstPrompt) {
      const player = state.players.find((p) => p.id === actorId)!;
      firstPrompt = {
        at: state.time,
        ownsBall: state.ball.ownerId === actorId,
        ballGap: distance(player.position, state.ball),
        destinationGap: state.ballCarrierIntent
          ? distance(player.position, state.ballCarrierIntent.target)
          : null,
        intentExpiresAt: state.ballCarrierIntent?.expiresAt ?? null,
        pursuit: Boolean(deriveCarryPursuit(state, player)),
        gate: agency.probe,
      };
    }
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    if (state.ball.ownerId === actorId && recoveredAt === null) recoveredAt = state.time;
    if (
      state.lastGroundContact?.actorId === actorId &&
      state.lastGroundContact.executed &&
      state.lastGroundContact.at > initial.time &&
      contactAt === null
    )
      contactAt = state.lastGroundContact.at;
  }
  return {
    name,
    target,
    initialPursuit: initialPursuit ?? null,
    initialAgency: initialAgency.probe,
    firstPrompt,
    recoveredAt,
    physicalContactAt: contactAt,
    endOwner: state.ball.ownerId ?? null,
    actorId,
    endBallGap: distance(state.ball, state.players.find((p) => p.id === actorId)!.position),
    endIntent: state.ballCarrierIntent ?? null,
    lastLoss: state.lastPossessionLoss ?? null,
    caveat:
      'Equivalent PR168 pushed-ball geometry; no user replay; prompts observed but no automatic human response beyond the stated initial action',
  };
};

export const restartProbe = (kind: 'indirect' | 'penalty' | 'halftime', dev = false) => {
  let { state } = shotProbeFixture('unmarked_striker');
  if (kind === 'halftime') {
    state.time = 2700;
    state.status = 'half_time';
    state = startSecondHalf(state);
  } else
    state = (dev ? applyRestartScenario : awardNaturalRestart)(
      state,
      kind === 'penalty' ? 'penalty' : 'free_kick_far',
      {
        restartTeam: 'home',
        incidentPoint: { x: 60, y: 30 },
        indirect: kind === 'indirect',
        ceremonial: true,
        cause: 'foul',
      },
    );
  const taker = state.restart!.takerId;
  state.playerAgencyEnabled = true;
  state.controlledFootballerId = taker;
  let firstPrompt: unknown = null,
    firstLegal: unknown = null;
  const keepers = () =>
    state.players
      .filter((p) => p.slot.position === 'goalkeeper')
      .map((p) => ({
        id: p.id,
        team: p.team,
        position: p.position,
        target: p.target,
        ownDepth: attacksRight(p) ? p.position.x : 105 - p.position.x,
      }));
  const start = {
    time: state.time,
    phase: state.restart?.phase,
    legal: deriveRestartLegalReadiness(state),
    keepers: keepers(),
  };
  for (let tick = 0; tick < 3600; tick++) {
    const legal = deriveRestartLegalReadiness(state),
      agency = projectPlayerAgency(state);
    if (agency.opportunity && !firstPrompt)
      firstPrompt = {
        elapsed: state.time - start.time,
        phase: state.restart?.phase,
        legal,
        keepers: keepers(),
        probe: agency.probe,
      };
    if (legal.ready && !firstLegal)
      firstLegal = {
        elapsed: state.time - start.time,
        phase: state.restart?.phase,
        legal,
        keepers: keepers(),
      };
    if (firstPrompt && firstLegal) break;
    const next = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    if (next === state) break;
    state = next;
  }
  return {
    kind,
    dev,
    start,
    firstPrompt,
    firstLegal,
    finalTime: state.time,
    finalPhase: state.restart?.phase ?? null,
    finalLegal: deriveRestartLegalReadiness(state),
    note: 'Canonical positioning only; original screenshot/projection unavailable',
  };
};

export const boundaryProbe = (defenderLast: boolean, switched: boolean, rapid = false) => {
  const { state } = shotProbeFixture('unmarked_striker');
  state.endsSwitched = switched;
  for (const p of state.players) {
    p.endsSwitched = switched;
    p.position = { x: 52, y: 20 };
  }
  const last = state.players.find((p) => p.team === (defenderLast ? 'away' : 'home'))!;
  state.ball = {
    x: switched ? 0.12 : 104.88,
    y: 12,
    height: 0.11,
    velocity: { x: switched ? -18 : 18, y: 0, z: 0 },
    lastTouchPlayerId: last.id,
    looseSince: state.time,
  };
  state.actionCooldown = 20;
  if (rapid) state.ball.lastTouchPlayerId = state.players.find((p) => p.team !== last.team)!.id;
  const next = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  return {
    defenderLast,
    switched,
    rapid,
    lastTouch: state.ball.lastTouchPlayerId,
    scenario: next.scenario,
    crossing: next.lastBoundaryCrossing,
    award: next.lastRestartAward,
    caveat:
      'Outgoing physical trajectory with supplied last touch; tests classification, not generation of a block/parry',
  };
};

/** Prescribed contact experiment, deliberately separate from normal AI choice probes. */
export const shotResolutionProbe = (context: string, seed: string) => {
  const { state: initial, actorId } = shotProbeFixture('unmarked_striker', seed);
  const keeper = initial.players.find(
    (p) => p.team === 'away' && p.slot.position === 'goalkeeper',
  )!;
  if (context === 'keeper_lateral') keeper.position.y = 36;
  if (context === 'keeper_weak')
    Object.assign(keeper.profile.attributes, { handling: 15, reflexes: 40, positioning: 40 });
  if (context.startsWith('block')) {
    const defender = initial.players.find(
      (p) => p.team === 'away' && p.slot.position === 'center_back',
    )!;
    defender.position = { x: 96, y: context === 'block_diagonal' ? 34.65 : 34 };
  }
  const action: MatchAction = {
    type: 'shot',
    actorId,
    intent: 'driven',
    contact: 'settled',
    target: { x: 105, y: 34 },
    goalTarget: {
      horizontal: context === 'wide_no_touch' ? 1.8 : context === 'keeper_lateral' ? 0.5 : 0,
      vertical: 0.24,
    },
  };
  let state = resolveMatchAction(initial, action, 'autonomous_npc');
  const shotId = state.ball.shot?.shotId;
  let outcome: unknown = null,
    firstBoundary: unknown = null;
  const touches: unknown[] = [];
  let lastTouch = initial.ball.lastTouchPlayerId;
  for (let tick = 0; tick < 320; tick++) {
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    if (state.ball.lastTouchPlayerId !== lastTouch) {
      lastTouch = state.ball.lastTouchPlayerId;
      if (touches.length < 8)
        touches.push({
          at: state.time,
          playerId: lastTouch,
          velocity: state.ball.velocity,
          point: { x: state.ball.x, y: state.ball.y },
        });
    }
    if (state.lastShot && state.lastShot.shotId === shotId && state.lastShot.outcome && !outcome)
      outcome = state.lastShot;
    if (state.lastBoundaryCrossing && !firstBoundary)
      firstBoundary = { crossing: state.lastBoundaryCrossing, award: state.lastRestartAward };
    if (outcome && (firstBoundary || state.ball.ownerId)) break;
  }
  return {
    context,
    seed,
    prescribedShot: true,
    shotId: shotId ?? null,
    outcome,
    touches,
    firstBoundary,
    endScenario: state.scenario,
    endOwner: state.ball.ownerId ?? null,
  };
};
