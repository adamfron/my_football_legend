import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import {
  readDevelopmentInput,
  manifest,
  retainSourceVersion,
  hash,
  writeReceipt,
} from './pr193Evidence.mjs';
const { input } = readDevelopmentInput('ss', 'state-value-v1');
let s = globalThis.structuredClone(input);
s.experimentalBallRecovery = true;
s.experimentalRestartPreparation = true;
const source = manifest(),
  sourceArchive = retainSourceVersion(source),
  flow = new NaturalMatchFlowDiagnostics();
const reference = readPr192Evidence(
  'docs/performance/pr192/matches/ss-state-value-v1-combined-final-v2.json',
);
const rows = [],
  captures = [],
  seen = new Set();
let ticks = 0;
mkdirSync('docs/performance/pr193/foul-captures', { recursive: true });
while (!['full_time', 'abandoned'].includes(s.status) && s.time < 7200) {
  if (s.status === 'half_time') s = startSecondHalf(s);
  const before = s;
  const close =
    before.defensiveChallenge ||
    before.players.some(
      (p) =>
        p.id === before.nearestChallengerId &&
        Math.hypot(p.position.x - before.ball.x, p.position.y - before.ball.y) < 2.2,
    );
  const frozen = close ? globalThis.structuredClone(before) : null;
  s = step(s, 0.025);
  flow.observe(before, s);
  const challenge = s.lastChallenge;
  if (challenge && !seen.has(challenge.id)) {
    seen.add(challenge.id);
    const row = {
      challenge,
      foul: s.lastFoul?.challengeId === challenge.id ? s.lastFoul : null,
      physicalContactReceipt: s.lastGroundContact?.at === challenge.at ? s.lastGroundContact : null,
      capture: null,
    };
    const category = `${challenge.technique}:${challenge.outcome}:${challenge.fromBehind ? 'behind' : 'front'}:${challenge.ballFirst ? 'ball-first' : 'no-ball'}`;
    if (frozen && captures.length < 16 && !captures.some((c) => c.category === category)) {
      const index = captures.length,
        path = `docs/performance/pr193/foul-captures/contact-${index}.json.gz`;
      const replay = step(globalThis.structuredClone(frozen), 0.025);
      if (hash(replay) !== hash(s))
        throw Error('Contact capture does not reproduce ' + challenge.id);
      const value = {
          schema: 'mfl-pr193-foul-capture-v1',
          state: frozen,
          expectedNextHash: hash(s),
          challengeId: challenge.id,
        },
        bytes = gzipSync(JSON.stringify(value));
      writeFileSync(path, bytes, { flag: 'wx' });
      row.capture = path;
      captures.push({
        category,
        path,
        sha256: hash(bytes),
        stateHash: hash(frozen),
        nextHash: hash(s),
      });
    }
    rows.push(row);
  }
  if (++ticks % 64000 === 0) console.log('SS/B baseline foul replay', s.time.toFixed(1));
}
const fouls = rows.filter((r) => r.challenge.outcome === 'foul');
const result = {
  schema: 'mfl-pr193-foul-audit-v1',
  source,
  sourceHash: hash(source),
  sourceArchive,
  inputHash: hash(input),
  classification:
    'exact full development replay of PR192 SS/B; existing geometric duel adjudication; no foul retuning',
  finalHash: hash(s),
  referenceFinalHash: reference.finalHash,
  baselinePreserved: hash(s) === reference.finalHash,
  status: s.status,
  ticks,
  challengeCount: rows.length,
  foulChallenges: fouls.length,
  behindFouls: fouls.filter((r) => r.challenge.fromBehind).length,
  ballFirstFouls: fouls.filter((r) => r.challenge.ballFirst).length,
  flow: flow.report(s),
  captures,
  rows,
  limits:
    'A correct replay proves reproducibility, not that every estimated body contact or force threshold is physically calibrated. Ordinary/careless, reckless and excessive-force classification remains the existing explicit rule model.',
};
writeReceipt('docs/performance/pr193/foul-audit-v1.json', result);
console.log(
  JSON.stringify({
    status: s.status,
    baselinePreserved: result.baselinePreserved,
    fouls: result.foulChallenges,
    behind: result.behindFouls,
    captures: captures.length,
  }),
);
if (!result.baselinePreserved || s.status !== 'full_time') process.exitCode = 1;
