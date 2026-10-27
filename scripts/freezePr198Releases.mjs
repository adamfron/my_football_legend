import console from 'node:console';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import {
  sampleCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { families, familyFixture } from './pr198Fixtures.mjs';
import { BASE, hash, read, finish, sourceIdentity } from './pr198Evidence.mjs';
const rows = [],
  rejected = [],
  historical = read('docs/performance/pr197/families-v5.json.gz');
for (const family of families)
  for (const skill of [20, 40, 60, 80, 100])
    for (const sample of [0, 1, 2, 3]) {
      const f = familyFixture(family, skill, sample),
        initial = f.state;
      const saved = historical.result.rows.find(
        (r) =>
          r.model === 'baseline' && r.family === family && r.skill === skill && r.sample === sample,
      );
      if (!saved || saved.inputHash !== hash(initial)) throw Error('PR197 exact input drift');
      const released = resolveMatchAction(
        globalThis.structuredClone(initial),
        globalThis.structuredClone(f.action),
        'autonomous_npc',
      );
      const pass = released.lastPassDiagnostic;
      if (pass?.passId === initial.lastPassDiagnostic?.passId || !pass) {
        rejected.push({ family, skill, sample, inputHash: hash(initial), action: f.action });
        continue;
      }
      if (hash(released.ball) !== saved.launchHash) throw Error('PR197 actual release drift');
      const actor = initial.players.find((p) => p.id === f.actorId);
      const contract = outcomeContractSchema.parse({
        version: 'original-delivery-v3',
        actorId: f.actorId,
        receiverId: f.receiverId,
        teamIds: initial.players.filter((p) => p.team === actor.team).map((p) => p.id),
        opponentIds: initial.players.filter((p) => p.team !== actor.team).map((p) => p.id),
        requestedAt: initial.time,
        horizonAt: initial.time + 8,
        releasedAt: pass.releasedAt,
        passId: pass.passId,
        shotId: null,
        previousShotId: initial.ball.shot?.shotId ?? initial.lastShot?.shotId ?? null,
        information: 'privileged_engineering_observer',
        conditionalOnRelease: true,
      });
      rows.push({
        family,
        skill,
        sample,
        seed: initial.seed,
        action: f.action,
        inputHash: hash(initial),
        originalPR197Source: historical.result.source,
        releaseHash: hash(released),
        ballHash: hash(released.ball),
        receiverHash: hash(released.players.find((p) => p.id === f.receiverId)),
        contract,
        releaseSample: sampleCanonicalOutcome(initial, released, 'original-delivery-v3'),
        state: released,
      });
    }
if (rows.length !== 180 || rejected.length !== 40) throw Error('Release denominator drift');
finish('docs/performance/pr198/releases-v1.json.gz', {
  schema: 'pr198-frozen-releases-v1',
  base: BASE,
  source: sourceIdentity(),
  method:
    'Exact PR197 baseline inputs and actual launched balls; all subsequent branches begin AFTER release. No branch can repair launch error or relaunch the original ball.',
  rows,
  rejected,
});
console.log('PR198 identical actual releases frozen', rows.length, 'rejected', rejected.length);
