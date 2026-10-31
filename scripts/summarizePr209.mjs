import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash } from './pr199Evidence.mjs';
const root = 'docs/performance/pr209';
const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
const inputs = Object.fromEntries(
  ['timing', 'retention', 'bounce'].map((k) => [k, read(`${root}/${k}-development-v1.json.gz`)]),
);
const { timing, retention, bounce } = Object.fromEntries(
  Object.entries(inputs).map(([k, v]) => [k, v.receipt.result]),
);
const describe = (values) => {
  const finite = values.filter((v) => v !== null && Number.isFinite(v));
  if (!finite.length) return { n: 0, missing: values.length };
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  return {
    n: finite.length,
    missing: values.length - finite.length,
    mean,
    sd: Math.sqrt(finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length),
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
};
const counts = (rows) =>
  Object.fromEntries(
    ['contact', 'miss', 'unavailable', 'unresolved'].map((k) => [
      k,
      rows.filter((r) => r.result.outcome === k).length,
    ]),
  );
const strata = [];
for (const speed of [0, 1, 3, 5, 8])
  for (const direction of ['approaching', 'departing', 'crossing']) {
    const rows = timing.rows.filter(
      (r) => r.config.speed === speed && r.config.direction === direction,
    );
    strata.push({
      speed,
      direction,
      attempts: rows.length,
      ...counts(rows),
      outgoingSpeed: describe(
        rows.map((r) =>
          r.result.contact ? Math.hypot(...Object.values(r.result.contact.outgoingVelocity)) : null,
        ),
      ),
      spin: describe(
        rows.map((r) =>
          r.result.contact ? Math.hypot(...Object.values(r.result.contact.outgoingSpin)) : null,
        ),
      ),
      timingResidual: describe(
        rows.map((r) =>
          r.result.contactAt === null ? null : r.result.contactAt - r.result.plannedContactAt,
        ),
      ),
    });
  }
const skills = [];
for (const primary of [25, 90])
  for (const technique of [25, 90])
    for (const preparationSeconds of [0.04, 0.24])
      for (const pressure of ['open', 'immediate']) {
        const rows = timing.skills.filter(
          (r) =>
            r.config.primary === primary &&
            r.config.technique === technique &&
            r.config.preparationSeconds === preparationSeconds &&
            r.config.pressure === pressure,
        );
        skills.push({
          primary,
          technique,
          preparationSeconds,
          pressure,
          attempts: rows.length,
          ...counts(rows),
          timingClipped: rows.filter((r) => r.error.timingClipped).length,
          outgoingX: describe(rows.map((r) => r.result.contact?.outgoingVelocity.x ?? null)),
          outgoingY: describe(rows.map((r) => r.result.contact?.outgoingVelocity.y ?? null)),
          spinZ: describe(rows.map((r) => r.result.contact?.outgoingSpin.z ?? null)),
        });
      }
const summary = {
  schema: 'pr209-summary-v1',
  source: inputs.timing.receipt.source,
  inputResults: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, hash(v.receipt)])),
  timing: {
    attempts: timing.rows.length,
    ...counts(timing.rows),
    strata,
    limits: timing.limits.map((r) => ({
      direction: r.direction,
      mirror: r.mirror,
      outcome: r.result.outcome,
      contactAt: r.result.contactAt,
      velocity: r.result.contact?.outgoingVelocity ?? null,
    })),
    examples: timing.rows
      .filter(
        (r) =>
          r.config.speed === 5 &&
          r.config.direction === 'crossing' &&
          !r.config.mirror &&
          [-0.01, 0, 0.01].includes(r.timingSeconds),
      )
      .map((r) => ({
        timingSeconds: r.timingSeconds,
        plannedAt: r.result.plannedContactAt,
        contactAt: r.result.contactAt,
        normal: r.result.contact?.normal ?? null,
        velocity: r.result.contact?.outgoingVelocity ?? null,
        spin: r.result.contact?.outgoingSpin ?? null,
        normalImpulse: r.result.normalImpulse,
        tangentImpulse: r.result.tangentImpulse,
      })),
    unexpected: timing.unexpected.map((r) => ({
      delta: r.delta,
      planHash: r.originalPlan,
      outcome: r.result.outcome,
      contactAt: r.result.contactAt,
      velocity: r.result.contact?.outgoingVelocity ?? null,
    })),
    maximumEvaluations: Math.max(...timing.rows.map((r) => r.result.evaluations)),
    maximumReceiptBytes: timing.maximumReceiptBytes,
    saveStateAdditionalBytes: timing.saveStateAdditionalBytes,
  },
  skills: {
    attempts: timing.skills.length,
    ...counts(timing.skills),
    strata: skills,
    qualification:
      'Exploratory paired engineering interventions; preparation budget is not a witnessed lawful recognition-to-wind-up history. PR206 compensation remains unestablished.',
  },
  retention: {
    discordances: retention.rows.length,
    preservedCounts: read('docs/performance/pr208/summary.json').continuations.filter((r) =>
      r.key.startsWith('pass/'),
    ),
    rows: retention.rows.map((r) => ({
      config: r.config,
      flags: r.flags,
      firstDivergence: Object.fromEntries(
        Object.entries(r.firstRecordedDivergence).map(([k, v]) => [k, v?.at ?? null]),
      ),
      arms: r.arms.map((a) => ({
        edition: a.edition,
        retained: a.outcome.teamPossessionAtOneSecond,
        touchAt: a.outcome.receiverTouchAt,
        controlAt: a.outcome.receiverControlAt,
        classification: a.classification,
        oneSecondAt: a.atOneSecond?.at ?? null,
        firstTouch: a.firstReceiverContact?.receptionOutcome?.quality ?? null,
        firstTouchRelativeSpeed:
          a.firstReceiverContact?.receptionOutcome?.contact?.relativeSpeed ?? null,
        fixedReceiverContactAt: a.physicalOnly.firstContact?.at ?? null,
        nextReleases: a.onwardDeliveries.map((d) => ({
          at: d.releasedAt,
          receiverId: d.action.receiverId,
          directTouch: d.outcome.directReceiverTouch,
          control: d.outcome.receiverControl,
          retention: d.outcome.teamPossessionAtOneSecond,
          censored: d.outcome.censored,
          terminal: d.outcome.terminal,
        })),
        finalHash: a.finalHash,
      })),
    })),
  },
  bounce: bounce.rows.map((r) => ({
    name: r.case.name,
    impacts: r.impacts.length,
    firstImpactAt: r.impacts[0]?.at ?? null,
    firstImpactX: r.impacts[0]?.position.x ?? null,
    apexSample: Math.max(r.initial.position.z, ...r.trajectory.map((r) => r.ball.position.z)),
    rollingAtHorizon: !r.trajectory.at(-1).ball.airborne,
    firstMotionEvidenceAt: r.observedContinuation.firstMotionEvidenceAt,
    firstTouchAt: r.observedContinuation.firstTouchAt,
    controlAt: r.observedContinuation.controlAt,
    retention: r.observedContinuation.teamPossessionAtOneSecond,
    oneSecondCensored: r.observedContinuation.oneSecondSample === null,
    nextActions: r.observedContinuation.actions.map((a) => ({
      at: a.at,
      type: a.action?.type,
      actorId: a.action?.actorId,
    })),
  })),
  costs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.costs])),
  integration: {
    researchChange:
      'Bounded low inside-foot temporal contact foundation and retained-continuation diagnosis',
    maintainedCandidate: 'realism-candidate-v1 / PR201 unchanged',
    defaultPolicy: 'B',
    confirmation: 'sealed',
    promotion: 'RETAIN_EXPERIMENTAL; live temporal integration BLOCKED_BY_DEPENDENCY',
    nextDependency:
      'Persist and arbitrate intentional strike preparation/contact on canonical body and ball segments, including misses and competing contacts, before live integration or broader skill claims',
    fullMatchMatrix: 'withheld; no local live temporal integration gate passed',
  },
};
const output = JSON.stringify(summary, null, 2) + '\n';
if (process.argv.includes('--check'))
  assert.equal(readFileSync(`${root}/summary.json`, 'utf8'), output, 'PR209 summary drift');
else writeFileSync(`${root}/summary.json`, output, { flag: 'wx' });
console.log(
  JSON.stringify({
    timing: { attempts: summary.timing.attempts, ...counts(timing.rows) },
    skills: { attempts: summary.skills.attempts, ...counts(timing.skills) },
    discordances: summary.retention.discordances,
    bounce: summary.bounce.map(({ name, retention, controlAt }) => ({
      name,
      retention,
      controlAt,
    })),
  }),
);
