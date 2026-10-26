import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { hash, writeReceipt, manifest, retainPr194Source } from './pr194Evidence.mjs';
import { readPr194Evidence } from './readPr194Evidence.mjs';
const fixtures = [
  ['ww', 'opportunity-driven-v1'],
  ['ww', 'hierarchical-intent-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'hierarchical-intent-v1'],
];
const check = process.argv.includes('--check'),
  source = manifest(),
  sourceHash = hash(source);
const runnerHash = hash(
  readFileSync('scripts/analyzePr194Circulation.mjs', 'utf8').replaceAll('\r\n', '\n'),
);
const cachePath = '../pr194-circulation-work-v4.json';
const cache = !check && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath)) : null;
if (cache && (cache.sourceHash !== sourceHash || cache.runnerHash !== runnerHash))
  throw Error('Analysis cache has different provenance');
const rows = cache?.rows ?? [];
for (const [design, policy] of fixtures) {
  if (rows.some((r) => r.design === design && r.policy === policy)) continue;
  const path = `docs/performance/pr194/matches/${design}-${policy}-combined-v4.json`;
  if (!existsSync(path) && !check) {
    console.log(design, policy, 'awaiting complete fixture');
    continue;
  }
  const r = readPr194Evidence(path),
    capture = r.capture;
  if (hash(readFileSync(capture.path)) !== capture.sha256) throw Error('Capture bytes changed');
  let s = JSON.parse(gunzipSync(readFileSync(capture.path)));
  if (hash(s) !== capture.stateHash) throw Error('Capture state changed');
  const start = s.time,
    decisions = [],
    releases = [];
  withBoundedObserver(
    (t) => {
      if (t.stage !== 'decision' || !t.scene || decisions.length >= 128) return;
      const chosen = t.candidates?.find((c) => c.id === t.decision?.selectedCandidateId),
        top = [...(t.candidates ?? [])].sort((a, b) => b.benefit - a.benefit);
      const brief = (c) =>
        c
          ? {
              id: c.id,
              kind: c.action.type,
              goal: c.goal,
              benefit: c.benefit,
              risk: c.risk,
              progress: c.progress,
              feasible: c.feasible,
              readyAt: c.readyAt,
              closesAt: c.closesAt,
              legal: c.legal ?? null,
            }
          : null;
      decisions.push({
        at: t.at,
        actorId: t.actorId,
        position: t.scene.position,
        selected: brief(chosen),
        prepared: t.decision?.preparationCandidateId ?? null,
        reasons: t.decision?.reasons ?? [],
        continuation: t.decision?.continuation,
        available: t.candidates?.length ?? 0,
        passOptions: t.candidates?.filter((c) => c.action.type === 'pass').length ?? 0,
        shotOptions: t.candidates?.filter((c) => c.action.type === 'shot').length ?? 0,
        progressiveOptions: t.candidates?.filter((c) => c.progress > 5).length ?? 0,
        unreadyBetter: top
          .filter((c) => chosen && c.benefit > chosen.benefit && (!c.feasible || c.readyAt > t.at))
          .map(brief)
          .slice(0, 3),
        best: brief(top[0]),
        bestCarry: brief(top.find((c) => c.action.type === 'carry')),
        bestShot: brief(top.find((c) => c.action.type === 'shot')),
        top: top.slice(0, 3).map(brief),
        observations: t.scene.knowledge ?? null,
        visibleIds: t.scene.visible.map((p) => p.id),
        rememberedIds: t.scene.remembered?.map((p) => p.id) ?? [],
      });
    },
    () => {
      for (let tick = 0; tick < 4800; tick++) {
        const before = s;
        s = step(s, 0.025);
        const p = s.lastPassDiagnostic;
        if (p && p.passId !== before.lastPassDiagnostic?.passId && releases.length < 128)
          releases.push({
            at: p.releasedAt,
            passerId: p.passerId,
            receiverId: p.intendedReceiverId,
            target: p.intendedTarget ?? p.predictedReceptionPoint,
          });
      }
    },
  );
  rows.push({
    design,
    policy,
    fullMatch: { passes: r.passes, shots: r.shots, reasons: r.perception.reasons },
    sourceMatch: path,
    capture,
    inputHash: capture.stateHash,
    start,
    seconds: s.time - start,
    finalHash: hash(s),
    decisions,
    releases,
    counts: {
      retainedDecisions: decisions.length,
      noObservedProgressive: decisions.filter((d) => !d.progressiveOptions).length,
      noShotCandidate: decisions.filter((d) => !d.shotOptions).length,
      higherBenefitUnready: decisions.filter((d) => d.unreadyBetter.length).length,
      choiceBelowBestBenefit: decisions.filter(
        (d) => d.selected && d.best && d.selected.benefit < d.best.benefit - 1e-8,
      ).length,
    },
    interpretationLimit:
      'Deterministic two-minute development prefix from a genuine checkpoint; does not measure all match decisions or prove an unseen alternative existed.',
  });
  console.log(design, policy, 'decisions', decisions.length, 'releases', releases.length);
}
rows.sort(
  (a, b) =>
    fixtures.findIndex(([d, p]) => a.design === d && a.policy === p) -
    fixtures.findIndex(([d, p]) => b.design === d && b.policy === p),
);
if (!check) writeFileSync(cachePath, JSON.stringify({ sourceHash, runnerHash, rows }));
if (rows.length === 4) {
  if (check) {
    const old = JSON.parse(readFileSync('docs/performance/pr194/circulation-v4.json'));
    if (hash(old.rows) !== hash(rows)) throw Error('Causal prefix replay drift');
  } else
    writeReceipt('docs/performance/pr194/circulation-v4.json', {
      schema: 'mfl-pr194-causal-prefix-v1',
      source,
      sourceHash,
      runnerHash,
      sourceArchive: retainPr194Source(source),
      rows,
    });
} else
  console.log(
    'Retained',
    rows.length,
    'completed causal prefixes; final report waits for all four',
  );
