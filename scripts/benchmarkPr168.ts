import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { pushedTouchFixture } from './pr168Fixtures';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { generateProfessionalOffers } from '../src/core/professionalClubs';
import { deriveSquadHierarchy, getSportingStatus } from '../src/core/footballerWorld';
import { playerAttributesSchema } from '../src/schemas/domainSchemas';
import type { PlayerPosition } from '../src/types/domain';
import { runPassLab } from './pr165TacticalLab';

const started = performance.now();
const carryRows = [];
for (const loose of [false, true])
  for (const reversed of [false, true])
    for (const pressure of [false, true])
      for (const turn of [false, true]) {
        const { state, actorId, dir } = pushedTouchFixture({ loose, reversed, pressure });
        const target = { x: 60 + dir * (turn ? -8 : 20), y: turn ? 15 : 34 };
        let next = resolveMatchAction(
          state,
          { type: 'carry', actorId, target, movementMode: 'sprint' },
          'human_selected',
        );
        let contactAt: number | null = null,
          lostOwnership = false;
        for (let tick = 0; tick < 160; tick++) {
          next = stepTacticalMatchAfterDecisionProbe(next);
          if (next.ball.ownerId !== actorId) lostOwnership = true;
          if (
            next.lastGroundContact?.actorId === actorId &&
            next.lastGroundContact.executed &&
            next.lastGroundContact.at > 600
          )
            contactAt ??= next.lastGroundContact.at;
        }
        const actor = next.players.find((p) => p.id === actorId)!;
        carryRows.push({
          loose,
          reversed,
          pressure,
          turn,
          accepted: next.decisionIndex > state.decisionIndex,
          contactAt,
          lostOwnership,
          finalOwner: next.ball.ownerId ?? null,
          recovered: next.ball.ownerId === actorId,
          actorPosition: actor.position,
          ball: { x: next.ball.x, y: next.ball.y },
          action: next.latestAction?.type,
          termination: next.lastCarryDiagnostic?.terminationReason,
        });
      }
const carryMs = performance.now() - started;
const world = createCanonicalWorldDatabase();
const transferRows = [];
for (const [position, age, ability] of [
  ['right_winger', 18, 60],
  ['right_winger', 25, 73],
  ['right_winger', 33, 73],
  ['central_midfielder', 25, 73],
  ['striker', 27, 78],
  ['goalkeeper', 27, 78],
  ['striker', 37, 58],
] as [PlayerPosition, number, number][]) {
  const base = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Benchmark',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position,
        heightCm: 180,
        weightKg: 75,
        seed: 'pr168-career',
      },
      'pr168-career',
      0,
    ),
    'pr168-career',
    world,
  );
  const career = {
    ...base,
    player: {
      ...base.player,
      age,
      attributes: playerAttributesSchema.parse(
        Object.fromEntries(Object.keys(base.player.attributes).map((key) => [key, ability])),
      ),
    },
  };
  const start = performance.now();
  const offers = generateProfessionalOffers(career);
  transferRows.push({
    position,
    age,
    ability,
    ms: performance.now() - start,
    offers: offers.map((offer) => {
      const projectedClub = {
        ...offer.club,
        squadPlayerIds: [...new Set([...(offer.club.squadPlayerIds ?? []), career.player.id])],
      };
      const hierarchy = deriveSquadHierarchy(career, projectedClub);
      return {
        clubId: offer.club.id,
        tier: offer.club.leagueTier,
        role: offer.contract.squadRole,
        plannedPosition: offer.plannedPosition,
        warning: offer.tacticalPositionWarning ?? null,
        predicted: offer.projectedStanding,
        actual: getSportingStatus(hierarchy, career.player.id),
        formation: hierarchy.formation,
        salary: offer.contract.monthlySalary,
      };
    }),
  });
}
const passing = runPassLab(['baseline', 'blocked_build_up'], ['pr165-tactic-1']);
const report = {
  label: process.env.MFL_EVIDENCE_LABEL ?? 'after',
  baseRevision: '2ddeb35',
  node: process.version,
  method:
    'Frozen equivalent physical fixtures: 16 four-second canonical continuations; cross-sectional real canonical squads for seven player profiles; ten existing PR165 counterfactual pass probes. No original user replay/save was supplied. Wall timings include warmup and are descriptive only.',
  carryMs,
  totalMs: performance.now() - started,
  carryRows,
  transferRows,
  passing,
};
mkdirSync('docs/performance', { recursive: true });
const output = `docs/performance/PR168-${report.label}.json`;
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    carryMs,
    totalMs: report.totalMs,
    unpressured: carryRows
      .filter((r) => !r.pressure)
      .map((r) => ({
        loose: r.loose,
        turn: r.turn,
        reversed: r.reversed,
        contactAt: r.contactAt,
        recovered: r.recovered,
        lostOwnership: r.lostOwnership,
      })),
    transfers: transferRows.map((r) => ({
      position: r.position,
      age: r.age,
      n: r.offers.length,
      tiers: r.offers.map((o) => o.tier),
    })),
  }),
);
