import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import { createReformFixture } from './pr177Fixtures.ts';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import {
  initialiseCoachIntelligence,
  assessCoachTactics,
} from '../src/core/matchSimulation/coachIntelligence.ts';
import {
  assignTacticalRoles,
  roleSuitability,
  rolesForPlayer,
  changeTacticalRole,
} from '../src/core/matchSimulation/tacticalRoles.ts';
import { createTeamThreatMemory } from '../src/core/matchSimulation/teamThreatMemory.ts';
import { deriveTacticalTargets } from '../src/core/matchSimulation/tacticalPositioning.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics.ts';
import { pr182SourceHash, digest } from './pr182Evidence.mjs';
const rows = [];
for (const scenario of [
  'A-pace',
  'B-response',
  'C-dismissal',
  'D-leading',
  'E-trailing',
  'F-no-change',
  'flank-protection',
  'low-block',
]) {
  for (const policy of PRIMARY_DECISION_POLICIES) {
    const f = createReformFixture('stationary-winger');
    let state = f.state;
    state.decisionPolicy = policy;
    for (const side of ['home', 'away']) {
      delete state.teams[side].coaching;
      state.teams[side].threatMemory = createTeamThreatMemory();
    }
    state = initialiseCoachIntelligence(state);
    state.rolePlan = assignTacticalRoles(state);
    const side = f.runner.team,
      memory = state.teams[side].coaching,
      threat = state.teams[side].threatMemory;
    if (scenario === 'A-pace') {
      state = changeTacticalRole(state, f.runner.id, 'wide_playmaker');
      Object.assign(state.teams[side].coaching, { samples: 24, lineSpace: 38 });
    }
    if (scenario === 'B-response') {
      memory.plan = 'exploit_space';
      threat.attackFailures = [4, 0, 0];
      threat.qualifyingAttacks = 5;
    }
    if (scenario === 'C-dismissal') {
      const p = state.players.find((p) => p.team === side && p.slot.position === 'center_back');
      state.discipline = {
        [p.id]: { team: side, yellowCards: 0, sentOff: true, sentOffAt: state.time },
      };
      state.players = state.players.filter((a) => a.id !== p.id);
      state.departedPlayers = [...(state.departedPlayers ?? []), p];
    }
    if (scenario === 'D-leading' || scenario === 'E-trailing') {
      state.time = 4000;
      state.ballOwnershipStartedAt = 3998;
      state.status = 'second_half';
      delete state.timekeeping;
      state.score = {
        home: scenario === 'D-leading' ? 1 : 0,
        away: scenario === 'E-trailing' ? 1 : 0,
      };
    }
    if (scenario === 'flank-protection') {
      threat.lineExposures = [5, 0, 0];
      threat.isolation = [2, 0, 0];
    }
    if (scenario === 'low-block')
      Object.assign(memory, { samples: 24, lowBlock: 0.9, lineSpace: 18 });
    const changed = assessCoachTactics(state, true, scenario === 'C-dismissal');
    const plans = (s) =>
      deriveTacticalTargets(s).map((p) => ({
        id: p.id,
        position: p.position,
        target: p.target,
        role: s.rolePlan?.assignments[p.id],
      }));
    const continuations = [];
    for (const [label, input] of [
      ['unchanged', state],
      ['coached', changed],
    ]) {
      let s = globalThis.structuredClone(input);
      // Disable further strategic reviews only for this short paired mechanism probe.
      // The committed candidate changes and all ordinary football authorities stay active.
      for (const t of ['home', 'away']) s.teams[t].coaching.assessedAt = s.time;
      const start = s.time,
        samples = [];
      for (let tick = 0; tick < 400; tick++) {
        s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
        if ([39, 119, 399].includes(tick))
          samples.push({
            seconds: s.time - start,
            players: s.players.map((p) => ({ id: p.id, position: p.position, target: p.target })),
            ball: s.ball,
            pass: s.lastPassDiagnostic,
            shot: s.lastShot,
          });
      }
      continuations.push({
        label,
        initialHash: digest(input),
        finalHash: digest(s),
        official: projectMatchCentreStatistics(s),
        samples,
      });
    }
    rows.push({
      scenario,
      policy,
      inputHash: digest(state),
      decision: changed.teams[side].coaching.decisions.at(-1),
      before: plans(state),
      after: plans(changed),
      suitability: state.players
        .filter((p) => p.team === side)
        .map((p) => ({
          id: p.id,
          roles: rolesForPlayer(p).map((r) => ({ role: r.id, score: roleSuitability(p, r) })),
        })),
      rankings: {
        before: rankAvailableActionsForAI(state, f.actor.id).slice(0, 3),
        after: rankAvailableActionsForAI(changed, f.actor.id).slice(0, 3),
      },
      continuations,
    });
  }
  console.log(
    JSON.stringify({
      scenario,
      policies: 5,
      decisions: rows
        .slice(-5)
        .map((r) => ({ policy: r.policy, chosen: r.decision.chosen, changed: r.decision.changed })),
    }),
  );
}
mkdirSync('docs/performance/pr182-evidence', { recursive: true });
writeFileSync(
  'docs/performance/pr182-evidence/coaching-continuations.json.gz',
  gzipSync(
    JSON.stringify({
      sourceHash: pr182SourceHash(),
      method:
        'Eight prescribed coaching evidence/geometry scenarios, all five policies; paired unchanged/coached ten-second canonical continuations. Not eight independent matches or empirical treatment-effect estimates. Changes alter future intentions without teleporting bodies.',
      rows,
    }),
  ),
);
