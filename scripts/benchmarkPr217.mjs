import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { checkPr217Source, recordPr217Source, ROOT } from './pr217Evidence.mjs';
import { write, hash } from './pr199Evidence.mjs';
import { stepTacticalMatch, startSecondHalf } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  projectPlayerAgency,
  applyPlayerDecision,
} from '../src/core/matchSimulation/playerDecision.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { passCompletionCredit } from '../src/core/matchSimulation/passCompletionCredit.ts';

if (process.argv.includes('--record-source')) recordPr217Source();
const source = checkPr217Source();
const check = process.argv.includes('--check');
const full = process.argv.includes('--full');
const emit = (path, data) => {
  if (!check) return write(path, data);
  const scratch = path.replace(ROOT, '.benchmark-artifacts/pr217');
  mkdirSync('.benchmark-artifacts/pr217', { recursive: true });
  writeFileSync(
    scratch,
    scratch.endsWith('.gz') ? gzipSync(JSON.stringify(data)) : JSON.stringify(data, null, 2) + '\n',
  );
};
const version = process.argv.find((x) => x.startsWith('--version='))?.slice(10) ?? 'v1';
assert.match(version, /^[a-z0-9-]+$/);
const read = (name) => JSON.parse(gunzipSync(readFileSync(`${ROOT}/${name}.json.gz`)));
const reload = (s) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s)));
const fixture = read('session-input');
const incident = read('incident-before-handoff');
const checkpoint = read('checkpoint-original');

const run = (name, initial, seconds, human = false) => {
  let state = reload(initial),
    reason = 'duration',
    totalTicks = 0;
  const began = performance.now(),
    cpu = process.cpuUsage();
  const decisions = [],
    stages = [],
    contacts = [],
    passes = new Map(),
    strikes = new Map(),
    examples = new Map(),
    history = [],
    checkpoints = [],
    minutes = [],
    periods = [],
    fitness = [];
  let lastMinute = state,
    transport = 0,
    lastFootballProgress = state.time,
    progressBall = state.ball;
  const snapshot = () => {
    let a = state,
      b = reload(state);
    for (let i = 0; i < 8; i++) {
      a = stepTacticalMatch(a, 0.025);
      b = stepTacticalMatch(b, 0.025);
      assert.deepEqual(reload(a), reload(b), `${name}: native save/reload identity`);
    }
    checkpoints.push({ at: state.time, hash: hash(reload(state)) });
  };
  snapshot();
  for (; state.time < initial.time + seconds && totalTicks < 400000; totalTicks++) {
    if (state.safetyHalt) {
      reason = `halt:${state.safetyHalt.reason}`;
      break;
    }
    if (state.status === 'half_time') {
      periods.push({ status: state.status, at: state.time });
      snapshot();
      if (!full) {
        reason = 'half_time';
        break;
      }
      state = startSecondHalf(state);
    }
    if (['full_time', 'abandoned'].includes(state.status)) {
      reason = state.status;
      break;
    }
    const agency = projectPlayerAgency(state);
    if (agency.opportunity) {
      if (!human) {
        reason = 'human_decision';
        break;
      }
      // Explicit, logged test choices; this is a driver for human-owned menus,
      // not an engine fallback, timer or automatic possession/goal.
      const option =
        agency.opportunity.options.find((o) => o.kind === 'action' && o.action.type === 'pass') ??
        agency.opportunity.options[0];
      decisions.push({ at: state.time, opportunity: agency.opportunity.kind, option });
      state = applyPlayerDecision(state, agency.opportunity, option.id);
    }
    const previous = state;
    history.push(state);
    if (history.length > 80) history.shift();
    const next = stepTacticalMatch(state, 0.025);
    if (next === state) {
      reason = 'unchanged';
      break;
    }
    state = next;
    if (
      next.decisionIndex !== previous.decisionIndex ||
      Math.hypot(next.ball.x - progressBall.x, next.ball.y - progressBall.y) > 0.5
    ) {
      lastFootballProgress = next.time;
      progressBall = next.ball;
    }
    if (next.time - lastFootballProgress > 120) {
      reason = 'action_starvation';
      break;
    }
    transport += Math.hypot(next.ball.x - previous.ball.x, next.ball.y - previous.ball.y);
    const r = next.restart;
    const stage = r
      ? `${r.awardId}:${r.retrieval?.stage ?? 'not_started'}:${r.phase}`
      : 'open_play';
    if (stages.at(-1)?.stage !== stage)
      stages.push({
        at: next.time,
        stage,
        takerId: r?.takerId,
        retrievalOwnerId: r?.retrieval?.playerId,
        ball: next.ball,
      });
    const pending = next.pendingStrike;
    if (pending && !strikes.has(pending.id)) {
      const speed = Math.hypot(
        next.ball.velocity?.x ?? 0,
        next.ball.velocity?.y ?? 0,
        next.ball.velocity?.z ?? 0,
      );
      strikes.set(pending.id, {
        id: pending.id,
        actorId: pending.actorId,
        selectedAt: pending.selectedAt,
        intendedContactAt: pending.selectedAt + pending.path.onset,
        expectedReceivingOpportunity: pending.passDiagnostic.selectionQuality?.expectedCompletion,
        outcome: 'unresolved',
      });
      const difficulty = speed < 1 ? 'stationary_or_slow' : speed < 5 ? 'moving' : 'fast';
      if (!examples.has(difficulty))
        examples.set(difficulty, {
          difficulty,
          id: pending.id,
          initial: reload(previous),
          selected: pending,
          ball: next.ball,
          speed,
        });
    }
    const strike = next.lastStrikeResolution;
    if (strike && strike.at >= initial.time) {
      strikes.set(strike.id, { ...strikes.get(strike.id), ...strike });
      for (const example of examples.values())
        if (example.id === strike.id) example.result = strike;
    }
    for (const pass of [next.lastResolvedPass, next.lastPassDiagnostic].filter(Boolean)) {
      const old = passes.get(pass.passId);
      const actualReceiverId = pass.actualReceiverId ?? pass.intendedReceiverId;
      passes.set(pass.passId, {
        ...old,
        ...pass,
        completionCredit: passCompletionCredit(pass),
        canonicalAttemptObserved:
          next.statistics?.observedPassAttemptIds.includes(pass.passId) ?? false,
        ...(pass.finalResult === 'completed' &&
        pass.resolvedAt !== undefined &&
        next.time > pass.resolvedAt
          ? {
              teamRetainedAtFirstObservedFollowingTick:
                old?.teamRetainedAtFirstObservedFollowingTick ??
                next.possessionTeam === next.statistics?.playerTeams?.[actualReceiverId],
            }
          : {}),
      });
    }
    if (
      next.lastGroundContact?.at !== previous.lastGroundContact?.at &&
      next.lastGroundContact?.at >= initial.time
    )
      contacts.push(next.lastGroundContact);
    if (Math.floor(previous.time / 60) !== Math.floor(next.time / 60)) {
      snapshot();
      minutes.push({
        from: lastMinute.time,
        to: next.time,
        decisions: next.decisionIndex - lastMinute.decisionIndex,
        transport,
        status: next.status,
      });
      const player = next.players.find((p) => p.id === fixture.controlledPlayer);
      if (player)
        fitness.push({
          at: next.time,
          fitness: player.fitness,
          locomotion: player.locomotionTelemetry,
        });
      lastMinute = next;
      transport = 0;
      console.log('PR217', name, Math.round(next.time), next.status, next.decisionIndex);
    }
  }
  snapshot();
  const result = {
    source: source.fingerprint,
    name,
    initial: reload(initial),
    initialHash: hash(reload(initial)),
    terminal: reload(state),
    terminalHash: hash(reload(state)),
    reason,
    totalTicks,
    wallSeconds: (performance.now() - began) / 1000,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
    decisions,
    stages,
    periods,
    contacts,
    fitness,
    minutes,
    checkpoints,
    passes: [...passes.values()].sort((a, b) => (a.passId < b.passId ? -1 : 1)),
    strikes: [...strikes.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    examples: [...examples.values()],
    ...(state.safetyHalt || reason === 'unchanged' || reason === 'action_starvation'
      ? { failureWindow: history }
      : {}),
  };
  emit(`${ROOT}/${name}-${version}.json.gz`, result);
  emit(`${ROOT}/${name}-summary-${version}.json`, {
    ...result,
    initial: undefined,
    terminal: undefined,
    failureWindow: undefined,
    contacts: result.contacts.length,
    passes: result.passes.length,
    strikes: result.strikes.length,
    examples: result.examples.map((e) => ({
      id: e.id,
      difficulty: e.difficulty,
      speed: e.speed,
      outcome: e.result?.outcome,
    })),
    decisions: result.decisions.length,
  });
  return result;
};

if (full) {
  const kind = process.argv.find((x) => x.startsWith('--arm='))?.slice(6) ?? 'incident';
  let initial;
  if (kind === 'incident') initial = incident.initial;
  else if (kind === 'input') initial = fixture.initial;
  else if (kind === 'checkpoint') initial = checkpoint.initial;
  else if (kind === 'baseline')
    initial = JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr214/holistic-input-ci-v1.json.gz')),
    ).baseline;
  else throw new Error(`Unknown arm ${kind}`);
  const result = run(`full-${kind}`, initial, 10000, kind !== 'baseline');
  assert.equal(result.reason, 'full_time', 'A blocked full match remains a failed receipt');
} else {
  const contact = run('incident', incident.initial, check ? 2 : 45);
  assert.equal(contact.terminal.safetyHalt, undefined);
  assert.equal(contact.terminal.executionWitnesses.unresolved, undefined);
  assert.ok(
    contact.contacts.some(
      (c) => c.actorId === 'footballer_pro_9_19' && Math.abs(c.at - 295.70356882032144) < 1e-7,
    ),
  );
  const restart = run('throw-in', checkpoint.initial, check ? 40 : 60);
  assert.equal(restart.terminal.safetyHalt, undefined);
  assert.equal(restart.terminal.substitutionState.pending.length, 0);
  assert.ok(restart.stages.some((s) => s.stage.endsWith(':approach:preparing')));
  assert.ok(restart.stages.some((s) => s.stage.endsWith(':placed:release')));
  assert.ok(restart.stages.some((s) => s.stage === 'open_play'));
  const frozen = stepTacticalMatch(reload(incident.originalTerminal), 0.025);
  assert.equal(frozen.safetyHalt.reason, 'initial_penetration');
  assert.equal(frozen.time, incident.originalTerminal.time);
  assert.equal(stepTacticalMatch(frozen, 0.025), frozen);
  emit(`${ROOT}/local-summary-${version}.json`, {
    source: source.fingerprint,
    incidentSeconds: contact.terminal.time,
    restartSeconds: restart.terminal.time,
    blockedState: frozen.safetyHalt,
    promotion: 'RETAIN_EXPERIMENTAL',
  });
}
