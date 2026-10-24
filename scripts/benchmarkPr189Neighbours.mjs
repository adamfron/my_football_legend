import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { createRelativeTrial } from '../src/core/matchSimulation/relativeDecisionLab.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
const suffix = process.argv.includes('--canonical')
  ? '-canonical'
  : process.argv.includes('--final')
    ? '-final'
    : '';
const output = `docs/performance/pr189/neighbours${suffix}.json`;
if (existsSync(output)) throw Error('Preserve neighbour evidence');
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rows = [];
for (const [skill, opposition] of [
  [40, 40],
  [80, 80],
  [40, 80],
  [80, 40],
])
  for (const reversed of [false, true])
    for (const policy of [
      'opportunity-driven-v1',
      'hierarchical-intent-v1',
      'contextual-judgment-v1',
    ])
      for (const situation of ['safe', 'arrived', 'outlet', 'blocked']) {
        const config = {
          skill,
          opposition,
          reversed,
          policy,
          situation,
          seed: `pr189-neighbour-${skill}-${opposition}-${situation}`,
        };
        const f = createRelativeTrial(config),
          initial = f.state;
        const run = (observed) => {
          let state = JSON.parse(JSON.stringify(initial)),
            stationary = 0,
            maxStationary = 0,
            firstRelease = null;
          const events = createHash('sha256');
          let releases = 0,
            preparations = 0;
          state = withBoundedObserver(
            observed
              ? (t) => {
                  events.update(JSON.stringify(t));
                  if (t.stage === 'attempt' && t.released) {
                    releases++;
                    firstRelease ??= t.at - initial.time;
                  }
                  if (t.stage === 'decision' && t.decision.preparationCandidateId) preparations++;
                }
              : undefined,
            () => {
              for (let i = 0; i < 240; i++) {
                const previous = state;
                state = step(state, 0.025);
                const actor = state.players.find((p) => p.id === state.ball.ownerId);
                const previousActor = actor
                  ? previous.players.find((p) => p.id === actor.id)
                  : undefined;
                stationary =
                  actor &&
                  previousActor &&
                  state.ball.ownerId === previous.ball.ownerId &&
                  Math.hypot(
                    actor.position.x - previousActor.position.x,
                    actor.position.y - previousActor.position.y,
                  ) /
                    0.025 <
                    0.35
                    ? stationary + 0.025
                    : 0;
                maxStationary = Math.max(maxStationary, stationary);
              }
              return state;
            },
          );
          return {
            stateSha256: sha(state),
            eventsSha256: events.digest('hex'),
            maxStationary,
            releases,
            preparations,
            firstRelease,
            ownerAfter: state.ball.ownerId,
            status: state.status,
          };
        };
        const observed = run(true),
          bare = run(false);
        rows.push({
          config,
          ...observed,
          observerNeutral: observed.stateSha256 === bare.stateSha256,
        });
      }
writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      classification:
        '96 reconstructed six-second development neighbours; four skill pairings, both directions, three policies; not independent validation',
      runnerSha256: sha(
        readFileSync('scripts/benchmarkPr189Neighbours.mjs', 'utf8').replaceAll('\r\n', '\n'),
      ),
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    rows: rows.length,
    neutral: rows.every((r) => r.observerNeutral),
    maxStationary: Math.max(...rows.map((r) => r.maxStationary)),
    withoutRelease: rows.filter((r) => r.releases === 0).length,
  }),
);
if (rows.some((r) => !r.observerNeutral)) process.exitCode = 1;
