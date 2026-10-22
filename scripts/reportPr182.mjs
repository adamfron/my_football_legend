import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { digest } from './pr182Evidence.mjs';
const root = process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? '../pr182-development';
const cohort = process.argv.includes('--validation') ? 'validation' : 'development';
const files = readdirSync(root, { recursive: true }).map(String).filter((p) => p.endsWith('.json.gz') && !p.includes('frozen'));
const rows = files.map((path) => {
  const bytes = readFileSync(resolve(root, path)), r = JSON.parse(gunzipSync(bytes));
  const official = r.report.summary.official, h = official.home, a = official.away;
  const shots = r.report.summary.shots;
  const ownSum = (key) => h[key] + a[key];
  const changes = ['home', 'away'].flatMap((s) => r.teams[s].coaching?.decisions ?? []).filter((d) => d.changed);
  const shotOutcomes = Object.fromEntries(['goal', 'save', 'miss', 'block', 'post'].map((k) => [k, shots.filter((s) => s.outcome === k).length]));
  return { id: r.design.id, tier: r.design.tier, policy: r.policy, inputHash: r.inputHash,
    effectiveInputHash: r.effectiveInputHash, productionHash: r.productionHash, harnessHash: r.frozenHarnessHash,
    artifactHash: digest(bytes), artifact: path.replaceAll('\\', '/'), finalHash: r.finalHash, ticks: r.ticks,
    status: r.status, seconds: r.time, home: h, away: a,
    metrics: { passes: ownSum('passesAttempted'), completion: 100 * ownSum('passesCompleted') / Math.max(1, ownSum('passesAttempted')),
      firstTimeShare: 100 * r.passes.firstTime / Math.max(1, ownSum('passesAttempted')),
      shots: ownSum('shots'), goals: ownSum('goals'), corners: ownSum('corners'),
      boxEntries: r.flow.boxEntries, finalThirdEntries: r.flow.finalThirdEntries, crosses: r.flow.crosses,
      targetedDepthPasses: r.lineage.summary.targetedBehind, completedDepthPasses: r.lineage.summary.completedBeyondReleaseLine,
      contestedAerialContacts: r.spatial.events.contested_aerial_contact ?? 0,
      wideTakeOnIntentions: r.spatial.events.wing_take_on_started ?? 0,
      passedMarkerWithControl: r.spatial.events.take_on_passed_marker_with_control ?? 0,
      pathologicalHolds: r.report.diagnostics.pathologicalHolds, maxHoldSeconds: r.report.diagnostics.maxHoldSeconds,
      liveMinutes: r.clock.inPlay / 60, deadMinutes: r.clock.stoppage / 60,
      coachChanges: changes.length, halftimeChanges: changes.filter((d) => d.trigger === 'half_time').length,
      substitutions: r.substitutions?.length ?? 0,
      averageShotProxyXg: shots.reduce((n, s) => n + s.baseXg, 0) / Math.max(1, shots.length),
      cpuSeconds: r.performance.cpuSeconds, maxSampledRssMiB: r.performance.maxSampledRssBytes / 2**20,
    }, changes, shotOutcomes, shotLineage: shots, observerErrors: r.observer.errors,
    counterattacks: r.report.summary.transitions.filter((t) => t.phase === 'rapid_transition' && t.progress >= 10).length,
    turnoverConsequences: r.report.summary.turnoverConsequences,
  };
});
const mean = (xs) => xs.reduce((a,b) => a+b,0) / Math.max(1,xs.length);
const quantile = (xs,p) => { const s=[...xs].sort((a,b)=>a-b), x=(s.length-1)*p, i=Math.floor(x); return s.length ? s[i]+(s[Math.ceil(x)]-s[i])*(x-i) : null; };
const metrics = Object.keys(rows[0]?.metrics ?? {}), policies = [...new Set(rows.map((r) => r.policy))].sort();
const summarise = (rs) => ({ n: rs.length, fullTime: rs.filter((r)=>r.status==='full_time').length,
  metrics: Object.fromEntries(metrics.map((k)=>[k,{mean:mean(rs.map((r)=>r.metrics[k])),p10:quantile(rs.map((r)=>r.metrics[k]),.1),median:quantile(rs.map((r)=>r.metrics[k]),.5),p90:quantile(rs.map((r)=>r.metrics[k]),.9)}])) });
// Fixed-seed fixture bootstrap, never resampling individual passes or frames.
let rng=1821022;
const uniform=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/2**32;};
const paired = policies.filter((p)=>p!=='legacy-pr176').map((policy)=>({policy,
  metrics:Object.fromEntries(metrics.filter((k)=>!['maxSampledRssMiB'].includes(k)).map((k)=>{
    const diffs=rows.filter((r)=>r.policy===policy).flatMap((r)=>{
      const b=rows.find((b)=>b.policy==='legacy-pr176'&&b.id===r.id);return b?[r.metrics[k]-b.metrics[k]]:[];});
    const resamples=Array.from({length:4000},()=>mean(diffs.map(()=>diffs[Math.floor(uniform()*diffs.length)])));
    return [k,{n:diffs.length,mean:mean(diffs),positive:diffs.filter((d)=>d>0).length,negative:diffs.filter((d)=>d<0).length,bootstrap95:[quantile(resamples,.025),quantile(resamples,.975)],differences:diffs}];
  }))}));
const result={schema:'mfl-pr182-policy-comparison-v1',cohort,
  unit:'Paired fixture design; five policies on the same design are dependent. Four designs per strength tier in primary validation. Bootstrap intervals are exploratory and unadjusted for multiple metrics.',
  rows,byPolicy:Object.fromEntries(policies.map((p)=>[p,summarise(rows.filter((r)=>r.policy===p))])),
  byTier:Object.fromEntries(['SS','SW','WW'].map((t)=>[t,Object.fromEntries(policies.map((p)=>[p,summarise(rows.filter((r)=>r.policy===p&&r.tier===t))]))])),
  strongWeakSides:Object.fromEntries(policies.map((p)=>[p,rows.filter((r)=>r.policy===p&&r.tier==='SW').map((r)=>({id:r.id,strong:r.home,weak:r.away}))])),paired};
writeFileSync(`docs/performance/PR182-${cohort}-comparison.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cohort,runs:rows.length,byPolicy:Object.fromEntries(policies.map((p)=>[p,{n:result.byPolicy[p].n,...Object.fromEntries(['passes','shots','goals','boxEntries','pathologicalHolds','maxHoldSeconds','liveMinutes','coachChanges'].map((k)=>[k,result.byPolicy[p].metrics[k].mean]))}]))},null,2));
