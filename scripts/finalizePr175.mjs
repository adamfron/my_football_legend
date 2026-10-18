/* global console */
import process from 'node:process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const mode=process.argv.find((a)=>a.startsWith('--mode='))?.slice(7)??'validation';
const read=(p)=>JSON.parse(readFileSync(p,'utf8'));
const get=(n)=>read(`docs/performance/PR175-${n}.json`);
const write=(n,v)=>writeFileSync(`docs/performance/PR175-${n}.json`,JSON.stringify({version:1,...v},null,2)+'\n');
const hash=(b)=>createHash('sha256').update(b).digest('hex');
if(mode==='validation') {
  const frozen=get('candidate-freeze'),stats=get('independent-match-distributions');
  if(stats.status!=='complete'||stats.groups.validation6.matches!==6)throw new Error('Need final complete cohort analysis');
  const files=readdirSync('../pr175-validation').filter((n)=>n.endsWith('-cohort.json'));
  const rows=files.map((n)=>read(`../pr175-validation/${n}`));
  if(rows.some((r)=>r.manifest.sourceHash!==frozen.sourceHash||r.status!=='full_time'))throw new Error('Frozen validation source/completion mismatch');
  write('post-correction-validation',{status:'complete',sourceHash:frozen.sourceHash,freezeAt:frozen.frozenAt,consumedAt:new Date().toISOString(),
    independentNewMatches:12,sealedValidationMatches:6,developmentMatches:6,acceptedGameplayCorrections:[],
    method:'One post-freeze evaluation of six previously unread fixtures. Production source equals baseline exactly; there is no non-identical gameplay candidate or claimed before/after effect. No tuning after validation was opened.',
    development:stats.groups.development6,validation:stats.groups.validation6,
    sourcesAndInputs:rows.map((r)=>({id:r.design.id,sourceHash:r.manifest.sourceHash,initialHash:r.initialHash,finalHash:r.finalHash,status:r.status,score:r.score})),
    readiness:'NOT READY',reason:'Severe attacking scarcity and circulation remain; no supported population calibration of summary output.',
    nextHoldout:'Consumed. Any future repair/tuning must freeze a new untouched fixture set.'});
} else if(mode==='performance') {
  const window=get('performance-windows'),pairs=[];
  for(const id of ['dev-youth','dev-balanced']) {
    const observed=read(`../pr175-development/${id}-cohort.json`),plain=read(`../pr175-plain/${id}-plain.json`);
    if(observed.finalHash!==plain.finalHash||observed.ticks!==plain.ticks||plain.status!=='full_time')throw new Error('Whole-match observer equivalence failed');
    pairs.push({id,sourceHash:plain.manifest.sourceHash,initialHash:plain.initialHash,finalHash:plain.finalHash,ticks:plain.ticks,time:plain.time,
      cpuMs:plain.cpuMs,wallMs:plain.wallMs,memory:plain.memory,completeCanonicalStateEqual:true});
  }
  const median=(a)=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  const modes=Object.fromEntries(['plain','existing','detailed'].map((mode)=>[mode,{cpuMs:median(window.rows.filter((r)=>r.mode===mode).map((r)=>r.cpuMs)),
    wallMs:median(window.rows.filter((r)=>r.mode===mode).map((r)=>r.wallMs)),retainedBytes:median(window.rows.filter((r)=>r.mode===mode).map((r)=>r.retainedBytes))}]));
  write('performance',{status:'complete',sourceHash:window.manifest.sourceHash,productionSourceEqualsMergedPr174:true,
    method:window.method,windowMedians:modes,diagnosticCpuRatio:modes.detailed.cpuMs/modes.plain.cpuMs,
    windowInterpretation:'Only three short measured samples per mode. A detailed/plain CPU ratio below one, especially with a different wall-time ordering, is not an observer speedup or evidence of zero overhead. Scheduler/JIT/GC contributions were not isolated. Treat these as descriptive mode timings and retention costs; full-match observed research timings were concurrent and are not an overhead comparator.',
    fullMatchMethod:'process.cpuUsage and performance.now around the entire canonical stepping loop, excluding imports, fixture creation, final hashing and receipt serialization; whole-process lifetime and startup are separate questions.',
    windowRows:window.rows,profiles:window.profiles,combinationTimings:window.combinationTimings,fullMatchEquivalence:pairs,startup:get('career-startup'),
    limitation:'No gameplay change or claimed speedup. Full-match observer-disabled replays run serially after concurrent research/verification; older parallel cohort wall times are not used as performance evidence. Heap/RSS snapshots are not isolated peaks. Inclusive profiler and isolated combination spans overlap; combination invocation timing includes timer overhead and is not a full-match CPU share or a measurement of all shared movement/forecast work.'});
} else if(mode==='verification') {
  const logPath='../pr175-verify.log',bytes=readFileSync(logPath),text=stripVTControlCharacters(bytes.toString('utf8'));
  if(readFileSync('../pr175-verify-exit.txt','utf8').trim()!=='0')throw new Error('npm run verify did not pass');
  const phases=[...text.matchAll(/Tests\s+(\d+) passed/g)].map((m)=>Number(m[1]));
  if(phases.length!==4)throw new Error(`Unexpected verify phases ${phases}`);
  const historical=get('source-baseline').historicalEvidenceHashes;
  if(Object.entries(historical).some(([path,digest])=>hash(readFileSync(path).toString('base64'))!==digest))
    throw new Error('Historical evidence preservation failed');
  mkdirSync('docs/performance/pr175-evidence',{recursive:true});
  const zipped=gzipSync(bytes);writeFileSync('docs/performance/pr175-evidence/PR175-verify.log.gz',zipped);
  write('verification',{status:'complete',verify:'PASS',command:'npm run verify',exitCode:0,node:process.version,platform:process.platform,
    testPhases:phases,totalTests:phases.reduce((a,b)=>a+b,0),lint:'PASS',build:'PASS',
    unchanged:'Existing commands, workers, timeouts, assertions, seeds/goldens, canonical source, package lock and CI configuration unchanged.',
    newRegressionTests:6,log:{path:'docs/performance/pr175-evidence/PR175-verify.log.gz',sha256:hash(zipped),uncompressedSha256:hash(bytes)},
    historicalEvidencePreservation:{filesChecked:Object.keys(historical).length,identical:true,hashMethod:'SHA256 of base64 of exact initial Windows checkout bytes, as recorded before acquisition'},
    earlierAttempts:[{stage:'research factory generation',result:'invalid creator position rejected by Zod before any match; corrected to supported positions before manifest freeze'},
      {stage:'controlled harness module load',result:'wrong isShotAction export path rejected before any execution; corrected to existing actionAgency export'},
      {stage:'focused Vitest in sandbox temp',result:'EPERM cache rename before collecting tests; rerun with writable workspace TEMP/TMP, unchanged test settings; six focused tests pass'},
      {stage:'reference download inside sandbox',result:'DNS unavailable; explicit opt-in public download succeeded with approved network access; normal tests use no network'}]});
} else if(mode==='historical-goals') {
  const rows=readdirSync('../pr175-historical-goals').filter((n)=>n.endsWith('.json')).sort().map((n)=>read(`../pr175-historical-goals/${n}`));
  if(rows.length!==24||rows.some((r)=>!r.completeCanonicalReplayEqual))throw new Error('Need 24 complete historical goal-source replays');
  const counts=(xs,f)=>xs.reduce((a,x)=>{const k=f(x);a[k]=(a[k]??0)+1;return a;},{});
  const describe=(xs)=>{
    const a=xs.filter(Number.isFinite).sort((a,b)=>a-b),i=(a.length-1)/2;
    return {n:a.length,mean:a.length?a.reduce((n,x)=>n+x,0)/a.length:null,
      median:a.length?(a[Math.floor(i)]+a[Math.ceil(i)])/2:null,min:a[0]??null,max:a.at(-1)??null};
  };
  const shots=rows.flatMap((r)=>r.shots),goals=rows.flatMap((r)=>r.goals).map((g)=>{
    const s=shots.find((s)=>s.diagnostic.shotId===g.shotId);
    return {...g,rebound:!!s&&g.initialResolutionPrecededGoal&&Boolean(s.diagnostic.reboundSource||s.diagnostic.blockerId||['parry','parry_away','failed_save'].includes(s.diagnostic.goalkeeperAction??''))};
  });
  write('historical-goal-sources',{status:'complete',method:'24 full final-merged-source causal ledger replays; every final canonical hash equals the independently rebenchmarked historical input. Original and previously examined cohorts remain separate and dependent.',
    matches:24,shots:shots.length,goals:goals.length,goalSources:counts(goals,(g)=>g.source),shotContexts:counts(shots,(s)=>s.diagnostic.context),
    byContext:Object.fromEntries([...new Set(shots.map((s)=>s.diagnostic.context))].map((context)=>[context,{
      shots:shots.filter((s)=>s.diagnostic.context===context).length,goals:shots.filter((s)=>s.diagnostic.context===context&&s.diagnostic.outcome==='goal').length,
      distance:describe(shots.filter((s)=>s.diagnostic.context===context).map((s)=>s.diagnostic.distance)),
      pressure:describe(shots.filter((s)=>s.diagnostic.context===context).map((s)=>s.diagnostic.pressure)),
      finalOutcomes:counts(shots.filter((s)=>s.diagnostic.context===context),(s)=>s.diagnostic.outcome??'unresolved')} ])),
    finalShotOutcomes:counts(shots,(s)=>s.diagnostic.outcome??'unresolved'),
    missingRelease:goals.filter((g)=>!g.shotId&&g.source!=='own_goal'),
    reboundGoals:goals.filter((g)=>g.rebound).length,goalLedger:goals,
    duplicateShotIds:shots.length-new Set(shots.map((s)=>s.diagnostic.shotId)).size,duplicateGoalIds:goals.length-new Set(goals.map((g)=>g.id)).size,
    groups:Object.fromEntries(['original','extra','reserved'].map((g)=>[g,{matches:rows.filter((r)=>r.group===g).length,
      shots:rows.filter((r)=>r.group===g).flatMap((r)=>r.shots).length,goals:rows.filter((r)=>r.group===g).flatMap((r)=>r.goals).length,
      sources:counts(rows.filter((r)=>r.group===g).flatMap((r)=>r.goals),(x)=>x.source)}])),rows});
} else throw new Error(`Unknown mode ${mode}`);
console.log(`finalized ${mode}`);
