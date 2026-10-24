import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  withBoundedObserver,
  inspectBoundedAction,
} from '../src/core/matchSimulation/boundedIntelligence.ts';
import { releaseContactReadiness } from '../src/core/matchSimulation/decisionReadiness.ts';
import { usesBoundedIntelligence } from '../src/core/matchSimulation/boundedIntelligenceState.ts';
import { restorePathologicalState } from '../src/core/matchSimulation/pathologicalReplay.ts';
import {
  deriveRestartLegalReadiness,
  legalizeRestartPlayerTarget,
} from '../src/core/matchSimulation/restartLaws.ts';

const root = 'docs/performance/pr189';
const ownerOnly = process.argv.includes('--owner-only');
const suffix = ownerOnly ? '-owner' : process.argv.includes('--early') ? '-early' : '';
const output = `${root}/adversarial${suffix}.json`;
if (existsSync(output)) throw Error('Preserve adversarial evidence');
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const captures = readdirSync(root)
  .filter((p) => (p.includes('-pathology-') || p.endsWith('-cutoff.json.gz')) && p.endsWith('.gz'))
  .filter((p) => !ownerOnly || p.includes('-owner-120s'))
  .sort();
const rows = [],
  traces = [];
const run = (input, observed) => {
  let state = JSON.parse(JSON.stringify(input)),
    progress = null;
  let originalActorReleases = 0,
    bodyPathMetres = 0,
    furthestMetres = 0;
  const origin = input.players.find((p) => p.id === input.ball.ownerId)?.position;
  const events = createHash('sha256'),
    frames = [];
  state = withBoundedObserver(
    observed
      ? (t) => {
          events.update(JSON.stringify(t));
        }
      : undefined,
    () => {
      for (let i = 0; i < 800; i++) {
        const actor = state.players.find((p) => p.id === input.ball.ownerId);
        if (observed && actor && i % 40 === 0 && state.ball.ownerId === actor.id) {
          const b = usesBoundedIntelligence(state) ? inspectBoundedAction(state, actor) : null;
          frames.push({
            at: state.time,
            ...(i === 0 ? { inspection: b } : {}),
            foot: releaseContactReadiness(state, actor),
            selected: b?.decision.selectedCandidateId ?? null,
            preparing: b?.decision.preparationCandidateId ?? null,
            velocity: actor.velocity,
            ballVelocity: state.ball.velocity,
            lastContact: state.lastGroundContact?.at,
            lastDecisionAt: state.boundedRuntime?.lastDecisionAt,
          });
        }
        const before = state;
        state = step(state, 0.025);
        if (
          state.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId &&
          state.lastPassDiagnostic?.passerId === input.ball.ownerId
        )
          originalActorReleases++;
        if (before.ball.ownerId === input.ball.ownerId && origin) {
          const previousActor = before.players.find((p) => p.id === input.ball.ownerId);
          const currentActor = state.players.find((p) => p.id === input.ball.ownerId);
          if (previousActor && currentActor) {
            bodyPathMetres += Math.hypot(
              currentActor.position.x - previousActor.position.x,
              currentActor.position.y - previousActor.position.y,
            );
            furthestMetres = Math.max(
              furthestMetres,
              Math.hypot(currentActor.position.x - origin.x, currentActor.position.y - origin.y),
            );
          }
        }
        if (!progress) {
          const nextActor = state.players.find((p) => p.id === input.ball.ownerId);
          const released = state.lastPassDiagnostic?.passId !== input.lastPassDiagnostic?.passId;
          const previousActor = before.players.find((p) => p.id === input.ball.ownerId);
          const moving = Boolean(
            nextActor &&
              previousActor &&
              Math.hypot(
                nextActor.position.x - previousActor.position.x,
                nextActor.position.y - previousActor.position.y,
              ) /
                0.025 >
                0.35,
          );
          if (released || moving || state.ball.ownerId !== input.ball.ownerId)
            progress = {
              after: state.time - input.time,
              kind: released
                ? 'pass_release'
                : state.ball.ownerId !== input.ball.ownerId
                  ? 'ownership_change'
                  : 'body_movement',
              status: state.status,
              lastChallenge: state.lastChallenge,
            };
        }
        if (state === before) break;
      }
      return state;
    },
  );
  return {
    stateSha256: sha(state),
    eventsSha256: events.digest('hex'),
    progress,
    frames,
    status: state.status,
    originalActorReleases,
    bodyPathMetres,
    furthestMetres,
    sameOwnerAtEnd: state.ball.ownerId === input.ball.ownerId,
    ...(input.restart
      ? {
          restart: {
            initialAwardId: input.restart.awardId,
            finalAwardId: state.restart?.awardId,
            initialReadiness: deriveRestartLegalReadiness(input),
            finalReadiness: deriveRestartLegalReadiness(state),
            requiredEndAt: [input.timekeeping?.requiredEndAt, state.timekeeping?.requiredEndAt],
            opponents: input.players
              .filter((p) => p.team !== input.restart.restartTeam)
              .map((p) => ({
                id: p.id,
                sentOff: input.discipline?.[p.id]?.sentOff ?? false,
                distanceToSpot: Math.hypot(
                  p.position.x - input.restart.spot.x,
                  p.position.y - input.restart.spot.y,
                ),
                position: p.position,
                target: p.target,
                legalTarget: legalizeRestartPlayerTarget(input, p, p.target),
                finalPosition: state.players.find((next) => next.id === p.id)?.position,
              })),
          },
        }
      : {}),
  };
};
for (const path of captures) {
  const capture = JSON.parse(gunzipSync(readFileSync(`${root}/${path}`)));
  const initial = restorePathologicalState(capture),
    a = run(initial, true),
    b = run(initial, true),
    bare = run(initial, false);
  const deterministic =
    a.stateSha256 === b.stateSha256 &&
    a.stateSha256 === bare.stateSha256 &&
    a.eventsSha256 === b.eventsSha256;
  rows.push({
    path,
    capturedAt: initial.time,
    owner: initial.ball.ownerId,
    progress: a.progress,
    originalActorReleases: a.originalActorReleases,
    bodyPathMetres: a.bodyPathMetres,
    furthestMetres: a.furthestMetres,
    sameOwnerAtEnd: a.sameOwnerAtEnd,
    status: a.status,
    ...(a.restart ? { restart: a.restart } : {}),
    deterministic,
    stateHashes: [a.stateSha256, b.stateSha256, bare.stateSha256],
    eventHashes: [a.eventsSha256, b.eventsSha256],
  });
  traces.push({ path, frames: a.frames });
}
writeFileSync(`${root}/adversarial-traces${suffix}.json.gz`, gzipSync(JSON.stringify(traces)));
writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      classification:
        'new real development captures; 800-tick continuation and observer neutrality; no independent cohort',
      rows,
      runnerSha256: sha(
        readFileSync('scripts/benchmarkPr189Adversarial.mjs', 'utf8').replaceAll('\r\n', '\n'),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(rows));
if (rows.some((r) => !r.deterministic)) process.exitCode = 1;
