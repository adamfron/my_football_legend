import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pr172SourceHash, pr172Hash } from './pr172Evidence';
const path='docs/performance/PR175-candidate-freeze.json';
if(existsSync(path)) throw new Error('Candidate already frozen; do not silently overwrite');
if(existsSync('../pr175-validation')&&readdirSync('../pr175-validation').length) throw new Error('Validation already consumed');
const files=readdirSync('../pr175-development').filter((p)=>p.endsWith('-cohort.json'));
if(files.length!==6) throw new Error('Complete six development matches first');
const development=files.map((p)=>JSON.parse(readFileSync(`../pr175-development/${p}`,'utf8')));
const sourceHash=pr172SourceHash();
if(sourceHash!=='9f6123b5e9861d07b945253c0f1a98934326fb66da8246ca85fd96735c761d21'||
  development.some((r)=>r.status!=='full_time'||r.manifest.sourceHash!==sourceHash)) throw new Error('Not unchanged merged PR174 development');
if(execFileSync('git',['diff','d6556eba','--name-only','--','src','package.json','package-lock.json'],{encoding:'utf8'}).trim()) throw new Error('Gameplay/dependencies changed');
const decision='No production gameplay correction accepted: development and controlled evidence isolate severe access/selection discrepancies but do not establish a safe narrow mechanical/coefficient repair. Freeze unchanged merged PR174 for one sealed validation evaluation; no tuning after opening it.';
writeFileSync(path,JSON.stringify({version:1,frozenAt:new Date().toISOString(),sourceHash,baseCommit:'d6556eba33d240bfc6ed845e256b185e9a24bc4a',
  decision,validationInspected:false,validationCountBeforeFreeze:0,
  development:development.map((r)=>({id:r.design.id,initialHash:r.initialHash,finalHash:r.finalHash,status:r.status,sourceHash:r.manifest.sourceHash})),
  fixtureManifestHash:pr172Hash(readFileSync('docs/performance/PR175-new-fixture-manifest.json','utf8')),
  acceptance:'Do not claim statistical improvement for a diagnostics-only PR; READY requires plausible match-level attacking football, which development does not demonstrate.',
},null,2)+'\n');
writeFileSync('docs/performance/PR175-hypothesis-tests.json',JSON.stringify({version:1,stage:'pre-validation',sourceHash,decision,
  hypotheses:[
    {id:'pass-count-inflation',result:'rejected',evidence:'Every research released PassDiagnostic matches official attempts. Self-reclaim is not a completed teammate pass.'},
    {id:'missing-selected-shots',result:'not supported in development',evidence:'No owner/incoming selected shot lacks a release in six completed development games; restart release is a separate lifecycle.'},
    {id:'keepers-and-blocks-disabled',result:'rejected',evidence:'208 prescribed shots give real saves, misses, blocks and a post; complete canonical physical outcomes retained.'},
    {id:'rare-dangerous-access',result:'supported descriptively',evidence:'Development: 1608 episodes,326 final-third control,39 box control,11 credible episodes,7 shots. Candidate presence is not a guarantee of useful football.'},
    {id:'safe-recycling',result:'supported descriptively, mechanism contributions unresolved',evidence:'Real backward/lateral releases and reciprocal exchanges; retained/max progression measured. No unsupported universal progressive bonus accepted.'},
    {id:'shot-selection-bias',result:'supported with limitations',evidence:'Generated marginal shots frequently rank below carry/pass; 35 credible decision observations but very few releases. Internal estimates are uncalibrated.'},
    {id:'universal-shot-bonus',result:'rejected as a correction',evidence:'Frozen real state can score after carry as well as immediate shot; another prescribed shot produces no goal. More attempts alone fails the acceptance gate.'},
    {id:'relax-underlap-cover',result:'rejected',evidence:'Available underlap can lose independent ranking; covered routes legitimately fail. No evidence for weakening defence.'},
    {id:'organised-press-escape',result:'unproven',evidence:'Five press variants produce losses and no shots; timed run changes local metres, not robust escape.'},
    {id:'adaptation-improves-football',result:'unproven',evidence:'10 controlled history/context variants initially choose carry; actual subsequent outcomes retained separately.'},
    {id:'stale-restart-means-set-piece-goal',result:'rejected; diagnostics corrected',evidence:'Persistent law restrictions can precede many unrelated possessions. Final attribution requires exact continuous episode lineage; raw hints retained.'},
  ], acceptedGameplayCorrections:[],acceptedResearchCorrections:['Strict restart/goal lineage projection','Self-reclaim separated from pass completion','Control timing requires same current actor/receiver/episode'],
  rejectedProductionChanges:['fixed pass cooldown','universal progressive/shot/CM bonuses','goalkeeper/defender nerfs','target frequency quotas','looser rest-cover guards'],
},null,2)+'\n');
console.log(decision);
