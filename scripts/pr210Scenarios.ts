import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createOpenPlayMatchFixture,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import { projectPlayerAgency } from '../src/core/matchSimulation/playerDecision';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry';
import { releaseContactReadiness } from '../src/core/matchSimulation/decisionReadiness';
import { deriveCarryPursuit } from '../src/core/matchSimulation/carryPursuit';
import { distance } from '../src/core/matchSimulation/matchSpace';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

const world = createCanonicalWorldDatabase();
/** A physically equivalent development checkpoint, not a recovered user save. */
export const createPr210Carry = (
  separation = 2.2,
  speed = 7,
  movementMode: 'sprint' | 'dribble' = 'sprint',
) => {
  const state = createOpenPlayMatchFixture(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr210:right-back:carry',
      control: { mode: 'spectator' },
    }),
  );
  const actor = state.players.find((p) => p.team === 'home' && p.slot.position === 'right_back')!;
  state.controlledFootballerId = actor.id;
  state.playerAgencyEnabled = true;
  state.scenario = 'open_play';
  delete state.restart;
  state.time = 20;
  state.actionCooldown = 0;
  state.ballOwnershipStartedAt = 18;
  delete state.onBallPreparation;
  for (const p of state.players) {
    p.position = { x: p.team === 'home' ? 15 : 95, y: 18 + p.slotIndex * 3 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  }
  actor.position = { x: 69.99, y: 8 };
  actor.target = { x: 96, y: 8 };
  actor.velocity = { x: 6, y: 0 };
  actor.facingAngle = Math.PI / 2;
  state.ball = {
    ...actor.position,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
    height: 0.11,
    velocity: { x: speed, y: 0, z: 0 },
    airborne: false,
  };
  const committed = resolveMatchAction(
    state,
    {
      type: 'carry',
      actorId: actor.id,
      target: actor.target,
      movementMode,
    },
    'human_selected',
  );
  committed.ball = { ...committed.ball, x: actor.position.x + separation };
  return committed;
};

export const pr210Frame = (state: TacticalMatchState) => {
  const actor = state.players.find((p) => p.id === state.controlledFootballerId)!;
  const feet = playerContactGeometry(actor);
  const agency = projectPlayerAgency(state);
  const pursuit = deriveCarryPursuit(state, actor);
  return {
    time: state.time,
    actor: {
      id: actor.id,
      position: actor.position,
      velocity: actor.velocity,
      facing: actor.facingAngle,
    },
    ball: state.ball,
    ballEpisode: state.ballEpisode,
    possession: state.humanPossessionEpisode,
    carry: state.ballCarrierIntent,
    pursuit,
    footDistance: Math.min(
      distance(feet.leftFoot, state.ball),
      distance(feet.rightFoot, state.ball),
    ),
    footReach: feet.footReach,
    readiness: releaseContactReadiness(state, actor),
    nearestOpponent: Math.min(
      ...state.players
        .filter((p) => p.team !== actor.team)
        .map((p) => distance(p.position, actor.position)),
    ),
    contact: state.lastGroundContact,
    ballContact: state.lastBallContact,
    recovery: state.lastBallRecovery,
    acquisition: state.ballAcquisition,
    possessionChange: state.lastPossessionChange,
    scenario: state.scenario,
    restart: state.restart,
    decision: agency.opportunity && {
      kind: agency.opportunity.kind,
      trigger: agency.opportunity.triggerReason,
      actionFamilies: agency.opportunity.options.map((o) =>
        o.kind === 'action' ? o.action.type : `movement:${o.intent.type}`,
      ),
    },
  };
};

export const createPr210Cases = () => {
  const recovered = createPr210Carry(4);
  const short = createPr210Carry(0.4, 3, 'dribble');
  const intercepted = createPr210Carry(4, 3);
  const opponent = intercepted.players.find(
    (p) => p.team === 'away' && p.slot.position !== 'goalkeeper',
  )!;
  opponent.position = { x: intercepted.ball.x + 0.4, y: 8 };
  opponent.target = { ...opponent.position };
  const teammate = structuredClone(intercepted);
  const foe = teammate.players.find((p) => p.id === opponent.id)!;
  foe.position = { x: 95, y: 60 };
  const mate = teammate.players.find(
    (p) =>
      p.team === 'home' &&
      p.id !== teammate.controlledFootballerId &&
      p.slot.position !== 'goalkeeper',
  )!;
  mate.position = { x: teammate.ball.x + 0.4, y: 8 };
  mate.target = { ...mate.position };
  const boundary = createPr210Carry();
  boundary.players.find((p) => p.id === boundary.controlledFootballerId)!.position.y = 66;
  boundary.ball.y = 67.99;
  boundary.ball.velocity = { x: 0, y: 10, z: 0 };
  const failed = createPr210Carry(7, 20);
  const intervention = createPr210Carry();
  const defender = intervention.players.find(
    (p) => p.team === 'away' && p.slot.position !== 'goalkeeper',
  )!;
  defender.position = { x: 71.7, y: 8.4 };
  defender.target = { ...defender.position };
  return { recovered, short, intercepted, teammate, boundary, failed, intervention };
};

export const tracePr210Carry = (initial: TacticalMatchState, ticks = 240) => {
  let state = structuredClone(initial);
  const frames = [pr210Frame(state)];
  for (let i = 0; i < ticks; i++) {
    if (projectPlayerAgency(state).opportunity || state.scenario !== 'open_play') break;
    state = stepTacticalMatch(state, 0.025);
    frames.push(pr210Frame(state));
  }
  return { state, frames };
};
