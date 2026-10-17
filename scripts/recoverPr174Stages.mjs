import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import console from 'node:console';
const base='docs/performance/pr174-experiments';
const c=JSON.parse(gunzipSync(readFileSync(`${base}/PR174-C-source.json.gz`)));
const b=JSON.parse(JSON.stringify(c)); b.stage='B';
const actions='src/core/matchSimulation/matchActions.ts', play='src/core/matchSimulation/combinationPlay.ts';
b.sources[actions]=b.sources[actions]
 .replace('observeCombinationRelease, enumerateCombinationPasses, isMovingCombinationReturn','observeCombinationRelease')
 .replace(/ {2}for \(const candidate of enumerateCombinationPasses\(state, actor\)\) \{\n {4}if \(candidate.type === 'pass'[^\n]*\n {6}actions.push\(candidate\);\n {2}\}\n/,'')
 .replace("receiverMoved > 4 ||\n    (isMovingCombinationReturn(state, actor, receiver) && decision.laneOccupation === 0 && decision.expectedCompletion > 0.62 && decision.defenderEta > decision.receiverEta + 0.12);",'receiverMoved > 4;');
b.sources[play]=b.sources[play]
 .replace('constrainTargetOnside, applyRoleRelationships','constrainTargetOnside')
 .replace('target: applyRoleRelationships(previous, runner, runner.idealTarget ?? runner.target)','target: runner.idealTarget ?? runner.target');
for(const key of Object.keys(b.harness)) b.harness[key]=b.harness[key].replaceAll('as unknown as TacticalMatchState','as TacticalMatchState');
const hash=sources=>createHash('sha256').update(Object.entries(sources).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,s])=>`${p}\0${s}\0`).join('')).digest('hex');
const receipt=JSON.parse(readFileSync('../pr174-research/PR174-B-development.json','utf8'));
assert.equal(hash(b.sources),receipt.manifest.sourceHash,'Reconstructed stage B source hash');
const harnessHash=createHash('sha256').update(b.harness['scripts/benchmarkPr174.ts']+b.harness['scripts/pr174Fixtures.ts']).digest('hex');
assert.equal(harnessHash,receipt.manifest.harnessHash,'Reconstructed stage B harness hash');
writeFileSync(`${base}/PR174-B-source.json.gz`,gzipSync(JSON.stringify(b)));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(p,e.name)):[resolve(p,e.name)]);
const root=resolve('../baseline-pr173');
const sources=Object.fromEntries(walk(resolve(root,'src/core/matchSimulation')).filter(p=>p.endsWith('.ts')&&!p.endsWith('.test.ts')).map(p=>[relative(root,p).replaceAll('\\','/'),readFileSync(p,'utf8').replaceAll('\r\n','\n')]));
assert.equal(hash(sources),JSON.parse(readFileSync('../pr174-research/PR174-A1-development.json','utf8')).manifest.sourceHash);
writeFileSync(`${base}/PR174-A-source.json.gz`,gzipSync(JSON.stringify({stage:'A',sources,harness:b.harness})));
console.log('A and B archives match their measured source hashes; B harness matches byte-for-byte.');
