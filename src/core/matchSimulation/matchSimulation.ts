import { deriveCanonicalCoachProfile } from '../coachProfiles';
import type { SingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  chooseNpcAction,
  chooseRestartAction,
  evaluatePressure,
  resolveMatchAction,
} from './matchActions';
import { clampPitchPoint, distance, distanceToSegment, type TeamSide } from './matchSpace';
import type { MatchPlayerState, MatchPhase, TacticalMatchState } from './matchState';
import { deriveNeutralFormationAnchor, deriveTacticalTargets } from './tacticalPositioning';
import { applyRestartScenario } from './restartScenarios';

const transitionPhase = (owns: boolean): MatchPhase =>
  owns ? 'attacking_transition' : 'defensive_transition';
const settledPhase = (owns: boolean): MatchPhase =>
  owns ? 'positional_attack' : 'defensive_block';

export const createTacticalMatch = (session: SingleMatchSession): TacticalMatchState => {
  const build = (side: TeamSide, team: SingleMatchSession['home']): MatchPlayerState[] =>
    team.players.map((player) => {
      const prototype = { slot: player.slot, team: side, profile: player.profile };
      const anchor = deriveNeutralFormationAnchor(prototype);
      return {
        id: player.footballerId,
        team: side,
        profile: player.profile,
        slotIndex: player.slotIndex,
        slot: player.slot,
        duty: player.slot.duty ?? 'support',
        position: anchor,
        target: anchor,
        velocity: { x: 0, y: 0 },
        anchor,
        neutralAnchor: anchor,
        idealTarget: anchor,
        meanPosition: anchor,
        samples: 1,
      };
    });
  const players = [...build('home', session.home), ...build('away', session.away)];
  const owner = session.home.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!;
  const state: TacticalMatchState = {
    seed: session.setup.seed,
    time: 0,
    decisionIndex: 0,
    teams: {
      home: {
        side: 'home',
        clubId: session.home.club.id,
        formation: session.home.formation,
        style: deriveCanonicalCoachProfile(session.home.club.managerId ?? 'manager').tacticalStyle,
        phase: 'positional_attack',
        phaseElapsed: 0,
      },
      away: {
        side: 'away',
        clubId: session.away.club.id,
        formation: session.away.formation,
        style: deriveCanonicalCoachProfile(session.away.club.managerId ?? 'manager').tacticalStyle,
        phase: 'defensive_block',
        phaseElapsed: 0,
      },
    },
    players,
    ball: {
      ...players.find((p) => p.id === owner.footballerId)!.position,
      ownerId: owner.footballerId,
    },
    possessionTeam: 'home',
    timeSincePossessionChanged: 0,
    actionCooldown: 0.4,
    score: { home: 0, away: 0 },
    currentPressure: 0,
    scenario: 'open_play',
    ...(session.setup.control.mode === 'player'
      ? { controlledFootballerId: session.setup.control.footballerId }
      : {}),
  };
  return { ...state, players: deriveTacticalTargets(state) };
};

const changePossession = (
  state: TacticalMatchState,
  ownerId: string,
  cause: 'tackle' | 'interception' | 'claim' = 'claim',
) => {
  const owner = state.players.find((p) => p.id === ownerId)!;
  if (owner.team === state.possessionTeam) return { ...state, ball: { ...state.ball, ownerId } };
  const teams = { ...state.teams };
  for (const side of ['home', 'away'] as const)
    teams[side] = { ...teams[side], phase: transitionPhase(side === owner.team), phaseElapsed: 0 };
  return {
    ...state,
    teams,
    possessionTeam: owner.team,
    timeSincePossessionChanged: 0,
    ball: { x: owner.position.x, y: owner.position.y, ownerId },
    lastPossessionChange: { at: state.time, from: state.possessionTeam, to: owner.team, cause },
  };
};

const makeLoose = (state: TacticalMatchState, velocity = { x: 0, y: 0 }): TacticalMatchState => ({
  ...state,
  ball: { x: state.ball.x, y: state.ball.y, velocity, looseSince: state.time },
});

const resolveShot = (state: TacticalMatchState): TacticalMatchState => {
  const action = state.currentAction;
  if (action?.type !== 'shot') return state;
  const shooter = state.players.find((p) => p.id === action.actorId)!;
  const keeper = state.players.find(
    (p) => p.team !== shooter.team && p.profile.primaryPosition === 'goalkeeper',
  )!;
  const defenders = state.players.filter(
    (p) =>
      p.team !== shooter.team &&
      p.id !== keeper.id &&
      distanceToSegment(p.position, shooter.position, action.target) < 2.1,
  );
  const pressure = evaluatePressure(state, shooter).value;
  const rng = RandomGenerator.fromSeed(`${state.seed}:shot:${state.decisionIndex}`);
  const range = distance(shooter.position, action.target);
  const quality =
    (shooter.profile.attributes.finishing +
      shooter.profile.attributes.technique +
      shooter.profile.attributes.composure) /
      300 -
    range / 85 -
    pressure * 0.3;
  const save =
    (keeper.profile.attributes.reflexes +
      keeper.profile.attributes.handling +
      keeper.profile.attributes.oneOnOnes) /
      300 +
    Math.max(0, 1 - distance(keeper.position, action.target) / 12) * 0.2;
  let result: 'goal' | 'save' | 'block' | 'miss';
  if (defenders.length && rng.bool(Math.min(0.62, 0.16 + defenders.length * 0.11 + pressure * 0.2)))
    result = 'block';
  else if (rng.float() > Math.max(0.18, Math.min(0.9, 0.64 + quality * 0.32))) result = 'miss';
  else if (rng.bool(Math.max(0.12, Math.min(0.78, save * 0.58 - quality * 0.18)))) result = 'save';
  else result = 'goal';
  if (result === 'goal') {
    const score = { ...state.score, [shooter.team]: state.score[shooter.team] + 1 };
    return applyRestartScenario({ ...state, score, lastShotResult: result }, 'kick_off');
  }
  if (result === 'miss')
    return applyRestartScenario({ ...state, lastShotResult: result }, 'goal_kick');
  if (result === 'save' && rng.bool(Math.min(0.85, keeper.profile.attributes.handling / 110)))
    return changePossession(
      { ...state, lastShotResult: result, ball: { ...keeper.position } },
      keeper.id,
      'claim',
    );
  return makeLoose(
    { ...state, lastShotResult: result },
    { x: shooter.team === 'home' ? -5 : 5, y: (rng.float() - 0.5) * 8 },
  );
};

export const stepTacticalMatch = (
  input: TacticalMatchState,
  rawDelta = 0.1,
): TacticalMatchState => {
  const dt = Math.min(0.25, Math.max(0.01, rawDelta));
  let state = {
    ...input,
    time: input.time + dt,
    timeSincePossessionChanged: input.timeSincePossessionChanged + dt,
    actionCooldown: Math.max(0, input.actionCooldown - dt),
    teams: { ...input.teams },
  };
  if (state.restart?.phase === 'setup' && state.time - state.restart.startedAt >= 2.1) {
    const action = chooseRestartAction(state);
    if (action) state = resolveMatchAction(state, action);
  }
  if (
    state.restart?.phase === 'release' &&
    state.time - (state.restart.executedAt ?? state.time) >= 4
  ) {
    const { restart: _restart, ...openPlay } = state;
    void _restart;
    state = { ...openPlay, scenario: 'open_play' };
  }
  for (const side of ['home', 'away'] as const) {
    const team = state.teams[side],
      elapsed = team.phaseElapsed + dt;
    state.teams[side] = {
      ...team,
      phaseElapsed: elapsed,
      phase:
        elapsed > 2.8 &&
        (team.phase === 'attacking_transition' || team.phase === 'defensive_transition')
          ? settledPhase(side === state.possessionTeam)
          : team.phase,
    };
  }
  state.players = deriveTacticalTargets(state).map((player) => {
    if (state.restart?.phase === 'setup') return { ...player, velocity: { x: 0, y: 0 } };
    const dx = player.target.x - player.position.x,
      dy = player.target.y - player.position.y,
      d = Math.max(0.001, Math.hypot(dx, dy));
    const quality =
      (player.profile.attributes.pace * 0.65 + player.profile.attributes.agility * 0.35) / 100;
    const maxSpeed = 3.7 + quality * 3;
    const desiredVelocity = {
      x: (dx / d) * Math.min(maxSpeed, d / dt),
      y: (dy / d) * Math.min(maxSpeed, d / dt),
    };
    const agility = player.profile.attributes.agility / 100;
    const acceleration = (3.2 + agility * 5.5) * dt;
    const velocityDelta = {
      x: desiredVelocity.x - player.velocity.x,
      y: desiredVelocity.y - player.velocity.y,
    };
    const velocityDeltaLength = Math.hypot(velocityDelta.x, velocityDelta.y);
    const velocityScale =
      velocityDeltaLength > acceleration ? acceleration / velocityDeltaLength : 1;
    const velocity = {
      x: player.velocity.x + velocityDelta.x * velocityScale,
      y: player.velocity.y + velocityDelta.y * velocityScale,
    };
    let next = clampPitchPoint({
      x: player.position.x + velocity.x * dt,
      y: player.position.y + velocity.y * dt,
    });
    const close = state.players.filter(
      (p) => p.id !== player.id && distance(p.position, next) < 1.15,
    );
    for (const other of close) {
      const ox = next.x - other.position.x,
        oy = next.y - other.position.y,
        od = Math.max(0.1, Math.hypot(ox, oy));
      next = clampPitchPoint({ x: next.x + (ox / od) * 0.12, y: next.y + (oy / od) * 0.12 });
    }
    const samples = player.samples + 1;
    return {
      ...player,
      position: next,
      velocity: { x: (next.x - player.position.x) / dt, y: (next.y - player.position.y) / dt },
      samples,
      meanPosition: {
        x: (player.meanPosition.x * player.samples + next.x) / samples,
        y: (player.meanPosition.y * player.samples + next.y) / samples,
      },
    };
  });
  if (state.ball.travelDuration && state.ball.from && state.ball.target) {
    const elapsed = (state.ball.travelElapsed ?? 0) + dt,
      t = Math.min(1, elapsed / state.ball.travelDuration);
    state.ball = {
      ...state.ball,
      x: state.ball.from.x + (state.ball.target.x - state.ball.from.x) * t,
      y: state.ball.from.y + (state.ball.target.y - state.ball.from.y) * t,
      travelElapsed: elapsed,
    };
    if (state.ball.travelKind !== 'shot') {
      const passer = state.players.find((p) => p.id === state.currentActorId);
      const candidate =
        passer &&
        state.players
          .filter(
            (p) =>
              p.team !== passer.team &&
              p.profile.primaryPosition !== 'goalkeeper' &&
              distance(p.position, state.ball) < 2.2,
          )
          .sort((a, b) => distance(a.position, state.ball) - distance(b.position, state.ball))[0];
      if (candidate && (state.ball.travelElapsed ?? 0) < (state.ball.travelDuration ?? 0)) {
        const rng = RandomGenerator.fromSeed(
          `${state.seed}:flight:${state.decisionIndex}:${Math.floor(elapsed * 10)}:${candidate.id}`,
        );
        const reading =
          (candidate.profile.attributes.gameReading +
            candidate.profile.attributes.positioning +
            candidate.profile.attributes.pace) /
          300;
        if (rng.bool(0.12 + reading * 0.42))
          return changePossession(
            { ...state, ball: { ...candidate.position } },
            candidate.id,
            'interception',
          );
      }
    }
    if (t >= 1) {
      if (state.ball.travelKind === 'shot') return resolveShot(state);
      const receiver = state.players.find((p) => p.id === state.ball.intendedReceiverId)!;
      const passer = state.players.find((p) => p.id === state.currentActorId)!;
      const laneDefenders = state.players
        .filter((p) => p.team !== passer.team && distance(p.position, state.ball) < 4)
        .sort((a, b) => distance(a.position, state.ball) - distance(b.position, state.ball));
      const rng = RandomGenerator.fromSeed(`${state.seed}:pass:${state.decisionIndex}`);
      const length = distance(passer.position, receiver.position);
      const chance = Math.max(
        0.35,
        Math.min(
          0.96,
          0.58 +
            (passer.profile.attributes.passing +
              passer.profile.attributes.technique +
              passer.profile.attributes.composure) /
              500 -
            length / 120 -
            (laneDefenders[0]?.profile.attributes.gameReading ?? 0) / 650,
        ),
      );
      if (
        state.ball.travelKind === 'restart' &&
        (state.scenario === 'goal_kick' ||
          state.scenario === 'corner' ||
          state.scenario.startsWith('free_kick'))
      )
        return makeLoose(state);
      const owner = rng.bool(chance) || !laneDefenders[0] ? receiver : laneDefenders[0];
      state = changePossession(
        { ...state, ball: { x: owner.position.x, y: owner.position.y } },
        owner.id,
        owner === receiver ? 'claim' : 'interception',
      );
    }
  } else if (!state.ball.ownerId && state.ball.looseSince !== undefined) {
    const velocity = state.ball.velocity ?? { x: 0, y: 0 },
      looseSince = state.ball.looseSince;
    state.ball = {
      ...state.ball,
      x: Math.max(0, Math.min(105, state.ball.x + velocity.x * dt)),
      y: Math.max(0, Math.min(68, state.ball.y + velocity.y * dt)),
      velocity: { x: velocity.x * 0.9, y: velocity.y * 0.9 },
    };
    if (state.time - looseSince > 0.35) {
      const claimant = state.players
        .map((p) => ({
          p,
          score:
            distance(p.position, state.ball) -
            (p.profile.attributes.pace +
              p.profile.attributes.agility +
              p.profile.attributes.gameReading) /
              90,
        }))
        .sort((a, b) => a.score - b.score || a.p.id.localeCompare(b.p.id))[0];
      if (claimant && distance(claimant.p.position, state.ball) < 3.2)
        state = changePossession(state, claimant.p.id, 'claim');
    }
  } else if (state.ball.ownerId && state.restart?.phase !== 'setup') {
    const owner = state.players.find((p) => p.id === state.ball.ownerId)!;
    const speed = Math.hypot(owner.velocity.x, owner.velocity.y),
      dirX = speed > 0.2 ? owner.velocity.x / speed : owner.team === 'home' ? 1 : -1,
      dirY = speed > 0.2 ? owner.velocity.y / speed : 0;
    state.ball = {
      x: owner.position.x + dirX * 1.15,
      y: owner.position.y + dirY * 1.15,
      ownerId: owner.id,
    };
  }
  if (state.ball.ownerId && !state.ball.travelDuration && state.restart?.phase !== 'setup') {
    const owner = state.players.find((p) => p.id === state.ball.ownerId)!;
    const evaluated = evaluatePressure(state, owner);
    state.currentPressure = evaluated.value;
    if (evaluated.nearestChallengerId) state.nearestChallengerId = evaluated.nearestChallengerId;
    else delete state.nearestChallengerId;
    const challenger = state.players.find((p) => p.id === evaluated.nearestChallengerId);
    if (challenger && distance(challenger.position, owner.position) < 1.65) {
      const rng = RandomGenerator.fromSeed(
        `${state.seed}:challenge:${state.decisionIndex}:${challenger.id}`,
      );
      const defence =
        (challenger.profile.attributes.tackling +
          challenger.profile.attributes.strength +
          challenger.profile.attributes.positioning +
          challenger.profile.attributes.aggression +
          challenger.profile.attributes.gameReading) /
        500;
      const attack =
        (owner.profile.attributes.dribbling +
          owner.profile.attributes.technique +
          owner.profile.attributes.agility +
          owner.profile.attributes.strength +
          owner.profile.attributes.composure) /
        500;
      const roll = rng.float() + (defence - attack) * 0.35;
      if (roll > 0.58) state = changePossession(state, challenger.id, 'tackle');
      else if (roll > 0.42)
        state = makeLoose(state, { x: (rng.float() - 0.5) * 5, y: (rng.float() - 0.5) * 5 });
    }
  } else {
    state.currentPressure = 0;
    delete state.nearestChallengerId;
  }
  if (state.actionCooldown <= 0 && state.ball.ownerId && state.restart?.phase !== 'setup') {
    const action = chooseNpcAction(state, state.ball.ownerId);
    if (action) state = resolveMatchAction(state, action);
  }
  return state;
};

export const matchStateToFrame = (state: TacticalMatchState) => ({
  timestampMs: state.time * 1000,
  players: state.players.map((p) => ({
    id: p.id,
    team: p.team,
    x: p.position.x,
    y: p.position.y,
    goalkeeper: p.profile.primaryPosition === 'goalkeeper',
    protagonist: p.id === state.controlledFootballerId,
    target: p.target,
    anchor: p.neutralAnchor,
    idealTarget: p.idealTarget,
  })),
  ball: { x: state.ball.x, y: state.ball.y, ownerId: state.ball.ownerId },
});
