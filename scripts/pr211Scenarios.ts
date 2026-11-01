import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { projectPlayerAgency } from '../src/core/matchSimulation/playerDecision';
import {
  temporalFootPath,
  ZERO_TEMPORAL_ERROR,
} from '../src/core/matchSimulation/temporalFootStrike';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';

export const createPr211Scene = (name = 'ordinary', timing?: number) => {
  const f = createKickFixture({ seed: 'pr211-canonical-contact' });
  const { state, actor, opponent } = f;
  delete state.experimentalKickExecution;
  state.experimentalPendingStrike = 'low-pass-dev-v1';
  state.ballEnvironment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' };
  state.playerAgencyEnabled = false;
  state.controlledFootballerId = actor.id;
  state.ball.lastTouchPlayerId = actor.id;
  actor.position.y += 0.17;
  actor.profile.dominantFoot = 'right';
  actor.target = { ...actor.position };
  state.playerMovementIntent = {
    actorId: actor.id,
    type: 'hold_shape',
    target: { ...actor.position },
    startedAt: state.time,
    expiresAt: state.time + 3,
  };
  state.ball.velocity = { x: 0.5, y: 0, z: 0 };
  if (name === 'crossing') state.ball.velocity = { x: 0, y: 3, z: 0 };
  if (name === 'timing') state.ball.velocity = { x: 0, y: 1, z: 0 };
  if (name === 'miss') state.ball.velocity = { x: 8, y: 0, z: 0 };
  if (name === 'advance') actor.velocity = { x: 3, y: 0 };
  if (name === 'brake') actor.velocity = { x: 6, y: 0 };
  if (name === 'turn') {
    actor.velocity = { x: 2, y: 0 };
    state.playerMovementIntent.target = { x: actor.position.x, y: actor.position.y + 5 };
  }
  if (name === 'penetration') actor.position.x = state.ball.x - 0.2;
  if (name === 'weak-foot' && f.action.type === 'pass') {
    f.action.foot = 'left';
    actor.profile.weakFootProficiency = 15;
  }
  if (name === 'hurried')
    state.onBallPreparation = {
      actorId: actor.id,
      gainedAt: state.time,
      readyAt: state.time + 0.2,
      kind: 'settling',
      incomingSpeed: 0.5,
    };
  if (name === 'defender-first' || name === 'defender-late' || name === 'teammate-first') {
    const defender = name === 'teammate-first' ? f.receiver : opponent;
    defender.position = {
      x: state.ball.x + (name === 'defender-late' ? 1.5 : 0.34),
      y: state.ball.y - 0.17,
    };
    defender.velocity = { x: -3, y: 0 };
    defender.facingAngle = -Math.PI / 2;
    defender.target = { ...defender.position };
    defender.anchor = { ...defender.position };
    defender.neutralAnchor = { ...defender.position };
  }
  if (name === 'touchline' || name === 'goal-line' || name === 'goal-post') {
    const offset =
      name === 'touchline'
        ? { x: 0, y: -34.05 }
        : name === 'goal-post'
          ? { x: 74.95, y: -3.66 }
          : { x: 75.05, y: -20 };
    state.ball.x += offset.x;
    state.ball.y += offset.y;
    actor.position.x += offset.x;
    actor.position.y += offset.y;
    state.playerMovementIntent.target = { ...actor.position };
    state.ball.velocity = name === 'touchline' ? { x: 0, y: -5, z: 0 } : { x: 5, y: 0, z: 0 };
  }
  const initial = structuredClone(state);
  let selected = resolveMatchAction(state, f.action, 'human_selected');
  if (timing !== undefined && selected.pendingStrike) {
    // Explicit engineering timing intervention, no endpoint error and no new sample.
    const perturbation = { ...ZERO_TEMPORAL_ERROR, timingSeconds: timing };
    selected = {
      ...selected,
      pendingStrike: {
        ...selected.pendingStrike,
        perturbation,
        path: temporalFootPath(selected.pendingStrike.plan, perturbation),
      },
    };
  }
  return { ...f, initial, selected };
};

export const pr211Frame = (input: TacticalMatchState) => {
  // The save schema is the contract: do not hash accidental extra properties on legacy 2D points.
  const s = tacticalMatchStateSchema.parse(input) as unknown as TacticalMatchState;
  return {
    time: s.time,
    phase: s.pendingStrike?.phase,
    actionId: s.pendingStrike?.id ?? s.lastStrikeResolution?.id,
    ballEpisode: s.ballEpisode ?? 0,
    actor: s.players.find((p) => p.id === s.controlledFootballerId),
    ball: s.ball,
    resolution: s.lastStrikeResolution,
    decisionIndex: s.decisionIndex,
    decision: projectPlayerAgency(s),
    events: s.actionEvents,
    statistics: s.statistics,
    scenario: s.scenario,
    score: s.score,
    groundContact: s.lastGroundContact,
    possessionChange: s.lastPossessionChange,
    restart: s.lastRestartAward,
    rngIdentity: {
      seed: s.seed,
      decisionIndex: s.decisionIndex,
      perturbation: s.pendingStrike?.perturbation,
    },
  };
};

export const tracePr211 = (initial: TacticalMatchState, ticks = 12) => {
  let state = initial;
  const frames = [pr211Frame(state)];
  for (let i = 0; i < ticks; i++) {
    state = stepTacticalMatch(state, 0.025);
    frames.push(pr211Frame(state));
  }
  return { state, frames };
};
