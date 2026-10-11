import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFormationBenchmarkSession } from '../src/core/matchSimulation/benchmarkFixtures';
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...v] = arg.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const load = <T>(p: string): Promise<T> => import(pathToFileURL(resolve(root, p)).href);
const engine = await load<typeof import('../src/core/matchSimulation/matchSimulation')>(
  'src/core/matchSimulation/matchSimulation.ts',
);
const policy = await load<typeof import('../src/core/matchSimulation/matchActions')>(
  'src/core/matchSimulation/matchActions.ts',
);
const positions = await load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
  'src/core/matchSimulation/tacticalPositioning.ts',
);
const prepare = await load<typeof import('../src/core/matchSimulation/onBallPreparation')>(
  'src/core/matchSimulation/onBallPreparation.ts',
);
const shots = await load<typeof import('../src/core/matchSimulation/shootingOptions')>(
  'src/core/matchSimulation/shootingOptions.ts',
);
const opportunity = await load<typeof import('../src/core/matchSimulation/shootingOpportunity')>(
  'src/core/matchSimulation/shootingOpportunity.ts',
);
const passDecision = await load<typeof import('../src/core/matchSimulation/passDecision')>(
  'src/core/matchSimulation/passDecision.ts',
);
const rows = [];
for (const scenario of [
  'line_gap',
  'striker_drops',
  'two_strikers',
  'open_lane',
  'press_escape',
  'edge_box',
  'rebound',
  'fresh_run',
  'fatigued_run',
] as const)
  for (const seed of ['pr162-scenario-1', 'pr162-scenario-2', 'pr162-scenario-3']) {
    const formation = ['striker_drops', 'fresh_run', 'fatigued_run'].includes(scenario)
      ? '4-3-3'
      : '4-4-2';
    let state = engine.createTacticalMatch(
      createFormationBenchmarkSession({
        opponent: '4-4-2',
        anchor: formation,
        attributes: 70,
        seed,
      }),
    );
    state.playerAgencyEnabled = false;
    state.time = 20;
    state.timeSincePossessionChanged = 5;
    state.teams.home.style = state.teams.away.style = 'balanced';
    for (const p of state.players) {
      p.position = {
        x: p.team === 'home' ? 42 + (p.slotIndex % 3) * 4 : 78 + (p.slotIndex % 3) * 4,
        y: 4 + p.slotIndex * 5.5,
      };
      p.velocity = { x: 0, y: 0 };
      p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
      if (p.slot.position === 'goalkeeper') p.position = { x: p.team === 'home' ? 5 : 102, y: 34 };
    }
    const carrier = state.players.find(
      (p) =>
        p.team === 'home' &&
        p.slot.position ===
          (['edge_box', 'rebound'].includes(scenario) ? 'striker' : 'central_midfielder'),
    )!;
    carrier.position = { x: ['edge_box', 'rebound'].includes(scenario) ? 84 : 62, y: 34 };
    const forwards = state.players.filter(
      (p) => p.team === 'home' && p.slot.position === 'striker',
    );
    for (const [i, p] of forwards.entries())
      if (p !== carrier)
        p.position = {
          x: scenario === 'striker_drops' || (scenario === 'two_strikers' && i === 0) ? 57 : 77,
          y: 29 + i * 10,
        };
    const winger = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'left_winger',
    )!;
    winger.position = { x: 72, y: 20 };
    const centrebacks = state.players.filter(
      (p) => p.team === 'away' && p.slot.position === 'center_back',
    );
    centrebacks[0]!.position = { x: 79, y: 20 };
    centrebacks[1]!.position = { x: 79, y: 48 };
    if (['edge_box', 'rebound'].includes(scenario))
      for (const p of state.players.filter(
        (p) => p.team === 'away' && p.slot.position !== 'goalkeeper',
      ))
        p.position = { x: 94, y: p.slotIndex < 6 ? 10 : 58 };
    if (scenario === 'press_escape')
      for (const p of state.players.filter(
        (p) => p.team === 'away' && /striker|winger/.test(p.slot.position),
      ))
        p.position = { x: 44, y: 12 + p.slotIndex * 3 };
    if (scenario === 'open_lane') centrebacks[0]!.position = { x: 73, y: 6 };
    if (scenario === 'fatigued_run')
      for (const p of state.players.filter((p) => p.team === 'home')) {
        p.fitness!.longTermCapacity = 0.35;
        p.fitness!.burstReadiness = 0.2;
      }
    state.ball = { ...carrier.position, ownerId: carrier.id, height: 0.11 };
    state.actionCooldown = 0;
    state.ballOwnershipStartedAt = state.time;
    state.currentPressure = policy.evaluatePressure(state, carrier).value;
    state.onBallPreparation = prepare.deriveOnBallPreparation(state, carrier, 'clean_control');
    state.players = positions.deriveTacticalTargets(state);
    const ranking = policy.rankAvailableActionsForAI(state, carrier.id);
    const initial = {
      carrierId: carrier.id,
      physicalReadyAfter: state.onBallPreparation.readyAt - state.time,
      delay: policy.npcPossessionDecisionDelay(state, carrier),
      opportunity: opportunity.evaluateShootingOpportunity(state, carrier),
      support: positions.deriveBuildUpSupport(state, 'home'),
      runs: positions.deriveAttackingRunIds(state, 'home'),
      targets: state.players
        .filter((p) => p.team === 'home')
        .map((p) => ({
          id: p.id,
          role: p.slot.position,
          position: p.position,
          target: p.idealTarget,
        })),
      ranking: ranking.map(({ action, score }) => ({
        action,
        score,
        ...(action.type === 'shot' || action.type === 'header'
          ? { executable: shots.canExecuteCanonicalShot(state, action) }
          : {}),
        ...(action.type === 'pass'
          ? {
              pass: passDecision.evaluatePassDecision(
                state,
                carrier,
                state.players.find((p) => p.id === action.receiverId)!,
                action.target,
                action.intent,
                action.delivery,
              ),
            }
          : {}),
      })),
    };
    const trace: unknown[] = [];
    let lastIndex = state.decisionIndex;
    let lastShot = '';
    for (let tick = 0; tick < 800; tick++) {
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      if (state.decisionIndex !== lastIndex) {
        if (trace.length < 16)
          trace.push({
            at: state.time,
            action: state.latestAction,
            ball: state.ball,
            shot: state.lastShot,
          });
        lastIndex = state.decisionIndex;
      }
      if (state.lastShot?.shotId && state.lastShot.shotId !== lastShot)
        lastShot = state.lastShot.shotId;
    }
    const homeStats = state.statistics!.players.filter(
      (p) => state.statistics!.playerTeams?.[p.playerId] === 'home',
    );
    rows.push({
      scenario,
      seed,
      initial,
      final: {
        time: state.time,
        score: state.score,
        shots: homeStats.reduce((s, p) => s + p.shots, 0),
        passes: homeStats.reduce((s, p) => s + p.passesAttempted, 0),
        shot: state.lastShot,
        forwards: state.players
          .filter((p) => p.team === 'home' && /striker|winger/.test(p.slot.position))
          .map((p) => ({
            id: p.id,
            position: p.position,
            distance: p.locomotionTelemetry?.distanceTotal,
          })),
      },
      trace,
    });
  }
const out = resolve(args.get('output') ?? 'docs/performance/PR162-scenarios.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    engineRoot: root,
    methodology:
      'Explicit frozen tactical setups; subsequent 800 ticks use only canonical physics. Rebound is an unforced shot setup and may not produce a save or second shot. No injected success.',
    rows,
  }) + '\n',
);
console.info(
  JSON.stringify(
    rows.map((r) => ({
      scenario: r.scenario,
      seed: r.seed,
      initialTop: r.initial.ranking[0],
      delay: r.initial.delay,
      shots: r.final.shots,
      passes: r.final.passes,
    })),
  ),
);
