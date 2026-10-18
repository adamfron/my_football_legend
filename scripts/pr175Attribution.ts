import type { z } from 'zod';
import type { pr175ObservationSchema } from './pr175Observer';
type Observation = z.infer<typeof pr175ObservationSchema>;

/** A persistent legal second-touch restriction is not a set-piece attack. Require the
 * restart release to lead into this exact uninterrupted controlled possession. Preserve
 * raw hints separately in archived observations; this projection never changes canonical data. */
export const attributePr175Shots = (raw: Observation) => {
  const shots = raw.shots.map((s) => {
    const epIndex = raw.episodes.findIndex((p) => p.id === s.episodeId);
    const ep = raw.episodes[epIndex], prior = raw.episodes[epIndex - 1];
    const restart = raw.restarts.findLast((r) => r.releaseAt !== null && r.releaseAt <= s.releasedAt + 0.025);
    const continuous = ep && restart && restart.team === s.team &&
      restart.releaseAt! <= ep.start + 0.025 && (!prior || prior.end <= restart.at + 0.025);
    const direct = ['penalty', 'free_kick'].includes(s.diagnostic.context) && restart &&
      Math.abs((restart.releaseAt ?? -100) - s.releasedAt) <= 0.05;
    return { ...s, rawRestartHint: { id: s.sourceRestartId, scenario: s.sourceRestart },
      sourceRestartId: continuous || direct ? restart.id : null,
      sourceRestart: continuous || direct ? restart.scenario : null };
  });
  const goals = raw.goals.map((g) => {
    const shot = shots.find((s) => s.diagnostic.shotId === g.shotId);
    const source = shot ? shot.team !== g.team ? 'own_goal' : shot.diagnostic.context === 'penalty' ? 'penalty' :
      shot.diagnostic.context === 'free_kick' ? 'direct_free_kick' : shot.diagnostic.reboundSource ? 'rebound' :
      shot.sourceRestart ? 'set_piece_sequence' : 'open_play' : g.lastTouchTeam !== null && g.lastTouchTeam !== g.team ? 'own_goal' : 'other_canonical_boundary';
    const initialResolutionPrecededGoal=!!shot&&shot.resolvedAt!==null&&shot.resolvedAt<g.at-0.000001;
    const rebound=!!shot&&initialResolutionPrecededGoal&&Boolean(shot.diagnostic.reboundSource||shot.diagnostic.blockerId||
      ['parry','parry_away','failed_save'].includes(shot.diagnostic.goalkeeperAction??''));
    return { ...g, rawSourceHint: g.source, source,rebound,
      boundary: null, boundaryNote: 'Goal geometry is the physical shot/score transition. The lastBoundaryCrossing field may describe an earlier non-goal exit and is not attributed to this goal.',
      initialResolutionPrecededGoal };
  });
  return { shots, goals };
};

/** Follow the actual continuation reception, then this runner's uninterrupted control
 * until their next physical delivery. A later recycled attack in the same episode is
 * not attributed to this combination. Unknown/ambiguous continuation IDs are left unlinked. */
export const attributePr175Combinations = (raw: Observation) => raw.combinations.map((c) => {
  const runner=c.participantIds.at(-1),partner=c.participantIds[1];
  const candidates=raw.passes.filter((p)=>p.actorId===partner&&p.actualReceiverId===runner&&p.result==='completed'&&
    p.resolvedAt!==null&&Math.abs(p.resolvedAt-c.at)<=0.026&&p.episodeId===c.episodeId);
  const continuation=c.outcome==='completed'&&candidates.length===1?candidates[0]:undefined;
  const until=continuation?Math.min(...raw.passes.filter((p)=>p.actorId===runner&&p.releasedAt>=continuation.resolvedAt!-0.000001).map((p)=>p.releasedAt),Infinity):-Infinity;
  const choices=continuation?raw.choices.filter((d)=>d.actorId===runner&&d.episodeId===c.episodeId&&d.at>=c.at-0.026&&d.at<=until):[];
  const shots=continuation?raw.shots.filter((s)=>s.diagnostic.shooterId===runner&&s.episodeId===c.episodeId&&
    s.releasedAt>=c.at-0.026&&s.releasedAt<=until&&
    (s.previousPassId===continuation.id||(s.diagnostic.firstTime&&Math.abs(s.releasedAt-continuation.resolvedAt!)<=0.026))):[];
  const {retainedProgress,...identity}=c;
  return {...identity,runnerDisplacementFromRecordedOrigin:retainedProgress,continuationPassId:continuation?.id??null,controlChainEndsAt:Number.isFinite(until)?until:null,
    rawEpisodeAssociationCounts:{choices:c.subsequentChoiceIds.length,shots:c.subsequentShotIds.length},
    subsequentChoiceIds:choices.map((d)=>d.id),subsequentShotIds:shots.map((s)=>s.diagnostic.shotId)};
});
