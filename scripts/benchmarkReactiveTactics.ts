import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  beginDefensiveChallenge,
  deriveCooperativePress,
} from '../src/core/matchSimulation/defensiveChallenges';
import { chooseNpcAction } from '../src/core/matchSimulation/matchActions';
import {
  createTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import {
  deriveBuildUpSupport,
  deriveStructuralPosition,
  deriveTacticalTargets,
} from '../src/core/matchSimulation/tacticalPositioning';
import {
  createTeamThreatMemory,
  evaluateTeamThreatResponse,
  initialiseTeamThreatMemory,
} from '../src/core/matchSimulation/teamThreatMemory';

const finite = z.number().finite();
export const reactiveTacticsBenchmarkSchema = z.object({
  seeds: z
    .array(
      z.object({
        seed: z.string(),
        pressAttempts: z.number().int(),
        canonicalPressWins: z.number().int(),
        threatEvidence: finite,
        adaptiveLineDepthMetres: finite,
        buildUpLineBeforeMetres: finite,
        buildUpLineAfterMetres: finite,
        supportOutlets: z.number().int(),
        supportDistanceBeforeMetres: finite,
        supportDistanceAfterMetres: finite,
        recycleChoicesBefore: z.number().int(),
        recycleChoicesAfter: z.number().int(),
        selectionSamples: z.number().int(),
        weakTeamWidthBeforeMetres: finite,
        weakTeamWidthAfterMetres: finite,
        weakTeamLineBeforeMetres: finite,
        weakTeamLineAfterMetres: finite,
        weakTeamAttackingOutlets: z.number().int(),
        safeDoublePress: z.boolean(),
        unsafeDoublePressDeclined: z.boolean(),
      }),
    )
    .max(12),
  collectionScope: z.literal('bounded_deterministic_reactive_tactical_scenarios'),
});
export type ReactiveTacticsBenchmark = z.infer<typeof reactiveTacticsBenchmarkSchema>;
const world = createCanonicalWorldDatabase();
const fixture = (seed: string) =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const neutral = (state: TacticalMatchState): TacticalMatchState => ({
  ...state,
  teams: {
    ...state.teams,
    home: { ...state.teams.home, threatMemory: createTeamThreatMemory(0, state.time) },
  },
});

/** Six real, seeded contacts against the recurring same CB. No fabricated turnover diagnostics. */
const pressTrap = (seed: string) => {
  let state = fixture(seed);
  const ownerId = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!.id;
  const presserId = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!.id;
  let wins = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    state = {
      ...state,
      time: attempt * 8,
      scenario: 'open_play',
      possessionTeam: 'home',
      ballEpisode: attempt * 2,
      actionCooldown: 20,
      ball: { x: 28.5, y: 15, ownerId },
      players: state.players.map((player) => ({
        ...player,
        position:
          player.id === ownerId
            ? { x: 28, y: 15 }
            : player.id === presserId
              ? { x: 29, y: 15 }
              : { x: player.team === 'home' ? 16 : 85, y: 50 + player.slotIndex },
        velocity: { x: 0, y: 0 },
        facingAngle: player.team === 'home' ? Math.PI / 2 : -Math.PI / 2,
        profile:
          player.id === ownerId || player.id === presserId
            ? {
                ...player.profile,
                attributes: {
                  ...player.profile.attributes,
                  tackling: player.id === presserId ? 100 : 10,
                  gameReading: player.id === presserId ? 100 : 10,
                  positioning: player.id === presserId ? 100 : 10,
                  strength: player.id === presserId ? 100 : 10,
                  dribbling: 10,
                  technique: 10,
                  agility: 10,
                  composure: 10,
                },
              }
            : player.profile,
      })),
    };
    delete state.defensiveChallenge;
    delete state.defensiveEpisodes;
    delete state.recentDuel;
    state = beginDefensiveChallenge(
      state,
      { type: 'challenge', actorId: presserId, opponentId: ownerId, technique: 'standing' },
      'autonomous_npc',
    );
    state = stepTacticalMatchAfterDecisionProbe(state);
    if (state.lastChallenge?.outcome === 'clean_win') wins++;
  }
  return { state, wins, ownerId, presserId };
};

/** Let the canonical bodies follow their plans; compares executed geometry in an identical state. */
const moveBuildUp = (input: TacticalMatchState, ownerId: string) => {
  let state = structuredClone(input);
  const owner = state.players.find((player) => player.id === ownerId)!;
  state.possessionTeam = 'home';
  state.timeSincePossessionChanged = 10;
  state.actionCooldown = 1000;
  state.ball = { ...owner.position, ownerId };
  state.ballOwnershipStartedAt = state.time;
  state.teams.home.phase = 'positional_attack';
  const presser = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const pressPoint = { x: owner.position.x + 7, y: owner.position.y };
  state.players = state.players.map((player) =>
    player.team === 'away'
      ? {
          ...player,
          position: player.id === presser.id ? pressPoint : { x: 95, y: 62 },
          target: player.id === presser.id ? pressPoint : { x: 95, y: 62 },
          velocity: { x: 0, y: 0 },
        }
      : player,
  );
  // The matched snapshot keeps an active press seven metres away, with an explicit canonical
  // hold-shape commitment. It isolates physical support/line movement from another ball win.
  state.playerMovementIntent = {
    actorId: presser.id,
    type: 'hold_shape',
    target: pressPoint,
    startedAt: state.time,
    expiresAt: state.time + 10,
  };
  for (let tick = 0; tick < 320; tick++) state = stepTacticalMatchAfterDecisionProbe(state);
  const defenders = state.players.filter(
    (player) =>
      player.team === 'home' &&
      player.id !== ownerId &&
      player.duty === 'defend' &&
      player.profile.primaryPosition !== 'goalkeeper',
  );
  const outlets = deriveBuildUpSupport(state, 'home');
  return {
    state,
    line: mean(defenders.map((player) => player.position.x)),
    supportDistance: mean(
      state.players
        .filter((player) => outlets.some((outlet) => outlet.playerId === player.id))
        .map((player) =>
          Math.hypot(player.position.x - owner.position.x, player.position.y - owner.position.y),
        ),
    ),
  };
};

const recycleSamples = (reference: TacticalMatchState, ownerId: string) => {
  const run = (adaptive: boolean) => {
    let recycle = 0;
    for (let index = 0; index < 12; index++) {
      let state = fixture(reference.seed);
      state.time = 100;
      state.actionCooldown = 0;
      state.ballOwnershipStartedAt = 90;
      state.teams.home.threatMemory = adaptive
        ? reference.teams.home.threatMemory!
        : createTeamThreatMemory();
      const owner = state.players.find((player) => player.id === ownerId)!;
      const support = state.players.find(
        (player) =>
          player.team === 'home' &&
          player.id !== ownerId &&
          player.profile.primaryPosition !== 'goalkeeper',
      )!;
      const runner = state.players.find(
        (player) =>
          player.team === 'home' &&
          player.id !== ownerId &&
          player.id !== support.id &&
          player.profile.primaryPosition !== 'goalkeeper',
      )!;
      const opponents = state.players.filter(
        (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
      );
      for (const player of state.players)
        player.position = { x: player.team === 'home' ? 8 : 85, y: 60 };
      owner.position = { x: 28, y: 15 };
      support.position = { x: 10, y: 28 };
      runner.position = { x: 56 + (index % 3), y: 15 };
      opponents[0]!.position = { x: 32, y: 15 };
      opponents[1]!.position = { x: runner.position.x + 3 + (index % 4), y: 15 };
      state = { ...state, ball: { ...owner.position, ownerId }, possessionTeam: 'home' };
      const action = chooseNpcAction(state, ownerId);
      if (action?.type === 'pass' && action.target.x < owner.position.x) recycle++;
    }
    return recycle;
  };
  return { before: run(false), after: run(true) };
};

const lowBlock = (seed: string) => {
  let state = fixture(seed);
  state.players = state.players.map((player) => ({
    ...player,
    profile: {
      ...player.profile,
      attributes: {
        ...player.profile.attributes,
        passing: player.team === 'home' ? 25 : 85,
        technique: player.team === 'home' ? 25 : 85,
        gameReading: player.team === 'home' ? 25 : 85,
        tackling: player.team === 'home' ? 25 : 85,
        pace: player.team === 'home' ? 25 : 85,
      },
    },
  }));
  state = initialiseTeamThreatMemory(state);
  let memory = state.teams.home.threatMemory!;
  memory.territorialPressure = 0.7;
  for (let time = 2; time <= 60; time += 2)
    memory = evaluateTeamThreatResponse({ ...state, time }, 'home', memory);
  state = {
    ...state,
    time: 60,
    teams: { ...state.teams, home: { ...state.teams.home, threatMemory: memory } },
  };
  const geometry = (match: TacticalMatchState) => {
    const defenders = match.players
      .filter((player) => player.team === 'home' && player.slot.position.endsWith('_back'))
      .map((player) => deriveStructuralPosition(match, player));
    return {
      width:
        Math.max(...defenders.map((point) => point.y)) -
        Math.min(...defenders.map((point) => point.y)),
      line: mean(defenders.map((point) => point.x)),
    };
  };
  return {
    before: geometry(neutral(state)),
    after: geometry(state),
    attackingOutlets: deriveTacticalTargets(state).filter(
      (player) => player.team === 'home' && player.duty === 'attack' && player.target.x > 40,
    ).length,
  };
};

const doublePress = (seed: string) => {
  const state = fixture(seed);
  const carrier = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const defenders = state.players.filter(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  );
  for (const player of state.players) {
    player.position = { x: player.team === 'home' ? 80 : 90, y: 60 };
    player.velocity = { x: 0, y: 0 };
  }
  carrier.position = { x: 30, y: 34 };
  defenders[0]!.position = { x: 29, y: 34 };
  defenders[1]!.position = { x: 31, y: 40 };
  defenders[2]!.position = { x: 18, y: 34 };
  state.ball = { ...carrier.position, ownerId: carrier.id };
  state.possessionTeam = 'away';
  const safe = Boolean(deriveCooperativePress(state, 'home'));
  const receiver = state.players.find(
    (player) =>
      player.team === 'away' &&
      player.id !== carrier.id &&
      player.profile.primaryPosition !== 'goalkeeper',
  )!;
  receiver.position = { x: 28, y: 43 };
  return { safe, unsafeDeclined: !deriveCooperativePress(state, 'home') };
};

export const runReactiveTacticsBenchmark = (
  seeds = ['pr151-tactics-1', 'pr151-tactics-2', 'pr151-tactics-3'],
): ReactiveTacticsBenchmark =>
  reactiveTacticsBenchmarkSchema.parse({
    collectionScope: 'bounded_deterministic_reactive_tactical_scenarios',
    seeds: seeds.map((seed) => {
      const trap = pressTrap(seed);
      const adapted = moveBuildUp(trap.state, trap.ownerId);
      const unadapted = moveBuildUp(neutral(trap.state), trap.ownerId);
      const outlets = deriveBuildUpSupport(adapted.state, 'home');
      const owner = unadapted.state.players.find((player) => player.id === trap.ownerId)!;
      const matchingOutletDistance = mean(
        unadapted.state.players
          .filter((player) => outlets.some((outlet) => outlet.playerId === player.id))
          .map((player) =>
            Math.hypot(player.position.x - owner.position.x, player.position.y - owner.position.y),
          ),
      );
      const selection = recycleSamples(trap.state, trap.ownerId);
      const block = lowBlock(seed);
      const cooperation = doublePress(seed);
      return {
        seed,
        pressAttempts: 6,
        canonicalPressWins: trap.wins,
        threatEvidence: trap.state.teams.home.threatMemory!.buildUpLosses[0],
        adaptiveLineDepthMetres: trap.state.teams.home.threatMemory!.response.lineDepthMetres,
        buildUpLineBeforeMetres: unadapted.line,
        buildUpLineAfterMetres: adapted.line,
        supportOutlets: outlets.length,
        supportDistanceBeforeMetres: matchingOutletDistance,
        supportDistanceAfterMetres: adapted.supportDistance,
        recycleChoicesBefore: selection.before,
        recycleChoicesAfter: selection.after,
        selectionSamples: 12,
        weakTeamWidthBeforeMetres: block.before.width,
        weakTeamWidthAfterMetres: block.after.width,
        weakTeamLineBeforeMetres: block.before.line,
        weakTeamLineAfterMetres: block.after.line,
        weakTeamAttackingOutlets: block.attackingOutlets,
        safeDoublePress: cooperation.safe,
        unsafeDoublePressDeclined: cooperation.unsafeDeclined,
      };
    }),
  });

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/benchmarkReactiveTactics.ts'))
  console.log(JSON.stringify(runReactiveTacticsBenchmark(), null, 2));
