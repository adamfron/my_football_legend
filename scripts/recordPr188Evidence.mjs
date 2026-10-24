import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const json = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
// Windows PowerShell 5 transcripts are UTF-16LE; preserve their raw archive bytes
// while parsing both those transcripts and UTF-8 Node/PowerShell 7 logs.
const transcript = (p) => {
  const bytes = readFileSync(p);
  return bytes
    .toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8')
    .replace(/^\uFEFF/, '');
};
const source = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const sourceSha256 = sha(source);
if (process.argv.includes('--check')) {
  const index = json('docs/performance/PR188-evidence-index.json');
  if (sourceSha256 !== index.sourceSha256) throw Error('Source changed');
  for (const a of index.artifacts) {
    const bytes = readFileSync(a.path);
    if (sha(bytes) !== a.sha256) throw Error(`Artifact changed: ${a.path}`);
  }
  console.log(JSON.stringify({ checked: index.artifacts.length, sourceSha256 }));
} else {
  const historical = json('docs/performance/PR188-baseline.json');
  for (const f of historical.historical) {
    const v = f.path.endsWith('.json')
      ? readFileSync(f.path, 'utf8').replaceAll('\r\n', '\n')
      : readFileSync(f.path);
    if (sha(v) !== f.sha256) throw Error(`Historical evidence modified: ${f.path}`);
  }
  const labs = json('docs/performance/PR188-labs-relative-optimized.json');
  if (labs.sourceSha256 !== sourceSha256) throw Error('Final laboratory source differs from head');
  const research = json('docs/performance/PR188-research-optimized.json');
  if (research.sourceSha256 !== sourceSha256) throw Error('Research source differs from head');
  const baseline = json('docs/performance/PR188-labs-baseline-v2.json');
  const passive = json('docs/performance/PR188-labs-baseline-passive-final.json');
  const matrix = json('docs/performance/PR188-full-matrix-status.json');
  if (matrix.results.length !== 15) throw Error('Incomplete development matrix');
  const verificationLog = transcript('../pr188-verify-complete.log');
  const exitCode = Number(transcript('../pr188-verify-complete-exit.txt').trim());
  if (exitCode !== 0) throw Error('Verification did not pass');
  const testStages = [...verificationLog.matchAll(/Tests\s+(\d+) passed/g)].map((m) =>
    Number(m[1]),
  );
  if (testStages.length !== 4) throw Error('Incomplete test stages');
  const replayLog = transcript('../pr188-optimized-replay.log');
  if (!replayLog.includes('"trials":240') || replayLog.includes('mismatch'))
    throw Error('Missing observer-off replay');
  const matches = matrix.results.map((r) => {
    const path = `docs/performance/PR188-match-${r.design}-${r.policy}-full-observed-final-v1.json`;
    if (!existsSync(path)) return { ...r, archiveMissing: true };
    const receipt = json(path);
    if (receipt.sourceSha256 !== sourceSha256) throw Error(`Match source mismatch: ${path}`);
    const bytes = readFileSync(receipt.archive);
    if (sha(bytes) !== receipt.archiveSha256) throw Error('Match archive mismatch');
    const payload = jsonFromGzip(bytes);
    if (sha(payload.finalState) !== receipt.finalStateSha256)
      throw Error(`Final state hash mismatch: ${path}`);
    const players = payload.finalState.statistics?.players ?? [];
    const sum = (key) => players.reduce((n, p) => n + (p[key] ?? 0), 0);
    const depth = {};
    for (const side of ['home', 'away']) {
      const points = (payload.depthSamples ?? [])
        .filter(
          (d) => d.side === side && ['positional_attack', 'attacking_transition'].includes(d.phase),
        )
        .flatMap((d) => d.forwards);
      depth[side] = {
        samples: points.length,
        meanFromLastLine: mean(points.map((p) => p.fromLastLine)),
        meanFromMidfield: mean(points.map((p) => p.fromMidfield)),
      };
    }
    return {
      ...r,
      path,
      archive: receipt.archive,
      sourceSha256: receipt.sourceSha256,
      score: receipt.score,
      status: receipt.status,
      failure: receipt.failure,
      canonicalSeconds: receipt.canonicalSeconds,
      finalStateSha256: receipt.finalStateSha256,
      counts: receipt.counts,
      passesAttempted: sum('passesAttempted'),
      passesCompleted: sum('passesCompleted'),
      shots: sum('shots'),
      fouls: sum('foulsCommitted'),
      maxStationarySeconds: receipt.maxStationarySeconds,
      maxOwnerSeconds: receipt.maxOwnerSeconds,
      cpuMicroseconds: receipt.cpuMicroseconds,
      wallMilliseconds: receipt.wallMilliseconds,
      rssBytes: receipt.rssBytes,
      depth,
    };
  });
  const pairs = [
    [40, 40],
    [60, 60],
    [80, 80],
    [40, 80],
    [80, 40],
  ].map(([skill, opposition]) => {
    const group = (r, active = true) =>
      r.rows.filter(
        (x) =>
          x.config.skill === skill &&
          x.config.opposition === opposition &&
          (active ? x.config.situation !== 'passive' : x.config.situation === 'passive'),
      );
    const describe = (rows) => ({
      variants: rows.length,
      releases: rows.reduce((n, r) => n + r.releases, 0),
      holds: rows.reduce((n, r) => n + (r.selectedTypes.hold ?? 0), 0),
      maxStationary: Math.max(...rows.map((r) => r.maxStationary)),
      retainedAtEnd: rows.filter((r) => r.firstChange === null).length,
    });
    return {
      skill,
      opposition,
      baseline: describe(group(baseline)),
      revised: describe(group(labs)),
      passiveBaseline: describe(group(passive, false)),
      passiveRevised: describe(group(labs, false)),
    };
  });
  const candidateDisposition = labs.rows.map((r) => ({
    config: r.config,
    candidates: r.initial.candidates.map((c) => ({
      id: c.id,
      reason:
        c.legal === false
          ? 'observed_offside'
          : !c.feasible
            ? 'contact_unavailable_now'
            : c.readyAt > r.initial.scene.at
              ? 'preparation_required'
              : c.closesAt <= r.initial.scene.at
                ? 'expired'
                : c.id === r.initial.decision.selectedCandidateId
                  ? 'selected'
                  : c.id === r.initial.decision.preparationCandidateId
                    ? 'preparing'
                    : 'not_selected_by_policy_comparison',
    })),
  }));
  const changedPsychology = research.psychology.filter(
    (p) =>
      p.enabled &&
      research.psychology.some(
        (q) =>
          q.label === p.label &&
          q.mentality === p.mentality &&
          !q.enabled &&
          q.decision.selectedCandidateId !== p.decision.selectedCandidateId,
      ),
  ).length;
  const fullBarePath = 'docs/performance/PR188-possession-diagnosis.json';
  const fullBare = json(fullBarePath);
  const fullObserved = matches.find(
    (m) => m.design === 'dev-ww' && m.policy === 'opportunity-driven-v1',
  );
  const fullObservedReceipt = json(fullObserved.path);
  const fullBareBytes = readFileSync(fullBare.archive);
  const fullBareState = jsonFromGzip(fullBareBytes).finalState;
  const fullObservedState = jsonFromGzip(readFileSync(fullObservedReceipt.archive)).finalState;
  const canonicalFinalStateSha256 = sha(canonical(fullBareState));
  if (
    sha(fullBareBytes) !== fullBare.archiveSha256 ||
    sha(fullBareState) !== fullBare.finalStateSha256 ||
    fullBare.sourceSha256 !== sourceSha256 ||
    fullBare.failure !== fullObservedReceipt.failure ||
    fullBare.status !== fullObservedReceipt.status ||
    canonicalFinalStateSha256 !== sha(canonical(fullObservedState)) ||
    fullBare.inputSha256 !== fullObservedReceipt.inputSha256
  )
    throw Error('Full-match observer-off replay mismatch');
  const fullReplayComparison = {
    schemaVersion: 1,
    observedReceipt: fullObserved.path,
    diagnosticReceipt: fullBarePath,
    sameInputs: true,
    equalRawFinalStateSha256: fullBare.finalStateSha256 === fullObserved.finalStateSha256,
    observedRawSha256: fullObserved.finalStateSha256,
    diagnosticRawSha256: fullBare.finalStateSha256,
    equalCanonicalFinalStateSha256: true,
    canonicalFinalStateSha256,
    explanation:
      'The diagnostic input was rehydrated from archived JSON. All final state values are identical; only object-key insertion order differs in departedPlayers[8]. Raw-order checksum failure is retained in the original diagnostic receipt/log. Canonical comparison sorts object keys recursively and preserves every array order and value.',
  };
  writeFileSync(
    'docs/performance/PR188-full-replay-comparison.json',
    JSON.stringify(fullReplayComparison, null, 2) + '\n',
  );
  const verification = {
    schemaVersion: 1,
    sourceSha256,
    command: 'npm run verify',
    exitCode,
    testStages,
    totalTests: testStages.reduce((a, b) => a + b, 0),
    node: process.version,
    environment: { NODE_OPTIONS: '--max-semi-space-size=64', VITEST_MAX_WORKERS: '1' },
    log: 'docs/performance/pr188-run-logs/pr188-verify-complete.log',
    logSha256: sha(readFileSync('../pr188-verify-complete.log')),
    targetedRegressionTests: 26,
    laboratoryObserverOffReplay: {
      variants: 240,
      equalFinalStateHashes: true,
      log: 'docs/performance/pr188-run-logs/pr188-optimized-replay.log',
    },
    fullMatchObserverOffReplay: {
      design: 'dev-ww',
      policy: 'opportunity-driven-v1',
      receipt: fullBarePath,
      equalInputs: true,
      equalRawFinalStateHashes: fullReplayComparison.equalRawFinalStateSha256,
      equalCanonicalFinalStateHashes: true,
      canonicalFinalStateSha256,
      comparison: 'docs/performance/PR188-full-replay-comparison.json',
      status: fullBare.status,
      failure: fullBare.failure,
      scope:
        'Bounded trace and flow observers disabled; pure diagnostic inspections at fixed stationary-duration thresholds remain. One representative development repeat, not a new independent design.',
    },
    browser: 'docs/performance/PR188-browser.json',
    ci: 'Final-head CI is checked and linked in the pull request, not inferred from local verification.',
  };
  writeFileSync(
    'docs/performance/PR188-verification.json',
    JSON.stringify(verification, null, 2) + '\n',
  );
  for (const p of readdirSync('..').filter((p) => p.startsWith('pr188-') && /\.log$/.test(p))) {
    const destination = `docs/performance/pr188-run-logs/${p}`;
    if (existsSync(destination) && sha(readFileSync(destination)) !== sha(readFileSync(`../${p}`)))
      throw Error(`Preserve existing log: ${destination}`);
    if (!existsSync(destination)) copyFileSync(`../${p}`, destination);
  }
  const table = [
    '| Matchup | Active variants | Releases, PR187 → PR188 | Holds, PR187 → PR188 | Longest stationary seconds, PR187 → PR188 |',
    '|---|---:|---:|---:|---:|',
    ...pairs.map(
      (p) =>
        `| ${p.skill}:${p.opposition} | ${p.revised.variants} | ${p.baseline.releases} → ${p.revised.releases} | ${p.baseline.holds} → ${p.revised.holds} | ${p.baseline.maxStationary.toFixed(3)} → ${p.revised.maxStationary.toFixed(3)} |`,
    ),
  ].join('\n');
  const passiveTable = [
    '| Matchup | Passive retained through 12s, PR187 → PR188 | Longest stationary seconds, PR187 → PR188 |',
    '|---|---:|---:|',
    ...pairs.map(
      (p) =>
        `| ${p.skill}:${p.opposition} | ${p.passiveBaseline.retainedAtEnd}/6 → ${p.passiveRevised.retainedAtEnd}/6 | ${p.passiveBaseline.maxStationary.toFixed(3)} → ${p.passiveRevised.maxStationary.toFixed(3)} |`,
    ),
  ].join('\n');
  const matchTable = [
    '| Design / policy | Status | Score | Passes completed / attempted | Physical shots | Max stationary / same-owner seconds | CPU seconds |',
    '|---|---|---|---:|---:|---:|---:|',
    ...matches.map(
      (m) =>
        `| ${m.design} / ${m.policy} | ${m.status ?? 'missing'}${m.failure ? ' / FAILED' : ''} | ${m.score ? `${m.score.home}–${m.score.away}` : '—'} | ${m.passesCompleted ?? '—'}/${m.passesAttempted ?? '—'} | ${m.shots ?? '—'} | ${m.maxStationarySeconds?.toFixed(2) ?? '—'} / ${m.maxOwnerSeconds?.toFixed(2) ?? '—'} | ${m.cpuMicroseconds ? ((m.cpuMicroseconds.user + m.cpuMicroseconds.system) / 1e6).toFixed(1) : '—'} |`,
    ),
  ].join('\n');
  const depthTable = [
    '| Design / policy | Home striker vs last line / midfield (m) | Away striker vs last line / midfield (m) |',
    '|---|---:|---:|',
    ...matches
      .filter((m) => m.depth)
      .map(
        (m) =>
          `| ${m.design} / ${m.policy} | ${fmt(m.depth.home.meanFromLastLine)} / ${fmt(m.depth.home.meanFromMidfield)} | ${fmt(m.depth.away.meanFromLastLine)} / ${fmt(m.depth.away.meanFromMidfield)} |`,
      ),
  ].join('\n');
  const completed = matches.filter((m) => m.status === 'full_time' && !m.failure).length;
  const zeroShots = matches.filter((m) => m.shots === 0).map((m) => `${m.design}/${m.policy}`);
  const gates = `| Gate | Decision |\n|---|---|\n| 1 — reproduce | Local mechanism and frozen development evidence; exact human exports unavailable |\n| 2 — relative knowledge | Experimental geometry/mobility model; richer scouted technical priors deferred |\n| 3 — liveness | FAILED in full WW: multi-minute stationary episodes remain despite local paired improvements |\n| 4 — defence | Exposed-contact regression and autonomous episodes; historical controller retained |\n| 5 — psychology | Optional/off by default; controlled on/off only, not empirical calibration |\n| 6 — restarts | Kick-off and quick/prepared human flow tested; visual wall consistency remains open |\n| 7 — full development | ${completed}/15 finish; completion does not validate liveness or attacking creation; all negative outcomes retained |\n| 8 — independent readiness | NOT READY / sealed cohort NOT RUN |\n| 9 — engineering | Local verify PASS (${verification.totalTests} tests); final CI in PR |`;
  let report = readFileSync(
    'docs/PR188_RELATIVE_DECISION_MAKING_AND_MATCH_STABILIZATION.md',
    'utf8',
  );
  const replace = (tag, body) => {
    const a = `<!-- ${tag}_START -->`,
      b = `<!-- ${tag}_END -->`,
      lo = report.indexOf(a),
      hi = report.indexOf(b);
    if (lo < 0 || hi < lo) throw Error('Missing report marker');
    report = report.slice(0, lo + a.length) + '\n\n' + body + '\n\n' + report.slice(hi);
  };
  replace('GATES', gates);
  replace(
    'LABS',
    `${table}\n\nThe 210 active variants are compared separately from 30 human-retain variants. Releases are actual pass/shot launches, not action intentions or completed passes. Earlier cooldown-based passive variants are superseded apparatus, not passive validation.\n\n${passiveTable}\n\nMoving human protection may retain ownership without stationary paralysis. A 12-second retained episode alone cannot establish an indefinite stable equilibrium.\n\nResearch: ${research.counts.physical} physical trials, ${research.counts.psychology} psychology variants, ${research.counts.learning} knowledge sequences, ${research.counts.walls} wall variants. Psychology changes ${changedPsychology}/16 paired initial selections; technical attributes remain separate. Full inputs, actions, contact and outcomes are in the compressed research archive.`,
  );
  replace(
    'MATCHES',
    `${matchTable}\n\n${completed}/15 variants finish. ${zeroShots.length ? `Zero-shot variants remain: ${zeroShots.join(', ')}.` : 'A physically released shot occurs in every variant; this alone does not validate attacking quality.'} Scores and shot counts are observations, not calibration targets. CPU is per process; two simulations share the host. Complete telemetries preserve progression, receiving, challenges, restarts, fouls and other football consequences.\n\n${depthTable}\n\nDepth means use attacking phases only. Negative last-line distance means short of the opponent second-last line in the attacking direction; positive means closer to the goal. Negative midfield distance means deeper than own midfield. These are formation/phase observations, not causal proof of a positioning repair.`,
  );
  replace(
    'VERIFY',
    `Local npm run verify: **PASS**, ${verification.totalTests} tests (${testStages.join(' + ')}), lint, TypeScript and production build. All stages are retained; no timeout or test budget was relaxed. Twenty-six targeted PR188 tests cover liveness, evidence boundaries and real restarts. Complete observer-off replay preserves 240 final physical/runtime hashes. The verification receipt names source ${sourceSha256}; final-head CI is linked in the PR. Earlier failed/interrupted runs remain in the evidence index.`,
  );
  writeFileSync('docs/PR188_RELATIVE_DECISION_MAKING_AND_MATCH_STABILIZATION.md', report);
  const artifacts = readdirSync('docs/performance', { recursive: true })
    .map((p) => p.replaceAll('\\', '/'))
    .filter(
      (p) =>
        /pr188/i.test(p) &&
        p !== 'PR188-evidence-index.json' &&
        statSync(`docs/performance/${p}`).isFile(),
    )
    .sort()
    .map((p) => ({
      path: `docs/performance/${p}`,
      sha256: sha(readFileSync(`docs/performance/${p}`)),
    }));
  const index = {
    schemaVersion: 1,
    sourceSha256,
    source,
    base: historical.base,
    historicalFilesPreserved: historical.historical.length,
    humanExportsConsumed: false,
    independentConfirmation: 'NOT RUN; sealed',
    readiness: 'NOT READY for promotion or summary calibration',
    pairs,
    candidateDisposition,
    research: { ...research, psychologyChangedChoices: changedPsychology },
    matches,
    verification,
    fullReplayComparison,
    performance: json('docs/performance/PR188-performance.json'),
    artifacts,
    limits: [
      'Full WW falsifies general experimental-policy liveness: multi-minute open-play stationary episodes remain.',
      'Development designs are reused, not independent validation.',
      'Physical success forecasts remain uncalibrated.',
      'Legacy shared defensive/GK/restart controllers retain privileged state access.',
      'Wall visual/body width equivalence and broader communication/scouting remain open.',
    ],
  };
  writeFileSync(
    'docs/performance/PR188-evidence-index.json',
    JSON.stringify(index, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      sourceSha256,
      completed,
      variants: matches.length,
      historical: index.historicalFilesPreserved,
      artifacts: artifacts.length,
      tests: verification.totalTests,
    }),
  );
}
function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
function fmt(v) {
  return v === null ? '—' : v.toFixed(2);
}
function jsonFromGzip(bytes) {
  return JSON.parse(gunzipSync(bytes).toString('utf8'));
}
