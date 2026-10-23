import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import console from 'node:console';
import { digest, pr183SourceHash, pr183HarnessHash } from './pr183Evidence.mjs';
const sourceHash=pr183SourceHash(),harnessHash=pr183HarnessHash();
const path='docs/performance/PR183-freeze.json';
if(existsSync(path)){
 const old=JSON.parse(readFileSync(path));
 if(old.sourceHash!==sourceHash||old.harnessHash!==harnessHash)throw Error('Existing freeze differs; do not silently reuse independent inputs');
 console.log('Existing source/harness freeze verified.');
}else{
 const validation=JSON.parse(readFileSync('docs/performance/PR183-validation-inputs.json'));
 writeFileSync(path,JSON.stringify({schema:'mfl-pr183-freeze-v1',frozenAtUtc:new Date().toISOString(),
  base:'16c2e71efcec98862b6d6c996f0737f02131235e',sourceHash,harnessHash,
  defaultPolicy:'state-value-v1',policies:['legacy-pr176','state-value-v1','role-value-v1','role-intent-v1','phase-role-hybrid-v1'],
  validation:validation.rows.map(r=>({id:r.design.id,inputHash:r.inputHash,sessionHash:r.sessionHash})),
  acceptance:{canonicalDt:.025,fullTimeRuns:15,maximumSimulatedSeconds:7200,maximumCpuSecondsPerIndependentMatch:600,
    finalStateSchema:'tacticalMatchStateSchema',statistics:'assertMatchStatisticsInvariants',observerErrors:0,
    clocks:'inPlay + stoppage = elapsed at fixed-tick precision',
    mechanicalRegression:'Both frozen native extreme retreats regain feasible passes and release before another 12m retreat. This is a scenario diagnostic, never a production restriction.',
    physicalRegression:'No possession from pursuit; finite real contacts and acceleration; touch/secure-control distinction; emergency substitutions stay legal.',
    independence:'Three newly materialised SS/SW/WW designs, zero simulated validation ticks before this freeze. No consumed PR182 input is used as new evidence.',
    quality:'Report territorial purpose, shot distance/angle/pressure/attributes/physical outcomes, censored attempts, contact/foul events and all five policies. No event quotas or policy promotion.',
    readiness:'Do not call summary calibration ready if circulation, goalkeeper/shooting behaviour or other serious realism limits remain. Full unchanged npm run verify must pass before merge readiness.'},
  definitions:'pr183Observation.ts and unchanged PR181/182 flow/role observers, identified by harnessHash. Paired design is the experimental unit; 15 matches are three designs, not 15 independent samples.',
  validationArchiveHash:digest(readFileSync('docs/performance/pr183-evidence/validation.json.gz')),
 },null,2)+'\n');
 console.log(JSON.stringify({sourceHash,harnessHash,validationDesigns:validation.rows.length,validationTicks:0}));
}
