import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createKickFixture } from '../../../../src/core/matchSimulation/physicalKickLaboratory.ts';
import { playerBodyClearance, supportedUprightPair } from '../../../../src/core/matchSimulation/playerBodyContact.ts';
import { canonicalStrikeFoot } from '../../../../src/core/matchSimulation/pendingStrike.ts';
import { runPr215Clinch } from '../../../../scripts/pr215Clinch.ts';
import { checkPr215Source } from '../../../../scripts/pr215Evidence.mjs';
const binding = checkPr215Source();
const geometry = runPr215Clinch();
const f = createKickFixture({ seed: 'pr215-clinch-actual-players' });
const players = f.state.players.filter((p) => !p.goalkeeperRole && p.slot.position !== 'goalkeeper').slice(0, 3);
const surfaces = [...geometry.bodies, geometry.third];
players.forEach((p, i) => {
  p.position = { x: surfaces[i].centre.x, y: surfaces[i].centre.y };
  p.velocity = { x: 0, y: 0 };
});
const pairs = [];
for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
  assert.ok(supportedUprightPair(players[i], players[j]));
  const clearance = playerBodyClearance(players[i], players[j]);
  assert.ok(clearance >= 0);
  pairs.push({ ids: [players[i].id, players[j].id], clearance });
}
const feet = players.map((p) => ({ id: p.id, position: p.position,
  left: canonicalStrikeFoot(undefined, p, p, 'left', 0, 0.025, 0).position,
  right: canonicalStrikeFoot(undefined, p, p, 'right', 0, 0.025, 0).position }));
assert.ok(feet.every((p) => Math.max(p.left.z, p.right.z) < geometry.initial.position.z - 1));
writeFileSync('docs/performance/pr215/clinch-player-geometry.json', JSON.stringify({
  source: binding.fingerprint, scope: 'actual upright player/core/foot geometry supporting the upper-sphere primitive; no articulated low-leg or canonical high-ball claim',
  pairs, feet, supportBall: geometry.initial.position, minimumThirdTorsoSeparation: geometry.minimumThirdTorsoSeparation,
}, null, 2) + '\n');
