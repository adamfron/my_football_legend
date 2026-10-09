import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PressingTracker } from '../src/core/matchSimulation/pressingDiagnostics';
import { ContactTacticalTracker } from '../src/core/matchSimulation/contactTacticalDiagnostics';
import { MatchReplayHistory } from '../src/core/matchSimulation/matchReplay';
import { MatchDebugRecorder } from '../src/app/match/matchDebugCapture';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { clampPitchPoint } from '../src/core/matchSimulation/matchSpace';
import {
  emptyTurnoverCauseCounts,
  turnoverCauseCountsSchema,
} from '../src/core/matchSimulation/possessionEvents';

const pressureCarrierMetricsSchema = z.object({
  controlledSeconds: z.number().nonnegative(),
  stationarySeconds: z.number().nonnegative(),
  carryStarts: z.number().int().nonnegative(),
  physicalDribbles: z.number().int().nonnegative(),
  firstTimeReleases: z.number().int().nonnegative(),
  carrySeconds: z.number().nonnegative(),
  carryDistance: z.number().nonnegative(),
  shieldingSeconds: z.number().nonnegative(),
  lossesByCause: turnoverCauseCountsSchema,
});

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...v] = arg.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const config = z
  .object({
    minutes: z.number().positive().max(90),
    seeds: z.array(z.string()).min(1),
    revision: z.string(),
    observer: z.enum(['minimum', 'normal', 'dev', 'capture']),
  })
  .parse({
    minutes: Number(args.get('minutes') ?? 90),
    seeds: (args.get('seeds') ?? 'lab-muwhj3er,pr155-natural-b,pr155-natural-c').split(','),
    revision: args.get('revision') ?? 'PR158',
    observer: args.get('observer') ?? 'normal',
  });
const root = resolve(args.get('engine-root') ?? process.cwd());
const sourceHash = () => {
  const sourceRoot = resolve(root, 'src/core/matchSimulation');
  const paths: string[] = [];
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = resolve(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) paths.push(file);
    }
  };
  walk(sourceRoot);
  const hash = createHash('sha256');
  for (const file of paths.sort())
    hash
      .update(relative(sourceRoot, file).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(file))
      .update('\0');
  return hash.digest('hex');
};
const canonicalSourceHash = sourceHash();
const benchmarkSourceHash = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');
const hashObservers = () => {
  const hash = createHash('sha256');
  for (const path of [
    'src/core/matchSimulation/pressingDiagnostics.ts',
    'src/core/matchSimulation/contactTacticalDiagnostics.ts',
    'src/core/matchSimulation/matchReplay.ts',
    'src/app/match/matchDebugCapture.ts',
  ])
    hash
      .update(path)
      .update('\0')
      .update(readFileSync(resolve(path)))
      .update('\0');
  return hash.digest('hex');
};
const observerSourceHash = hashObservers();
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [worldModule, sessions, engine, actions, flow, stats, positioning, defence] =
  await Promise.all([
    load<typeof import('./createCanonicalWorldDatabase')>(
      'scripts/createCanonicalWorldDatabase.ts',
    ),
    load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
    load<typeof import('../src/core/matchSimulation/matchSimulation')>(
      'src/core/matchSimulation/matchSimulation.ts',
    ),
    load<typeof import('../src/core/matchSimulation/matchActions')>(
      'src/core/matchSimulation/matchActions.ts',
    ),
    load<typeof import('../src/core/matchSimulation/matchFlowTelemetry')>(
      'src/core/matchSimulation/matchFlowTelemetry.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
      'src/core/matchSimulation/playerMatchStats.ts',
    ),
    load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
      'src/core/matchSimulation/tacticalPositioning.ts',
    ),
    load<typeof import('../src/core/matchSimulation/defensiveChallenges')>(
      'src/core/matchSimulation/defensiveChallenges.ts',
    ),
  ]);
const world = worldModule.createCanonicalWorldDatabase();
const fixtures = [
  {
    id: 'balanced-balanced',
    home: 'pro_9',
    away: 'pro_1',
    homeStyle: 'balanced',
    awayStyle: 'balanced',
  },
  {
    id: 'native-433-pressing-442',
    home: 'pro_9',
    away: 'pro_1',
    homeStyle: 'balanced',
    awayStyle: 'pressing',
  },
  {
    id: 'strong-weak',
    home: 'pro_9',
    away: world.clubs[63]!.id,
    homeStyle: 'balanced',
    awayStyle: 'balanced',
  },
  { id: 'high-press', home: 'pro_9', away: 'pro_1', homeStyle: 'pressing', awayStyle: 'pressing' },
  {
    id: 'fast-wings',
    home: 'pro_9',
    away: 'pro_1',
    homeStyle: 'counter_attacking',
    awayStyle: 'balanced',
  },
  {
    id: 'safe-defensive-outlets',
    home: 'pro_9',
    away: 'pro_1',
    homeStyle: 'possession',
    awayStyle: 'pressing',
  },
] as const;
const out = resolve(args.get('out') ?? 'docs/performance/PR158-flow-after.json');
mkdirSync(dirname(out), { recursive: true });
const resumed =
  args.has('resume') && existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as {
        canonicalSourceHash: string;
        benchmarkSourceHash: string;
        formatVersion: number;
        observerSourceHash: string;
        config: typeof config;
        results: Array<{ fixture: string; seed: string }>;
      })
    : undefined;
if (
  resumed &&
  (resumed.canonicalSourceHash !== canonicalSourceHash ||
    resumed.benchmarkSourceHash !== benchmarkSourceHash ||
    resumed.formatVersion !== 2 ||
    resumed.observerSourceHash !== observerSourceHash ||
    JSON.stringify(resumed.config) !== JSON.stringify(config))
)
  throw new Error('Resume inputs or frozen source do not match.');
const results: unknown[] = resumed?.results ?? [];
const save = () => {
  if (sourceHash() !== canonicalSourceHash)
    throw new Error('Canonical source changed during the matrix; discard and repeat this run.');
  if (hashObservers() !== observerSourceHash)
    throw new Error('Observer source changed during the matrix; discard and repeat this run.');
  if (
    createHash('sha256')
      .update(readFileSync(new URL(import.meta.url)))
      .digest('hex') !== benchmarkSourceHash
  )
    throw new Error('Benchmark source changed during the matrix; discard and repeat this run.');
  writeFileSync(
    out,
    JSON.stringify(
      {
        base: '73c0fabed04ee4a31da85fa918f19bbc42344975',
        config,
        node: process.version,
        formatVersion: 2,
        canonicalSourceHash,
        benchmarkSourceHash,
        observerSourceHash,
        inputPolicy:
          'spectator; canonical autonomy without human agency; second half explicitly started',
        results,
      },
      null,
      2,
    ) + '\n',
  );
};
for (const fixture of fixtures.filter(
  (f) => !args.has('fixtures') || args.get('fixtures')!.split(',').includes(f.id),
))
  for (const seed of config.seeds) {
    if (resumed?.results.some((row) => row.fixture === fixture.id && row.seed === seed)) continue;
    const session = sessions.createSingleMatchSession(world, {
      homeClubId: fixture.home,
      awayClubId: fixture.away,
      seed,
      control: { mode: 'spectator' },
    });
    let state = engine.createTacticalMatch(session);
    state.playerAgencyEnabled = false;
    state.teams.home.style = fixture.homeStyle;
    state.teams.away.style = fixture.awayStyle;
    // Identical fixture-only abilities in both revisions; no role participation quota.
    if (fixture.id === 'fast-wings')
      for (const p of state.players.filter((p) => p.team === 'home')) {
        const a = p.profile.attributes;
        p.profile = {
          ...p.profile,
          attributes: {
            ...a,
            ...(/winger/.test(p.slot.position) ? { pace: 90, agility: 82 } : {}),
            ...(/central_midfielder|defensive_midfielder/.test(p.slot.position)
              ? { passing: 40, technique: 45 }
              : {}),
          },
        };
      }
    if (fixture.id === 'safe-defensive-outlets')
      for (const p of state.players.filter((p) => p.team === 'home')) {
        if (/center_back|left_back|right_back|goalkeeper|central_midfielder/.test(p.slot.position))
          p.profile = {
            ...p.profile,
            attributes: {
              ...p.profile.attributes,
              passing: 85,
              firstTouch: 85,
              technique: 85,
              gameReading: 85,
              composure: 85,
            },
          };
      }
    const initial = structuredClone(state);
    const canonicalPlan = (
      defence as typeof defence & {
        derivePressingPlan?: (
          state: TacticalMatchState,
          actorId: string,
        ) => { intention: string; target: { x: number; y: number } } | undefined;
      }
    ).derivePressingPlan;
    // Reconstruct the PR156 locomotion override from its immutable source, not just
    // the earlier tactical target. No diagnostic projection changes movement.
    const plan =
      canonicalPlan ??
      ((s: TacticalMatchState, actorId: string) => {
        const actor = s.players.find((p) => p.id === actorId);
        const owner = s.players.find((p) => p.id === s.ball.ownerId);
        if (!actor || !owner) return;
        const coop = defence.deriveCooperativePress(s, actor.team);
        const commit = defence.shouldCommitRoutinePress(s, actorId, coop ?? null);
        const override =
          (s.nearestChallengerId === actorId || coop?.primaryId === actorId) &&
          s.defensiveChallenge?.actorId !== actorId &&
          s.playerMovementIntent?.actorId !== actorId &&
          (defence.isDefensiveEpisodeLocked(s, actorId, owner.id) || !commit);
        const dx = actor.position.x - owner.position.x,
          dy = actor.position.y - owner.position.y;
        const d = Math.hypot(dx, dy),
          radius = coop?.primaryId === actorId ? 0.95 : 2.3;
        return {
          intention: commit ? 'engage' : coop?.primaryId === actorId ? 'screen' : 'contain',
          target: override
            ? clampPitchPoint({
                x:
                  owner.position.x + (d > 0.001 ? dx / d : actor.team === 'home' ? -1 : 1) * radius,
                y: owner.position.y + (d > 0.001 ? dy / d : 0) * radius,
              })
            : actor.target,
        };
      });
    const tracker =
      config.observer === 'minimum'
        ? undefined
        : new PressingTracker(
            {
              derivePressingAssignment: positioning.derivePressingAssignment,
              deriveBuildUpSupport: positioning.deriveBuildUpSupport,
              deriveDefensiveContext: defence.deriveDefensiveContext,
              enumerateDefensiveChallengeActions: defence.enumerateDefensiveChallengeActions,
              chooseNpcDefensiveChallengeAction: defence.chooseNpcDefensiveChallengeAction,
              deriveCooperativePress: defence.deriveCooperativePress,
              protectedPressReceiver: defence.protectedPressReceiver,
              rankAvailableActionsForAI: actions.rankAvailableActionsForAI,
            },
            plan,
          );
    let telemetry = flow.createMatchFlowTelemetry(seed);
    const contactTracker = new ContactTacticalTracker();
    const replay = ['dev', 'capture'].includes(config.observer)
      ? new MatchReplayHistory()
      : undefined;
    const capture = config.observer === 'capture' ? new MatchDebugRecorder() : undefined;
    let ticks = 0;
    const pressureCarrier = pressureCarrierMetricsSchema.parse({
      controlledSeconds: 0,
      stationarySeconds: 0,
      carryStarts: 0,
      physicalDribbles: 0,
      firstTimeReleases: 0,
      carrySeconds: 0,
      carryDistance: 0,
      shieldingSeconds: 0,
      lossesByCause: emptyTurnoverCauseCounts(),
    });
    const started = performance.now();
    while (
      state.time < config.minutes * 60 &&
      !['full_time', 'abandoned'].includes(state.status ?? '')
    ) {
      if (state.status === 'half_time') {
        state = engine.startSecondHalf(state);
        continue;
      }
      const previous = state;
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      if (state.time === previous.time) throw new Error(`Stalled ${state.time}`);
      contactTracker.observe(previous, state);
      if (tracker) {
        tracker.observe(previous, state);
        telemetry = flow.observeMatchFlow(telemetry, previous, state);
        const owner = previous.players.find((p) => p.id === previous.ball.ownerId);
        const high = owner && previous.scenario === 'open_play' && previous.currentPressure >= 0.67;
        if (high) {
          const dt = Math.max(0, state.time - previous.time);
          pressureCarrier.controlledSeconds += dt;
          if (Math.hypot(owner.velocity.x, owner.velocity.y) < 0.35)
            pressureCarrier.stationarySeconds += dt;
          if (
            previous.onBallPreparation?.micro?.shielding ||
            previous.ballCarrierIntent?.executionMode === 'shield'
          )
            pressureCarrier.shieldingSeconds += dt;
          const carry = state.ballCarrierIntent;
          if (
            carry?.actorId === owner.id &&
            (carry.actorId !== previous.ballCarrierIntent?.actorId ||
              carry.startedAt !== previous.ballCarrierIntent?.startedAt)
          )
            pressureCarrier.carryStarts++;
          if (previous.ballCarrierIntent?.actorId === owner.id && state.ball.ownerId === owner.id) {
            pressureCarrier.carrySeconds += dt;
            const moved = state.players.find((p) => p.id === owner.id)!;
            pressureCarrier.carryDistance += Math.hypot(
              moved.position.x - owner.position.x,
              moved.position.y - owner.position.y,
            );
          }
          pressureCarrier.physicalDribbles += (state.actionEvents ?? []).filter(
            (event) =>
              event.sequence >= (previous.actionEventSequence ?? 0) &&
              event.kind === 'dribble' &&
              event.actorId === owner.id,
          ).length;
        }
        const released = state.lastPassDiagnostic;
        if (
          released &&
          released.passId !== previous.lastPassDiagnostic?.passId &&
          previous.currentPressure >= 0.67 &&
          released.executionType === 'first_time'
        )
          pressureCarrier.firstTimeReleases++;
        const loss = state.lastPossessionLoss;
        if (loss && loss.id !== previous.lastPossessionLoss?.id) {
          const pass = loss.passId && telemetry.passOutcomes.find((p) => p.passId === loss.passId);
          if ((high && loss.loserId === owner.id) || (pass && pass.pressure >= 0.67))
            pressureCarrier.lossesByCause[loss.cause]++;
        }
      }
      replay?.observe(state);
      capture?.record(state);
      if (capture?.lastObservationError) throw new Error(capture.lastObservationError);
      ticks++;
      if (ticks % 24000 === 0)
        process.stderr.write(
          `${config.revision} ${fixture.id}:${seed} ${(state.time / 60).toFixed(1)}min\n`,
        );
    }
    tracker?.close(state);
    stats.assertMatchStatisticsInvariants(state.statistics!, state);
    if (tracker) flow.assertTelemetryInvariants(telemetry);
    const shotRows = telemetry.shotDiagnostics;
    const players = state.statistics!.players;
    const pressure = tracker?.snapshot();
    if (pressure) {
      const samples = pressure.retainedEpisodes;
      pressure.retainedEpisodes = [
        ...new Map(
          [
            ...samples
              .filter((e) => e.maximumStaticSeconds >= 2)
              .sort((a, b) => b.maximumStaticSeconds - a.maximumStaticSeconds)
              .slice(0, 3),
            ...samples.sort((a, b) => b.duration - a.duration).slice(0, 3),
            ...samples.slice(-3),
          ].map((e) => [`${e.startedAt}:${e.primary}`, e]),
        ).values(),
      ];
    }
    results.push({
      fixture: fixture.id,
      seed,
      time: state.time,
      status: state.status,
      score: state.score,
      ticks,
      elapsedMs: performance.now() - started,
      formations: { home: session.home.formation, away: session.away.formation },
      styles: { home: fixture.homeStyle, away: fixture.awayStyle },
      canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
      contactsAndTactics: contactTracker.snapshot(state),
      physicalContactControl:
        (state as TacticalMatchState & { contactControlTelemetry?: unknown })
          .contactControlTelemetry ?? null,
      players: players.map((p) => ({
        ...p,
        team: initial.players.find((a) => a.id === p.playerId)?.team,
        role: initial.players.find((a) => a.id === p.playerId)?.slot.position,
        locomotion: state.players.find((a) => a.id === p.playerId)?.locomotionTelemetry ?? null,
      })),
      passingNetwork: telemetry.passingNetwork,
      possession: {
        changes: telemetry.possessionChanges,
        turnoverCauses: telemetry.turnoverCauses,
        touches: players.reduce((sum, p) => sum + p.touches, 0),
        receptions: players.reduce((sum, p) => sum + p.passesReceived, 0),
        carries: players.reduce((sum, p) => sum + p.carries, 0),
        firstTimePasses: telemetry.firstTimePassAttempts,
      },
      attackingFlow: {
        finalThirdEntries: telemetry.finalThirdEntries,
        finalThirdPossessionSeconds: telemetry.finalThirdPossessionSeconds,
        boxEntries: telemetry.boxEntries,
        boxTouches: telemetry.boxTouches,
        threatFlow: telemetry.threatFlow,
        // These values describe physically released shots, not unexecuted ranked options.
        releasedShotExpectations: {
          samples: telemetry.shootingOpportunityValues.length,
          sum: telemetry.shootingOpportunityValues.reduce((total, value) => total + value, 0),
          mean: telemetry.shootingOpportunityValues.length
            ? telemetry.shootingOpportunityValues.reduce((total, value) => total + value, 0) /
              telemetry.shootingOpportunityValues.length
            : null,
          maximum: telemetry.shootingOpportunityValues.length
            ? Math.max(...telemetry.shootingOpportunityValues)
            : null,
        },
      },
      pressing: pressure ?? null,
      defence: state.defensiveTelemetry ?? null,
      carrier: tracker
        ? {
            highPressureHolds: telemetry.ballHolds.filter((h) => h.pressureBand === 'high').length,
            carries: telemetry.carries,
            passesUnderPressure: telemetry.passOutcomes.filter((p) => p.pressure >= 0.67).length,
            firstTimeReleases: telemetry.firstTimePassAttempts,
            turnovers: telemetry.turnoverCauses,
            underPressure: pressureCarrierMetricsSchema.parse(pressureCarrier),
          }
        : null,
      shooting: {
        attempts: players.reduce((s, p) => s + p.shots, 0),
        onTarget: telemetry.shotsOnTarget,
        blocked: telemetry.shotsBlocked,
        posts: shotRows.filter((s) => s.outcome === 'post').length,
        crossbars: shotRows.filter((s) => s.outcome === 'crossbar').length,
        saves: players.reduce((s, p) => s + p.saves, 0),
        goals: state.score.home + state.score.away,
        families: Object.fromEntries(
          ['placed', 'driven', 'chip', 'header'].map((f) => [
            f,
            shotRows.filter((s) => s.intent === f).length,
          ]),
        ),
        firstTime: shotRows.filter((s) => s.firstTime).length,
        distanceBins: Object.fromEntries(
          [
            [0, 5],
            [5, 10],
            [10, 15],
            [15, 20],
            [20, 25],
            [25, 30],
            [30, 106],
          ].map(([lo, hi]) => [
            `${lo}-${hi}`,
            shotRows.filter((s) => s.distance >= lo! && s.distance < hi!).length,
          ]),
        ),
        angleBins: Object.fromEntries(
          [
            [0, 0.33],
            [0.33, 0.67],
            [0.67, 1.01],
          ].map(([lo, hi]) => [
            `${lo}-${hi}`,
            shotRows.filter((s) => s.angle >= lo! && s.angle < hi!).length,
          ]),
        ),
        pressureMean: shotRows.reduce((s, p) => s + p.pressure, 0) / Math.max(1, shotRows.length),
        players: players
          .filter((p) => p.shots > 0)
          .map((p) => ({
            player: p.playerId,
            role: initial.players.find((a) => a.id === p.playerId)?.slot.position,
            shots: p.shots,
          })),
        funnel: shotRows.slice(-256),
      },
      passing: {
        attempts: players.reduce((s, p) => s + p.passesAttempted, 0),
        completed: players.reduce((s, p) => s + p.passesCompleted, 0),
      },
      fouls: players.reduce((s, p) => s + p.fouls, 0),
      yellowCards: players.reduce((s, p) => s + p.yellowCards, 0),
      redCards: players.reduce((s, p) => s + p.redCards, 0),
    });
    save();
    process.stderr.write(
      `${config.revision} completed ${fixture.id}:${seed}: ${(performance.now() - started).toFixed(0)}ms\n`,
    );
  }
