import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { createTransitionFixture } from '../src/core/matchSimulation/transitionLaboratory.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { hash, manifest, retainSourceVersion, writeReceipt } from './pr193Evidence.mjs';
const rows = [];
for (const mode of ['legacy', 'incidental', 'own_goal', 'post', 'wide', 'direct_throw']) {
  const f = createTransitionFixture({ id: 'incidental-score-laws', scenario: 'deflection' });
  let s = f.state;
  if (mode === 'legacy') delete s.experimentalIncidentalGoals;
  s.players.forEach((p, i) => {
    p.position = { x: 25 + (i % 6) * 4, y: 5 + Math.floor(i / 6) * 14 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  s.ball = {
    x: 104.5,
    y: mode === 'wide' ? 39 : mode === 'post' ? 30.5 : 34,
    height: 0.8,
    velocity: { x: 20, y: 0, z: 0 },
    airborne: true,
    looseSince: s.time,
    lastTouchPlayerId: mode === 'own_goal' ? f.defenderId : f.carrierId,
  };
  delete s.onBallPreparation;
  if (mode === 'own_goal' || mode === 'post') s.possessionTeam = 'away';
  s.actionCooldown = 5;
  if (mode === 'direct_throw')
    s.restartTouchRestriction = {
      awardId: 'throw',
      scenario: 'throw_in',
      team: 'home',
      takerId: f.carrierId,
      indirect: false,
      touchedByOther: false,
    };
  const initialHash = hash(s),
    trace = [];
  for (let i = 0; i < 12; i++) {
    s = step(s, 0.025);
    trace.push({ at: s.time, ball: { ...s.ball }, score: s.score });
    if (s.postGoal || s.restart) break;
  }
  const shots = s.statistics?.players.reduce((n, p) => n + p.shots, 0) ?? 0;
  if ((s.statistics?.observedShotIds.length ?? 0) !== 0 || s.lastShot)
    throw Error('Fictional intentional shot');
  if (shots !== (mode === 'incidental' ? 1 : 0))
    throw Error('Goal-inclusive public shot convention drift');
  if (s.score.home !== (['incidental', 'own_goal'].includes(mode) ? 1 : 0))
    throw Error('Goal law experiment failed ' + mode);
  rows.push({
    mode,
    initialHash,
    finalHash: hash(s),
    trace,
    goal: s.lastIncidentalGoal ?? null,
    score: s.score,
    shots,
    playerGoals: s.statistics?.players.reduce((n, p) => n + p.goals, 0) ?? 0,
    ownGoals: s.statistics?.players.reduce((n, p) => n + (p.ownGoals ?? 0), 0) ?? 0,
    lastContact: s.lastBallContact ?? null,
    classification:
      'prescribed near-goal trajectory; actual canonical crossing; isolated scoring/law test, not a generated multi-contact highlight',
  });
}
const source = manifest(),
  sourceArchive = retainSourceVersion(source),
  result = {
    schema: 'mfl-pr193-incidental-scoring-v3',
    source,
    sourceHash: hash(source),
    sourceArchive,
    rows,
  };
const out = 'docs/performance/pr193/incidental-scoring-v3.json';
if (process.argv.includes('--check')) {
  const old = JSON.parse(readFileSync(out));
  if (hash(old.rows) !== hash(rows)) throw Error('Incidental scoring replay drift');
} else writeReceipt(out, result);
console.log(
  'PR193 incidental/own goal laws PASS; goal-inclusive public statistics; no intentional shot identity',
);
