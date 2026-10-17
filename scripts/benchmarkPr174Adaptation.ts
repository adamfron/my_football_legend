import { writeFileSync } from 'node:fs';
import { createPr171Fixture } from './pr171Fixtures';
import { createCombinationFixture } from './pr174Fixtures';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import {
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions';
import {
  evaluateTeamThreatResponse,
  createTeamThreatMemory,
  type TeamThreatMemory,
} from '../src/core/matchSimulation/teamThreatMemory';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity';
import { distance } from '../src/core/matchSimulation/matchSpace';
import { deriveCooperativePress } from '../src/core/matchSimulation/defensiveChallenges';
import { pr172Manifest, pr172Hash } from './pr172Evidence';

let history = createPr171Fixture('central_possession', false, 'pr174-history').state;
const episodes: unknown[] = [],
  responses: unknown[] = [],
  memories: { at: number; team: 'home' | 'away'; memory: TeamThreatMemory }[] = [];
let lastResponse = '';
for (let tick = 0; tick < 24000; tick++) {
  const previous = history;
  history = stepTacticalMatchAfterDecisionProbe(history, 0.025);
  for (const team of ['home', 'away'] as const) {
    const m = history.teams[team].threatMemory!,
      old = previous.teams[team].threatMemory;
    if (m.qualifyingAttacks !== old?.qualifyingAttacks)
      episodes.push({
        at: history.time,
        team,
        qualifying: m.qualifyingAttacks,
        failures: m.attackFailures,
      });
    if (tick % 400 === 0) {
      memories.push({ at: history.time, team, memory: structuredClone(m) });
      const key = JSON.stringify([
        team,
        m.response.attackVariation,
        m.response.distanceShotContext,
      ]);
      if (key !== lastResponse) {
        responses.push({ at: history.time, team, response: m.response });
        lastResponse = key;
      }
    }
  }
}
const failed = memories
  .filter((r) => Math.max(...(r.memory.attackFailures ?? [0, 0, 0])) >= 2)
  .sort(
    (a, b) => (b.memory.response.attackVariation ?? 0) - (a.memory.response.attackVariation ?? 0),
  )[0];
const successful = memories.find(
  (r) =>
    (r.memory.qualifyingAttacks ?? 0) > 0 &&
    Math.max(...(r.memory.attackFailures ?? [0, 0, 0])) < 0.5,
);
const rows = [];
for (const variant of [
  'neutral',
  'failed',
  'successful',
  'weak',
  'blocked',
  'better_teammate',
  'exposed_keeper',
  'rebounds',
  'lead',
  'trailing',
] as const) {
  const f = createCombinationFixture({ scenario: 'distance' }),
    s = f.state;
  s.time = history.time;
  s.ballOwnershipStartedAt = s.time - 2;
  const actor = s.players.find((p) => p.id === f.a)!;
  for (const p of s.players.filter(
    (p) =>
      p.team !== actor.team &&
      p.slot.position !== 'goalkeeper' &&
      distance(p.position, actor.position) < 12,
  ))
    p.position = { x: 90, y: p.position.y < 34 ? 18 : 50 };
  s.players.find((p) => p.id === f.b)!.position = { x: 94, y: 38 };
  const chosenHistory =
    variant === 'successful' ? successful : variant === 'neutral' ? undefined : failed;
  const memory = chosenHistory
    ? structuredClone(chosenHistory.memory)
    : createTeamThreatMemory(0, s.time);
  // Histories are actual canonical sequences. Standardise the current geometry and identities;
  // only bounded team-level attack evidence/response is transferred, not a player's future action.
  const clean = createTeamThreatMemory(0, s.time - 2);
  if (memory.attackFailures) clean.attackFailures = [...memory.attackFailures];
  if (memory.qualifyingAttacks !== undefined) clean.qualifyingAttacks = memory.qualifyingAttacks;
  clean.response.attackVariation = memory.response.attackVariation ?? 0;
  clean.response.distanceShotContext = memory.response.distanceShotContext ?? 0;
  if (variant === 'lead' || variant === 'trailing') {
    s.time = 81 * 60;
    s.score = { home: variant === 'lead' ? 1 : 0, away: variant === 'trailing' ? 1 : 0 };
    clean.evaluatedAt = s.time - 2;
  }
  s.teams.home.threatMemory = evaluateTeamThreatResponse(s, 'home', clean);
  if (variant === 'weak')
    Object.assign(actor.profile.attributes, { finishing: 25, technique: 25, composure: 25 });
  if (variant === 'blocked')
    s.players.find((p) => p.team !== 'home' && p.slot.position !== 'goalkeeper')!.position = {
      x: 84,
      y: 32,
    };
  if (variant === 'better_teammate')
    s.players.find((p) => p.id === f.b)!.position = { x: 93, y: 30 };
  if (variant === 'exposed_keeper')
    s.players.find((p) => p.team !== 'home' && p.slot.position === 'goalkeeper')!.position = {
      x: 90,
      y: 15,
    };
  if (variant === 'rebounds') s.players.find((p) => p.id === f.c)!.position = { x: 96, y: 29 };
  const ranked = rankAvailableActionsForAI(s, f.a),
    opening = ranked[0]?.action;
  let next = opening ? resolveMatchAction(s, opening) : s;
  const shots = new Map();
  for (let tick = 0; tick < 320; tick++) {
    next = stepTacticalMatchAfterDecisionProbe(next, 0.025);
    const shot = next.ball.shot ?? next.lastShot;
    if (shot && (shot.releasedAt ?? -1) >= s.time) shots.set(shot.shotId, shot);
  }
  rows.push({
    variant,
    initialHash: pr172Hash(s),
    historySource: chosenHistory
      ? { at: chosenHistory.at, team: chosenHistory.team, hash: pr172Hash(chosenHistory.memory) }
      : null,
    memory: s.teams.home.threatMemory,
    opportunity: evaluateShootingOpportunity(s, actor),
    press: deriveCooperativePress(s, 'away'),
    ranked: ranked.slice(0, 8),
    selected: opening,
    actualShots: [...shots.values()],
    finalOwner: next.ball.ownerId ?? null,
    finalScore: next.score,
    finalHash: pr172Hash(next),
  });
}
writeFileSync(
  'docs/performance/PR174-tactical-adaptation.json',
  JSON.stringify(
    {
      manifest: pr172Manifest(),
      method:
        '600s actual canonical history; controlled identical present geometry with different legitimate bounded team histories. Additional score/ability/cover variants are explicit counterfactuals, not natural-rate estimates.',
      episodes,
      responses,
      failedSource: failed ?? null,
      successfulSource: successful ?? null,
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    episodes: episodes.length,
    failed: !!failed,
    successful: !!successful,
    rows: rows.length,
  }),
);
