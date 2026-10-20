import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import process from 'node:process';
import { createReformFixture } from './pr177Fixtures.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  assignTacticalRoles,
  changeTacticalRole,
  tacticalRoleFor,
  roleSuitability,
} from '../src/core/matchSimulation/tacticalRoles.ts';
import {
  roleMovementTarget,
  deriveTacticalRolePhase,
  forecastWaiting,
} from '../src/core/matchSimulation/roleTactics.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import { deriveMovementCapability } from '../src/core/matchSimulation/locomotion.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import { RoleExperimentRecorder } from '../src/core/matchSimulation/roleExperiment.ts';
import { pr172Hash as sha, pr172SourceHash } from './pr172Evidence.ts';

const policies = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
];
const specs = [
  [
    'fullback',
    ['defensive_fullback', 'attacking_fullback', 'inverted_fullback'],
    ['overlap', 'no-cover'],
  ],
  [
    'winger',
    ['traditional_winger', 'inside_forward', 'wide_playmaker'],
    ['low-block', 'high-line', 'slow-fullback', 'fast-fullback', 'overlap'],
  ],
  ['striker', ['target_forward', 'false_nine', 'advanced_forward'], ['high-line', 'low-block']],
  [
    'midfielder',
    ['deep_playmaker', 'box_to_box', 'controlling_midfielder', 'creative_ten'],
    ['build-up', 'transition'],
  ],
];
const rows = [],
  started = performance.now();
for (const [family, roles, setups] of specs)
  for (const setup of setups)
    for (const role of roles)
      for (const capability of family === 'winger' ? ['fast', 'technical'] : ['native']) {
        const f = createReformFixture(
          setup === 'transition'
            ? 'corner-counter'
            : setup === 'high-line'
              ? 'high-line-through'
              : 'stationary-winger',
        );
        const { state, actor, runner, opponents } = f;
        const subject =
          family === 'winger'
            ? runner
            : state.players.find(
                (p) =>
                  p.team === actor.team &&
                  (family === 'fullback'
                    ? p.slot.position === 'left_back'
                    : family === 'striker'
                      ? p.slot.position === 'striker'
                      : p.slot.position === 'central_midfielder' && p.slot.duty === 'attack'),
              );
        if (!subject) throw new Error(`Missing ${family}`);
        if (setup === 'low-block')
          opponents.forEach((p, i) => {
            p.position = { x: 80 + (i % 2) * 7, y: 7 + (i % 9) * 6 };
            p.target = { ...p.position };
          });
        if (setup === 'slow-fullback' || setup === 'fast-fullback')
          opponents
            .filter((p) => p.slot.position.includes('back'))
            .forEach((p) => {
              p.profile.attributes.pace = setup === 'slow-fullback' ? 28 : 95;
            });
        if (setup === 'overlap') {
          subject.position = { x: 56, y: 12 };
          subject.target = { ...subject.position };
        }
        if (setup === 'no-cover')
          state.players
            .filter(
              (p) =>
                p.team === actor.team &&
                p.id !== actor.id &&
                p.id !== subject.id &&
                p.slot.position !== 'goalkeeper',
            )
            .forEach((p) => {
              p.position.x = 80;
            });
        if (capability !== 'native')
          Object.assign(subject.profile.attributes, {
            pace: capability === 'fast' ? 95 : 30,
            agility: capability === 'fast' ? 90 : 45,
            passing: capability === 'technical' ? 95 : 50,
            technique: capability === 'technical' ? 95 : 50,
          });
        for (const policy of policies) {
          let s = globalThis.structuredClone(state);
          s.decisionPolicy = policy;
          s.rolePlan = assignTacticalRoles(s);
          s = changeTacticalRole(s, subject.id, role);
          const input = globalThis.structuredClone(s),
            athlete = s.players.find((p) => p.id === subject.id),
            owner = s.players.find((p) => p.id === s.ball.ownerId);
          const ranking = rankAvailableActionsForAI(s, owner.id);
          const record = {
            family,
            setup,
            role,
            capability,
            policy,
            inputHash: sha(input),
            subjectId: subject.id,
            phase: deriveTacticalRolePhase(s, subject.team),
            movementTarget: roleMovementTarget(s, athlete, athlete.target),
            movementCapability: deriveMovementCapability(athlete),
            suitability: roleSuitability(athlete, tacticalRoleFor(s, athlete)),
            candidates: ranking.map((r) => ({
              action: r.action,
              value: r.canonicalScore,
              reason: evaluateStateValueAction(s, owner, r.action)?.reasons,
            })),
            selected: ranking[0]?.action,
            continuation: [],
          };
          const observer = new RoleExperimentRecorder(s);
          let tick = 0;
          for (const seconds of [2, 5, 8]) {
            while (tick < seconds * 40) {
              const previous = s;
              s = withRankingObserver(observer.ranking, () =>
                stepTacticalMatchAfterDecisionProbe(s, 0.025),
              );
              observer.observe(previous, s);
              tick++;
            }
            const player = s.players.find((p) => p.id === subject.id);
            record.continuation.push({
              seconds,
              hash: sha(s),
              position: player?.position,
              target: player?.target,
              velocity: player?.velocity,
              owner: s.ball.ownerId,
              ball: s.ball,
              score: s.score,
              pass: s.lastPassDiagnostic,
              shot: s.lastShot,
              combination: s.lastCombination,
              role: player ? tacticalRoleFor(s, player).id : null,
              summary: s.statistics?.players.filter((p) => p.playerId === subject.id),
              events: observer.trace.filter(
                (e) => !['ranking_sample', 'selected_action'].includes(e.kind),
              ),
            });
          }
          // Compare the complete end state with an unobserved continuation from precisely the input.
          let plain = input;
          for (let i = 0; i < 320; i++) plain = stepTacticalMatchAfterDecisionProbe(plain, 0.025);
          if (sha(plain) !== sha(s))
            throw new Error(`Observer changed trajectory ${family}/${role}/${policy}`);
          record.observerEquality = true;
          rows.push(record);
        }
      }
const manifest = {
  version: 1,
  sourceHash: pr172SourceHash(),
  runtime: process.version,
  scenarios: rows.length,
  wallSeconds: (performance.now() - started) / 1000,
  design:
    'Prescribed 22-player states, role/capability/opposition counterfactuals; 2/5/8-second canonical continuations, paired within each cell. These are dependent mechanism probes, not population rates.',
};
writeFileSync(
  'docs/performance/pr179-evidence/controlled.json.gz',
  gzipSync(JSON.stringify({ manifest, rows })),
);
writeFileSync(
  'docs/performance/PR179-controlled-summary.json',
  JSON.stringify(
    {
      manifest,
      rows: rows.map(({ candidates, continuation, ...r }) => ({
        ...r,
        candidates: candidates.length,
        spatialPasses: candidates.filter((c) => c.action.requestedSpace).length,
        checkpoints: continuation.map((c) => ({
          seconds: c.seconds,
          position: c.position,
          velocity: c.velocity,
          hash: c.hash,
        })),
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(manifest));

// Reproduce the worst inherited PR178 hold: same frozen fixture and canonical B prefix.
const original = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr178-evidence/initial-states.json.gz')),
).find((f) => f.design.id === 'pr178-val-high-line');
let frozen = globalThis.structuredClone(original.state);
frozen.decisionPolicy = 'state-value-v1';
while (frozen.time < 120) frozen = stepTacticalMatchAfterDecisionProbe(frozen, 0.025);
writeFileSync(
  'docs/performance/pr179-evidence/pr178-worst-hold-input.json.gz',
  gzipSync(
    JSON.stringify({
      sourceFixture: original.design,
      sourceInputHash: original.inputHash,
      capturedAt: frozen.time,
      hash: sha(frozen),
      state: frozen,
    }),
  ),
);
const holds = [];
for (const policy of policies) {
  let s = globalThis.structuredClone(frozen);
  s.decisionPolicy = policy;
  s.rolePlan = assignTacticalRoles(s);
  const recorder = new RoleExperimentRecorder(s),
    owner = s.players.find((p) => p.id === s.ball.ownerId),
    ranking = rankAvailableActionsForAI(s, owner.id);
  for (let i = 0; i < 4800; i++) {
    const previous = s;
    s = withRankingObserver(recorder.ranking, () => stepTacticalMatchAfterDecisionProbe(s, 0.025));
    recorder.observe(previous, s);
  }
  holds.push({
    policy,
    initialRanking: ranking,
    forecast: forecastWaiting(frozen, owner).diagnostic,
    report: recorder.export(original.session, s, pr172SourceHash(), process.version),
    finalHash: sha(s),
  });
}
writeFileSync(
  'docs/performance/pr179-evidence/hold-replays.json.gz',
  gzipSync(JSON.stringify({ sourceHash: pr172SourceHash(), inputHash: sha(frozen), holds })),
);
console.log('completed inherited hold replays');
