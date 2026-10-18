import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPr171Fixture, PR171_COHORT } from './pr171Fixtures';
import { createPr174HeldOutFixture } from './pr174CohortFixtures';
import { Pr175Observer } from './pr175Observer';
import { attributePr175Shots } from './pr175Attribution';
import { pr172Manifest, pr172Hash } from './pr172Evidence';
import { startSecondHalf, stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { z } from 'zod';

const arg=(k:string)=>process.argv.find((a)=>a.startsWith(`--${k}=`))?.slice(k.length+3);
const group=z.enum(['original','reserved','extra']).parse(arg('group')??'original');
const out='../pr175-historical-goals';mkdirSync(out,{recursive:true});
const families=group==='extra'?['senior_balanced','wide_direct'] as const:group==='reserved'?['youth_native','senior_balanced','strong_weak','press_low'] as const:PR171_COHORT;
const manifest=pr172Manifest();
for(const family of families) for(const reversed of [false,true]) {
  const name=`cohort-${family}${group==='extra'?'-extra-a':''}-${reversed}.json`,path=`${out}/${group}-${name}`;
  if(existsSync(path)) { const old=JSON.parse(readFileSync(path,'utf8'));if(old.manifest.sourceHash!==manifest.sourceHash)throw new Error('Goal ledger source mismatch');continue; }
  const fixture=group==='reserved'?createPr174HeldOutFixture(family,reversed):createPr171Fixture(family,reversed,group==='extra'?'extra-a':undefined);
  let state=structuredClone(fixture.state),ticks=0;
  const observer=new Pr175Observer();
  while(state.status!=='full_time'&&state.time<7200) {
    if(state.status==='half_time')state=startSecondHalf(state);
    const previous=state;state=stepTacticalMatchAfterDecisionProbe(state,0.025);observer.observe(previous,state);ticks++;
    if(ticks%48000===0)console.log(`goal ledger ${group}/${family}/${reversed} t=${state.time.toFixed(1)}`);
  }
  const baseline=JSON.parse(readFileSync(`${group==='reserved'?'../pr175-merged-reserved':'../pr175-merged-historical'}/${name}`,'utf8'));
  if(state.status!=='full_time'||pr172Hash(state)!==baseline.observed.finalStateHash||pr172Hash(fixture.state)!==baseline.observed.initialStateHash)throw new Error('Goal-source replay changed whole canonical state');
  const raw=observer.snapshot(state),attributed=attributePr175Shots(raw);
  if(raw.shots.length!==state.statistics!.players.reduce((n,p)=>n+p.shots,0)||raw.goals.length!==state.score.home+state.score.away)throw new Error('Goal-source release/score mismatch');
  writeFileSync(path,JSON.stringify({version:1,manifest,group,family,reversed,fixtureHash:pr172Hash(fixture.session),initialHash:pr172Hash(fixture.state),
    finalHash:pr172Hash(state),status:state.status,ticks,time:state.time,score:state.score,completeCanonicalReplayEqual:true,
    method:'Final merged historical fixture replay with minimal causal observer, no decision sampling/ranking hooks. Entire canonical state equals the separately rebenchmarked baseline. Exact all-phase physical releases and score transitions, strict restart lineage. Raw retained hints preserved within each shot/goal projection.',
    ...attributed,initialOutcomeCounts:Object.fromEntries(Object.entries(raw.counts).filter(([k])=>k.startsWith('shot_outcome:')))},null,2)+'\n');
  console.log(`saved goal ledger ${group}/${family}/${reversed}`);
}
