import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { z } from 'zod';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import {
  rankAvailableActionsForAI,
  scoreActionForAI,
  deriveLeadPass,
  npcPossessionDecisionDelay,
  evaluatePressure,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions.ts';
import { projectPassReception } from '../src/core/matchSimulation/passReception.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { derivePassDifficulty } from '../src/core/matchSimulation/passExecution.ts';
import {
  deriveSpacePassPlan,
  enumerateNpcSpacePasses,
} from '../src/core/matchSimulation/spacePassing.ts';
import { evaluateRunSpace } from '../src/core/matchSimulation/reachableSpace.ts';
import {
  deriveBuildUpSupport,
  deriveFlankRunAssignments,
  deriveTacticalTargets,
} from '../src/core/matchSimulation/tacticalPositioning.ts';
import { secondLastOpponentLine } from '../src/core/matchSimulation/offside.ts';
import { preparationMarginForAction } from '../src/core/matchSimulation/onBallPreparation.ts';
import { estimateCarrierContactWindow } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  attacksRight,
  distance,
  distanceToSegment,
  clampPitchPoint,
} from '../src/core/matchSimulation/matchSpace.ts';
import {
  projectFutureBallTrajectory,
  BALL_PHYSICS,
} from '../src/core/matchSimulation/ballPhysics.ts';

const hash = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const out = process.argv.includes('--plain') ? '../pr176-plain-receipts' : 'docs/performance';
const receiptSchema = z.object({
  version: z.literal(1),
  manifest: z.unknown(),
  method: z.string(),
  rows: z.array(z.unknown()),
});
mkdirSync(out, { recursive: true });
const sourceRoot = 'src/core/matchSimulation';
const sources = readdirSync(sourceRoot)
  .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
  .sort()
  .map((p) => {
    const path = `${sourceRoot}/${p}`,
      bytes = readFileSync(path),
      text = bytes.toString('utf8').replaceAll('\r\n', '\n');
    return {
      path,
      sha256: hash(bytes),
      normalizedSha256: hash(text),
      gitBlob: execFileSync('git', ['rev-parse', `HEAD:${path}`], { encoding: 'utf8' }).trim(),
      text,
    };
  });
const historical = readdirSync('docs/performance')
  .filter((p) => /^PR17[1-5].*\.json$/.test(p))
  .sort()
  .map((p) => ({
    path: `docs/performance/${p}`,
    sha256: hash(readFileSync(`docs/performance/${p}`)),
  }));
const manifest = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  fixedDt: 0.025,
  normalizedProductionHash: hash(sources.map((s) => `${s.path}\0${s.text}\0`).join('')),
  sources: sources.map((s) =>
    Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'text')),
  ),
  historical,
  inputs: JSON.parse(readFileSync('../pr176-inputs/manifest.json', 'utf8')),
  researchSources: [
    'scripts/auditPr176.mjs',
    'scripts/pr176AuditLoader.mjs',
    'scripts/registerPr176Audit.mjs',
    'scripts/preparePr176.mjs',
    'scripts/auditPr176Boundaries.mjs',
    'scripts/preparePr177Fixtures.mjs',
    'scripts/reportPr176.mjs',
    'scripts/finalizePr176.mjs',
  ].map((path) => ({ path, sha256: hash(readFileSync(path)) })),
};
const emit = (name, method, rows) =>
  writeFileSync(
    `${out}/PR176-${name}.json`,
    JSON.stringify(
      receiptSchema.parse({
        version: 1,
        manifest: {
          baseCommit: manifest.baseCommit,
          normalizedProductionHash: manifest.normalizedProductionHash,
          node: manifest.node,
        },
        method,
        rows,
      }),
      null,
      2,
    ) + '\n',
  );
writeFileSync(`${out}/PR176-source-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

// AST census is evidence of source locations, never a claim every numeric literal is a timer.
const comparisons = [],
  numericDeclarations = [],
  returns = [];
for (const src of sources) {
  const file = ts.createSourceFile(src.path, src.text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(node.operatorToken.kind)
    )
      comparisons.push({ path: src.path, line, expression: node.getText(file) });
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      /\d/.test(node.initializer.getText(file)) &&
      node.initializer.getText(file).length < 1800
    )
      numericDeclarations.push({
        path: src.path,
        line,
        name: node.name.getText(file),
        expression: node.initializer.getText(file),
      });
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      [
        'matchActions.ts',
        'passDecision.ts',
        'shootingOpportunity.ts',
        'shootingOptions.ts',
        'carryOpportunity.ts',
        'reachableSpace.ts',
      ].some((p) => src.path.endsWith('/' + p))
    )
      returns.push({ path: src.path, line, expression: node.expression.getText(file) });
    ts.forEachChild(node, visit);
  };
  visit(file);
}
writeFileSync(
  `${out}/PR176-source-census.json.gz`,
  gzipSync(JSON.stringify({ version: 1, comparisons, numericDeclarations, returns })),
);
emit(
  'scoring-expressions',
  'Original source expressions and exact locations. AST extraction, no second scorer.',
  returns,
);

const cases = [];
for (const group of ['pr175-natural', 'pr175-natural-dev-strength']) {
  const captures = JSON.parse(gunzipSync(readFileSync(`../pr176-inputs/${group}.json.gz`)));
  for (const [i, c] of captures.entries())
    cases.push({ ...c, id: `${group}:${i}`, state: tacticalMatchStateSchema.parse(c.state) });
}
let trace = [];
globalThis[Symbol.for('mfl.pr176.term')] = (term) => trace.push(term);
const snapshot = (state, actorId, detail = true) => {
  trace = [];
  const before = hash(state),
    ranking = rankAvailableActionsForAI(state, actorId),
    actor = state.players.find((p) => p.id === actorId);
  const recorded = trace;
  trace = [];
  if (hash(state) !== before) throw new Error('Ranking mutated frozen state');
  return ranking.map((r) => {
    const terms = recorded.filter((t) => t.action === r.action && t.fn === 'scoreActionForAI');
    if (
      terms.length &&
      r.action.type !== 'space_pass' &&
      Math.abs(terms.reduce((s, t) => s + t.value, 0) - r.canonicalScore) > 1e-8
    )
      throw new Error('Operand trace total mismatch');
    const receiver =
      r.action.type === 'pass'
        ? state.players.find((p) => p.id === r.action.receiverId)
        : undefined;
    return {
      ...r,
      ...(detail
        ? {
            terms: terms.map((t) => ({
              fn: t.fn,
              line: t.line,
              expression: t.expression,
              value: t.value,
            })),
            receiverRole: receiver?.slot.position ?? null,
            forecast: receiver
              ? evaluatePassDecision(
                  state,
                  actor,
                  receiver,
                  r.action.target,
                  r.action.intent,
                  r.action.delivery,
                  undefined,
                  Boolean(r.action.firstTime),
                )
              : null,
          }
        : {}),
    };
  });
};
const decompositions = cases.map((c) => ({
  id: c.id,
  category: c.category,
  at: c.state.time,
  actorId: c.actorId,
  stateHash: hash(c.state),
  actor: c.state.players.find((p) => p.id === c.actorId),
  phase: c.state.teams[c.state.possessionTeam].phase,
  opportunity: evaluateShootingOpportunity(
    c.state,
    c.state.players.find((p) => p.id === c.actorId),
  ),
  ranking: snapshot(c.state, c.actorId),
}));
for (const c of cases) {
  const actual = decompositions
    .find((r) => r.id === c.id)
    .ranking.map((r) => ({
      action: r.action,
      canonicalScore: r.canonicalScore,
      deterministicNoise: r.deterministicNoise,
      score: r.score,
    }));
  if (hash(actual) !== hash(c.ranking))
    throw new Error(`Historical ranking not reproduced: ${c.id}`);
}
emit(
  'frozen-scores',
  'All 19 PR175 selected natural development states, all generated actions including rejected. Historical inputs, not a new validation set. Additive terms wrap original operands once; totals checked to 1e-8 and whole input states unchanged.',
  decompositions,
);
console.log(`frozen decompositions: ${decompositions.length}`);

const gateRows = [];
for (const c of cases) {
  const s = c.state,
    a = s.players.find((p) => p.id === c.actorId),
    rank = decompositions.find((r) => r.id === c.id).ranking;
  for (const p of s.players.filter((p) => p.team === a.team && p.id !== a.id)) {
    const projection = projectPassReception(s, a, p, 'lead'),
      lead = deriveLeadPass(s, a, p),
      progress = (p.position.x - a.position.x) * (attacksRight(a) ? 1 : -1),
      space = progress > 8 && p.duty !== 'defend' ? evaluateRunSpace(s, a, p) : null;
    gateRows.push({
      id: c.id,
      receiverId: p.id,
      role: p.slot.position,
      duty: p.duty,
      distance: distance(a.position, p.position),
      speed: Math.hypot(p.velocity.x, p.velocity.y),
      targetDistance: distance(p.position, p.target),
      semanticIntent: projection.semanticIntent,
      leadDistance: projection.leadDistance,
      predictionHorizon: projection.predictionHorizon,
      leadEligible: Boolean(lead),
      progress,
      space,
      generatedLeadOrThrough: rank
        .filter(
          (r) =>
            r.action.type === 'pass' &&
            r.action.receiverId === p.id &&
            ['lead', 'through'].includes(r.action.intent),
        )
        .map((r) => r.action),
      spaceActions: enumerateNpcSpacePasses(s, a)
        .map((action) => ({ action, plan: deriveSpacePassPlan(s, a, action.target) }))
        .filter((r) => r.plan.receiverId === p.id),
    });
  }
}
emit(
  'candidate-gates',
  '190 teammate projections from the 19 selected natural states. Counts describe these selected opportunities only, not a match-rate or oracle of viable missing passes. Independent space_pass path is explicitly retained.',
  gateRows,
);

const flight = [];
for (const metres of [5, 10, 15, 25, 35, 45, 60])
  for (const intent of ['support', 'progressive', 'direct', 'lead', 'through'])
    for (const delivery of ['ground', 'lofted']) {
      const s = globalThis.structuredClone(cases[0].state),
        a = s.players.find((p) => p.id === cases[0].actorId),
        p = s.players.find(
          (p) => p.team === a.team && p.id !== a.id && p.slot.position === 'central_midfielder',
        );
      a.position = { x: 15, y: 34 };
      a.facingAngle = Math.PI / 2;
      a.velocity = { x: 0, y: 0 };
      s.ball = { x: 15, y: 34, height: 0.11, ownerId: a.id };
      s.currentPressure = 0;
      p.position = { x: 15 + metres, y: 34 };
      p.target = { ...p.position };
      p.velocity = { x: 0, y: 0 };
      p.facingAngle = -Math.PI / 2;
      const target = { ...p.position },
        plan = derivePassLaunchPlan(s, a, p, target, intent, delivery),
        q = evaluatePassDecision(s, a, p, target, intent, delivery, plan),
        d = derivePassDifficulty(s, a, target, intent, delivery);
      const desired = Math.min(
        intent === 'support' ? 2.2 : intent === 'progressive' ? 1.8 : 1.45,
        Math.max(
          intent === 'support' ? 0.72 : 0.48,
          plan.receiverReadiness.earliestUsefulContactTime + (intent === 'support' ? 0.28 : 0.08),
          metres / (intent === 'support' ? 9 : intent === 'progressive' ? 13 : 17),
        ),
      );
      const samples = projectFutureBallTrajectory(
        {
          position: { x: 15, y: 34, z: 0.11 },
          velocity: plan.velocity,
          airborne: delivery === 'lofted',
          bounceCount: 0,
        },
        8,
        0.025,
      );
      const nearest = samples.reduce((b, x) =>
        distance(x.ball.position, target) < distance(b.ball.position, target) ? x : b,
      );
      const exactGround =
        delivery === 'ground'
          ? plan.speed ** 2 >= 2 * BALL_PHYSICS.rollingDeceleration * metres
            ? (plan.speed -
                Math.sqrt(plan.speed ** 2 - 2 * BALL_PHYSICS.rollingDeceleration * metres)) /
              BALL_PHYSICS.rollingDeceleration
            : null
          : null;
      flight.push({
        metres,
        intent,
        delivery,
        context:
          'Prescribed stationary receiver and unchanged frozen opponents; intent labels do not imply autonomous eligibility. Desired ground deadline calculated for comparison only; aerial planner ignores it.',
        desiredGroundDeadline: desired,
        plan,
        exactGroundCrossingSeconds: exactGround,
        integratedNearestAt: nearest.at,
        integratedNearestMissMetres: distance(nearest.ball.position, target),
        integratedNearestHeight: nearest.ball.position.z,
        rollingDeceleration: BALL_PHYSICS.rollingDeceleration,
        execution: d,
        forecast: q,
      });
    }
emit(
  'pass-flight',
  '70 prescribed distances/intents/deliveries through actual launch, integrator, execution and reception forecast. Independent trajectory integration is physical only (no players). Reported ETA uses the existing 0.55m meeting envelope; exact centre crossing separately. No new gameplay policy.',
  flight,
);
console.log(`flight rows: ${flight.length}`);

const releasedFlights = [];
for (const metres of [5, 10, 15, 25, 35, 45, 60])
  for (const delivery of ['ground', 'lofted'])
    for (const geometry of ['straight', 'diagonal']) {
      const s = globalThis.structuredClone(cases[0].state);
      const a = s.players.find((p) => p.id === cases[0].actorId);
      const p = s.players.find(
        (p) => p.team === a.team && p.slot.position === 'central_midfielder',
      );
      const origin = { x: 10, y: 9 };
      const vector = geometry === 'diagonal' ? { x: 0.8, y: 0.6 } : { x: 1, y: 0 };
      a.position = origin;
      a.velocity = { x: 0, y: 0 };
      a.facingAngle = Math.atan2(vector.x, vector.y);
      p.position = { x: origin.x + vector.x * metres, y: origin.y + vector.y * metres };
      p.target = { ...p.position };
      p.velocity = { x: 0, y: 0 };
      p.facingAngle = Math.atan2(-vector.x, -vector.y);
      s.ball = { ...origin, height: 0.11, ownerId: a.id };
      s.currentPressure = 0;
      const plan = derivePassLaunchPlan(s, a, p, p.position, 'direct', delivery);
      const before = hash(s);
      const released = resolveMatchAction(s, {
        type: 'pass',
        actorId: a.id,
        receiverId: p.id,
        target: p.position,
        requestedSpace: p.position,
        intent: 'direct',
        delivery,
      });
      if (hash(s) !== before) throw new Error('Release mutated source state');
      if (!released.ball.velocity) throw new Error('Prescribed pass did not release');
      const samples = projectFutureBallTrajectory(
        {
          position: { x: released.ball.x, y: released.ball.y, z: released.ball.height ?? 0 },
          velocity: { ...released.ball.velocity, z: released.ball.velocity.z ?? 0 },
          airborne: released.ball.airborne ?? false,
          bounceCount: 0,
        },
        8,
        0.025,
      );
      const nearest = samples.reduce((b, x) =>
        distance(x.ball.position, p.position) < distance(b.ball.position, p.position) ? x : b,
      );
      const atPlan = samples.reduce((b, x) =>
        Math.abs(x.at - plan.predictedArrivalTime) < Math.abs(b.at - plan.predictedArrivalTime)
          ? x
          : b,
      );
      releasedFlights.push({
        metres,
        geometry,
        delivery,
        intent: 'direct',
        plan,
        actualReleaseSpeed: Math.hypot(
          released.ball.velocity.x,
          released.ball.velocity.y,
          released.ball.velocity.z ?? 0,
        ),
        actualReleaseVelocity: released.ball.velocity,
        physicalTarget: released.ball.target,
        intendedTarget: p.position,
        selectionForecast: released.lastPassDiagnostic?.selectionQuality,
        actualNearestAt: nearest.at,
        actualNearestMissMetres: distance(nearest.ball.position, p.position),
        actualNearestHeight: nearest.ball.position.z,
        missAtPlannedTimeMetres: distance(atPlan.ball.position, p.position),
      });
    }
emit(
  'released-flight',
  '28 prescribed direct releases in straight/diagonal geometry, all requested distances, actual canonical execution error and launch; then physical-only trajectory integration (no defender intervention). Same seed-derived release branch per case; no diagnostic RNG draws. Planned vs actual includes nominal-height and sampled-target effects, so speed ceiling is isolated by the explicit velocities, not by asserting every miss is caused by the ceiling.',
  releasedFlights,
);

// Frozen-state sweeps: each independently cloned from one historical observation.
const sensitivity = [];
const base = cases.find((c) => c.category === 'backward') ?? cases[0];
const actorOf = (s) => s.players.find((p) => p.id === base.actorId);
const receiverId = base.state.players.find(
  (p) =>
    p.team === actorOf(base.state).team &&
    p.id !== base.actorId &&
    p.slot.position === 'central_midfielder',
).id;
const receiverOf = (s) => s.players.find((p) => p.id === receiverId);
const nearestId = base.state.players
  .filter((p) => p.team !== actorOf(base.state).team)
  .sort(
    (a, b) =>
      distance(a.position, receiverOf(base.state).position) -
      distance(b.position, receiverOf(base.state).position),
  )[0].id;
const sweep = (factor, values, change) => {
  for (const value of values) {
    const s = globalThis.structuredClone(base.state);
    change(s, value);
    const a = actorOf(s),
      p = receiverOf(s),
      projection = projectPassReception(s, a, p, 'lead');
    const ranking = snapshot(s, a.id, false),
      plan = derivePassLaunchPlan(s, a, p, p.position, 'progressive'),
      q = evaluatePassDecision(s, a, p, p.position, 'progressive', 'ground', plan);
    sensitivity.push({
      factor,
      value,
      baseId: base.id,
      receiverId,
      projection,
      leadEligible: Boolean(deriveLeadPass(s, a, p)),
      forecast: q,
      passScore: scoreActionForAI(s, a.id, {
        type: 'pass',
        actorId: a.id,
        receiverId,
        target: p.position,
        intent: 'progressive',
      }),
      winner: ranking[0] ?? null,
      candidates: ranking.map(({ action, score, canonicalScore }) => ({
        action,
        score,
        canonicalScore,
      })),
      delay: npcPossessionDecisionDelay(s, a),
    });
  }
};
sweep(
  'receiverSpeed',
  [0, 0.3, 0.34, 0.349, 0.35, 0.351, 0.36, 0.69, 0.7, 0.71, 1.19, 1.2, 1.21, 3, 6],
  (s, v) => {
    receiverOf(s).velocity = { x: (attacksRight(actorOf(s)) ? 1 : -1) * v, y: 0 };
  },
);
sweep('targetSeparation', [0, 1.19, 1.2, 1.21, 1.59, 1.6, 1.61, 2, 4, 8, 12], (s, v) => {
  const p = receiverOf(s);
  p.velocity = { x: 0, y: 0 };
  p.target = clampPitchPoint({
    x: p.position.x + (attacksRight(actorOf(s)) ? v : -v),
    y: p.position.y,
  });
});
sweep('receiverMarkerDistance', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], (s, v) => {
  const p = receiverOf(s);
  s.players.find((p) => p.id === nearestId).position = clampPitchPoint({
    x: p.position.x,
    y: p.position.y + v,
  });
});
sweep(
  'laneOffset',
  [0, 0.9, 1, 1.01, 1.64, 1.65, 1.66, 2.09, 2.1, 2.11, 2.49, 2.5, 2.51, 3.5, 5],
  (s, v) => {
    const a = actorOf(s),
      p = receiverOf(s),
      dx = p.position.x - a.position.x,
      dy = p.position.y - a.position.y,
      l = Math.hypot(dx, dy);
    s.players.find((p) => p.id === nearestId).position = clampPitchPoint({
      x: (a.position.x + p.position.x) / 2 - (dy / l) * v,
      y: (a.position.y + p.position.y) / 2 + (dx / l) * v,
    });
  },
);
sweep('passerGameReading', [20, 30, 40, 50, 60, 70, 80, 90, 99], (s, v) => {
  actorOf(s).profile.attributes.gameReading = v;
});
sweep('passerComposure', [20, 30, 40, 50, 60, 70, 80, 90, 99], (s, v) => {
  actorOf(s).profile.attributes.composure = v;
});
sweep('receiverPace', [20, 35, 50, 65, 80, 95], (s, v) => {
  receiverOf(s).profile.attributes.pace = v;
});
sweep('orientation', [-3.14, -2, -1, -0.1, 0, 0.1, 1, 2, 3.14], (s, v) => {
  actorOf(s).facingAngle = v;
});
sweep('burstReadiness', [0.01, 0.1, 0.29, 0.3, 0.31, 0.59, 0.6, 0.61, 1], (s, v) => {
  actorOf(s).fitness.burstReadiness = v;
});
sweep('timeTrailing', [4499.975, 4500, 4500.025, 4799.975, 4800, 4800.025], (s, v) => {
  const delta = v - s.time;
  s.time = v;
  s.score[actorOf(s).team] = 0;
  s.score[actorOf(s).team === 'home' ? 'away' : 'home'] = 1;
  s.ballOwnershipStartedAt += delta;
  if (s.onBallPreparation) {
    s.onBallPreparation.gainedAt += delta;
    s.onBallPreparation.readyAt += delta;
  }
});
sweep(
  'phase',
  ['defensive_transition', 'defensive_block', 'attacking_transition', 'positional_attack'],
  (s, v) => {
    s.teams[actorOf(s).team].phase = v;
  },
);
sweep('scoreDifference', [-2, -1, 0, 1, 2], (s, v) => {
  s.score[actorOf(s).team] = 3 + v;
  s.score[actorOf(s).team === 'home' ? 'away' : 'home'] = 3;
});
sweep('actionCooldown', [0, 0.001, 0.024, 0.025, 0.026, 0.25, 1.3, 1.6], (s, v) => {
  s.actionCooldown = v;
});
emit(
  'sensitivity',
  'Exploratory dependent frozen-state sweeps, one changed factor per clone. Full candidate availability and rank retained. Pure ranker intentionally ignores actionCooldown; live caller is audited separately. Through 0.2/0.62 and support/overlap boundaries additionally have source census and explicit PR177 benchmark specifications.',
  sensitivity,
);
console.log(`sensitivity rows: ${sensitivity.length}`);

const movements = cases.map((c) => {
  const s = c.state,
    a = s.players.find((p) => p.id === c.actorId),
    targets = deriveTacticalTargets(s);
  return {
    id: c.id,
    ball: s.ball,
    support: deriveBuildUpSupport(s, a.team),
    flank: deriveFlankRunAssignments(s, a.team),
    offsideLine: secondLastOpponentLine(s, a.team),
    players: targets.map((p) => ({
      id: p.id,
      team: p.team,
      role: p.slot.position,
      duty: p.duty,
      position: p.position,
      velocity: p.velocity,
      ideal: p.idealTarget,
      target: p.target,
      distanceFromBall: distance(p.position, s.ball),
      laneMarkerCount: s.players.filter(
        (d) => d.team !== p.team && distanceToSegment(d.position, s.ball, p.position) < 2.1,
      ).length,
      pressure: evaluatePressure(s, p),
      targetSeparation: distance(p.position, p.target),
    })),
  };
});
emit(
  'movement',
  'One actual next tactical plan in each frozen state. Target existence is not completed movement or a clear passing angle; positions, velocities, pressure and lane geometry retained.',
  movements,
);

const windows = [],
  windowFinals = [];
for (const c of [
  cases[0],
  cases.find((c) => c.category === 'final_third'),
  cases.find((c) => c.category === 'credible'),
  cases.find((c) => c.category === 'credible_no_candidate'),
].filter(Boolean)) {
  let s = globalThis.structuredClone(c.state);
  const samples = [];
  for (let tick = 0; tick <= 120; tick++) {
    if (tick % 4 === 0 && s.ball.ownerId && !s.restart && !s.postGoal) {
      const a = s.players.find((p) => p.id === s.ball.ownerId),
        ranking = snapshot(s, a.id, false),
        age = s.time - (s.ballOwnershipStartedAt ?? s.time),
        delay = npcPossessionDecisionDelay(s, a);
      const blocked = s.actionCooldown > 0 || age < delay;
      const opportunities = ranking
        .filter((r) => {
          if (r.action.type === 'shot')
            return ['credible', 'high_value'].includes(evaluateShootingOpportunity(s, a).category);
          if (
            r.action.type !== 'pass' ||
            (r.action.target.x - a.position.x) * (attacksRight(a) ? 1 : -1) < 5
          )
            return false;
          const p = s.players.find((p) => p.id === r.action.receiverId),
            q = evaluatePassDecision(s, a, p, r.action.target, r.action.intent, r.action.delivery);
          return q.expectedRetainedPossession >= 0.62 && !q.targetPredictedOutOfPlay;
        })
        .map((r) => ({
          key: `${a.id}:${r.action.type}:${r.action.receiverId ?? r.action.intent}`,
          action: r.action,
          score: r.score,
          preparationMargin: preparationMarginForAction(s, a, r.action),
        }));
      samples.push({
        at: s.time,
        stateHash: hash(s),
        actorId: a.id,
        blocked,
        actionCooldown: s.actionCooldown,
        possessionAge: age,
        decisionDelay: delay,
        remaining: Math.max(s.actionCooldown, delay - age, 0),
        physicalPreparation: s.onBallPreparation ?? null,
        contactWindow: estimateCarrierContactWindow(s, a, a.target),
        opportunities,
        winner: ranking[0] ?? null,
      });
    }
    if (tick < 120) s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
  }
  const vanished = [];
  for (let i = 1; i < samples.length - 1; i++)
    for (const o of samples[i].opportunities) {
      if (!samples[i].blocked || samples[i - 1].opportunities.some((p) => p.key === o.key))
        continue;
      const end = samples
        .slice(i + 1)
        .find(
          (x) => x.actorId !== samples[i].actorId || !x.opportunities.some((p) => p.key === o.key),
        );
      if (end && end.actorId === samples[i].actorId && end.blocked)
        vanished.push({
          key: o.key,
          appearedAt: samples[i].at,
          vanishedBy: end.at,
          remainingAtAppearance: samples[i].remaining,
          physicallyPrepared: o.preparationMargin >= 0,
        });
    }
  windows.push({ id: c.id, duration: 3, sampleStep: 0.1, vanishedWhileBlocked: vanished, samples });
  windowFinals.push({ id: c.id, hash: hash(s) });
}
emit(
  'opportunity-windows',
  'Four selected genuine frozen starts, each 3s canonical continuation. Shadow ranks at 0.1s do not execute actions. Valuable-pass proxy is retained forecast>=0.62 and >5m forward; credible shot proxy uses existing evaluator. Appeared-and-vanished requires same owner and still blocked at sampled disappearance. Discrete sampling and selected starts preclude population or causal estimates.',
  windows,
);
globalThis[Symbol.for('mfl.pr176.term')] = undefined;
const parity = {
  rankings: decompositions.map((r) => ({
    id: r.id,
    hash: hash(
      r.ranking.map((entry) => ({
        action: entry.action,
        canonicalScore: entry.canonicalScore,
        deterministicNoise: entry.deterministicNoise,
        score: entry.score,
      })),
    ),
  })),
  windowFinals,
};
writeFileSync(
  process.argv.includes('--plain') ? '../pr176-plain.json' : '../pr176-observed.json',
  JSON.stringify(parity, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    states: cases.length,
    gateRows: gateRows.length,
    flight: flight.length,
    sweeps: sensitivity.length,
    windows: windows.length,
    vanished: windows.flatMap((w) => w.vanishedWhileBlocked).length,
    mode: process.argv.includes('--plain') ? 'plain' : 'instrumented',
  }),
);
