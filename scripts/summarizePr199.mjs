import { writeFileSync, readFileSync } from 'node:fs';
import console from 'node:console';
import { hash, read, ROOT, BASE, options, normalized } from './pr199Evidence.mjs';
import { catalogue } from './pr199Catalogue.mjs';
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const errors = (list) => {
  const valid = list.filter((r) => r.horizontal !== null),
    values = valid.map((r) => r.horizontal).sort((a, b) => a - b);
  return {
    eligible: list.length,
    predicted: valid.length,
    missing: list.length - valid.length,
    meanHorizontal: mean(values),
    p90Horizontal: values.length
      ? values[Math.min(values.length - 1, Math.floor(values.length * 0.9))]
      : null,
    maxHorizontal: values.at(-1) ?? null,
    meanHeight: mean(valid.map((r) => r.height)),
    meanAbsoluteSpeedError: mean(valid.map((r) => Math.abs(r.speedError))),
    meanDirectionError: mean(valid.map((r) => r.directionError).filter((v) => v !== null)),
  };
};
const group = (rows, key, aggregate) =>
  Object.fromEntries(
    [...new Set(rows.map(key))].sort().map((k) => [k, aggregate(rows.filter((r) => key(r) === k))]),
  );
const outcomes = (rows) => ({
  eligible: rows.length,
  touch: rows.filter((r) => r.outcome.directReceiverTouch).length,
  control: rows.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl).length,
  retained: rows.filter((r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond)
    .length,
  censored: rows.filter((r) => r.outcome.censored).length,
  noUsefulBallObservation: rows.filter((r) => r.firstUseful === null).length,
  noTrajectoryEstimate: rows.filter((r) =>
    'everTrajectoryEstimate' in r ? !r.everTrajectoryEstimate : r.firstUseful === null,
  ).length,
  noBallObservation: rows.filter((r) => r.observations === 0).length,
  meanAcquisitions: mean(rows.map((r) => r.observations)),
  meanOffered: mean(rows.map((r) => r.offeredSeconds)),
  meanAttended: mean(rows.map((r) => r.attendedSeconds)),
  memoryContinuationTicks: rows.reduce((n, r) => n + r.rememberedUses, 0),
});
const baseline = read(`${ROOT}/forensics-baseline-v1.json.gz`).result,
  forensic = read(`${ROOT}/forensics-changed-v1.json.gz`).result;
const changed = read(`${ROOT}/frozen-pr198.json`).changedContacts.map((c) => {
  const cases = forensic.rows.filter((r) => r.ballHash === c.ballHash),
    r = cases.find((r) => r.variant === 'R'),
    s = cases.find((r) => r.variant === 'S');
  const at = r.outcome.receiverTouchAt ?? s.outcome.receiverTouchAt;
  const near = (run) =>
    run.traces.reduce(
      (best, f) => (!best || Math.abs(f.at - at) < Math.abs(best.at - at) ? f : best),
      null,
    );
  const frame = near(s);
  const restored = cases
    .filter((x) => c.lostTouch && x.variant !== 'R' && x.outcome.directReceiverTouch)
    .map((x) => x.variant);
  return {
    ...c,
    ballHash: r.ballHash,
    variants: Object.fromEntries(
      cases.map((x) => [
        x.variant,
        {
          touch: x.outcome.directReceiverTouch,
          control: x.outcome.directReceiverTouch && x.outcome.receiverControl,
          retained: x.outcome.directReceiverTouch && x.outcome.teamPossessionAtOneSecond,
          touchAt: x.outcome.receiverTouchAt,
          terminal: x.outcome.terminal,
          finalHash: x.finalHash,
        },
      ]),
    ),
    restoredBy: restored,
    receiverR: near(r),
    receiverS: frame,
    noPreparedPlanReviews: s.planCalls.filter((f) => f.plan.status === 'no_prepared_contact')
      .length,
    explanation: c.gainedTouch
      ? 'Synchronization gains a real contact in this geometry; alternatives and actual control/retention remain separate.'
      : restored.includes('facing_incoming') || restored.includes('speed_legacy')
        ? 'Live facing and/or approach-speed intervention restores contact on the exact ball. Motor preparation is causally implicated; cadence interactions prevent a unique universal coefficient repair.'
        : restored.includes('accurate_fresh')
          ? 'Fresh engineering observation restores contact; finite-cadence/model/movement interaction remains precisely narrowed rather than assigned a unique cause.'
          : 'The lost contact remains narrowed to the recorded motor/observation traces; no isolated tested factor fully restores it.',
  };
});
const perception = read(`${ROOT}/perception-v3.json.gz`).result;
const normal = perception.rows.filter((r) => r.config.attribute === null);
const flattened = normal.flatMap((r) =>
  r.errors.map((e) => ({
    ...e,
    family: r.family,
    condition: r.config.condition,
    duration: r.config.duration,
    cues: r.config.cues,
    remainingToLowPlane:
      r.meetings[0]?.planeAt === null || r.meetings[0]?.planeAt === undefined
        ? null
        : r.meetings[0].planeAt - e.at,
  })),
);
const half = flattened.filter((e) => e.ahead === 0.5);
const receivers = read(`${ROOT}/receivers-visibility-v3.json.gz`).result,
  attrs = read(`${ROOT}/receivers-attributes-v3.json.gz`).result;
const keeperTables = Object.fromEntries(
  ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].map((version) => {
    const r = read(`${ROOT}/goalkeepers-${version}.json.gz`).result;
    const aggregate = (rows) => ({
      attempts: rows.length,
      contacts: rows.filter((r) => r.keeperContact).length,
      catches: rows.filter((r) => r.catch).length,
      parries: rows.filter((r) => r.parry).length,
      goals: rows.filter((r) => r.goal).length,
      noSight: rows.filter((r) => r.firstSight === null).length,
      meanFirstSight: mean(rows.map((r) => r.firstSight).filter((v) => v !== null)),
      meanFirstMovement: mean(rows.map((r) => r.reactionAt).filter((v) => v !== null)),
      directionCorrections: rows.reduce((n, r) => n + r.corrections, 0),
    });
    return [
      version,
      {
        summary: r.summary,
        byScenario: group(
          r.rows.filter((r) => r.config.attribute === null && !r.config.cues),
          (r) => `${r.scenario}/${r.config.native ? 'native' : 'belief'}`,
          aggregate,
        ),
        byAttribute: group(
          r.rows.filter((r) => r.config.attribute && r.config.attribute !== 'allKeeper'),
          (r) => `${r.config.attribute}/${r.config.level}`,
          aggregate,
        ),
        byCueAvailability: group(
          r.rows.filter((r) => r.config.attribute === null && !r.config.native),
          (r) => `${r.scenario}/${r.config.cues ? 'cue' : 'no-cue'}`,
          (list) => ({
            ...aggregate(list),
            offeredCue: list.filter((r) => r.cueOffered).length,
            acquiredCue: list.filter((r) => r.cueAcquired).length,
          }),
        ),
        source: r.source,
        costs: read(`${ROOT}/goalkeepers-${version}.json.gz`).costs,
      },
    ];
  }),
);
const contactErrors = receivers.rows.map((r) => {
  const time = r.outcome.receiverTouchAt;
  const f =
    time === null
      ? null
      : [...r.frames]
          .reverse()
          .find((f) => f.at <= time + 0.025 && f.plan?.contactPoint && f.plan?.contactAt !== null);
  const actual =
    time === null
      ? null
      : r.frames.find((f) => f.contacts.some((c) => c.actorId === r.outcome.contract.receiverId));
  return {
    family: r.family,
    sample: r.sample,
    controller: r.config.controller,
    condition: r.config.condition,
    cues: r.config.cues,
    actualContactAt: time,
    predictedContactAt: f?.plan?.contactAt ?? null,
    horizontal:
      f && actual
        ? Math.hypot(
            f.plan.contactPoint.x - (actual.reception?.contactPoint ?? actual.ball).x,
            f.plan.contactPoint.y - (actual.reception?.contactPoint ?? actual.ball).y,
          )
        : null,
    temporal: f && time !== null ? time - f.plan.contactAt : null,
    remainingAtPlanning: f && time !== null ? time - f.plan.plannedAt : null,
    actualPointSource: actual?.reception?.contactPoint
      ? 'canonical reception contact point'
      : 'post-contact tick ball approximation',
    limitation:
      'Tick-level post-contact ball position is an approximation; missing contact/plan remains null.',
  };
});
const progress = read('docs/match-engine/REALISM_PROGRESS.json');
const result = {
  schema: 'pr199-summary-v1',
  base: BASE,
  evidence: Object.fromEntries(
    Object.entries(catalogue).map(([key, [name]]) => [
      key,
      {
        path: `${ROOT}/${name}`,
        sha256: hash(readFileSync(`${ROOT}/${name}`)),
        source: read(`${ROOT}/${name}`).result.source,
      },
    ]),
  ),
  baseline: baseline.summary,
  forensicSummary: forensic.summary,
  forensicUncertainty: read(`${ROOT}/forensics-uncertainty-v1.json.gz`).result.summary,
  changedCases: changed,
  perception: {
    trials: perception.rows.length,
    flights: perception.flights.length,
    method: perception.method,
    byTiming: group(
      normal,
      (r) => `${r.config.condition}/${r.config.duration}/${r.config.cues ? 'cue' : 'no-cue'}`,
      (list) => ({
        trials: list.length,
        offered: mean(list.map((r) => r.offeredSeconds)),
        attended: mean(list.map((r) => r.attendedSeconds)),
        acquired: mean(list.map((r) => r.observations)),
        noUsefulBallObservation: list.filter((r) => r.firstUseful === null).length,
        noTrajectoryEstimate: list.filter((r) => !r.everTrajectoryEstimate).length,
        acquiredCue: list.filter((r) => r.cueAcquired).length,
        halfSecondForecast: errors(list.flatMap((r) => r.errors.filter((e) => e.ahead === 0.5))),
      }),
    ),
    byFamily: group(half, (e) => e.family, errors),
    byAge: group(
      half,
      (e) =>
        e.age === null
          ? 'none'
          : e.age < 0.2
            ? '0-0.2'
            : e.age < 0.5
              ? '0.2-0.5'
              : e.age < 1
                ? '0.5-1'
                : '1+',
      errors,
    ),
    byForecastHorizon: group(flattened, (e) => String(e.ahead), errors),
    byTimeRemainingToLowPlane: group(
      half,
      (e) =>
        e.remainingToLowPlane === null
          ? 'no crossing'
          : e.remainingToLowPlane < 0
            ? 'after crossing'
            : e.remainingToLowPlane < 0.25
              ? '0-0.25'
              : e.remainingToLowPlane < 1
                ? '0.25-1'
                : '1+',
      errors,
    ),
    byExposure: group(
      half,
      (e) => (e.exposure <= 0.2 ? '<=0.2' : e.exposure <= 0.8 ? '0.2-0.8' : '>0.8'),
      errors,
    ),
    byInitialSpeed: group(
      half,
      (e) => (e.initialSpeed < 15 ? '<15' : e.initialSpeed < 25 ? '15-25' : '25+'),
      errors,
    ),
    byAttribute: group(
      perception.rows.filter((r) => r.config.attribute),
      (r) => `${r.config.attribute}/${r.config.level}`,
      (list) => errors(list.flatMap((r) => r.errors.filter((e) => e.ahead === 0.5))),
    ),
  },
  receivers: {
    summary: receivers.summary,
    byCondition: group(
      receivers.rows,
      (r) => `${r.config.controller}/${r.config.condition}/${r.config.cues ? 'cue' : 'no-cue'}`,
      outcomes,
    ),
    byFamily: group(receivers.rows, (r) => `${r.config.controller}/${r.family}`, outcomes),
    contactErrors,
    attributeSummary: attrs.summary,
    referenceSummary: group(attrs.references, (r) => r.controller, outcomes),
    byAttribute: group(
      attrs.rows,
      (r) =>
        `${r.config.controller}/${r.config.attribute ?? 'pressure'}/${r.config.level ?? r.config.pressureDistance}`,
      outcomes,
    ),
  },
  keepers: keeperTables,
  performance: read(`${ROOT}/performance-v3.json`),
  progress: {
    total: progress.total,
    dimensions: progress.supportedCounts,
    historicalUpdateCount: progress.historicalUpdateCount,
    blocked: progress.blockedIds.length,
    awaitingFirstLinkedLab: progress.awaitingFirstLinkedLab.length,
    distinctScopedCorrections: progress.distinctScopedCorrections,
  },
  unchanged: {
    liveKernel: true,
    defaultPolicy: 'B',
    physicsHz: 40,
    permanentAttributes: 28,
    independentConfirmation: 'sealed',
    readiness: 'NOT READY',
  },
};
const path = `${ROOT}/summary.json`,
  json = JSON.stringify(result, null, 2) + '\n';
if (options.has('check')) {
  if (normalized(path) !== json) throw Error('PR199 summary drift');
} else writeFileSync(path, json);
console.log(
  'PR199 summary',
  perception.rows.length,
  'perception;',
  receivers.rows.length + attrs.rows.length,
  'receiving;',
  progress.supportedCounts,
);
