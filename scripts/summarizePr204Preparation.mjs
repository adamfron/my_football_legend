import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';

const input=process.argv[2] ?? 'docs/performance/pr204/preparation-final.json.gz';
const output=process.argv[3] ?? 'docs/performance/pr204/preparation-summary.json';
const data=JSON.parse(gunzipSync(readFileSync(input)));
const keys=['LL','LH','HL','HH'];
const metrics=['touch','control','retention'];
const key=(r)=>`${r.family}/${r.seedIndex}`;
const terminalKnown=(o)=>!['horizon','receiver_absent'].includes(o.terminal);
const known=(r,m)=>{
  const o=r.outcome;
  if(m==='touch') return o.directReceiverTouch || terminalKnown(o);
  if(m==='control') return o.receiverControl || terminalKnown(o);
  return o.directReceiverTouch && o.receiverControl ? !o.censored : terminalKnown(o);
};
const value=(r,m)=>Number(m==='touch' ? r.outcome.directReceiverTouch :
  m==='control' ? r.outcome.directReceiverTouch && r.outcome.receiverControl :
    r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond);
const summarize=(rows)=>{
  const episodes=new Map();
  for(const r of rows) {const k=key(r);if(!episodes.has(k))episodes.set(k,{});episodes.get(k)[r.group]=r;}
  const complete=[...episodes.values()].filter((e)=>keys.every((g)=>e[g] && !e[g].rejected));
  const out={attempted:episodes.size,completeQuartets:complete.length,metrics:{}};
  for(const metric of metrics){
    const valid=complete.filter((e)=>keys.every((g)=>known(e[g],metric))), n=valid.length;
    const per=valid.map((e)=>Object.fromEntries(keys.map((g)=>[g,value(e[g],metric)])));
    const means=Object.fromEntries(keys.map((g)=>[g,n?per.reduce((a,x)=>a+x[g],0)/n:null]));
    const pairs={readingLowTouch:(x)=>x.HL-x.LL,readingHighTouch:(x)=>x.HH-x.LH,
      touchLowReading:(x)=>x.LH-x.LL,touchHighReading:(x)=>x.HH-x.HL,
      interaction:(x)=>x.HH-x.LH-x.HL+x.LL};
    const contrasts={};
    for(const [name,fn] of Object.entries(pairs)){
      const v=per.map(fn), mean=n?v.reduce((a,b)=>a+b,0)/n:null;
      let rng=0x9e3779b9; const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296;};
      const boots=[];
      if(n>1) for(let i=0;i<2000;i++){let sum=0;for(let j=0;j<n;j++)sum+=v[Math.floor(random()*n)];boots.push(sum/n);}
      boots.sort((a,b)=>a-b);
      contrasts[name]={mean,bootstrap95:n>1?[boots[49],boots[1949]]:null,discordant:v.filter((x)=>x!==0).length};
    }
    out.metrics[metric]={n,excludedUnresolved:complete.length-n,counts:Object.fromEntries(keys.map((g)=>[g,n?per.reduce((a,x)=>a+x[g],0):0])),means,contrasts};
  }
  const exposure={};
  for(const group of keys){
    const groupRows=complete.map((e)=>e[group]);
    const before=groupRows.filter((r)=>r.sight!==null && r.sight<=r.outcome.contract.releasedAt+1e-8);
    const timed=groupRows.filter((r)=>r.outcome.receiverTouchAt!==null && r.firstFlightSight!==null && r.firstFlightSight<=r.outcome.receiverTouchAt);
    exposure[group]={n:groupRows.length,seenBeforeRelease:before.length,
      meanSecondsSeenBeforeRelease:before.length?before.reduce((s,r)=>s+r.outcome.contract.releasedAt-r.sight,0)/before.length:null,
      prospectiveRecognised:groupRows.filter((r)=>r.firstProspective!==null).length,
      preReceptionPlans:groupRows.filter((r)=>r.firstPreReception!==null).length,
      flightSeenBeforeContact:timed.length,
      meanFlightSightToContact:timed.length?timed.reduce((s,r)=>s+r.outcome.receiverTouchAt-r.firstFlightSight,0)/timed.length:null};
  }
  out.exposure=exposure;
  const contacts={};
  for(const group of keys){
    const groupRows=complete.map((e)=>e[group]).filter((r)=>r.outcome.directReceiverTouch);
    const measurements=groupRows.map((r)=>{
      const frame=r.frames.find((f)=>Math.abs(f.at-r.outcome.receiverTouchAt)<1e-7);
      const assessment=frame?.receptionOutcome;
      return assessment && Math.abs((assessment.surfaceContact?.at ?? -1)-r.outcome.receiverTouchAt)<1e-7 ? assessment : null;
    }).filter(Boolean);
    const average=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
    const get=(fn)=>measurements.map(fn).filter((x)=>typeof x==='number' && Number.isFinite(x));
    contacts[group]={directContactCount:groupRows.length,assessmentCount:measurements.length,
      meanRelativeSpeed:average(get((a)=>a.contact?.relativeSpeed)),
      meanPreparationSeconds:average(get((a)=>a.contact?.preparationSeconds)),
      meanFacingError:average(get((a)=>a.quality?.facingError)),
      meanContactQuality:average(get((a)=>a.contact?.quality)),
      surfaces:measurements.reduce((a,x)=>{const k=x.contact?.surface??'unknown';a[k]=(a[k]??0)+1;return a;},{})};
  }
  out.contactMeasurements=contacts;
  return out;
};
const valid=data.rows.filter((r)=>r.condition && r.group);
const summary={source:data.source,stable:data.stable,releases:data.releases.length,rejectedEpisodes:data.rejected,
  rejectedArms:valid.filter((r)=>r.rejected).map(({family,seedIndex,condition,group,rejected})=>({family,seedIndex,condition,group,rejected})),
  qualification:'Complete paired quartets only; unresolved/censored outcomes excluded per metric, not set to failure. Seed-labelled episodes are independent experimental units. Percentile bootstrap resamples paired episodes; small samples, post-selection, multiple looks, and zero-discordance intervals limit inference. Conditions describe assigned visibility gates, not necessarily observed recognition.',conditions:{},families:{},pressure:{}};
const matched=(data.matchedBody??[]).flatMap((e)=>e.arms.map((a)=>({...e,...a,condition:'matched',rejected:null,
  sight:null,firstFlightSight:null,firstProspective:null,firstPreReception:null,frames:[]})));
summary.matchedBody=summarize(matched);
for(const condition of ['early','late']) summary.conditions[condition]=summarize(valid.filter((r)=>r.condition===condition));
for(const family of data.limits.families) summary.families[family]=Object.fromEntries(['early','late'].map((condition)=>[condition,summarize(valid.filter((r)=>r.family===family&&r.condition===condition))]));
for(const pressure of ['unpressured','immediate','delayed']) summary.pressure[pressure]=Object.fromEntries(['early','late'].map((condition)=>[condition,summarize(valid.filter((r)=>r.pressure===pressure&&r.condition===condition))]));
writeFileSync(output,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({source:summary.source,stable:summary.stable,releases:summary.releases,conditions:summary.conditions},null,2));
