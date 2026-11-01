import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';
import {
  createTacticalMatch,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation.ts';
import {
  projectPlayerAgency,
  applyPlayerDecision,
} from '../src/core/matchSimulation/playerDecision.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import {
  canOfferOwnedBallActions,
  releaseContactReadiness,
} from '../src/core/matchSimulation/decisionReadiness.ts';
import { checkPr210Source } from './pr210SourceGuard.mjs';
const binding = checkPr210Source(),
  world = createCanonicalWorldDatabase();
const seed = 'pr210:interactive-right-back:full-match:B';
const preview = createSingleMatchSession(world, {
  homeClubId: world.clubs[0].id,
  awayClubId: world.clubs[1].id,
  seed,
  control: { mode: 'spectator' },
});
const footballer = preview.home.players.find((p) => p.profile.primaryPosition === 'right_back');
let state = createTacticalMatch(
  createSingleMatchSession(world, {
    ...preview.setup,
    control: {
      mode: 'player',
      clubId: world.clubs[0].id,
      footballerId: footballer.footballerId,
      forceIntoXI: true,
    },
  }),
);
const start = performance.now(),
  cpu = process.cpuUsage(),
  decisions = [];
let ticks = 0;
while (!['full_time', 'abandoned'].includes(state.status) && ticks < 400000) {
  if (state.status === 'half_time') {
    state = startSecondHalf(state);
    continue;
  }
  const opportunity = projectPlayerAgency(state).opportunity;
  if (opportunity) {
    const actor = state.players.find((p) => p.id === opportunity.actorId);
    if (opportunity.kind === 'on_ball') assert.ok(canOfferOwnedBallActions(state, actor));
    const ranked = opportunity.kind === 'on_ball' ? rankAvailableActionsForAI(state, actor.id) : [];
    const rankedOption = ranked.flatMap((r) =>
      opportunity.options.filter(
        (o) => o.kind === 'action' && JSON.stringify(o.action) === JSON.stringify(r.action),
      ),
    )[0];
    const option = rankedOption ?? opportunity.options[0];
    const next = applyPlayerDecision(state, opportunity, option.id);
    assert.notEqual(next, state, 'Unresolved explicit test-driver choice');
    decisions.push({
      at: state.time,
      kind: opportunity.kind,
      reason: opportunity.triggerReason,
      option,
      body: actor.position,
      ball: state.ball,
      readiness: releaseContactReadiness(state, actor),
    });
    state = next;
  } else {
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    ticks++;
  }
  if (ticks && ticks % 40000 === 0)
    console.log(
      JSON.stringify({
        ticks,
        seconds: state.time,
        decisions: decisions.length,
        status: state.status,
      }),
    );
}
const usage = process.cpuUsage(cpu);
const receipt = {
  source: binding.fingerprint,
  seed,
  controller: 'Explicit deterministic test-driver selections; not a manual browser playtest',
  status: state.status,
  canonicalTime: state.time,
  ticks,
  decisions,
  finalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
  score: state.score,
  policy: state.decisionPolicy,
  fixedStep: 0.025,
  performance: {
    wallSeconds: (performance.now() - start) / 1000,
    cpuSeconds: (usage.user + usage.system) / 1e6,
    peakRSSKiB: process.resourceUsage().maxRSS,
  },
};
writeFileSync(
  'docs/performance/pr210/interactive-smoke.json',
  JSON.stringify(receipt, null, 2) + '\n',
);
assert.equal(state.status, 'full_time');
console.log(
  JSON.stringify({
    status: state.status,
    time: state.time,
    ticks,
    decisions: decisions.length,
    performance: receipt.performance,
  }),
);
