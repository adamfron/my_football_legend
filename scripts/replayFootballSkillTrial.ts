import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  footballSkillTrialResultSchema,
  runFootballSkillTrial,
} from '../src/core/matchSimulation/footballPerformanceLab';

const input = process.argv[2];
if (!input) throw new Error('Usage: replayFootballSkillTrial.ts <trial.json[.gz]> [output.json]');
const bytes = readFileSync(input),
  saved = footballSkillTrialResultSchema.parse(
    JSON.parse((input.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8')),
  );
const replay = runFootballSkillTrial(saved.input.config, saved.input.player, saved.seed);
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const expectedSha256 = sha(saved),
  actualSha256 = sha(replay),
  identical = expectedSha256 === actualSha256;
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(replay) + '\n');
console.log(
  JSON.stringify({
    identical,
    expectedSha256,
    actualSha256,
    seed: saved.seed,
    status: replay.status,
    finishSeconds: replay.finishSeconds,
    ticks: replay.ticks,
  }),
);
if (!identical) process.exitCode = 1;
