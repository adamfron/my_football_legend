import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { pr172SourceHash } from './pr172Evidence.ts';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const initialBytes = readFileSync(
  'docs/performance/pr177-evidence/loose-contact-loop-input.json.gz',
);
const initial = JSON.parse(gunzipSync(initialBytes));
const historical = JSON.parse(
  readFileSync('docs/performance/PR177-loose-contact-loop.json', 'utf8'),
);
if (historical.rows.some((r) => r.initialHash !== sha(initial)))
  throw new Error('Historical input hash mismatch');
mkdirSync('docs/performance/pr178-evidence', { recursive: true });
const files = readdirSync('src/core/matchSimulation')
  .filter((f) => f.endsWith('.ts'))
  .sort();
if (phase === 'before') {
  if (existsSync('docs/performance/PR178-baseline.json'))
    throw new Error('Baseline already frozen');
  writeFileSync(
    'docs/performance/PR178-baseline.json',
    JSON.stringify(
      {
        baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceHash: pr172SourceHash(),
        node: process.version,
        dt: 0.025,
        inputHash: sha(initial),
        compressedInputHash: sha(initialBytes),
        sourceFiles: Object.fromEntries(
          files.map((f) => [
            f,
            sha(readFileSync(`src/core/matchSimulation/${f}`, 'utf8').replaceAll('\r\n', '\n')),
          ]),
        ),
        lockHash: sha(readFileSync('package-lock.json', 'utf8').replaceAll('\r\n', '\n')),
      },
      null,
      2,
    ) + '\n',
  );
}
const rows = [];
for (const policy of ['legacy-pr176', 'state-value-v1']) {
  let state = globalThis.structuredClone(initial);
  delete state.decisionReadiness;
  state.decisionPolicy = policy;
  const origin = { ...state.ball },
    startCount = state.statistics.observedContactIds.length,
    frames = [];
  let firstControl;
  for (let tick = 0; tick < 200; tick++) {
    const previous = state;
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (state.ball.ownerId && firstControl === undefined) firstControl = state.time - initial.time;
    const nearby = state.players.filter(
      (p) => Math.hypot(p.position.x - state.ball.x, p.position.y - state.ball.y) < 2,
    );
    frames.push({
      tick,
      time: state.time,
      previousBall: previous.ball,
      ball: state.ball,
      previousContact: previous.lastBallContact,
      contact: state.lastBallContact,
      newContactIds: state.statistics.observedContactIds.slice(
        previous.statistics.observedContactIds.length,
      ),
      episode: state.ballEpisode,
      acquisition: state.ballAcquisition,
      nearby: nearby.map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        previousPosition: previous.players.find((q) => q.id === p.id)?.position,
        spherePenetration:
          0.83 -
          Math.hypot(
            state.ball.x - p.position.x,
            state.ball.y - p.position.y,
            (state.ball.height ?? 0.11) - 0.9,
          ),
      })),
    });
  }
  const trace = `pr178-evidence/contact-loop-${phase}-${policy}.json.gz`;
  writeFileSync(`docs/performance/${trace}`, gzipSync(JSON.stringify(frames)));
  rows.push({
    policy,
    sourceHash: pr172SourceHash(),
    inputHash: sha(initial),
    addedContactIdentities: state.statistics.observedContactIds.length - startCount,
    horizontalDisplacement: Math.hypot(state.ball.x - origin.x, state.ball.y - origin.y),
    firstControl,
    finalBall: state.ball,
    legalOutcome: {
      status: state.status,
      scenario: state.scenario,
      score: state.score,
      restart: state.restart,
      lastRestartAward: state.lastRestartAward,
      lastBoundaryCrossing: state.lastBoundaryCrossing,
    },
    finalHash: sha(state),
    trace,
    contactPlayers: [
      ...new Set(frames.filter((f) => f.newContactIds.length).map((f) => f.contact?.playerId)),
    ],
  });
}
writeFileSync(
  `docs/performance/PR178-contact-loop-${phase}.json`,
  JSON.stringify({ phase, rows }, null, 2) + '\n',
);
console.log(JSON.stringify(rows));
