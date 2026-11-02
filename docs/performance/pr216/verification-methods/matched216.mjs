import console from 'node:console';
const { structuredClone } = globalThis;
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { advancePendingStrikeInterval } from '../../../../src/core/matchSimulation/pendingStrikeInterval.ts';
import { playerBodyClearance } from '../../../../src/core/matchSimulation/playerBodyContact.ts';
const old = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr215/browser/incident-native-replay.json.gz')),
);
const ids = ['footballer_pro_0_11', 'footballer_pro_1_12'];
const a = old.history.find((f) => f.time > 11.224 && f.time < 11.226),
  b = old.history.find((f) => f.time > 11.249 && f.time < 11.251);
const initial = structuredClone(old.initial);
initial.time = a.time;
initial.scenario = 'open_play';
delete initial.restart;
delete initial.postGoal;
delete initial.pendingStrike;
delete initial.defensiveChallenge;
initial.players = ids.map((id) => {
  const p = initial.players.find((p) => p.id === id),
    before = a.players.find((p) => p.id === id),
    after = b.players.find((p) => p.id === id);
  return {
    ...p,
    position: before.position,
    velocity: {
      x: (after.position.x - before.position.x) / 0.025,
      y: (after.position.y - before.position.y) / 0.025,
    },
  };
});
initial.ball = {
  x: 70,
  y: 60,
  height: 0.11,
  velocity: { x: 0, y: 0, z: 0 },
  looseSince: initial.time,
};
initial.continuousPlayerContacts = [];
initial.continuousFootContacts = [];
initial.executionWitnesses = {};
const moved = {
  ...initial,
  time: initial.time + 0.025,
  players: initial.players.map((p) => ({
    ...p,
    position: b.players.find((q) => q.id === p.id).position,
  })),
};
const out = advancePendingStrikeInterval(initial, moved, 0.025, {
  ordinary: true,
  body: (s) => s,
  control: (s) => s,
  boundary: (s) => s,
});
assert.equal(out.executionWitnesses?.unresolved, undefined);
assert.ok(out.playerBodyContacts?.some((c) => c.kind === 'impact' && c.normalImpulse > 0));
assert.ok(playerBodyClearance(out.players[0], out.players[1]) >= -1e-8);
const evidence = {
  source: JSON.parse(readFileSync('docs/performance/pr216/source.json')).fingerprint,
  scope:
    'matched two-body interval using preserved endpoint-chord velocities, not a reconstruction of the old pre-projection motor command',
  originalStartClearance: playerBodyClearance(...initial.players),
  oldEndClearance: playerBodyClearance(...moved.players),
  newEndClearance: playerBodyClearance(...out.players),
  initial,
  moved,
  out,
};
mkdirSync('docs/performance/pr216/verification-methods', { recursive: true });
writeFileSync(
  'docs/performance/pr216/matched-original-pair.json.gz',
  gzipSync(JSON.stringify(evidence), { level: 9 }),
);
console.log(
  JSON.stringify(
    {
      source: evidence.source,
      old: evidence.oldEndClearance,
      new: evidence.newEndClearance,
      contacts: out.playerBodyContacts,
    },
    null,
    2,
  ),
);
