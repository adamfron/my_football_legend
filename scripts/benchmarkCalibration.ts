import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { runCalibrationShotFunnel } from './calibrationShotFunnel';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import {
  projectPlayerAgency,
  resolveDevPlayerDecision,
} from '../src/core/matchSimulation/playerDecision';
import { PlayerAgencyTracker } from '../src/core/matchSimulation/playerAgency';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  summarizeShootingStyles,
} from '../src/core/matchSimulation/matchFlowTelemetry';

// Same canonical engine and fixed step as gameplay. Explicit DEV delegation is the input policy.
const config = z
  .object({
    seconds: z.coerce.number().min(60).max(1200).default(600),
    seeds: z.coerce.number().int().min(1).max(4).default(3),
  })
  .parse({
    seconds: process.env.MFL_CALIBRATION_SECONDS,
    seeds: process.env.MFL_CALIBRATION_SEEDS,
  });
const world = createCanonicalWorldDatabase();
const sessions = Array.from({ length: config.seeds }, (_, index) => {
  const home = world.clubs[index * 2]!;
  const away = world.clubs[index * 2 + 1]!;
  const spectator = createSingleMatchSession(world, {
    homeClubId: home.id,
    awayClubId: away.id,
    seed: `pr145:calibration:${index}`,
    control: { mode: 'spectator' },
  });
  const role = ['central_midfielder', 'left_back', 'striker'][index % 3];
  const player =
    spectator.home.players.find((p) => p.profile.primaryPosition === role) ??
    spectator.home.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!;
  const session = createSingleMatchSession(world, {
    ...spectator.setup,
    control: {
      mode: 'player',
      clubId: home.id,
      footballerId: player.footballerId,
      forceIntoXI: false,
    },
  });
  let state = createTacticalMatch(session);
  let telemetry = createMatchFlowTelemetry();
  const agency = new PlayerAgencyTracker();
  const reasons: Record<string, number> = {};
  let leadAttempts = 0;
  let leadBehindMotion = 0;
  let lastPassId = '';
  const observe = (next: typeof state) => {
    telemetry = observeMatchFlow(telemetry, state, next);
    const pass = next.lastPassDiagnostic;
    if (pass && pass.passId !== lastPassId) {
      lastPassId = pass.passId;
      const action = next.latestAction;
      if (action?.type === 'pass' && ['lead', 'through'].includes(action.intent)) {
        leadAttempts++;
        const v = pass.receiverVelocityAtRelease;
        const p = pass.predictedReceptionPoint;
        const r = pass.receiverPositionAtRelease;
        if (Math.hypot(v.x, v.y) > 0.5 && (p.x - r.x) * v.x + (p.y - r.y) * v.y < -0.25)
          leadBehindMotion++;
      }
    }
    state = next;
  };
  const ticks = Math.round(config.seconds / FIXED_MATCH_DT);
  for (let tick = 0; tick < ticks; tick++) {
    if (state.status === 'abandoned' || state.status === 'full_time') break;
    const evaluation = projectPlayerAgency(state);
    const diagnostic = agency.observe(state, evaluation);
    if (diagnostic && diagnostic.ownership !== 'ineligible') {
      const reason = `${diagnostic.ownership}:${diagnostic.reason ?? 'unspecified'}`;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    if (evaluation.opportunity)
      observe(resolveDevPlayerDecision(state, evaluation.opportunity).state);
    if (state.status === 'abandoned') break;
    observe(stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT));
  }
  const stats = state.statistics?.players ?? [];
  return {
    seed: session.setup.seed,
    controlledPosition: player.profile.primaryPosition,
    canonicalSeconds: state.time,
    status: state.status,
    termination: state.termination,
    canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    score: state.score,
    shots: telemetry.shots,
    releasedShots: stats.reduce((sum, p) => sum + p.shots, 0),
    onTarget: telemetry.shotsOnTarget,
    onTargetRate: telemetry.shots ? telemetry.shotsOnTarget / telemetry.shots : 0,
    goals: telemetry.goals,
    saves: telemetry.saves,
    keeperContacts: telemetry.shotDiagnostics.filter((s) =>
      ['catch', 'parry', 'parry_away', 'failed_save'].includes(s.goalkeeperAction ?? ''),
    ).length,
    shotFamilies: summarizeShootingStyles(telemetry),
    passes: {
      attempted: telemetry.passesAttempted,
      completed: telemetry.passesCompleted,
      completionRate: telemetry.passesAttempted
        ? telemetry.passesCompleted / telemetry.passesAttempted
        : 0,
    },
    lead: { attempts: leadAttempts, behindActiveMotion: leadBehindMotion },
    agency: agency.snapshot(state.time),
    reasons,
    statistics: {
      receivedWithoutTouch: stats.filter((s) => s.passesReceived > s.touches).length,
      attempts: stats.reduce((n, s) => n + s.passesAttempted, 0),
      completed: stats.reduce((n, s) => n + s.passesCompleted, 0),
      received: stats.reduce((n, s) => n + s.passesReceived, 0),
      networkCompleted: telemetry.passingNetwork.reduce((n, e) => n + e.completed, 0),
    },
  };
});
const total = sessions.reduce(
  (n, s) => ({
    seconds: n.seconds + s.canonicalSeconds,
    shots: n.shots + s.shots,
    onTarget: n.onTarget + s.onTarget,
    goals: n.goals + s.goals,
    saves: n.saves + s.saves,
    keeperContacts: n.keeperContacts + s.keeperContacts,
    passes: n.passes + s.passes.attempted,
    completed: n.completed + s.passes.completed,
    humanDecisions: n.humanDecisions + s.agency.meaningfulHumanDecisions,
  }),
  {
    seconds: 0,
    shots: 0,
    onTarget: 0,
    goals: 0,
    saves: 0,
    keeperContacts: 0,
    passes: 0,
    completed: 0,
    humanDecisions: 0,
  },
);
process.stdout.write(
  JSON.stringify(
    {
      config,
      inputPolicy: 'explicit_dev_ai_selection',
      totals: {
        ...total,
        onTargetRate: total.shots ? total.onTarget / total.shots : 0,
        decisionsPer90: (total.humanDecisions * 5400) / total.seconds,
      },
      sessions,
      controlledShotFixtures: runCalibrationShotFunnel(),
    },
    null,
    2,
  ) + '\n',
);
