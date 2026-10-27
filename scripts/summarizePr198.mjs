import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { BASE, read, hash } from './pr198Evidence.mjs';
import { catalogue } from './pr198Catalogue.mjs';
const folder = 'docs/performance/pr198/';
const evidence = Object.fromEntries(
  Object.entries(catalogue).map(([key, [name]]) => [
    key,
    { path: folder + name, sha256: hash(readFileSync(folder + name)) },
  ]),
);
const lab = (key) => read(evidence[key].path).result;
const ablations = Object.fromEntries(
  ['baseline', 'defence', 'height', 'receiver', 'dh', 'dr', 'hr', 'combined', 'synchronized'].map(
    (model) => [model, lab('reception-' + model).summary],
  ),
);
const before = lab('reception-combined').rows,
  after = lab('reception-synchronized').rows;
const pairs = after.map((a, i) => {
  const b = before[i];
  if (
    hash([a.family, a.skill, a.sample, a.ballHash]) !==
    hash([b.family, b.skill, b.sample, b.ballHash])
  )
    throw Error('Unpaired reception');
  return {
    family: a.family,
    skill: a.skill,
    sample: a.sample,
    ballHash: a.ballHash,
    lostTouch: !!b.outcome.directReceiverTouch && !a.outcome.directReceiverTouch,
    gainedTouch: !b.outcome.directReceiverTouch && !!a.outcome.directReceiverTouch,
    lostControl:
      !!(b.outcome.directReceiverTouch && b.outcome.receiverControl) &&
      !(a.outcome.directReceiverTouch && a.outcome.receiverControl),
    gainedControl:
      !(b.outcome.directReceiverTouch && b.outcome.receiverControl) &&
      !!(a.outcome.directReceiverTouch && a.outcome.receiverControl),
  };
});
const sensitivity = lab('sensitivity'),
  opportunities = Object.fromEntries(
    ['baseline', 'loft'].map((model) => [model, lab('opportunity-' + model).summary]),
  );
const meetingErrors = Object.fromEntries(
  [
    ['combined', before],
    ['synchronized', after],
  ].map(([model, rows]) => {
    const sampled = rows.filter((r) => r.frames),
      measured = [];
    for (const row of sampled) {
      const touchAt = row.outcome.receiverTouchAt;
      if (touchAt === null) continue;
      const actual = row.frames.find((f) =>
        f.contacts.some(
          (c) => c.actorId === row.outcome.contract.receiverId && Math.abs(c.at - touchAt) < 0.026,
        ),
      );
      const plan = [...row.frames]
        .reverse()
        .find(
          (f) =>
            f.at <= touchAt + 1e-8 &&
            (model === 'synchronized' ? f.meeting?.contactPoint : f.legacyLocalPlan?.nextContact),
        );
      if (!actual || !plan) continue;
      const surface = actual.receptionOutcome?.surfaceContact;
      const finite = surface && Math.abs(surface.at - touchAt) < 0.026;
      const point = finite ? surface.point : actual.ball;
      const requested =
        model === 'synchronized' ? plan.meeting.contactPoint : plan.legacyLocalPlan.nextContact;
      const contactAt =
        model === 'synchronized'
          ? plan.meeting.contactAt
          : plan.at + plan.legacyLocalPlan.contactSeconds;
      measured.push({
        family: row.family,
        skill: row.skill,
        sample: row.sample,
        pointSource: finite ? 'finite_surface_witness' : 'post_tick_ball_proxy',
        spatialError: Math.hypot(point.x - requested.x, point.y - requested.y),
        temporalError: touchAt - contactAt,
        finiteSurfaceAvailable: finite ? surface.available : null,
        balance: finite ? surface.balance : (actual.plantBalance?.balance ?? null),
      });
    }
    const mean = (key) =>
      measured.length ? measured.reduce((n, r) => n + Math.abs(r[key]), 0) / measured.length : null;
    return [
      model,
      {
        sampled: sampled.length,
        contactsWithPlan: measured.length,
        spatialMAEMetres: mean('spatialError'),
        temporalMAESeconds: mean('temporalError'),
        finiteWitnesses: measured.filter((r) => r.pointSource === 'finite_surface_witness').length,
        rows: measured,
        qualification:
          'Predetermined skill 20/80, sample 0 frame subset; conditional on actual touch and a retained local plan. Finite witness preferred; post-tick ball proxy explicitly marked. Not a failure-free or real-football calibration denominator.',
      },
    ];
  }),
);
const sharedMeetingRows = meetingErrors.combined.rows.flatMap((beforeRow) => {
  const afterRow = meetingErrors.synchronized.rows.find(
    (r) =>
      r.family === beforeRow.family && r.skill === beforeRow.skill && r.sample === beforeRow.sample,
  );
  return afterRow
    ? [
        {
          family: beforeRow.family,
          skill: beforeRow.skill,
          sample: beforeRow.sample,
          before: beforeRow,
          after: afterRow,
        },
      ]
    : [];
});
const sharedMeetingErrors = {
  n: sharedMeetingRows.length,
  beforeSpatialMAE:
    sharedMeetingRows.reduce((n, r) => n + r.before.spatialError, 0) /
    Math.max(1, sharedMeetingRows.length),
  afterSpatialMAE:
    sharedMeetingRows.reduce((n, r) => n + r.after.spatialError, 0) /
    Math.max(1, sharedMeetingRows.length),
  beforeTemporalMAE:
    sharedMeetingRows.reduce((n, r) => n + Math.abs(r.before.temporalError), 0) /
    Math.max(1, sharedMeetingRows.length),
  afterTemporalMAE:
    sharedMeetingRows.reduce((n, r) => n + Math.abs(r.after.temporalError), 0) /
    Math.max(1, sharedMeetingRows.length),
  rows: sharedMeetingRows,
};
const opportunityPolicies = Object.fromEntries(
  ['baseline', 'loft'].map((model) => [
    model,
    Object.fromEntries(
      [...new Set(lab('opportunity-' + model).rows.map((r) => r.policy))].map((policy) => {
        const xs = lab('opportunity-' + model).rows.filter((r) => r.policy === policy);
        return [
          policy,
          {
            n: xs.length,
            opportunity: xs.filter((r) => r.stages.opportunity !== null).length,
            run: xs.filter((r) => r.stages.run !== null).length,
            observedRun: xs.filter((r) => r.stages.observedRun !== null).length,
            loftCandidate: xs.filter((r) => r.stages.loftCandidate !== null).length,
            admissible: xs.filter((r) => r.stages.admissibleLoft !== null).length,
            selected: xs.filter((r) => r.stages.selectedLoft !== null).length,
            released: xs.filter((r) => r.stages.releasedLoft !== null).length,
            forced: xs.filter((r) => r.forced).length,
            forcedReleased: xs.filter((r) => r.forced?.outcome.released).length,
          },
        ];
      }),
    ),
  ]),
);
const runnerId = lab('releases').rows[0].state.players.find(
  (p) => p.team === 'home' && p.slot.position === 'left_winger',
).id;
const opportunityDecisionAudit = Object.fromEntries(
  ['baseline', 'loft'].map((model) => {
    const rows = lab('opportunity-' + model).rows;
    const audit = rows.map((row) => {
      const bounded = !['state-value-v1', 'phase-role-hybrid-v1'].includes(row.policy);
      const witnessed = row.decisionWitnesses.flatMap((d) =>
        d.candidates
          .filter(
            (c) =>
              c.action.type === 'pass' &&
              c.action.receiverId === runnerId &&
              c.action.delivery === 'lofted',
          )
          .map((c) => ({ at: d.at, candidate: c })),
      );
      const candidate = row.stages.loftCandidate !== null || witnessed.length > 0;
      const ready = bounded
        ? row.stages.selectedLoft !== null ||
          witnessed.some(
            (w) =>
              w.candidate.feasible && w.candidate.readyAt <= w.at && w.candidate.closesAt > w.at,
          )
        : null;
      return {
        policy: row.policy,
        variant: row.variant,
        skill: row.skill,
        sample: row.sample,
        bounded,
        sampledLoft: row.stages.loftCandidate !== null,
        decisionLoft: witnessed.length > 0,
        candidate,
        additionalShortWindow: row.stages.loftCandidate === null && witnessed.length > 0,
        readyNowFromActualDecision: ready,
        recognizedPositionJob: row.stages.opportunity !== null,
        deliberateRun: row.stages.run !== null,
        selected: row.stages.selectedLoft !== null,
        preparing: row.stages.preparingLoft !== null,
        released: row.stages.releasedLoft !== null,
      };
    });
    return [
      model,
      {
        rows: audit,
        scenarios: audit.length,
        candidateWithAnyWitness: audit.filter((r) => r.candidate).length,
        additionalShortWindows: audit.filter((r) => r.additionalShortWindow).length,
        perPolicy: Object.fromEntries(
          [...new Set(audit.map((r) => r.policy))].map((policy) => {
            const xs = audit.filter((r) => r.policy === policy);
            return [
              policy,
              {
                n: xs.length,
                candidate: xs.filter((r) => r.candidate).length,
                additionalShortWindows: xs.filter((r) => r.additionalShortWindow).length,
                readyNow: xs[0].bounded
                  ? xs.filter((r) => r.readyNowFromActualDecision).length
                  : null,
                selected: xs.filter((r) => r.selected).length,
                preparing: xs.filter((r) => r.preparing).length,
                released: xs.filter((r) => r.released).length,
              },
            ];
          }),
        ),
        perSkill: Object.fromEntries(
          [40, 80].map((skill) => {
            const xs = audit.filter((r) => r.skill === skill);
            return [
              skill,
              {
                n: xs.length,
                recognizedPositionJobs: xs.filter((r) => r.recognizedPositionJob).length,
                candidate: xs.filter((r) => r.candidate).length,
                released: xs.filter((r) => r.released).length,
              },
            ];
          }),
        ),
        qualification:
          'Union of 0.2s menu samples and actual bounded decision witnesses. Full-world admission remains unavailable; readyNow uses retained native decision witnesses/actual selection, not sampled presence. Position-job recognition is not proof of tactical intention.',
      },
    ];
  }),
);
const disruption = lab('disruption-final'),
  rebounds = lab('rebounds');
const disruptionScenes = Object.fromEntries(
  [...new Set(disruption.rows.map((r) => r.scenario))].map((scenario) => {
    const xs = disruption.rows.filter((r) => r.scenario === scenario);
    return [
      scenario,
      {
        n: xs.length,
        deflections: xs.reduce((n, r) => n + r.ledger.physicalDeflections, 0),
        looseEpisodes: xs.reduce((n, r) => n + r.ledger.looseBallEpisodes, 0),
        catches: xs.reduce((n, r) => n + r.ledger.goalkeeperCatches, 0),
        parries: xs.reduce((n, r) => n + r.ledger.goalkeeperParries, 0),
        rebounds: xs.reduce((n, r) => n + r.ledger.goalkeeperRebounds, 0),
        turnovers: xs.reduce((n, r) => n + r.ledger.turnovers.length, 0),
        opponentShots: xs.reduce((n, r) => n + r.ledger.opponentShots, 0),
        restarts: Object.fromEntries(
          [...new Set(xs.flatMap((r) => Object.keys(r.ledger.restarts)))].map((k) => [
            k,
            xs.reduce((n, r) => n + (r.ledger.restarts[k] ?? 0), 0),
          ]),
        ),
      },
    ];
  }),
);
const designs = [
  ['ww', 'opportunity-driven-v1'],
  ['ww', 'hierarchical-intent-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'contextual-judgment-v1'],
  ['sw', 'state-value-v1'],
  ['ww', 'phase-role-hybrid-v1'],
  ['ss', 'state-value-v1'],
];
const matches = [];
for (const [design, policy] of designs)
  for (const model of ['baseline', 'corrected']) {
    const base = `${folder}matches/${design}-${policy}-${model}-v2.json.gz`;
    if (!existsSync(base)) continue;
    let path = base,
      row = read(path);
    if (!('lastControlledTeam' in row.disruption)) {
      path = base.replace('-v2.json.gz', '-observer-v3.json.gz');
      if (!existsSync(path)) continue;
      row = read(path);
      if (!row.physicalEquivalent || row.fullPhysicalReplayOf !== base)
        throw Error('Missing full observer equivalence');
    }
    if (row.status !== 'full_time' || row.failure) throw Error('Incomplete selected match');
    const eligible = row.passOutcomes.filter((p) => !p.restartOrigin),
      outcomes = eligible.map((p) => p.outcome);
    matches.push({
      path,
      sha256: hash(readFileSync(path)),
      design,
      policy,
      model,
      seed: row.seed,
      originalInputHash: row.originalInputHash,
      initialHash: row.initialHash,
      finalHash: row.finalHash,
      status: row.status,
      source: row.sourceArchive,
      flags: row.flags,
      passes: row.passes,
      shots: row.shots,
      score: row.score,
      nonRestartReleases: eligible.length,
      directTouches: outcomes.filter((o) => o.directReceiverTouch).length,
      controls: outcomes.filter((o) => o.receiverControl).length,
      retained: outcomes.filter((o) => o.teamPossessionAtOneSecond).length,
      censored: outcomes.filter((o) => o.censored).length,
      lofted: eligible.filter((p) => p.delivery === 'lofted').length,
      long: eligible.filter((p) => p.length >= 30).length,
      progressive: eligible.filter((p) => p.progress >= 10).length,
      through: row.counts.throughBalls,
      finalThirdEntries: row.football.finalThirdEntries,
      boxEntries: row.football.boxEntries,
      defensiveContacts: outcomes.filter((o) => o.defensiveContactAt !== null).length,
      defensiveControls: outcomes.filter((o) => o.defensiveControlAt !== null).length,
      looseEpisodes: row.disruption.looseBallEpisodes,
      goalkeeperRebounds: row.disruption.goalkeeperRebounds,
      restarts: row.disruption.restarts,
      turnovers: row.disruption.turnovers.length,
      turnoverWitnesses: row.disruption.turnovers,
      opportunityCounts: row.opportunityCounts,
      autonomousRunStarts: {
        overlap: row.football.overlapRunsStarted,
        underlap: row.football.underlapRunsStarted,
      },
      preparationFailures: row.counts.preparationFailures,
      receptions: row.football.receptions,
      inPlayMinutes: row.time.ballInPlaySeconds / 60,
      performance: row.performance,
      observerFullReplay: row.fullPhysicalReplayOf ?? null,
    });
  }
if (!process.argv.includes('--partial') && matches.length !== 14)
  throw Error('Fourteen selected complete matches required; got ' + matches.length);
const registry = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
const ids = [...registry.matchAll(/^### ([A-Z]+-\d+)/gm)].map((m) => m[1]);
const result = {
  schema: 'pr198-summary-v1',
  base: BASE,
  frozenSourceFingerprint: read(folder + 'frozen-pr197.json').fingerprint,
  evidence,
  ablations,
  interactionQualification:
    'On fixed released balls D and H have zero observed post-release marginal/interaction effect in this catalogue; this does not test their release-time rankings or all other geometries.',
  receiverPairs: pairs,
  receiverTransitions: {
    lostTouch: pairs.filter((p) => p.lostTouch).length,
    gainedTouch: pairs.filter((p) => p.gainedTouch).length,
    lostControl: pairs.filter((p) => p.lostControl).length,
    gainedControl: pairs.filter((p) => p.gainedControl).length,
  },
  receiverMeetingErrors: meetingErrors,
  sharedMeetingErrors,
  rejectedReceiverV1: lab('reception-rejected-v1').summary,
  sensitivity: {
    rows: sensitivity.rows.length,
    pairs: sensitivity.paired.length,
    lostTouch: sensitivity.paired.filter((p) => p.destroyedTouch).length,
    gainedTouch: sensitivity.paired.filter((p) => p.gainedTouch).length,
  },
  opportunities,
  opportunityPolicies,
  opportunityDecisionAudit,
  disruption: disruptionScenes,
  originalShotRebounds: {
    requests: rebounds.rows.length,
    physicallyLooseKeeperRebound: rebounds.rows.filter((r) => r.originalKeeperLoose).length,
  },
  performance: Object.fromEntries(
    ['serial', 'concurrent-1', 'concurrent-2'].map((mode) => [
      mode,
      read(evidence['performance-' + mode].path).costs,
    ]),
  ),
  fullMatches: matches,
  registry: {
    count: ids.length,
    added: ids.filter(
      (id) => !read(folder + 'frozen-pr197.json').registry.some((r) => r.id === id),
    ),
    completeEntries: [...registry.matchAll(/^- \[x\] COMPLETE/gm)].length,
  },
  exploratory: readdirSync(folder).filter((p) =>
    /^(disruption-v[12]|sensitivity-v1|receptions-synchronized-v1)/.test(p),
  ),
  canonicalReadiness: 'NOT READY',
  defaultPolicy: 'state-value-v1',
  independentConfirmation: 'sealed',
  physicsHz: 40,
  permanentAttributes: 28,
  limitations: [
    'Dependent paired seeds/mirrors; no independent Bernoulli or real-football calibration claim.',
    'Local receiver consistency repair retains worse touch/control/retention than PR197 combined; no promotion.',
    'Autonomous release is separate from deliberate runner opportunity recognition; full causal chain remains unproven.',
    'Full-world candidate rejection denominators are unavailable; bounded trace counts use actual witnessed menus.',
    'Shape and threat proxies are descriptive, not calibrated state value.',
  ],
};
const path = folder + 'summary.json';
if (process.argv.includes('--check')) {
  if (hash(read(path)) !== hash(result)) throw Error('PR198 summary drift');
} else writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
console.log(
  'PR198 summary',
  matches.length,
  'matches',
  result.registry.count,
  'IDs',
  result.receiverTransitions,
);
