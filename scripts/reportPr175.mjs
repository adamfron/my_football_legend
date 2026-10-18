/* global console */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { attributePr175Shots, attributePr175Combinations } from './pr175Attribution.ts';
const partial = process.argv.includes('--partial');
const root = 'docs/performance';
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const write = (name, value) => writeFileSync(`${root}/PR175-${name}.json`, JSON.stringify({ version: 1, status: partial ? 'partial' : 'complete', ...value }, null, 2) + '\n');
const total = (xs, f = (v) => v) => xs.reduce((n,x) => n + (f(x) ?? 0), 0);
const quantile = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, n = Math.floor(i); return sorted[n] + (sorted[Math.ceil(i)] - sorted[n]) * (i - n); };
const describe = (xs) => {
  const a = xs.filter((n) => Number.isFinite(n)).sort((a,b) => a-b), mean = a.length ? total(a)/a.length : null;
  return { n: a.length, mean, median: quantile(a, .5), sd: a.length > 1 ? Math.sqrt(total(a, (v) => (v - mean) ** 2) / (a.length-1)) : null,
    p10: quantile(a, .1), p90: quantile(a, .9), min: a[0] ?? null, max: a.at(-1) ?? null };
};
const frequencies = (xs, f) => xs.reduce((a,x) => { const key = f(x); a[key] = (a[key] ?? 0) + 1; return a; }, {});
const mergeCounts = (xs) => xs.reduce((a,x) => { for (const [k,v] of Object.entries(x ?? {})) a[k] = (a[k] ?? 0) + v; return a; }, {});
const historical = (dir) => !existsSync(dir) ? [] : readdirSync(dir).filter((p) => p.startsWith('cohort-') && p.endsWith('.json')).sort().map((file) => ({ file, ...read(`${dir}/${file}`) }));
const originals = historical('../pr175-merged-historical'), reserved = historical('../pr175-merged-reserved');
const loadNew = (dir) => !existsSync(dir) ? [] : readdirSync(dir).filter((p) => p.endsWith('-cohort.json')).sort().map((file) => {
  const r = read(`${dir}/${file}`), bytes = readFileSync(`${dir}/${r.observation.file}`), data = JSON.parse(gunzipSync(bytes));
  if (hash(BufferFromBase64(bytes)) !== r.observation.sha256) throw new Error('Observation archive digest mismatch');
  return { ...r, file, data, attributed: attributePr175Shots(data) };
});
// The acquisition runner records SHA256(base64(raw compressed bytes)); retain and verify
// that explicit legacy convention, while the evidence index uses standard byte hashes.
const BufferFromBase64 = (bytes) => bytes.toString('base64');
const development = loadNew('../pr175-development'), validation = loadNew('../pr175-validation');
const fresh = [...development, ...validation];
if (!partial && (originals.length !== 16 || reserved.length !== 8 || development.length !== 6 || validation.length !== 6)) throw new Error(`Incomplete cohorts ${originals.length}/${reserved.length}/${development.length}/${validation.length}`);
if (!partial && [...originals, ...reserved].some((r) => r.observed.status !== 'full_time')) throw new Error('Historical censoring requires explicit report handling');
if (!partial && fresh.some((r) => r.status !== 'full_time')) throw new Error('Fresh censoring requires explicit report handling');
const matchRow = (r, old = false) => {
  const s = old ? r.observed : r, official = s.official;
  const metrics = mergeCounts([official.home, official.away]);
  for (const k of ['possessionPercentage', 'completionPercentage']) delete metrics[k];
  metrics.saves = total(s.statistics.players, (p) => p.saves);
  metrics.durationMinutes = s.time / 60;
  metrics.liveSeconds = old ? total(Object.entries(s.attacking.audit.periods).filter(([k]) => k.startsWith('home:')), ([,p]) => p.liveSeconds) : r.data.counts.liveSeconds;
  return { id: old ? r.file : r.design.id, split: old ? 'historical' : r.design.split, status: s.status, seconds: s.time,
    fixtureHash: old ? r.fixture.fixtureHash : r.design.fixtureHash, initialHash: old ? s.initialStateHash : s.initialHash,
    finalHash: old ? s.finalStateHash : s.finalHash, sourceHash: r.manifest.sourceHash, score: s.score, metrics,
    per90: Object.fromEntries(Object.entries(metrics).filter(([k]) => !['liveSeconds','durationMinutes'].includes(k)).map(([k,v]) => [k, v*5400/s.time])),
    teams: Object.entries(official).map(([side, t]) => ({ side, ...t, shotsPer90: t.shots*5400/s.time, passesPer90: t.passesAttempted*5400/s.time })) };
};
const rows = fresh.map((r) => matchRow(r)), oldRows = originals.map((r) => matchRow(r,true)), reservedRows = reserved.map((r) => matchRow(r,true));
const distributions = (rows) => ({ matches: rows.length, match: Object.fromEntries(Object.keys(rows[0]?.metrics ?? {}).map((k) => [k, describe(rows.map((r) => r.metrics[k]))])),
  per90: Object.fromEntries(Object.keys(rows[0]?.per90 ?? {}).map((k) => [k, describe(rows.map((r) => r.per90[k]))])),
  teamMatch: Object.fromEntries(['passesAttempted','passesCompleted','shots','shotsOnTarget','goals','corners','fouls','completionPercentage'].map((k) => [k, describe(rows.flatMap((r) => r.teams.map((t) => t[k])))])),
  totals: mergeCounts(rows.map((r) => r.metrics)) });
const pairedHistorical = (current,archive) => {
  const saved=JSON.parse(gunzipSync(readFileSync(`${root}/pr174-experiments/${archive}`)));
  return current.map((r)=>{
    const old=JSON.parse(saved.files[r.file]);
    if(old.fixture.fixtureHash!==r.fixture.fixtureHash||old.observed.initialStateHash!==r.observed.initialStateHash) throw new Error('K/merged full input mismatch');
    const before=matchRow({...old,file:r.file},true),after=matchRow(r,true);
    return {cohort:archive.includes('original16')?'original16':'examined8',file:r.file,fixtureHash:r.fixture.fixtureHash,initialHash:r.observed.initialStateHash,
      sourceBefore:old.manifest.sourceHash,sourceAfter:r.manifest.sourceHash,
      completeFinalStateEqual:old.observed.finalStateHash===r.observed.finalStateHash,
      before:before.metrics,after:after.metrics,delta:Object.fromEntries(Object.entries(after.metrics).map(([k,v])=>[k,v-(before.metrics[k]??0)]))};
  });
};
const historicalPairs=[...pairedHistorical(originals,'PR174-final-original16-raw.json.gz'),...pairedHistorical(reserved,'PR174-final-heldout8-raw.json.gz')];
write('merged-baseline-comparison',{method:'Exact paired inputs against unchanged frozen-K raw archives. Final merged PR174 source is remeasured; no K measurement relabelled. All mirrored counterparts remain dependent.',
  originals:originals.length,reserved:reserved.length,identicalFinalStates:historicalPairs.filter((r)=>r.completeFinalStateEqual).length,
  pairedDeltaDistributions:Object.fromEntries(Object.keys(historicalPairs[0]?.delta??{}).map((k)=>[k,describe(historicalPairs.map((r)=>r.delta[k]))])),rows:historicalPairs});
const reference = read(`${root}/PR175-reference-methodology.json`), originalRef = read(`${root}/PR171-reference-comparison.json`);
const refRows = (list) => list.map((r) => ({ metrics: { passesAttempted: total(r.teams, (t) => t.passesWithoutCrosses), shots: total(r.teams,(t) => t.shots), goals: total(r.teams,(t) => t.goalsFromShots), corners: total(r.teams,(t) => t.corners),
  ...(r.teams.every((t)=>Number.isFinite(t.fouls))?{fouls:total(r.teams,(t)=>t.fouls),yellowCards:total(r.teams,(t)=>t.yellowCards),redCards:total(r.teams,(t)=>t.redCards)}:{}) },
  per90: { passesAttempted: total(r.teams,(t) => t.passesWithoutCrosses)*5400/total(r.periodsSeconds), shots: total(r.teams,(t) => t.shots)*5400/total(r.periodsSeconds), goals: total(r.teams,(t) => t.goalsFromShots)*5400/total(r.periodsSeconds), corners: total(r.teams,(t) => t.corners)*5400/total(r.periodsSeconds) },
  teams: r.teams.map((t) => ({ passesAttempted: t.passesWithoutCrosses, passesCompleted: t.completedWithoutCrosses, shots: t.shots, shotsOnTarget: t.shotsOnTargetConservative, goals: t.goalsFromShots, corners: t.corners, fouls:t.fouls, completionPercentage: t.completedWithoutCrosses/t.passesWithoutCrosses*100 })) }));
write('independent-match-distributions', { method: 'Descriptive match/team-match distributions. Team sides and event frames are not independent samples. Twelve selected designs are not a random population; shared youth clubs and repeated reference clubs limit independence. No significance claims or population confidence intervals.',
  groups: { original16: distributions(oldRows), examined8: distributions(reservedRows), fresh12: distributions(rows), development6: distributions(rows.filter((r) => r.split === 'development')), validation6: distributions(rows.filter((r) => r.split === 'validation')), worldCup12: distributions(refRows(originalRef.rows)), club12: distributions(refRows(reference.rows)) }, rows, oldRows, reservedRows });
const choices = fresh.flatMap((r) => r.data.choices), owner = choices.filter((c) => c.controlled), episodes = fresh.flatMap((r) => r.data.episodes), passes = fresh.flatMap((r) => r.data.passes);
const shotAction = (a) => a?.type === 'shot' || (a?.type === 'header' && a.intent === 'header_shot');
const credible = owner.filter((c) => ['credible','high_value'].includes(c.opportunity.category));
const stageCounts = frequencies(episodes.flatMap((p) => p.stages), (x) => x);
const shots = fresh.flatMap((r) => r.attributed.shots), goals = fresh.flatMap((r) => r.attributed.goals);
write('possession-to-shot-funnel', { method: 'Actual canonical owner/incoming ranker calls, not two-second samples. Episode stages are unique presence in uninterrupted controlled team possession; direct/set-piece/first-time paths can skip stages. Credible is an unvalidated internal opportunity category, not real-world xG. Support/box/progression candidate counts describe generated alternatives, not an exhaustive oracle of physically available options.',
  stages: stageCounts, episodeExits: frequencies(episodes,(p) => p.exit), episodes: episodes.length,
  ownerDecisions: owner.length, incomingDecisions: choices.length-owner.length, credibleDecisionObservations: credible.length,
  credibleEpisodes: new Set(credible.map((c) => c.episodeId)).size,
  credibleWithShotCandidate: credible.filter((c) => c.shotCandidates).length,
  credibleWithoutShotCandidate: credible.filter((c) => !c.shotCandidates).length,
  credibleWithExecutableShot: credible.filter((c) => c.executableShots).length,
  credibleSelectedShot: credible.filter((c) => shotAction(c.selected)).length,
  credibleAlternativeChoices: frequencies(credible.filter((c) => !shotAction(c.selected)),(c) => c.selected?.type ?? 'none'),
  allOwnerShotSelections: owner.filter((c) => shotAction(c.selected)).length,
  incomingShotSelections: choices.filter((c) => c.incoming && shotAction(c.selected)).length,
  releasedShots: shots.length, releaseChoiceLinks: shots.filter((s) => s.choiceId).length,
  physicalShotLifecycle: 'Routine accepted shot, preparation eligibility, foot contact and launch are one canonical transaction; no independent asynchronous wind-up state exists. Incoming proposals are revalidated on contact. A missing wind-up counter is not a failed preparation.',
  selectedWithoutRelease: choices.filter((c) => shotAction(c.selected) && !shots.some((s) => s.choiceId === c.id)).map((c) => ({ id:c.id, at:c.at, incoming:c.incoming, actorId:c.actorId })),
  byMatch: fresh.map((r) => ({ id:r.design.id, stages:frequencies(r.data.episodes.flatMap((p) => p.stages),(x)=>x), choices:r.data.choices.length, episodes:r.data.episodes.length,
    credibleChoices:r.data.choices.filter((c)=>c.controlled&&['credible','high_value'].includes(c.opportunity.category)).length, shots:r.data.shots.length })),
  representativeCredibleDecisions: credible.slice(0,20) });
const nonNegative = (xs) => xs.filter((x) => x !== null && x >= 0);
const choiceMap = new Map(choices.map((c)=>[c.id,c])), episodeMap = new Map(episodes.map((p)=>[p.id,p]));
const timedPasses = passes.filter((p)=>{
  const c=choiceMap.get(p.choiceId), ep=episodeMap.get(p.episodeId);
  return c?.controlled && ep && c.episodeId===ep.id && c.selected?.receiverId===p.receiverId &&
    p.controlAt!==null && p.controlAt>=ep.start-0.025 && c.at>=p.controlAt && c.at<=p.releasedAt;
});
const boxDeliveries=passes.filter((p)=>{
  if(p.intendedProgress<=5)return false;
  const direction=Math.sign(p.intendedProgress/(p.target.x-p.origin.x));
  const depth=(x)=>direction>0?x:105-x;
  return depth(p.target.x)>=88.5&&Math.abs(p.target.y-34)<=20.16&&
    (depth(p.origin.x)<88.5||Math.abs(p.origin.y-34)>20.16);
});
const boxChains=boxDeliveries.map((p)=>{
  const c=choiceMap.get(p.choiceId),q=c?.selected?.receiverId===p.receiverId?c.winnerTerms?.forecast:null;
  const nextChoice=p.result==='completed'&&p.actualReceiverId!==p.actorId?choices.find((d)=>d.controlled&&d.actorId===p.actualReceiverId&&d.episodeId===p.episodeId&&d.at>=p.resolvedAt):null;
  const intervening=nextChoice&&passes.some((r)=>r.id!==p.id&&r.episodeId===p.episodeId&&r.result==='completed'&&r.actualReceiverId===p.actualReceiverId&&r.resolvedAt>p.resolvedAt&&r.resolvedAt<=nextChoice.at);
  return {passId:p.id,episodeId:p.episodeId,choiceId:p.choiceId,releasedAt:p.releasedAt,result:p.result,
    actualReceiverId:p.actualReceiverId,forecast:q??null,
    credibleGeneratedForecast:!!q&&q.laneOccupation===0&&q.receiverLateBy<0.3&&q.expectedCompletion>0.5,
    receiverChoiceId:intervening?null:nextChoice?.id??null,
    receiverOpportunity:intervening?null:nextChoice?.opportunity.category??null,
    receiverSelected:intervening?null:nextChoice?.selected?.type??null};
});
write('territory-to-danger',{method:'Actual progressive Pass IDs aimed into the box from outside it, observed release/result and the same receiver’s first subsequent owner choice in the same possession. A later different reception invalidates the link. Target geometry is not actual box control. Completion-to-self is a reclaim. Credible forecast uses the existing audit thresholds (empty lane, receiverLateBy<0.3, completion>0.5), not validated probabilities. Restarts/uncaptured choices retain null forecast.',
  progressiveReleased:passes.filter((p)=>p.intendedProgress>5).length,
  progressiveResults:frequencies(passes.filter((p)=>p.intendedProgress>5),(p)=>p.result==='completed'&&p.actualReceiverId===p.actorId?'passer_reclaim':p.result??'unresolved'),
  boxTargetReleases:boxDeliveries.length,boxTargetResults:frequencies(boxDeliveries,(p)=>p.result==='completed'&&p.actualReceiverId===p.actorId?'passer_reclaim':p.result??'unresolved'),
  withRecordedForecast:boxChains.filter((c)=>c.forecast).length,withCredibleGeneratedForecast:boxChains.filter((c)=>c.credibleGeneratedForecast).length,
  nextRecipientOpportunities:frequencies(boxChains,(c)=>c.receiverOpportunity??'no_linked_owner_choice'),
  rows:boxChains});
write('passing-cadence', { method: 'Each physical PassDiagnostic release/resolution once. Awareness and preparation overlap rather than add. Flight-to-resolution includes failed/intercepted deliveries; receiver movement only where an actual contact exists. These are MFL rates; reference live-ball seconds unavailable.',
  timingInclusion:'Control/decision/release timing requires a controlled choice by this passer to this receiver in the same uninterrupted episode. Restart and incoming paths lack that owner lifecycle; old retained owner/choice hints are excluded. Receiver movement is restricted to the actual intended receiver.',
  timedControlledPasses:timedPasses.length, untimedOrDifferentLifecycle:passes.length-timedPasses.length,
  passes: passes.length, metres: describe(passes.map((p)=>p.metres)), flightSeconds: describe(nonNegative(passes.map((p)=>p.flightSeconds))),
  controlToRelease: describe(nonNegative(timedPasses.map((p)=>p.releasedAt-p.controlAt))),
  controlToDecision: describe(nonNegative(timedPasses.map((p)=>p.decisionAt-p.controlAt))),
  preparationDemand: describe(nonNegative(timedPasses.map((p)=>p.readyAt===null?null:p.readyAt-p.controlAt))),
  decisionToRelease: describe(nonNegative(timedPasses.map((p)=>p.releasedAt-p.decisionAt))),
  receptionToNextRelease: describe(nonNegative(passes.map((p)=>p.nextReleaseAfterReception))),
  receiverMovement: describe(nonNegative(passes.filter((p)=>p.actualReceiverId===p.receiverId).map((p)=>p.receiverMovement))), executionTypes: frequencies(passes,(p)=>p.executionType??'unknown'),
  releaseToResolutionByResult:Object.fromEntries([...new Set(passes.map((p)=>p.result??'unresolved'))].map((result)=>[result,describe(nonNegative(passes.filter((p)=>(p.result??'unresolved')===result).map((p)=>p.flightSeconds)))])),
  reciprocal: passes.filter((p)=>p.reciprocal).length, directions: frequencies(passes,(p)=>p.intendedProgress>5?'forward':p.intendedProgress < -2?'backward':'lateral'),
  results: frequencies(passes,(p)=>p.result==='completed'&&p.actualReceiverId===p.actorId?'passer_reclaim':p.result??'unresolved'), perLiveMinute: passes.length/(total(fresh,(r)=>r.data.counts.liveSeconds)/60),
  byMatch: fresh.map((r)=>({id:r.design.id,passes:r.data.passes.length,liveSeconds:r.data.counts.liveSeconds,meanDistance:describe(r.data.passes.map((p)=>p.metres)).mean})) });
write('possession-recycling', { method: 'Exploratory descriptors, not defect labels. Low-net circulation: >=4 passes and <5m retained gain. An excursion recycled: >=10m maximum gain but <5m retained gain. Reciprocal exchanges include legitimate tactical resets. Do not count a faster turnover as improvement.',
  possessionDuration: describe(episodes.map((p)=>p.end-p.start)), passesPerEpisode:describe(episodes.map((p)=>p.passes)),
  retainedGain:describe(episodes.map((p)=>p.lastDepth-p.startDepth)), maximumGain:describe(episodes.map((p)=>p.maxDepth-p.startDepth)),
  lowNetCirculation:episodes.filter((p)=>p.passes>=4&&p.lastDepth-p.startDepth<5).length,
  recycledExcursion:episodes.filter((p)=>p.maxDepth-p.startDepth>=10&&p.lastDepth-p.startDepth<5).length,
  repeatedExchanges:episodes.filter((p)=>p.reciprocal>=2).length,
  byMatch:fresh.map((r)=>({id:r.design.id,episodes:r.data.episodes.length,lowNet:r.data.episodes.filter((p)=>p.passes>=4&&p.lastDepth-p.startDepth<5).length,exits:frequencies(r.data.episodes,(p)=>p.exit)})),
  representative:episodes.filter((p)=>p.passes>=4&&p.lastDepth-p.startDepth<5).slice(0,12) });
const playerRows = fresh.flatMap((r)=>r.statistics.players.map((p)=>({match:r.design.id,team:r.roles[p.playerId]?.team,position:r.roles[p.playerId]?.position??'unknown',...p,
  per90:Object.fromEntries(['passesReceived','passesAttempted','passesCompleted','carries','shots','possessionLost','tacklesAttempted'].map((k)=>[k,p.minutesPlayed?p[k]*90/p.minutesPlayed:null])),
  receptionShare:p.passesReceived/r.official[r.roles[p.playerId]?.team??'home'].passesReceived})));
const roleTotals = {};
for (const p of playerRows) {
  const a = roleTotals[p.position] ??= { minutes:0,receptions:0,attempts:0,completions:0,carries:0,shots:0,losses:0 };
  a.minutes+=p.minutesPlayed; a.receptions+=p.passesReceived; a.attempts+=p.passesAttempted; a.completions+=p.passesCompleted; a.carries+=p.carries; a.shots+=p.shots; a.losses+=p.possessionLost;
}
write('positional-involvement', { method:'Actual participants including departures/substitutions, canonical minutes and within-team shares. Nominal engine slots are retained; central_midfielder encompasses duties. Do not infer AM/DM-equivalent usage or role appropriateness from aggregate shares. Duty changes over time were not retained.', roleTotals, playerRows,
  progressiveReceptions:frequencies(passes.filter((p)=>p.result==='completed'&&p.controlledProgress>5),(p)=>fresh.find((r)=>r.data.passes.some((q)=>q.id===p.id))?.roles[p.actualReceiverId]?.position??'unknown') });
const combos = fresh.flatMap((r)=>attributePr175Combinations(r.data).map((c)=>({...c,match:r.design.id}))), completed = combos.filter((c)=>c.outcome==='completed');
write('combination-conversion', { method:'Canonical combination IDs, unique partner→runner continuation pass and actual completed reception at the canonical combination completion timestamp. Subsequent choices/shots require this runner and the same control chain, ending at their next physical pass. A shot must link the same canonical continuation Pass ID (or its actual first-time contact). Later recycled attacks in the same episode are excluded. Raw broad same-episode hints are retained but never used as causal conversion. Unknown/ambiguous links are left unattributed.',
  intentions:mergeCounts(fresh.map((r)=>r.combinations?.counts)), endings:frequencies(combos,(c)=>`${c.kind}:${c.outcome}`),
  completed:completed.length, withSubsequentChoice:completed.filter((c)=>c.subsequentChoiceIds.length).length,
  withCredibleSubsequentChoice:completed.filter((c)=>c.subsequentChoiceIds.some((id)=>choices.some((d)=>d.id===id&&['credible','high_value'].includes(d.opportunity.category)))).length,
  withAttributedShot:completed.filter((c)=>c.subsequentShotIds.length).length, attributedShotIds:[...new Set(completed.flatMap((c)=>c.subsequentShotIds))], completedRows:completed });
write('pressing-and-adaptation',{method:'Natural observed utility contributions and bounded memory snapshots; controlled organised-press cases remain separate. A memory response is not proof of improved football outcomes.',
  actualPassChoicesWithAdaptationTerm:owner.filter((c)=>c.selected?.type==='pass'&&Math.abs(c.winnerTerms?.terms?.adaptation??0)>0.000001).length,
  observedAdaptationTerm:describe(owner.filter((c)=>c.selected?.type==='pass').map((c)=>c.winnerTerms?.terms?.adaptation??0)),
  memoryByMatch:fresh.map((r)=>({match:r.design.id,samples:r.data.memory.length,final:r.threatMemory,
    attackVariation:describe(r.data.memory.map((m)=>m.value?.response?.attackVariation??0)),
    distanceShotContext:describe(r.data.memory.map((m)=>m.value?.response?.distanceShotContext??0))})),
  controlledReceipt:'PR175-controlled-mechanisms.json',sameGeometryHistoryReceipt:'PR175-tactical-adaptation.json'});
write('shooting-outcomes', { method:'One actual shot ID, final diagnostic and canonical score transitions. Initial official block/save can precede a same-shot goal upgrade; do not add them as mutually exclusive final outcomes. Raw legal restart restrictions and last boundary fields can be stale; normalised provenance requires uninterrupted episode lineage. Internal expectation is not validated xG.',
  shots:shots.length, goals:goals.length, finalOutcomes:frequencies(shots,(s)=>s.diagnostic.outcome??'unresolved'),
  contexts:frequencies(shots,(s)=>s.diagnostic.context),
  byContext:Object.fromEntries([...new Set(shots.map((s)=>s.diagnostic.context))].map((context)=>[context,{
    shots:shots.filter((s)=>s.diagnostic.context===context).length,goals:shots.filter((s)=>s.diagnostic.context===context&&s.diagnostic.outcome==='goal').length,
    distance:describe(shots.filter((s)=>s.diagnostic.context===context).map((s)=>s.diagnostic.distance)),outcomes:frequencies(shots.filter((s)=>s.diagnostic.context===context),(s)=>s.diagnostic.outcome??'unresolved')} ])),
  initialOutcomeCounts:mergeCounts(fresh.map((r)=>Object.fromEntries(Object.entries(r.data.counts).filter(([k])=>k.startsWith('shot_outcome:'))))),
  goalSources:frequencies(goals,(g)=>g.source),reboundGoals:goals.filter((g)=>g.rebound).length,
  missingRelease:goals.filter((g)=>!g.shotId&&g.source!=='own_goal'),
  duplicateReleaseIds:shots.length-new Set(shots.map((s)=>s.diagnostic.shotId)).size,
  duplicateGoalIds:goals.length-new Set(goals.map((g)=>g.id)).size,
  shotDistance:describe(shots.map((s)=>s.diagnostic.distance)), shotPressure:describe(shots.map((s)=>s.diagnostic.pressure)),
  finalOutcomesPerMatch:fresh.map((r)=>({id:r.design.id,score:r.score,officialShots:r.official.home.shots+r.official.away.shots,shots:r.data.shots.length,finalOutcomes:frequencies(r.attributed.shots,(s)=>s.diagnostic.outcome??'unresolved')})),
  shotLedger:shots, goalLedger:goals });
const restarts=fresh.flatMap((r)=>r.data.restarts.map((s)=>({...s,match:r.design.id})));
const cornerLedger=restarts.filter((s)=>s.scenario==='corner');
write('goalkeeper-and-corners', { method:'Interventions conditional on released shot geometry/contact. Passive failed-save blocks are separate from save credit. Corner award needs canonical defensive last-touch evidence; earlier persistent boundary hints are not new contacts.',
  goalkeeperActions:frequencies(shots,(s)=>s.diagnostic.goalkeeperAction??'no_contact_record'),
  officialSaves:total(fresh,(r)=>total(r.statistics.players,(p)=>p.saves)),
  finalBlocks:shots.filter((s)=>s.diagnostic.outcome==='block').length, finalMisses:shots.filter((s)=>s.diagnostic.outcome==='miss').length,
  frame:shots.filter((s)=>['post','crossbar'].includes(s.diagnostic.outcome)).length,
  corners:total(fresh,(r)=>r.official.home.corners+r.official.away.corners), restartKinds:frequencies(restarts,(s)=>s.scenario),
  restartPreparationSeconds:describe(restarts.filter((s)=>s.releaseAt!==null).map((s)=>s.releaseAt-s.at)),
  cornerAttribution:{audited:cornerLedger.length,mismatches:cornerLedger.filter((s)=>
    !s.boundary||s.boundary.lastTouchTeam===s.team||s.boundary.lastTouchTeam===null||
    s.boundary.lastTouchPlayerId!==s.lastTouch||s.boundary.restartTeam!==s.team||
    !['goal_line_home','goal_line_away'].includes(s.boundary.boundary))},
  cornerLedger, restarts });
write('defence-and-discipline', { totals:distributions(rows).totals, canonicalDefence:fresh.map((r)=>({id:r.design.id,defence:r.defence,
  home:r.statistics.teamAccounting?.home,away:r.statistics.teamAccounting?.away})),
  interpretation:'Challenge attempts, clean wins, contact fouls and cards remain separate denominators; no foul quota. Small heterogeneous fixture samples do not establish league card rates.' });
const summary={ matches:fresh.length, original:originals.length, reserved:reserved.length, totals:distributions(rows).totals, stages:stageCounts,
  credible:credible.length,owner:owner.length,shots:shots.length,goals:goals.length,combos:completed.length,comparisons: { club:distributions(refRows(reference.rows)).match, world:distributions(refRows(originalRef.rows)).match } };
write('research-summary', summary);
if (!partial) {
  const destination=`${root}/pr175-evidence`;mkdirSync(destination,{recursive:true});
  const files={};
  for(const dir of ['../pr175-merged-historical','../pr175-merged-reserved','../pr175-development','../pr175-validation','../pr175-natural','../pr175-natural-dev-strength','../pr175-historical-goals','../pr175-plain','../pr175-pilot','../pr175-measured-harnesses']) if(existsSync(dir))
    for(const name of readdirSync(dir)) if(/\.(json|gz|ts)$/.test(name)) files[`${dir.slice(3)}/${name}`]=readFileSync(`${dir}/${name}`).toString('base64');
  for(const name of readdirSync('scripts').filter((n)=>/pr175|Pr175/.test(n))) files[`scripts/${name}`]=readFileSync(`scripts/${name}`).toString('base64');
  const bytes=gzipSync(JSON.stringify({encoding:'base64 exact original bytes',files}));
  writeFileSync(`${destination}/PR175-raw-and-harnesses.json.gz`,bytes);
  write('evidence-index',{method:'Lossless gzip container, base64 map of exact raw files and harnesses. SHA256 below hashes original bytes, not decoded text. Restore relative paths; use receipt manifest hashes to identify versions. No reference event dumps included.',
    archive:{path:`${destination}/PR175-raw-and-harnesses.json.gz`,sha256:hash(bytes),bytes:bytes.length},
    measuredHarnessFormatting:'pr175-measured-harnesses preserves the exact CRLF/extra-final-blank-line copies used for adaptation, career and startup measurements. Current scripts differ only by LF normalization and trimming final blank lines; no executable changes. Other measured cohort/performance harnesses remain byte-identical to acquisition.',
    files:Object.entries(files).map(([name,base64])=>({name,sha256:hash(Buffer.from(base64,'base64')),bytes:Buffer.from(base64,'base64').length}))});
}
console.log(JSON.stringify(summary));
