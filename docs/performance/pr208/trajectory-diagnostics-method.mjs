// Supplemental observer only. Integrates preserved launches through canonical physics.
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { source, hash } from '../../../scripts/pr199Evidence.mjs';
import { integrateBallFlight } from '../../../src/core/matchSimulation/ballPhysics.ts';
const root='docs/performance/pr208',start=performance.now(),cpu=process.cpuUsage();
const manifest=source();
const energy=b=>.5*.43*(b.velocity.x**2+b.velocity.y**2+b.velocity.z**2)+(.43*.11**2/3)*((b.spin?.x??0)**2+(b.spin?.y??0)**2+(b.spin?.z??0)**2);
const rows=[];
for(const [dataset,mode] of [['lab','trajectories'],['live','live']]){
  const original=JSON.parse(gunzipSync(readFileSync(`docs/performance/pr207/${dataset}-development-v1.json.gz`))).result;
  const next=JSON.parse(gunzipSync(readFileSync(`${root}/${mode}-development-v1.json.gz`))).receipt;
  assert.equal(next.source,hash(manifest));
  for(const [index,row]of original.rows.entries())for(const [armIndex,arm]of row.arms.entries()){
    if(!arm.released)continue;
    const launch=arm.launch,events=[];
    let ball={position:{x:launch.x,y:launch.y,z:Math.max(.11,launch.height??.11)},velocity:{x:launch.velocity?.x??0,y:launch.velocity?.y??0,z:launch.velocity?.z??0},spin:launch.spin??{x:0,y:0,z:0},airborne:launch.airborne??false,bounceCount:0};
    for(let tick=1;tick<=1000;tick++){
      const previous=ball;ball=integrateBallFlight(ball,.025);
      if(ball.bounceCount>previous.bounceCount)events.push({at:tick*.025,timeResolution:'historical collision at end of 25ms step; no exact impact time claimed',position:ball.position,kineticAtStepStart:energy(previous),kineticAtStepEnd:energy(ball),velocityAtStepStart:previous.velocity,velocityAtStepEnd:ball.velocity});
      if(!ball.airborne&&Math.hypot(ball.velocity.x,ball.velocity.y,ball.velocity.z)<.05)break;
    }
    assert.deepEqual(ball.position,arm.flight.stop,'Supplemental observer differs from original flight');
    const corrected=dataset==='lab'?next.result.rows[index].arms[armIndex].corrected:next.result.rows[index].arms[armIndex].correctedFlight;
    const dx=arm.target.x-launch.x,dy=arm.target.y-launch.y;
    const difference=Math.atan2(launch.velocity.y,launch.velocity.x)-Math.atan2(dy,dx);
    rows.push({dataset,index,seed:row.config.seed,config:row.config,model:arm.model,initialVelocity:launch.velocity,initialSpin:launch.spin,launchDirectionErrorRadians:Math.atan2(Math.sin(difference),Math.cos(difference)),legacy:{bounceCount:ball.bounceCount,bounces:events,distanceToReceptionPlaneAtStop:arm.target.x-arm.flight.stop.x,planeDirectionErrorRadians:arm.flight.plane?Math.atan2(arm.flight.lateralError,Math.abs(dx)):null},corrected:{bounceCount:corrected.bounceCount,bounces:corrected.impacts,distanceToReceptionPlaneAtStop:arm.target.x-corrected.stop.x,planeDirectionErrorRadians:corrected.plane?Math.atan2(corrected.lateralError,Math.abs(dx)):null}});
  }
}
assert.deepEqual(source(),manifest);
const result={schema:'pr208-supplemental-trajectory-diagnostics-v1',source:hash(manifest),methodSha256:hash(readFileSync(fileURLToPath(import.meta.url),'utf8').replaceAll('\r\n','\n')),rows};
const costs={wallSeconds:(performance.now()-start)/1000,cpuSeconds:Object.values(process.cpuUsage(cpu)).reduce((a,b)=>a+b,0)/1e6,peakRSSKiB:process.resourceUsage().maxRSS,node:process.version,platform:process.platform};
const output=`${root}/trajectory-diagnostics.json.gz`;
if(process.argv.includes('--check'))assert.equal(hash(JSON.parse(gunzipSync(readFileSync(output))).result),hash(result));
else writeFileSync(output,gzipSync(JSON.stringify({result,costs}),{level:9}),{flag:'wx'});
console.log(JSON.stringify({output,rows:rows.length,source:result.source,methodSha256:result.methodSha256,costs}));
