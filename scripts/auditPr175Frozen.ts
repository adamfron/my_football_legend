import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tacticalMatchStateSchema, type TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { npcPossessionDecisionDelay, rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions';
import { canExecuteCanonicalShot } from '../src/core/matchSimulation/shootingOptions';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace';
import { pr172Manifest, pr172Hash } from './pr172Evidence';
import { z } from 'zod';
const rows=[];
for(const group of ['pr175-natural','pr175-natural-dev-strength']) {
  const raw=JSON.parse(gunzipSync(readFileSync(`../${group}/frozen-states.json.gz`)).toString('utf8')) as {category:string;actorId:string;state:TacticalMatchState}[];
  for(const c of raw) {
    const state=tacticalMatchStateSchema.parse(c.state) as unknown as TacticalMatchState;
    const before=pr172Hash(state),actor=state.players.find((p)=>p.id===c.actorId)!;
    const ranked=rankAvailableActionsForAI(state,actor.id),a=actor.profile.attributes;
    rows.push({group,category:c.category,at:state.time,actorId:actor.id,stateHash:before,
      metresFromBall:distance(actor.position,state.ball),ballOwner:state.ball.ownerId??null,
      settledShotEligible:canExecuteCanonicalShot(state,{type:'shot',actorId:actor.id,intent:'driven',contact:'settled',
        target:{x:attacksRight(actor)?105:0,y:34},goalTarget:{horizontal:0,vertical:0.3}}),
      generatedShotOptions:ranked.filter((r)=>r.action.type==='shot').length,selected:ranked[0]??null,
      possessionAge:state.time-(state.ballOwnershipStartedAt??state.time),
      contextualDecisionDelay:npcPossessionDecisionDelay(state,actor),
      skill:(a.firstTouch+a.gameReading+a.composure)/300,
      readiness:state.onBallPreparation??null,
      awarenessDelayOfRetainedPass:state.lastResolvedPass?.awarenessDelay??state.lastPassDiagnostic?.awarenessDelay??null,
      retainedPassReleasedAt:state.lastResolvedPass?.releasedAt??state.lastPassDiagnostic?.releasedAt??null,
      retainedPassResolvedAt:state.lastResolvedPass?.resolvedAt??state.lastPassDiagnostic?.resolvedAt??null});
    if(pr172Hash(state)!==before)throw new Error('Pure frozen audit mutated state');
  }
}
const schema=z.object({version:z.literal(1),manifest:z.unknown(),method:z.string(),rows:z.array(z.unknown())});
writeFileSync('docs/performance/PR175-perception-clock-audit.json',JSON.stringify(schema.parse({version:1,manifest:pr172Manifest(),
  method:'19 retained natural development states. Actual canonical physical readiness and contextual decision-delay projections, no RNG/state mutation. Awareness of a retained incoming pass may precede present control and must not be added as an independent blackout. Full cohort reports owner timing separately; these selected states are not a population estimate. A credible opportunity category does not override foot access.',rows}),null,2)+'\n');
console.log(JSON.stringify({states:rows.length,credibleNoCandidate:rows.filter((r)=>r.category==='credible_no_candidate')}));
