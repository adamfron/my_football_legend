import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  createPr210Carry,
  createPr210Cases,
  tracePr210Carry,
  pr210Frame,
} from './pr210Scenarios.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
const options = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const output = resolve(options.get('output') ?? 'docs/performance/pr210/after.json.gz');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const start = performance.now(),
  cpu = process.cpuUsage();
const cases = { sprint: createPr210Carry(), ...createPr210Cases() };
const rows = Object.entries(cases).map(([name, initial]) => {
  const { state, frames } = tracePr210Carry(initial);
  return {
    name,
    initial,
    frames,
    finalHash: digest(state),
    prematurePrompts: frames.filter((f) => f.decision?.kind === 'on_ball' && !f.readiness.ready)
      .length,
    firstFiniteContact:
      frames.find((f) => f.contact?.executed && f.contact.at === f.time)?.time ?? null,
    firstRecovery: frames.find((f) => f.recovery?.at === f.time)?.recovery ?? null,
    firstDecision: frames.find((f) => f.decision)?.time ?? null,
    forwardDistance: frames.at(-1).actor.position.x - frames[0].actor.position.x,
    pursuitReversals: frames.filter(
      (f, i) => i > 0 && f.carry && frames[i - 1].actor.velocity.x >= 0 && f.actor.velocity.x < 0,
    ).length,
  };
});
// Engineering parity only: bypass the pause observer in BOTH editions; never
// consume these diagnostic frames as the current UI or an interactive decision.
let prescribed = createPr210Carry();
const physical = [];
for (let i = 0; i < 140; i++) {
  prescribed = stepTacticalMatchAfterDecisionProbe(prescribed, 0.025);
  physical.push({
    time: prescribed.time,
    players: prescribed.players,
    ball: prescribed.ball,
    contact: prescribed.lastGroundContact,
    recovery: prescribed.lastBallRecovery,
  });
}
const variants = [
  [0.6, 3, 0, 2],
  [2.2, 7, Math.PI / 2, 6],
  [4, 12, Math.PI, 3],
  [7, 20, 0, 0],
].map(([gap, speed, facing, body]) => {
  const state = createPr210Carry(gap, speed),
    actor = state.players.find((p) => p.id === state.controlledFootballerId);
  actor.facingAngle = facing;
  actor.velocity = { x: body, y: 0 };
  const result = tracePr210Carry(state);
  return {
    config: { gap, speed, facing, body },
    frames: result.frames,
    finalHash: digest(result.state),
  };
});
const projectionState = createPr210Carry(),
  projection = pr210Frame(projectionState);
const probeStart = performance.now();
for (let i = 0; i < 1000; i++) pr210Frame(projectionState);
const result = {
  rows,
  variants,
  physical,
  physicalHash: digest(physical),
  projection,
  sameSeed: 'pr210:right-back:carry',
  fixedStep: 0.025,
};
const usage = process.cpuUsage(cpu);
const receipt = {
  arm: options.get('arm') ?? 'after',
  result,
  resultHash: digest(result),
  performance: {
    wallSeconds: (performance.now() - start) / 1000,
    cpuSeconds: (usage.user + usage.system) / 1e6,
    peakRSSKiB: process.resourceUsage().maxRSS,
    thousandProbesSeconds: (performance.now() - probeStart) / 1000,
  },
  node: process.version,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, gzipSync(JSON.stringify(receipt), { level: 9 }));
console.log(
  JSON.stringify({
    output,
    hash: receipt.resultHash,
    physicalHash: result.physicalHash,
    performance: receipt.performance,
    rows: rows.map((r) => ({
      name: r.name,
      premature: r.prematurePrompts,
      contact: r.firstFiniteContact,
      recovery: r.firstRecovery,
      decision: r.firstDecision,
      final: r.frames.at(-1).scenario,
    })),
  }),
);
