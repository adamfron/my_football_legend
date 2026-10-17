import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createPr171Fixture } from './pr171Fixtures';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import { PassingConnectivityTracker } from '../src/core/matchSimulation/passingConnectivityDiagnostics';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry';
import {
  stepTacticalMatchAfterDecisionProbe,
  FIXED_MATCH_DT,
} from '../src/core/matchSimulation/matchSimulation';
import {
  projectMatchCentreStatistics,
  matchCentreStatisticsSchema,
} from '../src/core/matchSimulation/matchCentreStatistics';
const fixture = createPr171Fixture('senior_balanced', false);
const performanceRowSchema = z.object({
  mode: z.enum(['plain', 'existing', 'extended']),
  wallMs: z.number().nonnegative(),
  canonicalSeconds: z.number(),
  ticks: z.literal(2400),
  finalStateHash: z.string(),
  official: matchCentreStatisticsSchema,
  flow: z
    .object({
      passesAttempted: z.number(),
      passesCompleted: z.number(),
      shots: z.number(),
      saves: z.number(),
      shotsBlocked: z.number(),
    })
    .nullable(),
  retainedDiagnosticsBytes: z.number().nonnegative(),
});
const rows: z.infer<typeof performanceRowSchema>[] = [];
let warmup = true;
for (const order of [
  ['plain', 'existing', 'extended'],
  ['plain', 'existing', 'extended'],
  ['extended', 'existing', 'plain'],
  ['plain', 'existing', 'extended'],
] as const) {
  for (const mode of order) {
    let state = structuredClone(fixture.state),
      flow = createMatchFlowTelemetry('pr171-parity');
    const funnel = new AttackingFunnelTracker(undefined, true, mode === 'extended');
    const passing = new PassingConnectivityTracker();
    const start = performance.now();
    for (let tick = 0; tick < 2400; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      if (mode !== 'plain') {
        funnel.observe(previous, state);
        passing.observe(previous, state);
        flow = observeMatchFlow(flow, previous, state);
      }
    }
    const wallMs = performance.now() - start;
    const official = projectMatchCentreStatistics(state);
    if (mode !== 'plain') {
      assertTelemetryInvariants(flow);
      if (
        flow.passesAttempted !== official.home.passesAttempted + official.away.passesAttempted ||
        flow.passesCompleted !== official.home.passesCompleted + official.away.passesCompleted
      )
        throw new Error('Flow/public statistics mismatch');
    }
    if (!warmup)
      rows.push(
        performanceRowSchema.parse({
          mode,
          wallMs,
          canonicalSeconds: state.time,
          ticks: 2400,
          finalStateHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
          official,
          flow:
            mode === 'plain'
              ? null
              : {
                  passesAttempted: flow.passesAttempted,
                  passesCompleted: flow.passesCompleted,
                  shots: flow.shots,
                  saves: flow.saves,
                  shotsBlocked: flow.shotsBlocked,
                },
          retainedDiagnosticsBytes:
            mode === 'plain'
              ? 0
              : Buffer.byteLength(
                  JSON.stringify({
                    funnel: funnel.snapshot(state.time),
                    passing: passing.snapshot(),
                    flow,
                  }),
                ),
        }),
      );
    console.log(`performance ${warmup ? 'warmup ' : ''}${mode} ${wallMs.toFixed(1)} ms`);
  }
  warmup = false;
}
if (new Set(rows.map((r) => r.finalStateHash)).size !== 1)
  throw new Error('Performance observer parity failed');
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const timings = Object.fromEntries(
  ['plain', 'existing', 'extended'].map((mode) => [
    mode,
    median(rows.filter((r) => r.mode === mode).map((r) => r.wallMs)),
  ]),
);
const fullMatchConfirmations = [false, true].flatMap((reversed) => {
  const path = `../pr171-full/confirm-youth_native-${reversed}.json`;
  if (!existsSync(path)) return [];
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  const enabled = receipt.observed;
  const disabled = receipt.equivalence.disabled;
  if (enabled.finalStateHash !== disabled.finalStateHash || enabled.ticks !== disabled.ticks)
    throw new Error('Full-match observer parity failed');
  return [
    {
      manifest: receipt.manifest,
      fixture: receipt.fixture,
      receiptSha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      enabled: {
        finalStateHash: enabled.finalStateHash,
        ticks: enabled.ticks,
        status: enabled.status,
        time: enabled.time,
        score: enabled.score,
      },
      disabled: {
        finalStateHash: disabled.finalStateHash,
        ticks: disabled.ticks,
        status: disabled.status,
        time: disabled.time,
        score: disabled.score,
      },
      completeCanonicalStateEqual: true,
    },
  ];
});
writeFileSync(
  'docs/performance/PR171-observer-equivalence.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'One unrecorded warmup per mode, then three serial alternating triples, 60 canonical seconds per run. Existing=flow+attacking+passing; extended adds audit. Plain disables optional research observers. Complete canonical JSON compared. Serialized bytes are retained payload, not V8 heap or save growth. Small timing samples do not establish a production performance gain.',
      timings,
      incrementalAuditRuntimePercent: (timings.extended / timings.existing - 1) * 100,
      allResearchRuntimePercent: (timings.extended / timings.plain - 1) * 100,
      completeStateEqual: true,
      fullMatchConfirmations,
      rows,
    },
    null,
    2,
  ),
);
