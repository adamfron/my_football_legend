import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const fromRoot = (p) => import(pathToFileURL(resolve(p)).href);
const { checkPr214Source, hash } = await fromRoot('scripts/pr214Evidence.mjs');
const { createPr213Scene, tracePr213 } = await fromRoot('scripts/pr213Scenarios.ts');
const { footballerProfileSchema } = await fromRoot('src/schemas/domainSchemas.ts');
const source = checkPr214Source();
const receipt = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr214/canonical-final-v3.json.gz')),
).result;
const row = receipt.rows.find((r) => r.name === 'pass-body-third');
const reference = tracePr213(
  createPr213Scene({
    name: 'pass-body-challenge',
    separation: 0.7,
    lateral: 0.5,
    defenderSpeed: -9,
  }).initial,
  8,
);
const canonical = (x) => JSON.parse(JSON.stringify(x));
assert.deepEqual(
  canonical(row.frames.at(-1).strike.contact),
  canonical(reference.state.lastStrikeResolution.contact),
);
const motorWork = new Map();
let repeatedWitnesses = 0;
for (const r of receipt.rows)
  for (const frame of r.frames)
    for (const c of frame.clusters) {
      for (const w of c.motorWork ?? []) {
        const expected =
          0.5 *
          w.mass *
          (w.actuatorVelocity.x ** 2 +
            w.actuatorVelocity.y ** 2 -
            w.beforeVelocity.x ** 2 -
            w.beforeVelocity.y ** 2);
        assert.ok(Math.abs(expected - w.kineticWork) < 1e-9);
        const key = `${r.name}:${c.motorWorkAt}:${w.actorId}`;
        if (motorWork.has(key)) {
          assert.deepEqual(motorWork.get(key), w);
          repeatedWitnesses++;
        } else motorWork.set(key, w);
      }
    }
const p = receipt.protocol;
for (const s of [p.initial, p.baseline]) {
  assert.equal(s.players.length, 22);
  assert.equal(new Set(s.players.map((p) => p.id)).size, 22);
  for (const x of s.players) {
    footballerProfileSchema.parse(x.profile);
    assert.equal(Object.keys(x.profile.attributes).length, 28);
  }
  for (const team of ['home', 'away'])
    assert.equal(s.players.filter((p) => p.team === team).length, 11);
}
const { createPr214Scene } = await fromRoot('scripts/pr214Scenarios.ts');
const { stepTacticalMatch } = await fromRoot('src/core/matchSimulation/matchSimulation.ts');
const { projectPlayerDecisionOpportunity } = await fromRoot(
  'src/core/matchSimulation/playerDecision.ts',
);
const { createKickFixture } = await fromRoot('src/core/matchSimulation/physicalKickLaboratory.ts');
const { withHolisticDevelopment } = await fromRoot('scripts/holisticDevelopment.ts');
const pending = createPr214Scene('body-pass-third').initial;
pending.playerAgencyEnabled = true;
assert.equal(projectPlayerDecisionOpportunity(pending), undefined);
const pendingAfter = stepTacticalMatch(pending, 0.025);
assert.ok(pendingAfter.time > pending.time);
const concurrentMenus = pending.players
  .filter((p) => projectPlayerDecisionOpportunity({ ...pending, controlledFootballerId: p.id }))
  .map((p) => p.id);
const f = createKickFixture({ seed: 'pr214-human-freeze', family: 'shot', metres: 20 });
const menu = withHolisticDevelopment(f.state);
menu.playerAgencyEnabled = true;
menu.controlledFootballerId = f.actor.id;
const opportunity = projectPlayerDecisionOpportunity(menu);
assert.ok(opportunity);
assert.deepEqual(stepTacticalMatch(menu, 0.025), menu);
assert.deepEqual(stepTacticalMatch(stepTacticalMatch(menu, 0.025), 0.025), menu);
const agency = {
  pendingInitial: pending,
  pendingAfter,
  concurrentMenus,
  concurrentMenuCoverage: concurrentMenus.length ? 'exercised' : 'not exercised',
  realMenuInitial: menu,
  opportunity,
  frozenHash: hash(menu),
};
const result = {
  source,
  agency,
  passFirstUnchanged: true,
  passImpulseHash: hash(row.frames.at(-1).strike.contact),
  fullProfiles: 44,
  attributesEach: 28,
  uniqueMotorWitnesses: motorWork.size,
  repeatedWitnessesVerified: repeatedWitnesses,
};
if (!process.argv.includes('--check'))
  writeFileSync(
    'docs/performance/pr214/additional-checks-v2.json',
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx' },
  );
else
  assert.deepEqual(
    canonical(result),
    JSON.parse(readFileSync('docs/performance/pr214/additional-checks-v2.json')),
  );
console.log(JSON.stringify(result));
