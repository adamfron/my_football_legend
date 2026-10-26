import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { createTransitionFixture } from '../src/core/matchSimulation/transitionLaboratory.ts';
import { findFirstBallContact } from '../src/core/matchSimulation/ballFlight.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { hash, manifest, retainSourceVersion, writeReceipt } from './pr193Evidence.mjs';
const f = createTransitionFixture({ id: 'blocked-anatomy', scenario: 'crowded', lane: 'left' }),
  p = f.state.players.find((p) => p.id === f.defenderId);
// The exact ordinary loose-flight body candidate in matchSimulation.ts: a solid
// sphere, not separate legs. Query it rather than drawing a fictitious opening.
const body = { kind: 'defender', playerId: p.id, centre: { ...p.position, z: 0.9 }, radius: 0.72 };
const betweenLegs = findFirstBallContact({
  previous: { x: p.position.x - 1, y: p.position.y, z: 0.11 },
  next: { x: p.position.x + 1, y: p.position.y, z: 0.11 },
  attackingTeam: f.state.teams.home,
  candidates: [body],
});
let s = globalThis.structuredClone(f.state);
delete s.onBallPreparation;
s.actionCooldown = 5;
for (const q of s.players) {
  q.position = { x: 30, y: 10 };
  q.target = { ...q.position };
  q.velocity = { x: 0, y: 0 };
}
s.ball = {
  x: 104.5,
  y: 34,
  height: 0.8,
  velocity: { x: 20, y: 0, z: 0 },
  airborne: true,
  looseSince: s.time,
  lastTouchPlayerId: f.carrierId,
};
const initial = globalThis.structuredClone(s),
  trace = [];
for (let tick = 0; tick < 12; tick++) {
  s = step(s, 0.025);
  trace.push({
    at: s.time,
    ball: { ...s.ball },
    award: s.lastRestartAward ?? null,
    score: s.score,
  });
  if (s.restart || s.postGoal) break;
}
const source = manifest(),
  sourceArchive = retainSourceVersion(source);
const result = {
  schema: 'mfl-pr193-geometry-limits-v1',
  source,
  sourceHash: hash(source),
  sourceArchive,
  nutmeg: {
    status: 'blocked_research_fixture',
    body,
    betweenLegs,
    reason:
      'Solid current collision volume intersects the requested low central path. No anatomical nutmeg success is claimed.',
  },
  incidentalGoal: {
    status: 'blocked_scoring_path',
    initialHash: hash(initial),
    finalHash: hash(s),
    trace,
    reason:
      'A non-shot loose-ball goal-mouth crossing currently follows the generic boundary award path. PR193 does not fabricate a shot identity to hide this limitation.',
  },
  anatomy:
    'Generic canonical defender contacts identify the player and contact point, not knee versus thigh. The optional articulated surface experiment remains separate.',
};
if (!betweenLegs?.playerId)
  throw Error('Unexpected collider opening; reassess the blocked fixture');
if (s.score.home !== initial.score.home || s.score.away !== initial.score.away)
  throw Error('Incidental scoring path changed; reassess limitation');
if (process.argv.includes('--check')) {
  const saved = JSON.parse(readFileSync('docs/performance/pr193/geometry-limits-v1.json'));
  if (
    hash({
      ...result,
      source: saved.source,
      sourceHash: saved.sourceHash,
      sourceArchive: saved.sourceArchive,
    }) !== hash(saved)
  )
    throw Error('Geometry limitation replay drift');
} else writeReceipt('docs/performance/pr193/geometry-limits-v1.json', result);
console.log('PR193 blocked geometry and non-shot scoring fixtures reproduced');
