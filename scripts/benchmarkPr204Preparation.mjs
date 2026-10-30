import console from 'node:console';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { familyFixture } from './pr198Fixtures.mjs';
import { continueRelease } from './pr198Laboratory.mjs';
import { hash, source } from './pr199Evidence.mjs';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { sampleCanonicalOutcome, interpretCanonicalOutcome, outcomeContractSchema } from '../src/core/matchSimulation/canonicalOutcome.ts';

const started = performance.now(), cpu = process.cpuUsage(), sourceBefore = source();
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const limit = Number(args.get('limit') ?? 64), version = args.get('version') ?? 'final';
if (!/^[a-z0-9-]+$/.test(version) || !Number.isInteger(limit) || limit < 1 || limit > 64) throw Error('Invalid options');
const families = ['short_ground','medium_ground','progressive_ground','long_ground','long_lofted','moving_lead','cross_field','through_ball'];
const groups = [{id:'LL',reading:20,touch:20},{id:'LH',reading:20,touch:85},
  {id:'HL',reading:85,touch:20},{id:'HH',reading:85,touch:85}];
const flags = { experimentalDefensiveReception:true, experimentalHeightAwarePassing:true,
  experimentalReceiverAnticipation:true, experimentalReceiverSynchronisation:false,
  experimentalCanonicalArrival:false, experimentalBoundedBallFlightBelief:true,
  boundedReceiverRecovery:'hold-local-v1', experimentalActivePerception:true,
  experimentalReceivingPositions:true, situationalAwareness:'bounded-v1',
  prospectiveMovement:'two-pass-continuity-dev-v1' };
const cases = families.flatMap((family) => Array.from({length:8}, (_, i) => ({family, seedIndex:i}))).slice(0,limit);
const rows = [], rejected = [], releases = [], matchedBody = [];
for (const spec of cases) {
  const fixture = familyFixture(spec.family,55,spec.seedIndex % 2);
  const base = globalThis.structuredClone(fixture.state);
  const receiver = base.players.find((p) => p.id === fixture.receiverId);
  const actor = base.players.find((p) => p.id === fixture.actorId);
  const pressure = ['unpressured','immediate','delayed'][spec.seedIndex % 3];
  base.seed = `pr204-fixed-${spec.family}-${spec.seedIndex}`;
  Object.assign(base, flags);
  delete base.integrationProfile;
  base.playerAgencyEnabled = true; base.controlledFootballerId = actor.id;
  receiver.position.y = Math.max(2,Math.min(66,receiver.position.y + (Math.floor(spec.seedIndex/2)-1.5)*0.65));
  receiver.position.x = Math.max(2,Math.min(103,receiver.position.x + ((spec.seedIndex % 4)-1.5)*0.35));
  receiver.target = {...receiver.position}; receiver.anchor = {...receiver.position}; receiver.neutralAnchor = {...receiver.position};
  receiver.facingAngle = Math.atan2(actor.position.x-receiver.position.x,actor.position.y-receiver.position.y);
  if (spec.seedIndex % 2) receiver.facingAngle += Math.PI;
  if (spec.seedIndex % 4 >= 2) receiver.velocity = {x:-1.2,y:spec.seedIndex % 2 ? 1.8 : -1.8};
  for (const other of base.players.filter((p) => p.team !== receiver.team && p.slot.position !== 'goalkeeper')) {
    other.position = {x:15+other.slotIndex,y:spec.seedIndex%2?4:64};
    other.target = {...other.position}; other.neutralAnchor = {...other.position};
  }
  if (pressure !== 'unpressured') {
    const opp = base.players.find((p) => p.team !== receiver.team && p.slot.position !== 'goalkeeper');
    opp.position = {x:Math.min(103,receiver.position.x+(pressure==='immediate'?2.5:8)),y:receiver.position.y};
    opp.target = {...opp.position}; opp.neutralAnchor = {...opp.position};
  }
  const start = base.time;
  const runPrelude = (g, condition) => {
    let state = globalThis.structuredClone(base);
    const p = state.players.find((item)=>item.id===receiver.id);
    p.profile.attributes.gameReading=g.reading; p.profile.attributes.firstTouch=g.touch;
    // Deprivation is explicit; both arms only receive real optical evidence once unblocked.
    globalThis.__pr204VisionGate = {actorId:p.id,until:condition==='early'?start:start+0.85};
    const frames=[], movement=[]; let firstOptical=null, firstBallKnowledge=null, firstJob=null, firstProspective=null, firstPreReception=null;
    globalThis.__pr204MovementTrace={actorId:p.id,records:[]};
    for(let i=0;i<40;i++) {
      state=step(state,0.025);
      movement.push(...globalThis.__pr204MovementTrace.records.splice(0).map((x)=>({...x,at:state.time})));
      const q=state.players.find((item)=>item.id===p.id), mem=state.activePerceptionRuntime?.memory[p.id], sensor=state.liveBallFlightRuntime?.sensors[p.id];
      if(firstOptical===null && sensor?.optical) firstOptical=sensor.optical.at;
      if(firstBallKnowledge===null && mem?.ball) firstBallKnowledge=mem.ballSeenAt;
      const job=state.activePerceptionRuntime?.positions[p.id];
      if(firstJob===null && job && job.reason!=='protect_role_and_rest_defence' && job.prospective?.status!=='withdrawn') firstJob=state.time;
      if(firstProspective===null && job?.prospective && job.prospective.status!=='withdrawn' && state.time>=job.prospective.recognisedAt) firstProspective=state.time;
      const plan=state.activePerceptionRuntime?.plans[p.id];
      if(firstPreReception===null && plan?.status==='preparing') firstPreReception=state.time;
      if(i%4===0) frames.push({at:state.time, position:q.position,velocity:q.velocity,facing:q.facingAngle,target:q.target,
        sensor:sensor??null,situation:mem?.situation??null,job:job??null,preReceptionPlan:plan??null});
    }
    delete globalThis.__pr204VisionGate;
    delete globalThis.__pr204MovementTrace;
    return {state,firstOptical,firstBallKnowledge,firstJob,firstProspective,firstPreReception,frames,movement};
  };
  const ref = runPrelude({reading:55,touch:55},'early');
  if (ref.state.ball.ownerId !== actor.id) { rejected.push({...spec,pressure,reason:'reference_passer_lost_ball',at:ref.state.time}); continue; }
  const action = {...fixture.action, target:{...fixture.action.target}};
  const launched = resolveMatchAction(globalThis.structuredClone(ref.state),action,'autonomous_npc');
  const pass = launched.lastPassDiagnostic;
  if (!pass || pass.passId === ref.state.lastPassDiagnostic?.passId) { rejected.push({...spec,pressure,reason:'reference_did_not_release'}); continue; }
  const contract = outcomeContractSchema.parse({version:'original-delivery-v3',actorId:actor.id,receiverId:receiver.id,
    teamIds:base.players.filter((p)=>p.team===actor.team).map((p)=>p.id),
    opponentIds:base.players.filter((p)=>p.team!==actor.team).map((p)=>p.id),requestedAt:ref.state.time,
    releasedAt:pass.releasedAt,horizonAt:pass.releasedAt+8,passId:pass.passId,shotId:null,previousShotId:null,
    information:'privileged_engineering_observer',conditionalOnRelease:true});
  const frozen = {state:launched,contract,releaseSample:sampleCanonicalOutcome(ref.state,launched,'original-delivery-v3'),
    ballHash:hash(launched.ball),releaseHash:hash(launched)};
  releases.push({...spec,pressure,releaseHash:frozen.releaseHash,ballHash:frozen.ballHash,at:pass.releasedAt,
    ball:launched.ball,refPreludeHash:hash(ref.state)});
  let matchedCheckpoint=null;
  for(const condition of ['early','late']) for(const group of groups) {
    const pre=runPrelude(group,condition), c=pre.state.players.find((p)=>p.id===receiver.id);
    const closest=Math.min(...launched.players.filter((p)=>p.id!==c.id).map((p)=>Math.hypot(p.position.x-c.position.x,p.position.y-c.position.y)));
    if (pre.state.ball.ownerId!==actor.id || closest<1.15) {
      rows.push({...spec,pressure,condition,group:group.id,rejected:pre.state.ball.ownerId!==actor.id?'branch_passer_lost_ball':'overlapping_body_at_injection',closest});
      continue;
    }
    const injected=globalThis.structuredClone(frozen);
    const original=injected.state.players.find((p)=>p.id===receiver.id);
    // At the launch boundary, substitute only C's prelude state and C-local perception.
    // All other bodies, ball, clock and RNG remain from the same reference launch.
    Object.assign(original,globalThis.structuredClone(c));
    for(const key of ['memory','positions','plans']) {
      const from=pre.state.activePerceptionRuntime?.[key]?.[c.id];
      if(from) injected.state.activePerceptionRuntime[key][c.id]=globalThis.structuredClone(from);
      else delete injected.state.activePerceptionRuntime[key][c.id];
    }
    const sensor=pre.state.liveBallFlightRuntime?.sensors[c.id];
    if(sensor) injected.state.liveBallFlightRuntime.sensors[c.id]=globalThis.structuredClone(sensor);
    else delete injected.state.liveBallFlightRuntime.sensors[c.id];
    const events=[], sensory=[], targetChanges=[], movement=[];
    globalThis.__pr204MovementTrace={actorId:c.id,records:[]};
    let firstFlightSight=null, firstFlightKnowledge=null, previousTarget=null, priorTerminal=false;
    const result=continueRelease(injected,flags,undefined,(before,s,sample)=>{
      if(condition==='early' && group.id==='LL' && !priorTerminal) {
        const replaced=sample.passId!==contract.passId && !sample.releaseContact;
        if(!replaced && sample.contacts[0]?.actorId===c.id) matchedCheckpoint=globalThis.structuredClone(before);
        if(replaced || sample.contacts.length || sample.ownerId || sample.restart) priorTerminal=true;
      }
      movement.push(...globalThis.__pr204MovementTrace.records.splice(0).map((x)=>({...x,at:s.time})));
      if(sample.contacts.length || sample.releaseContact) events.push({at:s.time,contacts:sample.contacts,releaseContact:sample.releaseContact??null,ownerId:sample.ownerId});
      const p=s.players.find((q)=>q.id===c.id), sensorNow=s.liveBallFlightRuntime?.sensors[c.id], mem=s.activePerceptionRuntime?.memory[c.id];
      if(firstFlightSight===null && sensorNow?.optical) firstFlightSight=sensorNow.optical.at;
      if(firstFlightKnowledge===null && mem?.ball && mem.ballSeenAt>=pass.releasedAt-1e-8) firstFlightKnowledge=mem.ballSeenAt;
      if(p && (!previousTarget || Math.hypot(p.target.x-previousTarget.x,p.target.y-previousTarget.y)>0.1)) {
        targetChanges.push({at:s.time,target:p.target,job:s.activePerceptionRuntime?.positions[c.id]?.reason??null,
          reception:s.receptionPreparation?.actorId===c.id});
        previousTarget={...p.target};
      }
      if(p && (Math.round((s.time-pass.releasedAt)*40)%4===0 || sample.contacts.some((q)=>q.actorId===c.id)))
        sensory.push({at:s.time,position:p.position,velocity:p.velocity,facing:p.facingAngle,target:p.target,
          nearestOpponent:Math.min(100,...s.players.filter((q)=>q.team!==p.team).map((q)=>Math.hypot(q.position.x-p.position.x,q.position.y-p.position.y))),
          sensor:sensorNow??null,situation:mem?.situation??null,ball:sample.ball,contacts:sample.contacts});
    });
    delete globalThis.__pr204MovementTrace;
    rows.push({...spec,pressure,condition,group:group.id,rejected:null,releaseHash:frozen.releaseHash,ballHash:frozen.ballHash,
      injectedBody:{position:c.position,velocity:c.velocity,facing:c.facingAngle,plantBalance:c.plantBalance??null},
      sight:pre.firstOptical,knowledge:pre.firstBallKnowledge,firstReceivingJob:pre.firstJob,
      firstProspective:pre.firstProspective,firstPreReception:pre.firstPreReception,prelude:pre.frames,preludeMovement:pre.movement,
      closest,firstFlightSight,firstFlightKnowledge,targetChanges,sensory,movement,
      outcome:result.outcome,diagnostic:result.diagnostic,frames:result.frames,events,
      startHash:result.startHash,finalHash:result.finalHash,samplesHash:result.samplesHash});
  }
  if(matchedCheckpoint) {
    const body=matchedCheckpoint.players.find((p)=>p.id===receiver.id), arms=[];
    for(const group of groups) {
      const state=globalThis.structuredClone(matchedCheckpoint), p=state.players.find((q)=>q.id===receiver.id);
      p.profile.attributes.gameReading=group.reading; p.profile.attributes.firstTouch=group.touch;
      const first=step(state,0.025), firstSample=sampleCanonicalOutcome(state,first,'original-delivery-v3');
      const samples=[frozen.releaseSample,firstSample]; let after=first;
      for(let i=0;i<40;i++) {const next=step(after,0.025);samples.push(sampleCanonicalOutcome(after,next,'original-delivery-v3'));after=next;}
      const outcome=interpretCanonicalOutcome(contract,samples);
      const assessment=first.lastReceptionOutcome?.receiverId===p.id &&
        Math.abs((first.lastReceptionOutcome.surfaceContact?.at ?? -1)-first.time)<1e-7 ? first.lastReceptionOutcome : null;
      arms.push({group:group.id,firstContacts:firstSample.contacts,assessment,outcome,ballAfter:first.ball,
        receiverOwnerAtOneSecond:after.ball.ownerId===p.id,finalHash:hash(after)});
    }
    matchedBody.push({...spec,pressure,checkpointAt:matchedCheckpoint.time,checkpointHash:hash(matchedCheckpoint),
      ballHash:hash(matchedCheckpoint.ball),body:{position:body.position,velocity:body.velocity,facing:body.facingAngle,
        plantBalance:body.plantBalance??null},arms});
  }
  if ((releases.length+rejected.length)%8===0) console.log('PR204 preparation episodes',releases.length+rejected.length);
}
const sourceAfter=source(), stable=hash(sourceBefore)===hash(sourceAfter);
const result={schema:'pr204-pre-release-preparation-v1',source:hash(sourceBefore),sourceAfter:hash(sourceAfter),sourceManifest:sourceBefore,stable,
  qualification:'Synthetic developmental sensory deprivation and launch-boundary C-body/local-memory injection. Each family seed shares one forced canonical physical launch, other bodies and RNG; branch preludes are full canonical steps, but recombination is not a continuous natural match. Pre-release cue deprivation removes observations and never grants future pass knowledge. Baseline launch was planned at 55/55; late vs early windows are assignments, actual acquired observations and job timings are recorded. No forced contact, height/radius modification, surface irregularity or contact bonus.',
  limits:{seedCount:8,families,preludeSeconds:1,earliestOpenSeconds:0,lateOpenSeconds:0.85,
    matchedBody:'selected only where early LL had a direct first contact; attributes intervene one tick before contact'},
  costs:{wallSeconds:(performance.now()-started)/1000,cpu:process.cpuUsage(cpu),peakRSSKiB:process.resourceUsage().maxRSS,node:process.version,platform:process.platform},releases,rejected,rows,matchedBody};
mkdirSync('docs/performance/pr204',{recursive:true});
writeFileSync(`docs/performance/pr204/preparation-${version}.json.gz`,gzipSync(JSON.stringify(result),{level:9}),{flag:'wx'});
console.log(JSON.stringify({stable,source:result.source,episodes:cases.length,releases:releases.length,rejected:rejected.length,arms:rows.length,costs:result.costs}));
if (!stable) process.exitCode=1;
