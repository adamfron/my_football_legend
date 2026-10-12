import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

/** Same deterministic fixtures against clean main and PR165; observations never repair a state. */
const run = async (root: string) => {
  const load = (path: string) => import(pathToFileURL(resolve(root, path)).href);
  const [
    { createCanonicalWorldDatabase },
    { createSingleMatchSession },
    engine,
    { awardNaturalRestart },
    { RandomGenerator },
    { distance },
    { beginPostGoalReaction },
    actions,
  ] = await Promise.all([
    load('scripts/createCanonicalWorldDatabase.ts'),
    load('src/core/singleMatch.ts'),
    load('src/core/matchSimulation/matchSimulation.ts'),
    load('src/core/matchSimulation/restartScenarios.ts'),
    load('src/core/random/RandomGenerator.ts'),
    load('src/core/matchSimulation/matchSpace.ts'),
    load('src/core/matchSimulation/postGoalReactions.ts'),
    load('src/core/matchSimulation/matchActions.ts'),
  ]);
  const world = createCanonicalWorldDatabase();
  const initial = () =>
    engine.createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: 'pro_9',
        awayClubId: 'pro_1',
        seed: 'lab-mv47opno',
        control: { mode: 'spectator' },
      }),
    ) as TacticalMatchState;
  const restartRows = [];
  for (const team of ['home', 'away'] as const)
    for (const human of [false, true]) {
      let state = initial();
      const rng = RandomGenerator.fromSeed('pr165-packed-7');
      const mirror = (p: { x: number; y: number }) =>
        team === 'home' ? p : { x: 105 - p.x, y: 68 - p.y };
      const spot = mirror({ x: 78.775, y: 23.418 });
      state = {
        ...state,
        time: 3529,
        status: 'second_half',
        scenario: 'open_play',
        playerAgencyEnabled: false,
        actionCooldown: 30,
        ball: { ...spot, height: 0, velocity: { x: 0, y: 0, z: 0 } },
        players: state.players.map((p) => ({
          ...p,
          team: team === 'home' ? p.team : p.team === 'home' ? 'away' : 'home',
          neutralAnchor: mirror(p.neutralAnchor),
          anchor: mirror(p.anchor),
          position: mirror(
            p.profile.primaryPosition === 'goalkeeper'
              ? p.position
              : { x: 68.775 + rng.float() * 30, y: 9.418 + rng.float() * 28 },
          ),
          velocity: { x: 0, y: 0 },
        })),
      };
      state = awardNaturalRestart(state, 'free_kick_close', {
        restartTeam: team,
        cause: 'foul',
        incidentId: `packed-7:${team}`,
        incidentPoint: spot,
        eventAt: 3529,
      });
      if (human)
        state = {
          ...state,
          controlledFootballerId: state.restart!.takerId,
          playerAgencyEnabled: true,
        };
      let placedAt: number | null = null,
        readyAt: number | null = null,
        releaseAt: number | null = null,
        humanFrozen: boolean | null = null;
      for (let tick = 0; tick < 2400 && state.restart?.phase !== 'release'; tick++) {
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        if (state.restart?.retrieval?.stage === 'placed') placedAt ??= state.time - 3529;
        if (state.restart?.readiness?.legalReady) readyAt ??= state.time - 3529;
        if (state.restart?.phase === 'awaiting_decision') {
          const at = state.time;
          for (let i = 0; i < 20; i++)
            state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
          humanFrozen = state.time === at;
          const action = actions
            .enumerateRestartActions(state)
            .find((a: { type: string }) => a.type === 'pass');
          if (action) state = actions.resolveMatchAction(state, action, 'human_selected');
        }
      }
      if (state.restart?.phase === 'release') releaseAt = state.time - 3529;
      const r = state.restart;
      const ballBefore = { ...state.ball };
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      restartRows.push({
        team,
        human,
        placedAt,
        readyAt,
        releaseAt,
        humanFrozen,
        physicalFlightMoved: releaseAt !== null && distance(ballBefore, state.ball) > 0.01,
        phase: r?.phase,
        blockers: r?.readiness?.blockers,
        selected: r?.selectedAction?.type,
        selectedSource: r?.selectedSource,
        blockingWall: state.players
          .filter((p) => r?.roles[p.id]?.key === 'wall')
          .map((p) => ({
            id: p.id,
            position: p.position,
            target: p.target,
            planned: r?.targets[p.id],
            speed: Math.hypot(p.velocity.x, p.velocity.y),
            targetDistance: distance(p.position, p.target),
            closestBody: Math.min(
              ...state.players
                .filter((o) => o.id !== p.id)
                .map((o) => distance(o.position, p.position)),
            ),
          })),
        diagnostic: state.restartLivenessDiagnostics?.at(-1),
      });
    }
  const goalRows = [];
  for (const conceding of ['home', 'away'] as const)
    for (const urgent of [false, true]) {
      let state = initial();
      const scoring = conceding === 'home' ? 'away' : 'home';
      const keeper = state.players.find(
        (p) => p.team === conceding && p.slot.position === 'goalkeeper',
      )!;
      const scorer = state.players.find(
        (p) => p.team === scoring && p.slot.position === 'striker',
      )!;
      state = {
        ...state,
        time: urgent ? 5220 : 3600,
        status: 'second_half',
        scenario: 'open_play',
        playerAgencyEnabled: false,
        score: {
          home: scoring === 'home' ? 1 : urgent ? 2 : 0,
          away: scoring === 'away' ? 1 : urgent ? 2 : 0,
        },
        ball: {
          x: conceding === 'home' ? -1 : 106,
          y: 34,
          height: 0,
          velocity: { x: 0, y: 0, z: 0 },
          lastTouchPlayerId: scorer.id,
        },
        players: state.players.map((p) => ({
          ...p,
          velocity: { x: 0, y: 0 },
          position:
            p.id === keeper.id
              ? { x: conceding === 'home' ? 0.2 : 104.8, y: 34 }
              : p.id === scorer.id
                ? { x: conceding === 'home' ? 3 : 102, y: 34 }
                : p.position,
        })),
      };
      state = beginPostGoalReaction(state, scoring, scorer.id, `goal:${conceding}:${urgent}`);
      const start = state.time,
        stages = new Set<string>();
      let maxKeeperDepth = 0,
        transportId: string | undefined;
      let competitiveStatsDuringPreparation = false,
        maxBallStep = 0;
      for (let tick = 0; tick < 4000 && state.restart?.phase !== 'release'; tick++) {
        const before = state;
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        const p = state.players.find((p) => p.id === keeper.id)!;
        maxKeeperDepth = Math.max(
          maxKeeperDepth,
          conceding === 'home' ? p.position.x : 105 - p.position.x,
        );
        maxBallStep = Math.max(maxBallStep, distance(before.ball, state.ball));
        if (state.restart?.retrieval) stages.add(state.restart.retrieval.stage);
        if (state.restart?.retrieval?.stage === 'transport')
          transportId = state.restart.retrieval.playerId;
        if (state.restart?.phase !== 'release')
          competitiveStatsDuringPreparation ||= Boolean(
            state.statistics?.players.some(
              (p) => p.passesAttempted || p.passesReceived || p.touches || p.shots,
            ),
          );
      }
      goalRows.push({
        conceding,
        urgent,
        completed: state.restart?.phase === 'release',
        seconds: state.time - start,
        maxKeeperDepth,
        stages: [...stages],
        transportId,
        keeperId: keeper.id,
        takerId: state.restart?.takerId,
        legalReady: state.restart?.readiness?.legalReady,
        maxBallStep,
        competitiveStatsDuringPreparation,
        passAttemptsAfterRelease: state.statistics?.players.reduce(
          (n, p) => n + p.passesAttempted,
          0,
        ),
      });
    }
  return { restartRows, goalRows };
};
const baseline = await run(process.argv[2] ?? '../baseline-source');
const current = await run('.');
mkdirSync('docs/performance', { recursive: true });
const report = {
  base: '4f08a37b83067c5bd8e59fb297ab6156ef0fe86e',
  limitation:
    'Equivalent packed deterministic fixture at reported spot; original exported state absent. Baseline is clean main, same seed/world/geometry/engine dt.',
  baseline,
  current,
};
writeFileSync('docs/performance/PR165-integrity.json', JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    baseline: {
      restart: baseline.restartRows.map((r) => ({
        team: r.team,
        human: r.human,
        releaseAt: r.releaseAt,
        blockers: r.blockers,
      })),
      goals: baseline.goalRows,
    },
    current: {
      restart: current.restartRows.map((r) => ({
        team: r.team,
        human: r.human,
        releaseAt: r.releaseAt,
      })),
      goals: current.goalRows,
    },
  }),
);
