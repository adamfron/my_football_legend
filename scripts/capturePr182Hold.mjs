import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import { stepTacticalMatchAfterDecisionProbe, startSecondHalf } from '../src/core/matchSimulation/matchSimulation.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { forecastWaiting } from '../src/core/matchSimulation/roleTactics.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { pr182SourceHash, digest } from './pr182Evidence.mjs';
const input=JSON.parse(gunzipSync(readFileSync('docs/performance/pr182-evidence/initial-development.json.gz'))).find((f)=>f.design.id==='pr181-dev-ww-1');
let state=configureMatchPolicy(globalThis.structuredClone(input.state),'role-intent-v1'),hold;
const sourceHash=pr182SourceHash();
while(state.time<7200&&!['full_time','abandoned'].includes(state.status)) {
  if(state.status==='half_time')state=startSecondHalf(state);
  const before=state;
  state=stepTacticalMatchAfterDecisionProbe(state,.025);
  if(state.decisionIndex!==before.decisionIndex) {
    const a=state.latestAction,actor=state.players.find((p)=>p.id===a?.actorId);
    if(a?.type==='hold'&&actor&&state.ball.ownerId===actor.id) {
      if(hold?.id!==actor.id)hold={id:actor.id,at:state.time,origin:{...actor.position},count:0};
      hold.count++;
    } else hold=undefined;
  }
  if(hold) {
    const owner=state.players.find((p)=>p.id===hold.id);
    if(!owner||state.ball.ownerId!==hold.id||distance(owner.position,hold.origin)>1)hold=undefined;
    else if(state.time-hold.at>30&&hold.count>=3) {
      if(pr182SourceHash()!==sourceHash)throw Error('Source changed during exact hold reconstruction');
      writeFileSync('docs/performance/pr182-evidence/r2-new-ww-hold-state.json.gz',gzipSync(JSON.stringify(state)));
      const receipt={sourceHash,inputHash:input.inputHash,captureHash:digest(state),at:state.time,hold,
        releasePossible:canReleaseControlledAction(state,owner),waiting:forecastWaiting(state,owner).diagnostic,
        ranking:rankAvailableActionsForAI(state,owner.id).slice(0,8)};
      writeFileSync('docs/performance/PR182-new-hold.json',JSON.stringify(receipt,null,2)+'\n');
      console.log(JSON.stringify(receipt));
      break;
    }
  }
}
if(!hold)throw Error('No matching hold found');
