import { describe, expect, it } from 'vitest';
import { Pr175Observer } from './pr175Observer';
import { attributePr175Shots, attributePr175Combinations } from './pr175Attribution';
import { shotProbeFixture } from './pr171Probes';
import { rankAvailableActionsForAI, resolveMatchAction } from '../src/core/matchSimulation/matchActions';

describe('PR175 set-piece provenance', () => {
  const sample = () => {
    const { state, actorId } = shotProbeFixture('unmarked_striker', 'pr175-lineage');
    const observer = new Pr175Observer(), ranking = rankAvailableActionsForAI(state, actorId);
    const shot = ranking.find((r) => r.action.type === 'shot')!.action;
    observer.decision(state, actorId, ranking, shot);
    const next = resolveMatchAction(state, shot); observer.observe(state, next);
    return observer.snapshot(next);
  };
  it('rejects retained restart hints after an intervening possession', () => {
    const raw = sample();
    raw.shots[0]!.sourceRestart = 'goal_kick'; raw.shots[0]!.sourceRestartId = 'old';
    raw.restarts.push({ id: 'old', at: 100, releaseAt: 105, scenario: 'goal_kick', team: 'home', lastTouch: null, boundary: null });
    raw.episodes.unshift({ ...raw.episodes[0]!, id: 'intervening', start: 200, end: 590, team: 'away' });
    expect(attributePr175Shots(raw).shots[0]?.sourceRestartId).toBeNull();
    expect(raw.shots[0]?.sourceRestartId).toBe('old');
  });
  it('retains a genuine restart followed by uninterrupted attacking control', () => {
    const raw = sample();
    raw.restarts.push({ id: 'current', at: 590, releaseAt: 598, scenario: 'corner', team: 'home', lastTouch: null, boundary: null });
    expect(attributePr175Shots(raw).shots[0]?.sourceRestartId).toBe('current');
  });
  it('stops combination attribution at the runner’s next release even within the same possession', () => {
    const raw=sample(), shot=raw.shots[0]!,runner=shot.diagnostic.shooterId;
    shot.previousPassId='continuation';
    raw.combinations.push({id:'opening:combination',episodeId:shot.episodeId,kind:'pass_and_go',at:599,
      outcome:'completed',retainedProgress:5,participantIds:[runner,'partner',runner],subsequentChoiceIds:[],subsequentShotIds:[]});
    const pass={id:'continuation',episodeId:shot.episodeId,choiceId:null,team:shot.team,actorId:'partner',receiverId:runner,
      releasedAt:598,resolvedAt:599,result:'completed',contact:'clean_control',actualReceiverId:runner,metres:12,
      intendedProgress:5,controlledProgress:5,origin:{x:80,y:34},target:{x:92,y:34},receiverOrigin:{x:92,y:34},receiverMovement:0,
      controlAt:597,readyAt:597.5,decisionAt:598,executionType:'normal',nextReleaseAfterReception:null,nextPassId:null,flightSeconds:1,reciprocal:false};
    raw.passes.push(pass,{...pass,id:'intervening',actorId:runner,receiverId:'other',actualReceiverId:'other',releasedAt:601,resolvedAt:602});
    raw.shots.push({...shot,releasedAt:650,diagnostic:{...shot.diagnostic,shotId:'unrelated-later'}});
    raw.choices.push({...raw.choices[0]!,id:'later-choice',at:650});
    const linked=attributePr175Combinations(raw)[0]!;
    expect(linked.continuationPassId).toBe('continuation');
    expect(linked.subsequentShotIds).toEqual([shot.diagnostic.shotId]);
    expect(linked.subsequentChoiceIds).not.toContain('later-choice');
    raw.passes[1]!.releasedAt=599; // A first-time relay closes control on the same contact.
    expect(attributePr175Combinations(raw)[0]?.subsequentShotIds).toEqual([]);
  });
});
