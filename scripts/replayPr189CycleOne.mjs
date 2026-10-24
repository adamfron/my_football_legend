import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  symlinkSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as currentStep } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver as currentObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
const root = 'docs/performance/pr189';
const cycleTwo = process.argv.includes('--cycle-two');
const cycle = cycleTwo ? 'two' : 'one';
const version = process.argv.find((v) => v.startsWith('--version='))?.slice(10);
const output = `${root}/cycle-${cycle}-replay${version ? `-${version}` : ''}.json`;
const check = process.argv.includes('--check');
if (!check && existsSync(output)) throw Error('Preserve cycle-one replay');
const overlay = JSON.parse(
  gunzipSync(readFileSync(`${root}/failed-cycle-${cycle}-source.json.gz`)),
);
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr189-failed-'));
const verifyScratch = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr189-failed-')
  )
    throw Error('Unsafe source directory');
};
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const run = (initial, step, withObserver, observed) => {
  let state = JSON.parse(JSON.stringify(initial)),
    prematureControls = 0,
    firstRelease = null;
  let firstOwnershipChange = null,
    bodyPathMetres = 0;
  const events = [];
  state = withObserver(
    observed
      ? (t) => {
          events.push(t);
        }
      : undefined,
    () => {
      for (let i = 0; i < 800; i++) {
        const before = state;
        state = step(state, 0.025);
        if (firstOwnershipChange === null && state.ball.ownerId !== initial.ball.ownerId)
          firstOwnershipChange = {
            after: state.time - initial.time,
            ownerId: state.ball.ownerId ?? null,
          };
        if (before.ball.ownerId === initial.ball.ownerId) {
          const previousActor = before.players.find((p) => p.id === initial.ball.ownerId),
            actor = state.players.find((p) => p.id === initial.ball.ownerId);
          if (previousActor && actor)
            bodyPathMetres += Math.hypot(
              actor.position.x - previousActor.position.x,
              actor.position.y - previousActor.position.y,
            );
        }
        const old = before.lastGroundContact,
          next = state.lastGroundContact;
        if (
          old?.actorId === initial.ball.ownerId &&
          next?.actorId === old.actorId &&
          next.at !== old.at &&
          next.at < old.at + (old.surfaceContact?.recoverySeconds ?? 0) - 1e-8
        )
          prematureControls++;
        if (
          firstRelease === null &&
          state.lastPassDiagnostic?.passId !== initial.lastPassDiagnostic?.passId
        )
          firstRelease = state.time - initial.time;
      }
      return state;
    },
  );
  return {
    stateSha256: sha(state),
    eventsSha256: sha(events),
    prematureControls,
    firstRelease,
    firstOwnershipChange,
    bodyPathMetres,
  };
};
verifyScratch();
try {
  const archive = join(scratch, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, overlay.baseCommit]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  for (const f of overlay.files) {
    const target = resolve(scratch, f.path);
    if (
      !target.startsWith(resolve(scratch) + sep) ||
      !f.path.startsWith('src/') ||
      sha(f.content) !== f.sha256
    )
      throw Error('Invalid frozen source overlay');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content);
  }
  const manifest = readdirSync(join(scratch, 'src'), { recursive: true })
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
    .sort()
    .map((p) => ({
      path: `src/${p}`,
      sha256: sha(readFileSync(join(scratch, 'src', p), 'utf8').replaceAll('\r\n', '\n')),
    }));
  if (sha(manifest) !== overlay.sourceSha256)
    throw Error('Failed engine differs from original measured source');
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
  const paths = cycleTwo
    ? [`${root}/ww-opportunity-driven-v1-owner-audit-pathology-owner-120s.json.gz`]
    : [0, 1].map((index) => `${root}/ss-hierarchical-intent-v1-v1-pathology-${index}.json.gz`);
  const rows = paths.map((path) => {
    const initial = JSON.parse(gunzipSync(readFileSync(path))).state;
    const a = run(
      initial,
      old.stepTacticalMatchAfterDecisionProbe,
      observer.withBoundedObserver,
      true,
    );
    const b = run(
      initial,
      old.stepTacticalMatchAfterDecisionProbe,
      observer.withBoundedObserver,
      true,
    );
    const bare = run(
      initial,
      old.stepTacticalMatchAfterDecisionProbe,
      observer.withBoundedObserver,
      false,
    );
    const corrected = run(initial, currentStep, currentObserver, true);
    const correctedBare = run(initial, currentStep, currentObserver, false);
    if (
      a.stateSha256 !== b.stateSha256 ||
      a.stateSha256 !== bare.stateSha256 ||
      a.eventsSha256 !== b.eventsSha256 ||
      corrected.stateSha256 !== correctedBare.stateSha256 ||
      (!cycleTwo &&
        (!a.prematureControls || corrected.firstRelease === null || corrected.firstRelease > 2)) ||
      (cycleTwo &&
        (a.firstOwnershipChange !== null ||
          a.bodyPathMetres > 0.00001 ||
          !corrected.firstOwnershipChange ||
          corrected.firstOwnershipChange.after > 0.05 ||
          corrected.firstOwnershipChange.ownerId !== null)) ||
      corrected.prematureControls
    )
      throw Error('Causal contact recovery regression');
    return {
      path,
      old: a,
      repeated: b,
      bareStateSha256: bare.stateSha256,
      corrected,
      correctedBareStateSha256: correctedBare.stateSha256,
    };
  });
  const result = { schemaVersion: 1, failedSourceSha256: overlay.sourceSha256, ticks: 800, rows };
  if (check) {
    if (JSON.stringify(result) !== JSON.stringify(JSON.parse(readFileSync(output))))
      throw Error('Failed-cycle replay changed');
  } else writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  verifyScratch();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
