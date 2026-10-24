import { describe, expect, it } from 'vitest';
import { createRelativeTrial } from './relativeDecisionLab';
import { observeBoundedScene } from './boundedPerception';
import { inspectBoundedAction } from './boundedIntelligence';
import { constructBoundedCandidates, runBoundedPolicy } from './boundedDecision';
import { boundedPolicySchema, boundedRuntimeSchema } from './boundedIntelligenceState';
import {
  assessRelativeSituation,
  updateOpponentKnowledge,
  psychologicalContext,
} from './opponentKnowledge';
import { createFormationBenchmarkMatch } from './benchmarkFixtures';
import { stepTacticalMatchAfterDecisionProbe, stepTacticalMatch } from './matchSimulation';
import { createTacticalMatch } from './matchSimulation';
import { applyRestartScenario, awardNaturalRestart } from './restartScenarios';
import { requestHumanFreeKickPreparation, selectRestartAction } from './restartLifecycle';
import { enumerateContextualRestartActions } from './restartOptions';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { tacticalMatchStateSchema } from './matchState';
import { attacksRight, distance } from './matchSpace';
import { deriveRestartLegalReadiness } from './restartLaws';
import { playerContactGeometry } from './ballContactGeometry';
import { resolveMatchAction } from './matchActions';
import { chooseNpcDefensiveChallengeAction, deriveDefensiveContext } from './defensiveChallenges';
import { chooseCurrentFreeKickPositions } from './restartLifecycle';

const fixture = (
  skill = 40,
  opposition = skill,
  situation: 'safe' | 'approaching' | 'arrived' | 'exposed' = 'arrived',
) =>
  createRelativeTrial({
    skill,
    opposition,
    situation,
    policy: 'opportunity-driven-v1',
    seed: 'pr188-regression',
  });
const scene = (
  skill = 40,
  opposition = skill,
  situation: 'safe' | 'approaching' | 'arrived' | 'exposed' = 'arrived',
) => {
  const f = fixture(skill, opposition, situation);
  return observeBoundedScene(f.state, f.state.players.find((p) => p.id === f.actorId)!);
};
describe('PR188 relative opportunities and evidence boundaries', () => {
  const finishingFixture = () => {
    const f = fixture(80),
      s = f.state,
      a = s.players.find((p) => p.id === f.actorId)!;
    s.decisionPolicy = 'hierarchical-intent-v1';
    a.position = { x: 93, y: 34 };
    f.defenderIds.forEach((id, i) => {
      s.players.find((p) => p.id === id)!.position = { x: 70, y: 5 + i * 5 };
    });
    for (const [i, p] of s.players
      .filter((p) => p.team === a.team && p.id !== a.id && p.slot.position === 'center_back')
      .entries())
      p.position = { x: 89, y: 30 + i * 8 };
    s.ball = { ...s.ball, ...playerContactGeometry(a).rightFoot };
    return { s, a };
  };
  it('gives Hierarchical Intent a finishing objective when a physical shot is better than circulation', () => {
    const { s, a } = finishingFixture(),
      inspection = inspectBoundedAction(s, a);
    expect(inspection.action?.type).toBe('shot');
    expect(inspection.decision.intent?.goal).toBe('finish');
    const next = resolveMatchAction(s, inspection.action!, 'autonomous_npc');
    expect(next.ball.shot).toBeDefined();
    expect(next.ball.lastTouchPlayerId).toBe(a.id);
  });
  it('revises a supported progress plan for a better terminal opportunity rather than circulating indefinitely', () => {
    const { s, a } = finishingFixture(),
      scene = observeBoundedScene(s, a),
      candidates = constructBoundedCandidates(scene);
    const continuation = candidates.find((c) => c.action.type === 'carry')!;
    scene.intent = {
      actorId: a.id,
      candidateKey: continuation.id,
      goal: 'progress',
      startedAt: 9,
      expiresAt: 11,
      dependencies: [],
      signature: scene.signature,
    };
    const result = runBoundedPolicy('hierarchical-intent-v1', { scene, candidates });
    expect(result.intent?.goal).toBe('finish');
    expect(result.reasons).toContain('cancel:finishing_window_better_than_continuation');
    expect(result.measured.evaluations).toBeLessThanOrEqual(48);
  });
  it('lets a weak covered defender attempt an exposed contact inside the existing physical reach', () => {
    const f = fixture(),
      s = f.state,
      actor = s.players.find((p) => p.id === f.actorId)!,
      defender = s.players.find((p) => p.id === f.defenderIds[1])!;
    s.ball = { ...s.ball, x: actor.position.x + 0.4, y: actor.position.y };
    defender.position = { x: s.ball.x + 0.8, y: s.ball.y };
    defender.facingAngle = -Math.PI / 2;
    s.players.find((p) => p.id === f.defenderIds[2])!.position = { x: 64, y: 34 };
    expect(deriveDefensiveContext(s, defender.id)!.covering).toBeGreaterThan(0);
    expect(chooseNpcDefensiveChallengeAction(s, defender.id)?.technique).toBe('standing');
  });
  for (const skill of [40, 80])
    for (const policy of boundedPolicySchema.options)
      it(`${policy}: ordinary feasible action remains possible at ${skill}:${skill}`, () => {
        const s = scene(skill),
          candidates = constructBoundedCandidates(s);
        const d = runBoundedPolicy(policy, { scene: s, candidates });
        expect(d.selectedCandidateId ?? d.preparationCandidateId).not.toBeNull();
        expect(candidates.some((c) => c.action.type === 'pass' && c.risk < 1)).toBe(true);
      });
  for (const policy of boundedPolicySchema.options)
    it(`${policy}: compares a difficult action with harmful waiting without an admission fallback`, () => {
      const s = scene();
      const cs = constructBoundedCandidates(s).filter(
        (c) => c.action.type === 'hold' || c.action.type === 'carry',
      );
      cs.forEach((c) => {
        c.readyAt = s.at;
        c.feasible = true;
        c.closesAt = s.at + 2;
        c.risk = 0.95;
        c.benefit = c.action.type === 'hold' ? -0.5 : -0.1;
      });
      expect(runBoundedPolicy(policy, { scene: s, candidates: cs }).selectedCandidateId).not.toBe(
        'hold',
      );
    });
  it('prices a second intervention angle and keeps safe shielding meaningful', () => {
    const safe = assessRelativeSituation(scene(40, 40, 'safe'));
    const arrived = assessRelativeSituation(scene(40, 40, 'arrived'));
    expect(arrived.waitingRisk).toBeGreaterThan(safe.waitingRisk);
    expect(arrived.horizon).toBe(1.2);
  });
  it('does not turn repeated ticks or the scoreboard into new opponent evidence', () => {
    const s = scene(),
      foe = s.visible.find((p) => p.team !== s.team)!;
    s.visible = [foe];
    foe.velocity = { x: 3, y: 0 };
    s.opponents = updateOpponentKnowledge(s);
    const first = structuredClone(s.opponents);
    s.at += 2;
    s.scoreDifference = -4;
    expect(updateOpponentKnowledge(s)).toEqual(first);
    foe.velocity = { x: 0, y: 0 };
    s.opponents = updateOpponentKnowledge(s);
    s.at += 2;
    foe.velocity = { x: 0, y: 4 };
    expect(updateOpponentKnowledge(s)[foe.id]!.strength).toBe(2);
  });
  it('deduplicates a visible contact even after a distinct movement episode', () => {
    const s = scene(),
      foe = s.visible.find((p) => p.team !== s.team)!;
    s.visible = [foe];
    s.observedContact = { actorId: foe.id, key: 'touch:1' };
    s.opponents = updateOpponentKnowledge(s);
    s.at += 2;
    foe.velocity = { x: 3, y: 0 };
    s.opponents = updateOpponentKnowledge(s);
    s.at += 2;
    expect(updateOpponentKnowledge(s)[foe.id]!.strength).toBe(2);
  });
  it('keeps personality effects bounded and leaves skill and beliefs unchanged', () => {
    const s = scene(),
      before = structuredClone(s);
    s.at = 5100;
    s.scoreDifference = -1;
    const x = psychologicalContext(s);
    expect(x.urgency).toBeGreaterThan(0);
    expect(x.anxiety).toBeGreaterThan(0);
    expect(s.attributes).toEqual(before.attributes);
    expect(s.opponents).toEqual(before.opponents);
  });
  it('preserves optional runtime compatibility in old saves', () => {
    expect(boundedRuntimeSchema.parse({}).opponents).toEqual({});
    const f = fixture();
    delete f.state.boundedRuntime;
    expect(
      inspectBoundedAction(f.state, f.state.players.find((p) => p.id === f.actorId)!),
    ).toBeDefined();
  });
});
describe('PR188 lawful opening and human free kicks', () => {
  it('preserves the historical apparatus while the real constructor independently starts a kick-off', () => {
    const f = createFormationBenchmarkMatch({ opponent: '4-3-3', seed: 'pr188-apparatus' });
    expect(f.state.scenario).toBe('open_play');
    expect(f.state.ball.ownerId).toBeDefined();
    expect(createTacticalMatch(f.session).ball.ownerId).toBeUndefined();
  });
  it('starts unowned and stationary at the centre with legal established bodies', () => {
    const s = createTacticalMatch(
      createFormationBenchmarkMatch({
        opponent: '4-3-3',
        seed: 'pr188-opening-regression',
      }).session,
    );
    expect(s.scenario).toBe('kick_off');
    expect(s.ball.ownerId).toBeUndefined();
    expect(s.ball).toMatchObject({ x: 52.5, y: 34, velocity: { x: 0, y: 0, z: 0 } });
    expect(deriveRestartLegalReadiness(s).ready).toBe(true);
    for (const p of s.players)
      if (p.id !== s.restart!.takerId)
        expect(attacksRight(p) ? p.position.x : 105 - p.position.x).toBeLessThanOrEqual(
          52.5 + 1e-6,
        );
  });
  it('physically releases the first kick and records the taker without fabricated receiving ownership', () => {
    let s = createTacticalMatch(
      createFormationBenchmarkMatch({
        opponent: '4-3-3',
        seed: 'pr188-opening-contact',
      }).session,
    );
    const taker = s.restart!.takerId;
    for (let i = 0; i < 400 && s.restart?.phase !== 'release'; i++) s = stepTacticalMatch(s, 0.025);
    expect(s.restart?.phase).toBe('release');
    expect(s.ball.ownerId).toBeUndefined();
    expect(s.ball.lastTouchPlayerId).toBe(taker);
    expect(Math.hypot(s.ball.velocity?.x ?? 0, s.ball.velocity?.y ?? 0)).toBeGreaterThan(0);
  });
  const freeKick = (ceremonial = false) => {
    let s = applyRestartScenario(fixture(60).state, 'free_kick_close', {
      restartTeam: 'home',
      ceremonial,
    });
    s = { ...s, controlledFootballerId: s.restart!.takerId, playerAgencyEnabled: true };
    return s;
  };
  it('does not infer a whistle requirement just from a potential wall for a human taker', () => {
    const f = fixture(60).state;
    f.playerAgencyEnabled = true;
    f.controlledFootballerId = applyRestartScenario(f, 'free_kick_close', {
      restartTeam: 'home',
    }).restart!.takerId;
    const quick = applyRestartScenario(f, 'free_kick_close', { restartTeam: 'home' });
    expect(Object.values(quick.restart!.roles).some((r) => r.key === 'wall')).toBe(true);
    expect(quick.restart!.ceremonial).toBe(false);
    expect(deriveRestartLegalReadiness(quick).quickRestart).toBe(true);
    expect(deriveRestartLegalReadiness(quick).ready).toBe(true);
    const whistle = applyRestartScenario(f, 'free_kick_close', {
      restartTeam: 'home',
      ceremonial: true,
    });
    expect(deriveRestartLegalReadiness(whistle).quickRestart).toBe(false);
  });
  it('quick passes name actual positions and selection preserves the presented geometry', () => {
    const s = freeKick();
    const actions = enumerateContextualRestartActions(s);
    expect(actions.some((a) => a.type === 'pass')).toBe(true);
    expect(actions.some((a) => a.type === 'cross')).toBe(false);
    for (const a of actions)
      if (a.type === 'pass')
        expect(distance(a.target, s.players.find((p) => p.id === a.receiverId)!.position)).toBe(0);
    const next = selectRestartAction(s, actions.find((a) => a.type === 'pass')!, 'human_selected');
    expect(next.restart!.targets).toEqual(s.restart!.targets);
    expect(next.players).toEqual(s.players);
  });
  it('physically releases a selected live quick pass after resuming canonical time', () => {
    let s = awardNaturalRestart(freeKick(), 'free_kick_close', {
      restartTeam: 'home',
      restartPoint: { x: 83, y: 34 },
      ceremonial: false,
    });
    const taker = s.restart!.takerId,
      at = s.time,
      positions = structuredClone(s.players);
    const pass = enumerateContextualRestartActions(s).find((a) => a.type === 'pass')!;
    s = selectRestartAction(s, pass, 'human_selected');
    expect(s.time).toBe(at);
    expect(s.players).toEqual(positions);
    expect(s.ball.ownerId).toBeUndefined();
    for (let i = 0; i < 800 && s.restart?.phase !== 'release'; i++)
      s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    expect(s.restart?.phase).toBe('release');
    expect(s.ball.lastTouchPlayerId).toBe(taker);
    expect(s.ball.ownerId).toBeUndefined();
    expect(s.lastPassDiagnostic?.passerId).toBe(taker);
    expect(s.latestActionSource).toBe('human_selected');
    expect(s.time).toBeGreaterThan(at);
  });
  it('preparation resumes time, travels physically, returns agency and never chooses a kick', () => {
    let s = freeKick();
    const teammate = s.players.find(
      (p) => p.team === 'home' && p.id !== s.restart!.takerId && p.slot.position !== 'goalkeeper',
    )!;
    teammate.position = { x: 45, y: 12 };
    const before = structuredClone(s);
    s = requestHumanFreeKickPreparation(s);
    expect(s.time).toBe(before.time);
    expect(s.players).toEqual(before.players);
    expect(s.restart!.selectedAction).toBeUndefined();
    expect(projectPlayerDecisionOpportunity(s)).toBeUndefined();
    for (let i = 0; i < 2400 && s.restart?.humanPreparation !== 'ready'; i++)
      s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    expect(s.time).toBeGreaterThan(before.time);
    expect(s.restart?.humanPreparation).toBe('ready');
    expect(s.restart!.selectedAction).toBeUndefined();
    expect(projectPlayerDecisionOpportunity(s)?.kind).toBe('restart');
    expect(
      tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))).restart!.humanPreparation,
    ).toBe('ready');
  }, 30000);
  it('ceremonial laws prohibit quick play and retain the physical ball and wall conditions', () => {
    const s = freeKick(true);
    const wall = s.players.find((p) => s.restart!.roles[p.id]?.key === 'wall')!;
    wall.position = { ...s.ball };
    expect(deriveRestartLegalReadiness(s).quickRestart).toBe(false);
    expect(projectPlayerDecisionOpportunity(s)).toBeUndefined();
  });
  it('can explicitly return from preparation to currently legal positions without selecting a kick', () => {
    let s = freeKick();
    s.players.find(
      (p) => p.team === 'home' && p.id !== s.restart!.takerId && p.slot.position !== 'goalkeeper',
    )!.position = { x: 45, y: 12 };
    s = requestHumanFreeKickPreparation(s);
    for (let i = 0; i < 1200 && !deriveRestartLegalReadiness(s).ready; i++)
      s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    const before = structuredClone(s);
    expect(s.restart!.humanPreparation).toBe('waiting_team');
    const restored = chooseCurrentFreeKickPositions(s);
    expect(restored.players).toEqual(before.players);
    expect(restored.time).toBe(before.time);
    expect(restored.restart!.selectedAction).toBeUndefined();
    expect(restored.restart!.ceremonial).toBe(true);
    expect(enumerateContextualRestartActions(restored).some((a) => a.type === 'cross')).toBe(false);
    s = { ...s, ball: { ...s.ball, velocity: { x: 2, y: 0, z: 0 } } };
    expect(chooseCurrentFreeKickPositions(s)).toBe(s);
  });
});
