import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCombinationFixture } from './pr174Fixtures';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

const frozen = process.argv.find((a) => a.startsWith('--before-root='))?.split('=')[1];
if (!frozen) throw new Error('Pass --before-root=<frozen pre-review PR174 tree>');
const roots = [resolve(frozen), resolve('.')];
const rows = [];
for (const [engine, root] of roots.entries()) {
  const { resolveMatchAction } = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchActions.ts')).href
  )) as typeof import('../src/core/matchSimulation/matchActions');
  for (const scenario of ['overlap', 'underlap'] as const)
    for (const mirrored of [false, true])
      for (const availability of ['two', 'one', 'injured', 'sent_off'] as const) {
        const f = createCombinationFixture({ scenario, variant: 'timed_run', mirrored });
        const mates = f.state.players.filter(
          (p) =>
            p.team === 'home' &&
            ![f.a, f.b, f.c].includes(p.id) &&
            p.slot.position !== 'goalkeeper',
        );
        for (const [i, p] of mates.entries()) {
          const point = i < 2 ? { x: 40 + i * 4, y: 40 } : { x: 85, y: 35 + i * 3 };
          p.position = mirrored ? { x: 105 - point.x, y: 68 - point.y } : point;
          if (i >= 2 || availability === 'two' || (availability === 'one' && i === 0)) continue;
          if (availability === 'sent_off')
            f.state.discipline = {
              ...f.state.discipline,
              [p.id]: { yellowCards: 0, sentOff: true, team: p.team },
            };
          else
            p.injury = {
              id: 'review-cover',
              playerId: p.id,
              at: 20,
              status: 'unable',
              mechanism: 'contact',
              injuryType: 'impact',
              recoveryDays: 1,
              assessmentRequired: false,
            };
        }
        const initialHash = pr172Hash(f.state);
        const next: TacticalMatchState = resolveMatchAction(f.state, f.action);
        const expected = engine === 0 || availability === 'two';
        if (Boolean(next.combinationIntent) !== expected)
          throw new Error(
            `Unexpected intention: ${engine}/${scenario}/${mirrored}/${availability}`,
          );
        rows.push({
          engine: engine ? 'review-fix' : 'K-before-review',
          sourceHash: pr172SourceHash(root),
          scenario,
          mirrored,
          availability,
          initialHash,
          finalHash: pr172Hash(next),
          ballHash: pr172Hash(next.ball),
          passHash: pr172Hash(next.lastPassDiagnostic),
          intention: next.combinationIntent ?? null,
        });
      }
}
for (const row of rows.filter((r) => r.engine === 'review-fix')) {
  const before = rows.find(
    (r) =>
      r.engine === 'K-before-review' &&
      r.scenario === row.scenario &&
      r.mirrored === row.mirrored &&
      r.availability === row.availability,
  )!;
  if (
    before.initialHash !== row.initialHash ||
    before.ballHash !== row.ballHash ||
    before.passHash !== row.passHash ||
    (row.availability === 'two' && before.finalHash !== row.finalHash)
  )
    throw new Error('Paired opening physics or healthy continuation changed');
}
writeFileSync(
  'docs/performance/PR174-review-cover.json',
  JSON.stringify(
    {
      version: 1,
      method:
        '16 paired full-state actual pass releases: overlap/underlap, both orientations, two/one/no physically available covering defenders. Frozen K versus review fix. No contact or subsequent match result prescribed. Healthy two-cover whole states equal; all paired initial states, released ball and pass diagnostics equal. This receipt does not repeat the full-match cohort or estimate outcome frequency.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
