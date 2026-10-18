import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createPr175Fixture } from './pr175Fixtures';
import { pr172Manifest, pr172Hash } from './pr172Evidence';
import { Pr175Observer } from './pr175Observer';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import { CombinationPlayTracker } from '../src/core/matchSimulation/footballIntelligenceDiagnostics';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { PerformanceProfiler, withPerformanceProfiler, startPerformanceSpan, endPerformanceSpan } from '../src/core/matchSimulation/performanceProfiling';
import type { TacticalMatchState, MatchAction } from '../src/core/matchSimulation/matchState';
import type { RankedAiAction } from '../src/core/matchSimulation/matchActions';

const fixture = createPr175Fixture('dev-balanced');
const hooks = globalThis as unknown as Record<symbol, ((...a: never[]) => void) | undefined>;
const rows = [], profiles = [];
const combinationTimingSchema=z.object({calls:z.number().int().nonnegative(),activeCalls:z.number().int().nonnegative(),
  wallMs:z.number().nonnegative(),activeWallMs:z.number().nonnegative()});
const combinationTimings: Record<string, z.infer<typeof combinationTimingSchema>> = {};
for (let sample = -1; sample < 3; sample++)
  for (const mode of (sample % 2 ? ['plain', 'existing', 'detailed'] : ['detailed', 'existing', 'plain']) as ('plain' | 'existing' | 'detailed')[]) {
    let state = structuredClone(fixture.state);
    const observer = new Pr175Observer(), funnel = new AttackingFunnelTracker(undefined, true, true), combinations = new CombinationPlayTracker();
    hooks[Symbol.for('mfl.pr172.decision')] = mode === 'detailed' ? ((s: TacticalMatchState, a: string, r: RankedAiAction[]) => observer.decision(s, a, r, r[0]?.action)) as never : undefined;
    hooks[Symbol.for('mfl.pr172.incoming')] = mode === 'detailed' ? ((s: TacticalMatchState, a: string, r: RankedAiAction[], selected?: MatchAction) => observer.decision(s,a,r,selected,true)) as never : undefined;
    hooks[Symbol.for('mfl.pr172.components')] = mode === 'detailed' ? observer.component as never : undefined;
    const start = performance.now(), cpu = process.cpuUsage();
    for (let tick=0; tick<2400; tick++) {
      const before=state; state=stepTacticalMatchAfterDecisionProbe(state,0.025);
      if(mode!=='plain') { funnel.observe(before,state); combinations.observe(before,state); }
      if(mode==='detailed') observer.observe(before,state);
    }
    const wallMs=performance.now()-start, usage=process.cpuUsage(cpu);
    const payload=mode==='plain'?null:{funnel:funnel.snapshot(state.time),combinations:combinations.snapshot(),detailed:mode==='detailed'?observer.snapshot(state):null};
    if(sample>=0) rows.push({sample,mode,wallMs,cpuMs:(usage.user+usage.system)/1000,finalHash:pr172Hash(state),memory:process.memoryUsage(),retainedBytes:payload?Buffer.byteLength(JSON.stringify(payload)):0});
  }
for (const key of ['decision','incoming','components']) hooks[Symbol.for(`mfl.pr172.${key}`)]=undefined;
if(new Set(rows.map((r)=>r.finalHash)).size!==1) throw new Error('Performance observer equivalence failed');
let state=structuredClone(fixture.state);
const profiler=new PerformanceProfiler({enabled:true,sampleEveryTicks:1});
withPerformanceProfiler(profiler,()=>{
  for(let tick=0;tick<2400;tick++) { profiler.beginTick(tick);const span=startPerformanceSpan('canonical_step');state=stepTacticalMatchAfterDecisionProbe(state,0.025);endPerformanceSpan('canonical_step',span); }
});
if(pr172Hash(state)!==rows[0]!.finalHash) throw new Error('Profiler altered canonical state');
profiles.push(profiler.snapshot());
state=structuredClone(fixture.state);
hooks[Symbol.for('mfl.pr175.combinationProfile')]=((name:string,elapsed:number,active:boolean)=>{
  const row=combinationTimings[name]??={calls:0,activeCalls:0,wallMs:0,activeWallMs:0};
  row.calls++;row.wallMs+=elapsed;if(active){row.activeCalls++;row.activeWallMs+=elapsed;}
}) as never;
try {
  for(let tick=0;tick<2400;tick++)state=stepTacticalMatchAfterDecisionProbe(state,0.025);
} finally { hooks[Symbol.for('mfl.pr175.combinationProfile')]=undefined; }
if(!combinationTimings.reconcileCombination?.calls)throw new Error('Use registerPr175Performance.mjs for isolated combination timing');
if(pr172Hash(state)!==rows[0]!.finalHash)throw new Error('Combination timing altered canonical state');
writeFileSync('docs/performance/PR175-performance-windows.json',JSON.stringify({version:1,manifest:pr172Manifest(),
  method:'Serial identical 60s windows after all concurrent research. One warm-up plus three measured runs per mode, alternating mode order. Plain has research callbacks disabled but the opt-in loader still adds symbol checks and disabled combination wrappers; separate full-match plain processes use the ordinary loader. Core source is byte-identical to merged PR174, so these are observer costs, not a claimed gameplay speedup. Snapshot/serialization excluded from stepping timers. Inclusive all-tick spans overlap; do not sum categories. A separate same-state 60s replay times actual reconcile/release/candidate combination invocations with the offline loader, including active-intent calls. These wall-clock spans include timer overhead, are inclusive, and are not a full-match CPU share or a measure of all shared movement/forecast work.',
  rows,profiles,combinationTimings:z.record(z.string(),combinationTimingSchema).parse(combinationTimings),completeCanonicalStateEqual:true},null,2)+'\n');
console.log(JSON.stringify({samples:rows.length,completeCanonicalStateEqual:true}));
