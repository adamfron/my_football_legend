import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  symlinkSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as currentStep } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver as currentObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { deriveRestartLegalReadiness } from '../src/core/matchSimulation/restartLaws.ts';
import { capturePathologicalState } from '../src/core/matchSimulation/pathologicalReplay.ts';

const root = 'docs/performance/pr189';
const base = 'f8d3e0929441f49cdc448cb5c24d663a91ccc409';
const frozenSource = '2d0278506b91b7577d9f84c4964ffcc1767a4d57475e9d5992be4cef5e302edb';
const check = process.argv.includes('--check');
const output = `${root}/restart-replay.json`;
if (!check && existsSync(output)) throw Error('Preserve restart replay');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const sourceHash = (directory) =>
  sha(
    readdirSync(join(directory, 'src'), { recursive: true })
      .map((p) => p.replaceAll('\\', '/'))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
      .sort()
      .map((p) => ({
        path: `src/${p}`,
        sha256: sha(readFileSync(join(directory, 'src', p), 'utf8').replaceAll('\r\n', '\n')),
      })),
  );
const initial = JSON.parse(
  gunzipSync(readFileSync(`${root}/sw-contextual-judgment-v1-cutoff-diagnosis-cutoff.json.gz`)),
).state;
const cutoff = JSON.parse(readFileSync(`${root}/sw-contextual-judgment-v1-v3.json`));
if (sha(initial) !== cutoff.finalStateSha256 || cutoff.sourceSha256 !== frozenSource)
  throw Error('Cutoff input differs from the retained negative result');

const run = (step, observer, observed) => {
  let state = JSON.parse(JSON.stringify(initial)),
    after4s;
  let firstLegalAt = null,
    firstRelease = null,
    bodyPathMetres = 0,
    maximumSetupStep = 0;
  const events = createHash('sha256'),
    frames = [];
  const actorId = 'geometry:opponent:3',
    awardId = initial.restart.awardId,
    spot = initial.restart.spot;
  state = observer(
    observed
      ? (t) => {
          events.update(JSON.stringify(t));
        }
      : undefined,
    () => {
      for (let i = 0; i < 800; i++) {
        const before = state;
        const ready = deriveRestartLegalReadiness(state);
        if (firstLegalAt === null && state.restart?.awardId === awardId && ready.ready)
          firstLegalAt = state.time;
        state = step(state, 0.025);
        const actor = state.players.find((p) => p.id === actorId);
        if (before.restart?.awardId === awardId && before.restart.phase !== 'release') {
          const previous = before.players.find((p) => p.id === actorId);
          bodyPathMetres += Math.hypot(
            actor.position.x - previous.position.x,
            actor.position.y - previous.position.y,
          );
          for (const player of state.players) {
            const old = before.players.find((p) => p.id === player.id);
            if (old)
              maximumSetupStep = Math.max(
                maximumSetupStep,
                Math.hypot(player.position.x - old.position.x, player.position.y - old.position.y),
              );
          }
        }
        const interval = state.stoppageLedger?.intervals.find((p) => p.awardId === awardId);
        if (firstRelease === null && interval?.executedAt !== undefined) {
          firstRelease = {
            at: interval.executedAt,
            after: interval.executedAt - initial.time,
            minimumOpponentDistance: Math.min(
              ...state.players
                .filter((p) => p.team !== initial.restart.restartTeam)
                .map((p) => Math.hypot(p.position.x - spot.x, p.position.y - spot.y)),
            ),
            ballSpeed: Math.hypot(state.ball.velocity.x, state.ball.velocity.y),
            requiredEndAt: state.timekeeping.requiredEndAt,
            incidentStartedAt: interval.startedAt,
          };
        }
        if (i % 40 === 0)
          frames.push({
            after: state.time - initial.time,
            position: actor.position,
            target: actor.target,
            awardId: state.restart?.awardId ?? null,
            phase: state.restart?.phase ?? null,
            blockers: deriveRestartLegalReadiness(state).blockers,
            requiredEndAt: state.timekeeping.requiredEndAt,
          });
        if (i === 159) after4s = JSON.parse(JSON.stringify(state));
      }
      return state;
    },
  );
  return {
    after4s,
    metrics: {
      stateSha256: sha(state),
      after4sStateSha256: sha(after4s),
      eventsSha256: events.digest('hex'),
      firstLegalAt,
      firstRelease,
      bodyPathMetres,
      maximumSetupStep,
      finalAwardId: state.restart?.awardId ?? null,
      finalRequiredEndAt: state.timekeeping.requiredEndAt,
      frames,
    },
  };
};

const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr189-restart-'));
const verifyScratch = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr189-restart-')
  )
    throw Error('Unsafe restart replay directory');
};
verifyScratch();
try {
  const archive = join(scratch, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, base]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  if (sourceHash(scratch) !== frozenSource) throw Error('Frozen restart engine differs');
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const old = await import(
    pathToFileURL(join(scratch, 'src/core/matchSimulation/matchSimulation.ts'))
  );
  const observer = await import(
    pathToFileURL(join(scratch, 'src/core/matchSimulation/boundedIntelligence.ts'))
  );
  const before = [true, true, false].map(
    (observed) =>
      run(old.stepTacticalMatchAfterDecisionProbe, observer.withBoundedObserver, observed).metrics,
  );
  const continued = [true, true, false].map((observed) =>
    run(currentStep, currentObserver, observed),
  );
  const after = continued.map((r) => r.metrics);
  const negative = JSON.parse(readFileSync(`${root}/adversarial.json`)).rows.find((r) =>
    r.path.endsWith('-cutoff.json.gz'),
  );
  if (before[0].stateSha256 !== negative?.stateHashes[0])
    throw Error('Frozen engine no longer reproduces the original cutoff continuation');
  for (const group of [before, after]) {
    if (
      new Set(group.map((r) => r.stateSha256)).size !== 1 ||
      group[0].eventsSha256 !== group[1].eventsSha256
    )
      throw Error('Restart replay is not deterministic/observer neutral');
  }
  if (
    before[0].firstRelease !== null ||
    before[0].bodyPathMetres > 0.00001 ||
    before[0].finalAwardId !== initial.restart.awardId ||
    !after[0].firstRelease ||
    after[0].firstRelease.after > 4 ||
    after[0].firstRelease.minimumOpponentDistance < 9.14 ||
    after[0].firstRelease.ballSpeed <= 1 ||
    after[0].maximumSetupStep > 0.35 ||
    after[0].finalRequiredEndAt < initial.timekeeping.requiredEndAt
  )
    throw Error('Physical restart repair regression');
  const currentSourceSha256 = sourceHash('.');
  const result = {
    schemaVersion: 1,
    classification:
      'actual SW/C cutoff state; unchanged clocks; 800 physical ticks; exact frozen engine and observer comparisons',
    baseCommit: base,
    frozenSourceSha256: frozenSource,
    currentSourceSha256,
    initialStateSha256: sha(initial),
    before,
    after,
  };
  if (check) {
    if (JSON.stringify(result) !== JSON.stringify(JSON.parse(readFileSync(output))))
      throw Error('Restart evidence changed');
  } else {
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    writeFileSync(
      `${root}/restart-repaired-after-4s.json.gz`,
      gzipSync(
        JSON.stringify(
          capturePathologicalState(
            continued[0].after4s,
            base,
            `physical restart repair; source manifest ${currentSourceSha256}`,
          ),
        ),
      ),
    );
  }
  console.log(
    JSON.stringify({
      replay: 'PASS',
      currentSourceSha256,
      oldRelease: before[0].firstRelease,
      correctedRelease: after[0].firstRelease,
      observerNeutral: true,
    }),
  );
} finally {
  verifyScratch();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
