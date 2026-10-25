import { writeFileSync, existsSync } from 'node:fs';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const root = args.get('baseline-root');
if (!root) throw Error('--baseline-root must be an archived PR191 checkout');
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { createCanonicalWorldDatabase } = await load('scripts/createCanonicalWorldDatabase.ts');
const { createFirstTouchLabCatalog } = await load(
  'src/core/matchSimulation/firstTouchLabCatalog.ts',
);
const { runFirstTouchLab } = await load('src/core/matchSimulation/firstTouchLaboratory.ts');
const { runFirstTouchLab: current } = await import(
  '../src/core/matchSimulation/firstTouchLaboratory.ts'
);
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const players = Object.values(createCanonicalWorldDatabase().footballers)
  .map((p) => p.profile)
  .filter((p) => p.firstName === 'Adam' && p.lastName === 'Krawczyk');
const catalog = createFirstTouchLabCatalog();
const target = {
  direction_45: { x: 3.185, y: 2.468, separation: 2.975, contacts: 3 },
  direction_90: { x: 0.837, y: 3.959, separation: 3.417, contacts: 2 },
};
const candidates = players
  .map((player) => {
    const rows = ['direction_45', 'direction_90'].map((id) =>
      runFirstTouchLab(
        catalog.find((c) => c.id === id),
        player,
        'pr191-inspection',
      ),
    );
    const error = rows.reduce((n, r) => {
      const t = target[r.input.config.id],
        v = r.contacts[0]?.outgoingVelocity;
      return (
        n +
        (v ? Math.abs(v.x - t.x) + Math.abs(v.y - t.y) : 100) +
        Math.abs(r.metrics.finalSeparation - t.separation) +
        Math.abs(r.metrics.actorContacts - t.contacts)
      );
    }, 0);
    return { player, rows, error };
  })
  .sort((a, b) => a.error - b.error || a.player.id.localeCompare(b.player.id));
console.log(
  candidates.map((c) => ({
    id: c.player.id,
    error: c.error,
    metrics: c.rows.map((r) => ({
      id: r.input.config.id,
      sep: r.metrics.finalSeparation,
      v: r.contacts[0]?.outgoingVelocity,
      contacts: r.metrics.actorContacts,
    })),
  })),
);
const selected = candidates[0];
const rows = [
  'direction_45',
  'direction_90',
  'lifted_thigh',
  'descending_chest',
  'descending_thigh',
  'flat_aerial',
].map((id) => {
  const old = runFirstTouchLab(
    catalog.find((c) => c.id === id),
    selected.player,
    'pr191-inspection',
  );
  const repeat = runFirstTouchLab(
    old.input.config,
    selected.player,
    'pr191-inspection',
    (sample) => {
      sample.ball.x = 999;
    },
  );
  if (hash(old) !== hash(repeat)) throw Error('Frozen observer drift');
  const now = current(
    { ...old.input.config, movementModel: 'ball_oriented' },
    selected.player,
    'pr191-inspection',
  );
  const observed = current(
    { ...old.input.config, movementModel: 'ball_oriented' },
    selected.player,
    'pr191-inspection',
    (sample) => {
      sample.ball.x = 999;
      if (sample.movement) sample.movement.movementTarget.x = 999;
    },
  );
  if (hash(now) !== hash(observed)) throw Error('Current observer drift');
  return { id, oldHash: hash(old), currentHash: hash(now), old, current: now };
});
const result = {
  schema: 'mfl-pr192-reconstructed-human-v1',
  baseline: '9ea0e599f72800f4210092df2722e2ee16778ab7',
  provenance:
    'Reconstruction, NOT replay of unavailable browser exports. Candidate identity inferred from matching supplied rounded velocities, contact counts and separations across both trials; unedited canonical player card.',
  selectedId: selected.player.id,
  numericMatchToRoundedHumanEvidence: selected.error < 0.004,
  candidateErrors: candidates.map((c) => ({ id: c.player.id, error: c.error })),
  rows,
};
const out = 'docs/performance/pr192/reconstructed-human.json';
if (args.has('check')) {
  if (hash(readPr192Evidence(out)) !== hash(result)) throw Error('Human reconstruction drift');
} else {
  if (existsSync(out)) throw Error('Refusing overwrite');
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
}
console.log(
  JSON.stringify({
    selectedId: result.selectedId,
    match: result.numericMatchToRoundedHumanEvidence,
    rows: rows.map((r) => ({
      id: r.id,
      before: r.old.metrics.finalSeparation,
      after: r.current.metrics.finalSeparation,
      old: r.old.reason,
      now: r.current.reason,
    })),
  }),
);
