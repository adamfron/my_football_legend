import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCombinationFixture } from './pr174Fixtures';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
const roots = [resolve('.'), resolve('../stage-H4')];
const rows = [];
for (const [i, root] of roots.entries()) {
  const { resolveMatchAction } = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchActions.ts')).href
  )) as typeof import('../src/core/matchSimulation/matchActions');
  for (const injured of [false, true]) {
    const f = createCombinationFixture({ scenario: 'winger' });
    const teammates = f.state.players.filter(
      (p) => p.team === 'home' && ![f.a, f.b].includes(p.id) && p.slot.position !== 'goalkeeper',
    );
    for (const [index, p] of teammates.entries()) {
      if (index < 2) {
        p.position = { x: 40 + index * 4, y: 40 };
        if (injured)
          p.injury = {
            id: 'cover',
            playerId: p.id,
            at: 20,
            status: 'unable',
            mechanism: 'contact',
            injuryType: 'impact',
            recoveryDays: 1,
            assessmentRequired: false,
          };
      } else p.position = { x: 85, y: 35 + index * 3 };
    }
    const initialHash = pr172Hash(f.state);
    const next = resolveMatchAction(f.state, f.action);
    if ((!injured || i === 0) !== Boolean(next.combinationIntent))
      throw new Error('Unexpected cover probe result');
    rows.push({
      stage: i ? 'K' : 'H3',
      sourceHash: pr172SourceHash(root),
      injured,
      initialHash,
      finalHash: pr172Hash(next),
      intention: next.combinationIntent ?? null,
      ballHash: pr172Hash(next.ball),
      passHash: pr172Hash(next.lastPassDiagnostic),
    });
  }
}
for (const injured of [false, true]) {
  const pair = rows.filter((r) => r.injured === injured);
  if (
    pair[0]!.initialHash !== pair[1]!.initialHash ||
    pair[0]!.ballHash !== pair[1]!.ballHash ||
    pair[0]!.passHash !== pair[1]!.passHash
  )
    throw new Error('Opening physics changed');
}
writeFileSync(
  'docs/performance/PR174-cover-availability.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'Identical full legal 22-player states, two unavailable covering teammates; all other supporting outfield teammates ahead of passer. Ordinary actual opening release. Healthy counterpart retained. Cover count only changes; ball/pass physics identical.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
