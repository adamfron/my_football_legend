import { familyFixture } from './pr198Fixtures.mjs';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import {
  sampleCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash } from './pr201Evidence.mjs';
export const createFreshReleases = (edition = 200) => {
  const rejected = [];
  const entries = [];
  for (const family of ['short_ground', 'long_ground', 'long_lofted', 'moving_lead', 'cross_field'])
    for (const skill of [25, 55, 85])
      for (const sample of [0, 1])
        for (const factor of ['unpressured', 'immediate_pressure', 'late_reacquisition']) {
          const f = familyFixture(family, skill, sample);
          if (edition === 201) {
            const receiver = f.state.players.find((p) => p.id === f.receiverId);
            receiver.position = {
              x: receiver.position.x - 2.3,
              y: Math.max(3, Math.min(65, receiver.position.y + (sample ? -3.7 : 4.1))),
            };
            receiver.target = { ...receiver.position };
            receiver.anchor = { ...receiver.position };
            receiver.neutralAnchor = { ...receiver.position };
            f.action.target = { ...receiver.position };
          }
          f.state.seed = `pr${edition}-fresh-${family}-${skill}-${sample}`;
          const r = f.state.players.find((p) => p.id === f.receiverId);
          r.facingAngle += sample ? 0.7 : -0.45;
          r.velocity = { x: sample ? 1.5 : -2, y: sample ? -1.5 : 2 };
          if (factor === 'late_reacquisition') r.facingAngle += Math.PI;
          if (factor === 'unpressured')
            for (const p of f.state.players.filter(
              (p) => p.team !== r.team && p.slot.position !== 'goalkeeper',
            )) {
              p.position = { x: 20 + p.slotIndex, y: sample ? 4 : 64 };
              p.target = { ...p.position };
              p.neutralAnchor = { ...p.position };
            }
          if (factor === 'immediate_pressure') {
            const p = f.state.players.find(
              (p) => p.team !== r.team && p.slot.position !== 'goalkeeper',
            );
            p.position = { x: r.position.x + 1.2, y: r.position.y };
            p.target = { ...p.position };
            p.neutralAnchor = { ...p.position };
          }
          const s = resolveMatchAction(
            globalThis.structuredClone(f.state),
            f.action,
            'autonomous_npc',
          );
          const pass = s.lastPassDiagnostic;
          if (!pass || pass.passId === f.state.lastPassDiagnostic?.passId) {
            rejected.push({ family, skill, sample, inputHash: hash(f.state) });
            continue;
          }
          const actor = f.state.players.find((p) => p.id === f.actorId);
          const contract = outcomeContractSchema.parse({
            version: 'original-delivery-v3',
            actorId: f.actorId,
            receiverId: f.receiverId,
            teamIds: f.state.players.filter((p) => p.team === actor.team).map((p) => p.id),
            opponentIds: f.state.players.filter((p) => p.team !== actor.team).map((p) => p.id),
            requestedAt: f.state.time,
            releasedAt: pass.releasedAt,
            horizonAt: pass.releasedAt + 8,
            passId: pass.passId,
            shotId: null,
            previousShotId: null,
            information: 'privileged_engineering_observer',
            conditionalOnRelease: true,
          });
          entries.push({
            family,
            skill,
            sample,
            factor,
            seed: s.seed,
            releaseHash: hash(s),
            ballHash: hash(s.ball),
            receiverHash: hash(s.players.find((p) => p.id === f.receiverId)),
            contract,
            state: s,
            releaseSample: sampleCanonicalOutcome(f.state, s, 'original-delivery-v3'),
          });
        }
  return { entries, rejected };
};
