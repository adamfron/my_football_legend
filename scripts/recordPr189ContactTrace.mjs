import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const engineRoot = args.get('engine-root') ?? '.',
  name = args.get('name') ?? 'current';
const output = `docs/performance/pr189/contact-windows-${name}.json.gz`;
if (existsSync(output)) throw Error('Preserve contact trace');
const engine = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchSimulation.ts'))
);
const intelligence = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/boundedIntelligence.ts'))
);
const geometry = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/ballContactGeometry.ts'))
);
const preparation = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/onBallPreparation.ts'))
);
let state = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr189/baseline-20s.json.gz')),
).state;
const rows = [],
  events = [];
intelligence.withBoundedObserver(
  (t) => {
    if (t.actorId === 'geometry:anchor:5') events.push(t);
  },
  () => {
    for (let i = 0; i < 60; i++) {
      const actor = state.players.find((p) => p.id === 'geometry:anchor:5');
      const b = intelligence.inspectBoundedAction(state, actor),
        feet = geometry.playerContactGeometry(actor);
      rows.push({
        at: state.time,
        owner: state.ball.ownerId,
        observedContactReady: b.scene.contactReady,
        inspectedCandidate: b.decision.selectedCandidateId,
        preparationCandidate: b.decision.preparationCandidateId,
        preparationMargin: b.action
          ? preparation.preparationMarginForAction(state, actor, b.action)
          : null,
        nearestFootMetres: Math.min(
          Math.hypot(feet.leftFoot.x - state.ball.x, feet.leftFoot.y - state.ball.y),
          Math.hypot(feet.rightFoot.x - state.ball.x, feet.rightFoot.y - state.ball.y),
        ),
        lastGroundContactAt: state.lastGroundContact?.at,
        surfaceRecovery: state.lastGroundContact?.surfaceContact?.recoverySeconds,
        lastPolicyDecisionAt: state.boundedRuntime?.lastDecisionAt,
        passId: state.lastPassDiagnostic?.passId,
        velocity: state.ball.velocity,
      });
      state = engine.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    }
  },
);
const result = {
  schemaVersion: 1,
  name,
  classification:
    'pure intermediate inspections do not request or execute actions; events contain actual scheduler decisions/attempts',
  rows,
  events,
  finalStateSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
};
writeFileSync(output, gzipSync(JSON.stringify(result)));
console.log(
  JSON.stringify({
    output,
    actualAttempts: events.filter((t) => t.stage === 'attempt').length,
    decisions: events
      .filter((t) => t.stage === 'decision')
      .map((t) => ({
        at: t.at,
        selected: t.decision.selectedCandidateId,
        preparing: t.decision.preparationCandidateId,
      })),
  }),
);
