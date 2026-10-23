import { readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';
import { tacticalRoleFor } from '../src/core/matchSimulation/tacticalRoles.ts';
import { deriveTacticalRolePhase } from '../src/core/matchSimulation/roleTactics.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';

const sourceHash = JSON.parse(
    readFileSync('docs/performance/PR183-closure-freeze.json'),
  ).sourceHash,
  rows = [],
  details = [];
if (pr183SourceHash() !== sourceHash) {
  execFileSync(process.execPath, ['scripts/verifyPr183TypeOnlyBridge.mjs'], { stdio: 'pipe' });
  const bridge = JSON.parse(readFileSync('docs/performance/PR183-closure-type-only-bridge.json'));
  if (
    bridge.simulatedSourceHash !== sourceHash ||
    bridge.compilableSourceHash !== pr183SourceHash()
  )
    throw Error('Invalid type-only bridge');
}
for (const dir of [
  '../pr183-closure-final-development',
  '../pr183-closure-final-regression',
  '../pr183-closure-final-validation',
]) {
  for (const file of readdirSync(dir).filter((p) => p.endsWith('-phase-role-hybrid-v1.json.gz'))) {
    const r = JSON.parse(gunzipSync(readFileSync(`${dir}/${file}`)));
    if (r.productionHash !== sourceHash || r.status !== 'full_time')
      throw Error('Wrong/incomplete audit source');
    for (const e of r.realism.retreatExcursions.filter((e) => e.peakMetres >= 15)) {
      const frozen = r.longRetreatSnapshots.find(
        (s) => s.ownerId === e.id && Math.abs(s.startedAt - e.at) < 0.05,
      );
      if (!frozen) throw Error(`Missing peak audit snapshot ${r.design.id}:${e.at}`);
      const bytes = readFileSync(`${dir}/${frozen.file}`);
      let state = JSON.parse(gunzipSync(bytes));
      tacticalMatchStateSchema.parse(state);
      if (digest(state) !== frozen.stateHash) throw Error('Snapshot digest mismatch');
      copyFileSync(
        `${dir}/${frozen.file}`,
        `docs/performance/pr183-evidence/closure-audit-${frozen.file}`,
      );
      const actor = state.players.find((p) => p.id === e.id),
        dirSign = attacksRight(actor) ? 1 : -1;
      const rankings = [];
      const observe = (s, id, ranked) => {
        if (id !== e.id) return;
        const a = s.players.find((p) => p.id === id);
        const forward = ranked.filter(
          (q) => q.action.type === 'pass' && dirSign * (q.action.target.x - a.position.x) > 3,
        );
        rankings.push({
          at: s.time,
          position: a.position,
          pressure: s.currentPressure,
          releaseReady: canReleaseControlledAction(s, a),
          role: tacticalRoleFor(s, a).id,
          phase: deriveTacticalRolePhase(s, a.team),
          coachPlan: s.teams[a.team].coaching?.plan,
          forwardPasses: forward.length,
          bestForwardPass: forward[0],
          top: ranked.slice(0, 3),
        });
      };
      let maxPeak = (e.origin.x - actor.position.x) * dirSign;
      const start = state.time;
      while (state.ball.ownerId === e.id && state.time < start + 90) {
        state = withRankingObserver(observe, () =>
          stepTacticalMatchAfterDecisionProbe(state, 0.025),
        );
        if (state.ball.ownerId === e.id)
          maxPeak = Math.max(
            maxPeak,
            (e.origin.x - state.players.find((p) => p.id === e.id).position.x) * dirSign,
          );
      }
      if (
        state.ball.ownerId === e.id ||
        Math.abs(maxPeak - e.peakMetres) > 0.15 ||
        Math.abs(state.time - e.endAt) > 0.06
      )
        throw Error('Peak continuation failed to reproduce');
      const row = {
        fixture: r.design.id,
        cohort: r.cohort,
        sourceHash,
        inputHash: r.inputHash,
        snapshotHash: frozen.stateHash,
        snapshot: `pr183-evidence/closure-audit-${frozen.file}`,
        episode: e,
        replayedPeak: maxPeak,
        terminalAt: state.time,
        terminalAction: state.latestAction,
        terminalBall: state.ball,
        lastPossessionLoss: state.lastPossessionLoss,
        lastChallenge: state.lastChallenge,
        lastPossessionChange: state.lastPossessionChange,
        finalHash: digest(state),
        rankings: rankings.length,
        releaseReadyRankings: rankings.filter((q) => q.releaseReady).length,
        rankingsWithForwardPass: rankings.filter((q) => q.forwardPasses > 0).length,
        firstRanking: rankings[0],
        lastRanking: rankings.at(-1),
      };
      rows.push(row);
      details.push({ ...row, rankings });
    }
  }
}
writeFileSync(
  'docs/performance/pr183-evidence/closure-current-retreat-audit.json.gz',
  gzipSync(JSON.stringify(details)),
);
writeFileSync(
  'docs/performance/PR183-closure-current-retreat-audit.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-closure-current-retreat-audit-v1',
      sourceHash,
      scope:
        'Every observed R3 continuous-owner PEAK >=15m, including forward recoveries. Replay begins at the first >12m snapshot on the identical source. Finite backward recycling is not automatically a defect; rankings, foot access, pressure and actual ending retained for review.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      id: r.fixture,
      at: r.episode.at,
      peak: r.episode.peakMetres,
      recovered: r.episode.recoveredForwardMetres,
      pressure: r.episode.meanPressure,
      end: r.terminalAction?.type,
      rankings: r.rankings,
      release: r.releaseReadyRankings,
      forward: r.rankingsWithForwardPass,
    })),
    null,
    2,
  ),
);
