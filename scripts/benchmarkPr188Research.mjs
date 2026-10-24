/* global structuredClone */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createRelativeTrial } from '../src/core/matchSimulation/relativeDecisionLab.ts';
import { runFootballSkillTrial } from '../src/core/matchSimulation/footballPerformanceLab.ts';
import { createFootballDrillCatalog } from '../src/core/matchSimulation/footballLabCatalog.ts';
import {
  runJumpTrial,
  runPhysicalContest,
  runFeintTrial,
} from '../src/core/matchSimulation/extendedPhysicalLab.ts';
import { observeBoundedScene } from '../src/core/matchSimulation/boundedPerception.ts';
import {
  constructBoundedCandidates,
  runBoundedPolicy,
} from '../src/core/matchSimulation/boundedDecision.ts';
import {
  psychologicalContext,
  updateOpponentKnowledge,
} from '../src/core/matchSimulation/opponentKnowledge.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { applyRestartScenario } from '../src/core/matchSimulation/restartScenarios.ts';
import { deriveDefensiveWall } from '../src/core/matchSimulation/restartGeometry.ts';
import { enumerateContextualRestartActions } from '../src/core/matchSimulation/restartOptions.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';

const version = process.argv.find((a) => a.startsWith('--version='))?.split('=')[1] ?? 'v1';
if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const out = `docs/performance/PR188-research-${version}.json`;
if (existsSync(out)) throw Error('Preserve archived runs');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const source = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const started = performance.now(),
  cpu = process.cpuUsage(),
  physical = [],
  psychology = [],
  learning = [],
  walls = [];
const fixture = (skill, opposition = skill) =>
  createRelativeTrial({
    skill,
    opposition,
    situation: 'arrived',
    policy: 'contextual-judgment-v1',
    seed: 'pr188-controlled-paired',
  });
const drills = createFootballDrillCatalog()
  .filter((c) => ['pass', 'receive', 'turn', 'slalom'].includes(c.drill))
  .filter((c, i, a) => a.findIndex((r) => r.drill === c.drill) === i);
for (const skill of [40, 80])
  for (const seed of ['pr188-physical-1', 'pr188-physical-2', 'pr188-physical-3']) {
    const f = fixture(skill),
      profile = f.state.players.find((p) => p.id === f.actorId).profile;
    for (const drill of drills)
      physical.push({
        family: 'A',
        kind: drill.drill,
        skill,
        seed,
        result: runFootballSkillTrial(drill, profile, seed),
      });
    for (const ballHeight of [1.8, 2.3])
      physical.push({
        family: 'A',
        kind: 'timed_header',
        skill,
        seed,
        result: runJumpTrial({ ballHeight }, profile, seed),
      });
    for (const defender of ['commit', 'delay', 'cover'])
      physical.push({
        family: 'A',
        kind: 'reactive_dribble',
        skill,
        seed,
        result: runFeintTrial({ defender }, profile, seed),
      });
  }
for (const [skill, opposition] of [
  [40, 40],
  [80, 80],
  [40, 80],
  [80, 40],
])
  for (const exposed of [false, true]) {
    const f = fixture(skill, opposition);
    f.state.seed = `pr188-contest-${exposed}`;
    const d = f.state.players.find((p) => p.id === f.defenderIds[1]),
      a = f.state.players.find((p) => p.id === f.actorId);
    d.position = { x: exposed ? f.state.ball.x + 0.55 : a.position.x - 0.6, y: f.state.ball.y };
    d.facingAngle = -Math.PI / 2;
    physical.push({
      family: 'B',
      kind: 'prescribed_standing_contact_not_autonomous_choice',
      skill,
      opposition,
      exposed,
      result: runPhysicalContest(f.state, d.id, a.id, 'standing'),
    });
  }
const contexts = [
  ['neutral', 600, 0, 0, 0],
  ['favourite_ahead', 3600, 2, 0.6, 0],
  ['favourite_trailing', 3600, -1, 0.6, 0],
  ['underdog_ahead', 3600, 1, -0.6, 0],
  ['late_chasing', 5100, -1, 0.6, 0],
  ['late_protecting', 5100, 1, -0.6, 0],
  ['recent_failures', 3600, 0, 0.6, -0.6],
  ['positive_evidence', 3600, 0, -0.6, 0.6],
];
for (const [label, at, score, advantage, form] of contexts)
  for (const mentality of [35, 75])
    for (const enabled of [false, true]) {
      const f = fixture(60),
        s = f.state,
        a = s.players.find((p) => p.id === f.actorId);
      a.profile.attributes.composure = mentality;
      a.profile.attributes.determination = 100 - mentality / 2;
      s.time = at;
      s.status = at > 2700 ? 'second_half' : 'first_half';
      s.score = { home: Math.max(0, score), away: Math.max(0, -score) };
      s.ballOwnershipStartedAt = at - 2;
      s.onBallPreparation.gainedAt = at - 2;
      s.onBallPreparation.readyAt = at - 1;
      s.boundedExperiment.psychology = enabled;
      s.boundedExperiment.expectedAdvantage = advantage;
      const scene = observeBoundedScene(s, a);
      scene.ownForm = form;
      const candidates = constructBoundedCandidates(scene),
        decision = runBoundedPolicy('contextual-judgment-v1', { scene, candidates });
      let next = structuredClone(s);
      next.boundedRuntime = {
        ...next.boundedRuntime,
        selfEvidence: { [a.id]: { value: form, lastEvent: 'apparatus-controlled-evidence' } },
      };
      // Complete defaulted runtime through its save schema at the apparatus boundary.
      const { boundedRuntimeSchema } = await import(
        '../src/core/matchSimulation/boundedIntelligenceState.ts'
      );
      next.boundedRuntime = boundedRuntimeSchema.parse(next.boundedRuntime);
      const attempts = [];
      withBoundedObserver(
        (t) => {
          if (t.stage === 'attempt' && t.actorId === a.id) attempts.push(t);
        },
        () => {
          for (let i = 0; i < 80; i++) next = stepTacticalMatchAfterDecisionProbe(next, 0.025);
        },
      );
      psychology.push({
        family: 'D',
        label,
        mentality,
        enabled,
        scene,
        context: psychologicalContext(scene),
        decision,
        candidates,
        attempts,
        physical: {
          owner: next.ball.ownerId ?? null,
          lastPass: next.lastPassDiagnostic ?? null,
          lastChallenge: next.lastChallenge ?? null,
        },
        technicalAttributesUnchanged:
          sha(a.profile.attributes) ===
          sha(next.players.find((p) => p.id === a.id)?.profile.attributes ?? a.profile.attributes),
      });
    }
for (const misleading of [false, true]) {
  const f = fixture(60),
    a = f.state.players.find((p) => p.id === f.actorId),
    s = observeBoundedScene(f.state, a),
    foe = s.visible.find((p) => p.team !== s.team);
  s.visible = [foe];
  const samples = [];
  for (let i = 0; i < 8; i++) {
    s.at = 10 + i * 2;
    foe.velocity = i % 2 === 0 ? { x: misleading && i === 0 ? 8 : 3, y: 0 } : { x: 0, y: 0 };
    s.opponents = updateOpponentKnowledge(s);
    samples.push({ at: s.at, memory: structuredClone(s.opponents) });
  }
  learning.push({
    misleading,
    samples,
    limitation: 'episodic visible motion; not every tick, no exact hidden ability inference',
  });
}
for (const size of [2, 3, 4])
  for (const profile of ['under_wall', 'controlled_curl', 'wall_gap']) {
    let s = applyRestartScenario(fixture(60).state, 'free_kick_close', {
      restartTeam: 'home',
      ceremonial: true,
    });
    const wall = s.players.filter((p) => s.restart.roles[p.id]?.key === 'wall'),
      points = deriveDefensiveWall(s.ball, { x: 105, y: 34 }, size);
    wall.forEach((p, i) => {
      if (i < size) {
        p.position = { ...points[i] };
        p.target = { ...points[i] };
        s.restart.targets[p.id] = { ...points[i] };
      } else {
        p.position = { x: 85, y: 5 + i };
        p.target = { ...p.position };
        s.restart.targets[p.id] = { ...p.position };
        s.restart.roles[p.id] = { ...s.restart.roles[p.id], key: 'protect_zone' };
      }
    });
    const action = enumerateContextualRestartActions(s).find(
        (a) => a.type === 'shot' && a.freeKickProfile === profile,
      ),
      input = structuredClone(s),
      actual = [];
    if (action) {
      s = resolveMatchAction(s, action, 'dev_ai_selected');
      for (let i = 0; i < 200; i++) {
        s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
        if (i % 10 === 0)
          actual.push({
            at: s.time,
            ball: { ...s.ball },
            wall: s.players
              .filter((p) => input.restart.roles[p.id]?.key === 'wall')
              .map((p) => ({
                id: p.id,
                position: p.position,
                response: p.restartWallResponse ?? null,
              })),
          });
      }
    }
    walls.push({
      size,
      profile,
      offered: !!action,
      input,
      action: action ?? null,
      spacing: points.slice(1).map((p, i) => distance(p, points[i])),
      trajectory: actual,
      lastShot: s.lastShot ?? s.ball.shot ?? null,
      score: s.score,
    });
  }
const payload = {
  schemaVersion: 1,
  classification: 'controlled development; no independent validation or empirical calibration',
  version,
  source,
  sourceSha256: sha(source),
  runnerSha256: sha(
    readFileSync('scripts/benchmarkPr188Research.mjs', 'utf8').replaceAll('\r\n', '\n'),
  ),
  physical,
  psychology,
  learning,
  walls,
};
const bytes = gzipSync(JSON.stringify(payload));
writeFileSync(`docs/performance/PR188-research-traces-${version}.json.gz`, bytes);
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 1,
      version,
      sourceSha256: payload.sourceSha256,
      runnerSha256: payload.runnerSha256,
      archive: `docs/performance/PR188-research-traces-${version}.json.gz`,
      archiveSha256: sha(bytes),
      payloadSha256: sha(payload),
      counts: {
        physical: physical.length,
        psychology: psychology.length,
        learning: learning.length,
        walls: walls.length,
      },
      psychology: psychology.map(({ scene, candidates, attempts, ...r }) => ({
        ...r,
        attempts: attempts.length,
        releases: attempts.filter((a) => a.released).length,
        attributesSha256: sha(scene.attributes),
        beliefsSha256: sha(scene.opponents),
        candidateCount: candidates.length,
      })),
      walls: walls.map(
        ({ input, trajectory, ...r }) => (
          void input,
          {
            ...r,
            trajectorySamples: trajectory.length,
          }
        ),
      ),
      performance: {
        wallMs: performance.now() - started,
        cpu: process.cpuUsage(cpu),
        rss: process.memoryUsage().rss,
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    out,
    physical: physical.length,
    psychology: psychology.length,
    learning: learning.length,
    walls: walls.length,
  }),
);
