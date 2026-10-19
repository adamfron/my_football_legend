import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { z } from 'zod';
import { createCombinationFixture } from './pr174Fixtures.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import {
  rankAvailableActionsForAI,
  scoreActionForAI,
} from '../src/core/matchSimulation/matchActions.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import {
  deriveBuildUpSupport,
  deriveFlankRunAssignments,
} from '../src/core/matchSimulation/tacticalPositioning.ts';
import { clampPitchPoint, distance } from '../src/core/matchSimulation/matchSpace.ts';
const sha = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const raw = JSON.parse(gunzipSync(readFileSync('../pr176-inputs/pr175-natural.json.gz')))[0];
const base = tacticalMatchStateSchema.parse(raw.state),
  actorId = raw.actorId;
const ranked = rankAvailableActionsForAI(base, actorId);
const through = ranked.find(
  (r) => r.action.type === 'pass' && r.action.intent === 'through',
).action;
const safe = { ...ranked.find((r) => r.action.type === 'pass').action, intent: 'through' };
const rows = [];
const score = (s, action, factor, value) => {
  const a = s.players.find((p) => p.id === actorId),
    p = s.players.find((p) => p.id === action.receiverId),
    before = sha(s);
  const q = evaluatePassDecision(s, a, p, action.target, action.intent, action.delivery);
  const utility = scoreActionForAI(s, actorId, action);
  if (sha(s) !== before) throw new Error('Boundary projection mutated state');
  rows.push({
    factor,
    value,
    action,
    forecast: q,
    defenderAdvantage: q.defenderEta - q.receiverEta,
    canonicalScore: utility,
    generated: rankAvailableActionsForAI(s, actorId).some(
      (r) =>
        r.action.type === 'pass' &&
        r.action.receiverId === action.receiverId &&
        r.action.intent === action.intent,
    ),
    support: deriveBuildUpSupport(s, a.team),
    flanks: deriveFlankRunAssignments(s, a.team),
  });
};
const runner = base.players.find((p) => p.id === through.receiverId);
const defenderId = base.players
  .filter((p) => p.team !== runner.team)
  .sort(
    (a, b) => distance(a.position, through.target) - distance(b.position, through.target),
  )[0].id;
for (let i = 0; i <= 40; i++) {
  const s = globalThis.structuredClone(base),
    d = s.players.find((p) => p.id === defenderId);
  d.position = clampPitchPoint({ x: through.target.x + i * 0.2, y: through.target.y });
  d.velocity = { x: 0, y: 0 };
  score(s, through, 'defenderDistanceFromThroughTarget', i * 0.2);
}
for (let skill = 5; skill <= 95; skill += 5) {
  const s = globalThis.structuredClone(base),
    a = s.players.find((p) => p.id === actorId);
  a.profile.attributes.passing = skill;
  score(s, safe, 'passingSkillCompletionBoundary', skill);
}
for (const age of [0, 0.025, 5, 11.975, 12, 12.025]) {
  const s = globalThis.structuredClone(base),
    a = s.players.find((p) => p.id === actorId),
    r = s.players.find((p) => p.id === safe.receiverId);
  s.lastPassDiagnostic = {
    ...s.lastPassDiagnostic,
    passerId: r.id,
    intendedReceiverId: a.id,
    resolvedAt: s.time - age,
    receiverPositionAtRelease: { ...a.position },
  };
  score(s, { ...safe, intent: 'support' }, 'returnPassAge', age);
}
for (const depth of [61.99, 62, 62.01]) {
  const s = globalThis.structuredClone(base),
    a = s.players.find((p) => p.id === actorId);
  a.position = { x: depth, y: 34 };
  s.ball = { ...s.ball, x: depth, y: 34 };
  score(s, { ...safe, intent: 'support' }, 'carrierDepthSupportBoundary', depth);
}
for (const width of [19.99, 20, 20.01]) {
  const s = globalThis.structuredClone(base);
  const winger = s.players.find(
    (p) => p.team === base.possessionTeam && p.slot.position === 'left_winger',
  );
  winger.position.y = 34 - width;
  s.ball.y = 10;
  score(s, { ...safe, intent: 'support' }, 'wingerWidthOverlapBoundary', width);
}
for (const factor of ['eligibleWingerWidth', 'eligibleOutsideSpace']) {
  for (const value of factor === 'eligibleWingerWidth' ? [19.99, 20, 20.01] : [4.99, 5, 5.01]) {
    const fixture = createCombinationFixture({ scenario: 'overlap', variant: 'timed_run' });
    const s = fixture.state;
    const winger = s.players.find((p) => p.id === fixture.a);
    if (factor === 'eligibleWingerWidth') winger.position.y = 34 - value;
    const fullback = s.players.find((p) => p.id === fixture.c);
    const sign = Math.sign(fullback.neutralAnchor.y - 34);
    const outside = { x: winger.position.x + 8, y: 34 + sign * 30 };
    if (factor === 'eligibleOutsideSpace') {
      const defender = s.players
        .filter((p) => p.team !== winger.team)
        .sort((a, b) => distance(a.position, outside) - distance(b.position, outside))[0];
      defender.position = { x: outside.x + value, y: outside.y };
    }
    rows.push({
      factor,
      value,
      prescribedFixture: 'PR174 overlap timed_run',
      inputHash: sha(s),
      actualWingerWidth: Math.abs(winger.position.y - 34),
      actualOutsideClearance: Math.min(
        ...s.players
          .filter((p) => p.team !== winger.team)
          .map((p) => distance(p.position, outside)),
      ),
      flanks: deriveFlankRunAssignments(s, winger.team),
      support: deriveBuildUpSupport(s, winger.team),
    });
  }
}
const schema = z.object({
  version: z.literal(1),
  method: z.string(),
  baseStateHash: z.string(),
  rows: z.array(z.unknown()),
});
writeFileSync(
  'docs/performance/PR176-boundary-probes.json',
  JSON.stringify(
    schema.parse({
      version: 1,
      method:
        'Exploratory prescribed variants of one natural state; all canonical scores/forecasts, generated flags and tactical assignments retained. Completion boundary uses a prescribed through label to an existing safe outlet, not a claim this candidate was naturally generated. Defender-distance sweep includes discrete canonical ETA steps. No gameplay source changes or extra execution RNG.',
      baseStateHash: sha(base),
      rows,
    }),
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    boundaryRows: rows.length,
    completionRange: [
      Math.min(
        ...rows
          .filter((r) => r.factor === 'passingSkillCompletionBoundary')
          .map((r) => r.forecast.expectedCompletion),
      ),
      Math.max(
        ...rows
          .filter((r) => r.factor === 'passingSkillCompletionBoundary')
          .map((r) => r.forecast.expectedCompletion),
      ),
    ],
  }),
);
