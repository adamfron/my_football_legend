import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { BASE, ROOT, read, hash, git } from './pr200Evidence.mjs';
import { resolveIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import { parseRegistry } from './realismProgress.mjs';
import { integrationDimensions, generateIntegrationProgress } from './integrationProgress.mjs';
const check = process.argv.includes('--check');
const save = (path, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  if (check) {
    if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== text)
      throw Error('Generated PR200 report drift: ' + path);
  } else writeFileSync(path, text);
};
const baseline = read(`${ROOT}/frozen-pr199.json`),
  inventory = read(`${ROOT}/inventory.json`);
const choose = (final, initial) => `${ROOT}/${existsSync(`${ROOT}/${final}`) ? final : initial}`;
const localPath = choose('local-frozen-final-v1.json.gz', 'local-frozen-v1.json.gz'),
  freshPath = choose('local-fresh-final-v1.json.gz', 'local-fresh-v1.json.gz'),
  keeperPath = choose('goalkeepers-v3.json.gz', 'goalkeepers-v2.json.gz'),
  diagnosisPath = choose(
    'local-bounded-diagnosis-final-v1.json.gz',
    'local-bounded-diagnosis-v1.json.gz',
  );
const local = read(localPath).result,
  changed = read(`${ROOT}/local-changed-v1.json.gz`).result,
  fresh = read(freshPath).result,
  keeper = read(keeperPath).result;
const diagnosis = existsSync(diagnosisPath) ? read(diagnosisPath).result : null;
const matches = readdirSync(`${ROOT}/matches`)
  .filter((n) => n.endsWith('.json.gz'))
  .sort()
  .map((n) => ({ path: `${ROOT}/matches/${n}`, ...read(`${ROOT}/matches/${n}`) }));
// Extend the original programme by evidence scope, preserving its PR199 assessment.
const programme = JSON.parse(git(['show', `${BASE}:docs/match-engine/REALISM_EVIDENCE.json`]));
const informationPath = `${ROOT}/information-boundary-final-v1.json.gz`;
const information = read(informationPath).result;
const liveKey = 'live-information200';
programme.evidence.push({
  key: liveKey,
  ids: ['TACT-009', 'GK-002'],
  pr: 200,
  receipt: informationPath,
  sha256: hash(readFileSync(informationPath)),
  sourceFingerprint: information.source.fingerprint,
  sourceArchive: information.source.path,
  experiment:
    'Seven deterministic interventions on live optical, motor, active-memory and keeper consumers',
  result:
    'Hidden velocity/spin/target and unseen deflection do not update subjective input; cached timestamps remain genuine; actual keeper motion and save permission obey the gated contract.',
  limitation:
    'Scoped source correction only for the separately gated live route. Optical/anticipation calibration, reception losses, difficult saves, broad tactical cognition and whole-match transfer remain open; legacy consumers are intentionally unchanged.',
  correctionId: 'bounded-live-information200',
});
for (const record of programme.records.filter((r) => ['TACT-009', 'GK-002'].includes(r.id))) {
  record.scopeHistory = [
    { pr: 199, source: BASE, dimensions: globalThis.structuredClone(record.dimensions) },
  ];
  for (const name of [
    'EXPERIMENT_INVESTIGATED',
    'ROOT_CAUSE_IDENTIFIED',
    'FIX_IMPLEMENTED',
    'DEVELOPMENT_VALIDATED',
  ]) {
    record.dimensions[name].evidence.push(liveKey);
    record.dimensions[name].limitation =
      name === 'FIX_IMPLEMENTED'
        ? programme.evidence.at(-1).limitation
        : 'Historical PR199 scope is retained in scopeHistory. Live information isolation now executes, but physical reception/difficult-save regressions prevent general development validation or canonical promotion.';
  }
  record.dimensions.FIX_IMPLEMENTED.status = 'SUPPORTED';
  record.regressions.push(
    'PR200 live bounded pathway loses real receptions and some difficult saves; executable combined candidate is NOT_READY_FOR_PROMOTION.',
  );
}
save('docs/match-engine/REALISM_EVIDENCE.json', programme);
const evidencePaths = [
  `${ROOT}/inventory.json`,
  localPath,
  `${ROOT}/local-changed-v1.json.gz`,
  freshPath,
  keeperPath,
  ...(diagnosis ? [diagnosisPath] : []),
];
const evidence = evidencePaths.map((path, i) => {
  const r = read(path);
  return {
    key: ['inventory', 'frozen', 'changed', 'fresh', 'keepers', 'diagnosis'][i],
    path,
    sha256: hash(readFileSync(path)),
    sourceFingerprint: (r.result?.source ?? r.source).fingerprint,
  };
});
const selected = resolveIntegrationProfile('realism-candidate-v0');
const stage = (status, evidence, limitation) => ({ status, evidence, limitation });
const mapping = {
  schema: 'mfl-integration-evidence-v0',
  profile: selected.id,
  decision: 'NOT_READY_FOR_PROMOTION',
  records: inventory.records.map((m) => {
    const positive = Boolean(selected.features[m.flag]);
    const location =
      m.sourceLocations.find(
        (l) =>
          !/(Lab|Laboratory|assumptionCalibration|integration|matchState|attribute)/.test(l.path),
      ) ?? m.sourceLocations[0];
    const dimensions = Object.fromEntries(
      integrationDimensions.map((d) => [
        d,
        stage(
          'NOT_ASSESSED',
          [],
          'No promotion or isolated positive whole-match transfer is established.',
        ),
      ]),
    );
    dimensions.LIVE_CONSUMER_PRESENT = stage(
      'SUPPORTED',
      ['inventory'],
      'Source-backed acting entry/consumer exists; this does not certify every policy or empirical calibration.',
    );
    if (positive)
      dimensions.INTEGRATION_CANDIDATE = stage(
        'SUPPORTED',
        ['inventory'],
        'Selected for this explicitly failing executable development combination; selection is not endorsement.',
      );
    if (m.flag === 'experimentalDefensiveReception')
      dimensions.COMPATIBILITY_VALIDATED = stage(
        'SUPPORTED',
        ['frozen'],
        'Scoped same-release compatibility with observed receiver preparation and bounded route; no general calibration claim.',
      );
    if (['experimentalHeightAwarePassing', 'experimentalObservedLoftedPasses'].includes(m.flag))
      dimensions.COMPATIBILITY_VALIDATED = stage(
        'PARTIAL',
        ['inventory', 'frozen'],
        'Different policy-specific acting interfaces: height-aware engineering ranking is inactive in O/H/J; its release diagnostic may still execute. Combined matches do not identify a common acting height mechanism.',
      );
    if (m.flag === 'experimentalReceiverAnticipation')
      dimensions.COMPATIBILITY_VALIDATED = stage(
        'FAILED',
        ['frozen', 'fresh'],
        'Live-compatible execution exists, but bounded information plus its motor preparation loses real contacts.',
      );
    if (m.flag === 'experimentalBoundedBallFlightBelief') {
      dimensions.COMPATIBILITY_VALIDATED = stage(
        'FAILED',
        ['frozen', 'fresh', 'keepers'],
        'Information contracts are tested; receiver and difficult-keeper physical regressions prevent compatibility approval.',
      );
      dimensions.FULL_MATCH_TRANSFER_SUPPORTED = stage(
        'BLOCKED',
        ['frozen', 'fresh'],
        'Severe local loss blocks promotion. Whole-profile full-match contrasts are linked in the summary, but do not isolate this component or support policy-independent transfer.',
      );
    }
    return {
      mechanism: m.flag,
      ids: m.ids,
      sourceLocation: location.path,
      sourceFingerprint: inventory.source.fingerprint,
      profile: selected.id,
      behaviour: m.positive,
      knownRegressions: [m.negative],
      dimensions,
    };
  }),
  evidence,
};
const registry = parseRegistry(readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8'));
generateIntegrationProgress(mapping, registry);
save('docs/match-engine/INTEGRATION_EVIDENCE.json', mapping);
const bytes = (path) => ({ path, sha256: hash(readFileSync(path)) });
const summary = {
  schema: 'pr200-summary-v0',
  baseline: baseline.base,
  sourceFingerprint: baseline.fingerprint,
  profile: selected,
  mechanismDecisions: selected.mechanisms.map((m) => ({
    mechanism: m.flag,
    decision: m.promotion,
    selected: m.selected,
    reason: m.reason,
    limitation: m.negative,
  })),
  local: local.summary,
  changed: changed.summary,
  fresh: fresh.summary,
  keeper: keeper.summary,
  diagnosis: diagnosis?.summary ?? null,
  receipts: [...evidencePaths, informationPath].map(bytes),
  matches: matches.map(({ path, result: r, costs }) => ({
    path,
    sha256: hash(readFileSync(path)),
    source: r.source,
    manifest: r.manifest,
    design: r.design,
    policy: r.policy,
    profile: r.profile,
    seed: r.seed,
    initialHash: r.initialHash,
    originalInputHash: r.originalInputHash,
    status: r.status,
    finalHash: r.finalHash,
    passes: r.passes,
    shots: r.shots,
    score: r.score,
    counts: r.counts,
    time: r.time,
    costs,
    directTouch: r.passOutcomes.filter((p) => p.outcome.directReceiverTouch).length,
    control: r.passOutcomes.filter((p) => p.outcome.receiverControl).length,
    retained: r.passOutcomes.filter((p) => p.outcome.teamPossessionAtOneSecond).length,
  })),
  decisions: {
    wholeProfile: 'NOT_READY_FOR_PROMOTION',
    receiverMotor:
      'REJECT_CURRENT_VARIANT: incoming-facing ablation is not installed globally; S retained historically',
    perception: 'NEEDS_REPAIR: severe physical reception loss',
    defensiveReception: 'ACCEPT_FOR_CANDIDATE: scoped finite-contact symmetry',
    heightAwarePassing: 'RETAIN_EXPERIMENTAL: policy-specific approximate forecast',
    observedLoft:
      'ACCEPT_FOR_CANDIDATE: bounded repertoire only; deliberate complete chain remains unproven',
    synchronisation: 'REJECT_CURRENT_VARIANT',
  },
  independentConfirmation: 'sealed',
  canonicalReadiness: 'NOT READY',
};
save(`${ROOT}/summary.json`, summary);
const triple = (s) => `${s.touch}/${s.control}/${s.retained}`;
const localTable = (data) =>
  '| Variant | Trials | Touch/control/retained | Censored |\n| --- | ---: | --- | ---: |\n' +
  Object.entries(data)
    .map(([v, s]) => `| ${v} | ${s.all.trials} | ${triple(s.all)} | ${s.all.censored} |`)
    .join('\n') +
  '\n';
const matchTable =
  '| Design / policy | Profile / version | Passes / completed | Direct touch / control / retained | Shots | Score | Wall s / peak RSS MiB |\n| --- | --- | --- | --- | ---: | --- | --- |\n' +
  summary.matches
    .map(
      (r) =>
        `| ${r.design}/${r.policy} | ${r.profile}/${r.path.match(/-(v\d+)\.json/)?.[1]} | ${r.passes.attempted}/${r.passes.completed} | ${r.directTouch}/${r.control}/${r.retained} | ${r.shots} | ${r.score.home}:${r.score.away} | ${r.costs.wallSeconds.toFixed(1)}/${(r.costs.peakRSSKiB / 1024).toFixed(1)} |`,
    )
    .join('\n') +
  '\n';
const inventoryTable =
  '| Mechanism | Acting consumer / policies | Candidate | Source lifecycle | Reason / limitation |\n| --- | --- | --- | --- | --- |\n' +
  inventory.records
    .map(
      (m) =>
        `| ${m.flag} | ${m.consumer}; ${m.policies} | ${Boolean(selected.features[m.flag])} | ${selected.features[m.flag] ? 'INTEGRATION_CANDIDATE' : m.lifecycle} | ${m.reason}; ${m.negative} |`,
    )
    .join('\n') +
  '\n';
const keeperTable =
  '| Scenario | Controller | Trials | Contact | Catch / parry | Goal | No acquired sighting |\n| --- | --- | ---: | ---: | --- | ---: | --- |\n' +
  Object.entries(keeper.summary)
    .flatMap(([scene, models]) =>
      Object.entries(models).map(
        ([model, s]) =>
          `| ${scene} | ${model} | ${s.attempts} | ${s.contacts} | ${s.catches}/${s.parries} | ${s.goals} | ${s.noSight ?? 'unmeasured'} |`,
      ),
    )
    .join('\n') +
  '\n';
const finalPairs = summary.matches
  .filter((r) => r.profile === 'realism-candidate-v0' && r.path.endsWith('-v3.json.gz'))
  .map((r) => {
    const b = summary.matches.find(
      (b) => b.design === r.design && b.policy === r.policy && b.profile === 'canonical-pr199',
    );
    return `${r.design}/${r.policy}: shots ${b.shots}→${r.shots}, score ${b.score.home}:${b.score.away}→${r.score.home}:${r.score.away}`;
  })
  .join('; ');
const performanceTable =
  '| Design / policy | Baseline CPU s | Final candidate CPU s | CPU ratio |\n| --- | ---: | ---: | ---: |\n' +
  summary.matches
    .filter((r) => r.profile === 'realism-candidate-v0' && r.path.endsWith('-v3.json.gz'))
    .map((r) => {
      const b = summary.matches.find(
        (b) => b.design === r.design && b.policy === r.policy && b.profile === 'canonical-pr199',
      );
      const seconds = (c) => (c.cpu.user + c.cpu.system) / 1e6;
      return `| ${r.design}/${r.policy} | ${seconds(b.costs).toFixed(1)} | ${seconds(r.costs).toFixed(1)} | ${(seconds(r.costs) / seconds(b.costs)).toFixed(2)} |`;
    })
    .join('\n') +
  '\n';
const retainedReceiverTrials = readdirSync(ROOT)
  .filter((n) => n.startsWith('local-') && n.endsWith('.gz'))
  .reduce((n, p) => n + read(`${ROOT}/${p}`).result.rows.length, 0);
const report = `# PR200 — MatchEngine Integration Candidate, Receiver Motor and Bounded Perception

## 1. Executive summary

An executable, versioned **realism-candidate-v0** now combines mechanisms inside the one canonical MatchEngine. It is a maintained, inspectable development configuration with a separate policy dimension, dependency/conflict validation and deterministic settings checksum. The new live perception experiment closes demonstrated velocity/spin/timestamp and goalkeeper movement/action side channels in its named consumers. This is a **failing integration candidate, NOT_READY_FOR_PROMOTION**, not a declaration of realistic football. **B default; canonical NOT READY; independent confirmation sealed.**

Motor correction is deliberately withheld: the incoming-facing ablation recovers 9/11 selected contacts, but its complete 180-ball control/retention is below R. Fresh conditions do not erase that harm. No source coefficient, physical reach, launch error or contact outcome is tuned to recover a contact quota.

## 2. Frozen PR199 baseline

Merged source: \`${baseline.base}\`; final PR199 head \`${baseline.pr199Head}\`; normalized source fingerprint \`${baseline.fingerprint}\`. [Frozen manifest](performance/pr200/frozen-pr199.json) retains all ${baseline.ids.length} IDs and every PR195–199 evidence Git blob, including the original 28 long passes, 180 releases, eleven changed contacts, all perception and V1–V7 keeper apparatus, autonomous loft cohorts and full-match pairings. None is rewritten. S remains 149/113/108 versus R154/123/116; engineering-fresh remains a privileged diagnostic.

## 3. Current canonical engine architecture

The fixed 0.025s executor remains authoritative. Canonical movement, gravity/spin/flight integration, swept collisions, foot/body access, first-touch impulses, rules, fitness, player agency and all 28 permanent attributes remain shared. B/state-value-v1 remains the new-match default. Legacy/risk, B/role variants and bounded O/H/J share execution while retaining different decision interfaces. Engineering forecasts and research outcome observers are not player knowledge.

## 4. Experimental feature inventory

[Machine inventory](performance/pr200/inventory.json) contains exact current source locations/lines, actual acting consumers, policy applicability, dependencies, optional fields, effects on execution/observation/generation/utility, historical evidence, regressions, performance limits and persistence. All sixteen optional experimental fields and ${inventory.optionalStateContracts.length} optional player/ball/match state declarations are inventoried against source (property-reference candidates do not by themselves prove acting use); additional bounded/active/ablation configuration and body-v1 state are explicit.

${inventoryTable}
## 5. Acting-consumer dependency map

Canonical ball position → sensory visibility/acquisition → timestamped uncertain belief → bounded scene / reception motor observation → existing receiver forecast and final keeper/receiver motor command → canonical 40Hz movement → finite contact/control. Motion is derived from observed positions, not instantaneous canonical velocity. Physics and privileged comparison retain authoritative velocity/spin. S additionally requires receiver anticipation; S plus the new belief is rejected until their contract is validated. Research-only outcome/disruption/attribute laboratories never become knowledge. Height-aware engineering ranking and the O/H/J loft repertoire are distinct acting interfaces; an enabled height flag may execute only a release diagnostic in bounded policies.

## 6. Receiver regression forensics

All eleven changed balls are frozen and repeated, including the six lost cross-field, weak long-ground and moving-lead cases. [Changed continuations](performance/pr200/local-changed-v1.json.gz) retain actual bodies, velocity, facing, target, foot reach/access, plant balance, observed state/age, point/time commitment, actual incoming ball, contact and continuation. Historical PR199 interventions independently retain braking, cadence, commitment, authority, clock and uncertainty controls. Both shared projection and live S call the same receptionPlanFacing rule; this is not evidence of a unique remaining projection/live disagreement. Tactical overrides, shortlisting, information freshness and motor effort remain separate possible causes.

${localTable(changed.summary)}
## 7. Receiver correction implemented or rejected

**REJECT_CURRENT_VARIANT / correction withheld.** Uniform incoming-facing improves S but does not outperform R on the whole frozen set: 155/117/112 versus R154/123/116. Fewer lost selected contacts cannot justify worse overall controlled possession. Legacy effort is a diagnostic intervention, not a coherent production replacement. Original S and all historical outcomes remain available; the integration profile excludes S. No teleportation, enlarged foot surface, altered flight or synthetic first touch is introduced.

## 8. Fresh receiver validation

The exact complete frozen set is reproduced through the current unflagged kernel, including full original final hashes for R/S:

${localTable(local.summary)}
Ninety freshly released development trials (30 seed keys with three pressure/acquisition variants; dependent, not independent confirmation) use new seeds, ability25/55/85, ground/lofted/diagonal/moving leads, changed initial facing/momentum, immediate pressure, no pressure and late reacquisition. The actual ordinary release is preserved across each continuation; rejected requests and censoring remain separate. Lofted paths include actual bounces; rotating ordinary free kicks are tested separately with keeper contacts. No independent cohort is opened.

${localTable(fresh.summary)}
The complete PR200 source-bound receiver evidence retains ${retainedReceiverTrials} continuations, including earlier variants; the tables use the final acquisition/motor implementation where indicated.

Surface access without a witnessed touch is recorded as a diagnostic, not a proven physically feasible controlled alternative. Contact-time/preparation error remains conditional on actual available plan/contact witnesses; a missing contact is never assigned zero error. Opponent interventions and original-delivery-v3 lineage remain authoritative.

## 9. Player-perception leak audit

Legacy bounded snapshots can copy canonical velocity and general motor adaptation can read hidden spin/refresh time. These old paths remain unchanged when disabled. With the new experiment, bounded scenes and both general/reception motor adapters consume only live sensor belief. One position supplies no velocity; genuine continuous optical intervals or multiple acquired positions can support uncertain inference. Unseen spin is always unknown/zero in the motor interface, and hidden deflections cannot update belief.

## 10. New bounded live observation pathway

experimentalBoundedBallFlightBelief is independently selectable. Position acquisition uses deterministic 40Hz frame keys, finite range/attention and body occlusion; inference runs at100–200ms, stores at most22 sensor memories, expires after four seconds and forecasts at most the existing short local horizon. Actual sighting, motion evidence and prediction times remain distinct. Direct active-perception gathering admits only an actual acquisition; old predictions cannot refresh ballSeenAt. No usable motion estimate means ordinary positioning/memory, never a privileged fallback. Optics/cylinder geometry and inference are uncalibrated development hypotheses.

## 11. Goalkeeper information-boundary audit

The old shot projector, airborne intervention target, structural base/approach, role/tactical/aerial proposals, movement authority, locomotion and facing were traced. A final acting boundary overrides hidden target/facing/effort channels for the experimental keeper. Its command is computed from own body, goal geometry and remembered ball belief; it is not triggered by hidden shot metadata. Active save permission also requires timely motion evidence. Standing-body contact remains possible without an active save. Native contact/catch/parry/rebound formulas and finite surfaces remain shared.

## 12. Goalkeeper experimental behaviour

The V7 clean-shot source geometry/seeds are diagnostic references. New tests use actual physical screens, so blocked original shots are retained and not counted as keeper failures. V1 remains an apparatus receipt; V2 corrects the rotating-arm attribute intervention and marks legacy sighting unavailable rather than treating absence of instrumentation as blindness.

${keeperTable}
Ordinary clear contact6/6 (two launch seeds repeated across three keeper profiles) is retained in this small dependent set. High/late/adverse-facing regressions remain. This is neither a calibrated save distribution nor sufficient promotion evidence; future unseen rebound/anticipated-action work remains a dependency.

## 13. Integration-profile architecture

integrationProfile.ts is the permanent resolver and withIntegrationProfile applies it atomically to normal MatchEngine state. Zod validates IDs, feature settings, optional persisted selection and auxiliary switches. Settings checksum includes profile/version/policy/features and explicit bounded/active/decision-ablation switches. Fixture briefing, knowledge, coach and roster data remain bound by the separate initial-state hash. Source SHA256 archives identify every measured implementation. No second simulator or enable-all flag exists.

## 14. Exact integration-candidate configuration

Selected: defensive reception, height-aware passing, observed receiver anticipation, observed loft repertoire and bounded ball-flight belief. All other experiments are false, body-v1 absent, decision ablation none. Old saves with a missing policy retain their historical legacy policy when applying a profile. New-match B remains default but is separately selectable from R3/O/H/J and the remaining historical policies. S is excluded. Full resolved manifests, policy-specific inactive mechanisms, dependencies, source and checksums accompany every match receipt.

## 15. Reasons for inclusion and exclusion

Finite-contact symmetry is a strong test candidate; loft repertoire repairs a missing bounded family; height remains an approximate engineering forecast; observed anticipation is the compatible upstream motor interface; belief tests information integrity. Their combined physical failures are exposed rather than certified. Canonical arrival is excluded for mixed transfer and cost; active/receiving/tempo/transition/clearance/recovery/restart/body experiments are not silently inherited. Historical-pr198-s preserves a deliberately negative comparison. See [candidate decisions](match-engine/INTEGRATION_CANDIDATES.md).

## 16. Dependency-conflict tests

Tests cover missing anticipation, incompatible S/belief, unknown/stateful modules, different settings checksums, inactive policy consumers, defaults, explicit auxiliary switches, invalid saved profile/policy/fingerprint/settings, independent matches, genuine timestamps, hidden velocity/spin, stale deflection, bounded expiry, active-memory freshness, actual keeper movement after tactical consumers, active-save permission and saved-state deterministic canonical continuation. Old absent optional fields still load.

## 17. Local mechanism compatibility

Defensive reception × observed preparation executes the same real releases without new ownership shortcuts; bounded/no-defence aggregate direct reception is${triple(local.summary.bounded.all)} and ${triple(local.summary.bounded_no_defence.all)} in the two arms in this cohort, not proof that symmetry is irrelevant elsewhere. Height-aware engineering ranking × bounded loft repertoire has no shared acting policy interface; that limitation is explicit, rather than reporting an enabled Boolean as joint activation. Bounded perception × preparation is a severe regression. Keeper information × movement passes hidden-input contracts but difficult physical outcomes regress. R × S/incoming facing remains experimentally mixed.

${diagnosis ? 'Additional privileged sensory versus physical-effort diagnostic (never a player-facing fallback):\n\n' + localTable(diagnosis.summary) : 'Additional sensory/effort diagnosis is pending.'}

## 18. Full-match development comparisons

The runner executes actual normal canonical matches using fixed development WW/SS/SW states, matching seeds and explicit policy dimensions. Baseline, combined candidate, the historical S combination and no-belief ablation are retained. Final v3 candidate manifests freeze auxiliary switches, preserve missing-policy legacy semantics and reuse the existing movement authority order for known commitments. V1/V2 exploratory measurements remain source-reconstructible and are not treated as one uniform implementation. Final v3 runtime graph hashes are checked against current source. A final lazy-schema initialization correction is additionally protected by complete current-source physical-equivalence replays; the original archived variants remain available with --historical-source. Each source archive determines its exact configuration implementation.

${matchTable}
Pass/shot/score totals cover the whole match. Direct touch, control and one-second endpoint retention use original-delivery-v3; control/retention can follow a deflection and are not necessarily nested under direct touch. Compact raw receipts retain every original pass outcome, progressive/through/long/loft release, bounded decision-menu availability/rejection, territory/carries/contacts, keeper/rebound/second-ball/turnover/restarter ledgers and ball-in-play time. Complete full-world candidate denominators remain unavailable, not zero. Disruption/turnover details use the home-team perspective.

## 19. Policy-specific regressions

Final v3 paired results: ${finalPairs || 'awaiting completion'}. These remain dependent development fixtures, not independent population estimates.

The retained initial paired v1 candidate has SW/B26→15 shots, WW/O4→1, WW/H2→1 and SS/B10→8. WW/R3 grows8→16 while SW/Contextual31→54 and7:0→12:0 becomes more extreme. SS/O remains0→0. Increased shots/goals do not establish realism. The full no-belief ablation and historical profile retain policy-specific contrasts rather than pooling them into an attacking score.

## 20. Computational performance

Per-run CPU user/system, wall time, peak RSS, Node version and CPU model are recorded independently of football metrics. Candidate sensing performs bounded optical/inference work; no new repeated full-body forecasts are added for all22 players. S's expensive physical projections remain excluded. Concurrent-host observations cannot establish the10–15-minute serial no-debug target; no such achievement is claimed. Initial verify retained shared-host timeouts, a mid-run stale test import and a genuine direct-import schema cycle; the cycle is repaired with deferred schema resolution and existing module tests remain unchanged. Final verify runs on frozen code after heavy jobs. The first concurrent v2 launch exposed an exclusive source-archive publication race; failed logs are retained and publication is now atomic. This was an apparatus failure, not football evidence.

${performanceTable}
These are complete actual runs on the recorded development host, including different stoppages and event histories. CPU ratios describe measured whole-profile cost; they do not isolate a component, establish portable timing budgets or compensate for physical regressions.

## 21. Save/replay compatibility

New fields are optional and schema-validated. Profile application clears incompatible cached motor, belief, active and keeper state, writes all switches and preserves policy as its own dimension. Saved profile conflicts are rejected. Historical expectation scripts are not weakened: PR199's diagnostic-only/no-live-consumer assertions run against its exact merged source. PR195–198 checks and PR199 exact-source experiments retain old negative results. PR200 source reconstruction validates every archived byte before read-only comparison; match hashes bind full state, not only score.

## 22. Updated realism progress accounting

The original registry and I/F/E/T/M/C closure gates remain intact. Original issue/source-repair counts are recomputed, not increased for sixteen flags. Seven source-bound live information interventions support a scoped FIX_IMPLEMENTED update for TACT-009 and GK-002 sharing one correction identity; their historical PR199 dimensions remain in scopeHistory. Development validation stays partial because physical outcomes regress. [Generated progress](match-engine/REALISM_PROGRESS.md) additionally separates LIVE_CONSUMER_PRESENT, INTEGRATION_CANDIDATE, COMPATIBILITY_VALIDATED, FULL_MATCH_TRANSFER_SUPPORTED and CANONICAL_PROMOTED. Every positive integration scope links mechanism identity, stable IDs, source, profile, hashed evidence and limitations. No independent validation or COMPLETE is invented.

## 23. Mechanisms ready for integration

Symmetric defensive reception and the bounded observed-loft family are accepted for continued candidate testing in their stated scopes. Their inclusion does not promote default football or prove the deliberate complete run chain. An executable candidate is delivered; a successful complete simulation is not claimed. Information integrity can be source-correct while motor/football consequences still require repair.

## 24. Mechanisms experimental or blocked

Bounded sensory/motor preparation needs repair. S remains rejected for promotion; uniform incoming-facing is not installed globally. Height-aware ranking, canonical ETA, team rhythm, transition/clearance value, first-touch uncertainty and keeper anticipation remain experimental/calibration dependencies. Full-world B/R3 and broad outfield tactical controllers are not certified wholly bounded. No obsolete branch is deleted until save readers, consumers, replay edition and a replacement retirement plan are verified.

## 25. Recommended PR201 scope

First isolate the sensory cadence/acquisition and motor effort/preparation interaction exposed by the bounded-loss diagnostics on new paired geometries. Compare real early touches with real later controllable alternatives, not imagined future benefit. Then repeat the maintained profile and component ablations across the same policy matrix; either replace one component or explicitly retain/reject it. Every significant MatchEngine PR records research change, local result, integration effect, promotion decision and next dependency. Preserve failed profiles and close no original evidence gate by documentation alone.

## 26. Canonical readiness decision

**NOT READY. Whole profile NOT_READY_FOR_PROMOTION. B remains default;40Hz and28 attributes preserved; independent confirmation sealed.** The milestone is the executable, measured integration route and bounded live experiment with honest failures. Final-head CI status belongs to the pull request's exact revision; historical green checks are not substituted. Reproduction, lifecycle, rollback and retirement rules are permanent in [integration architecture](match-engine/INTEGRATION_ARCHITECTURE.md).
`;
save(
  'docs/PR200_MATCH_ENGINE_INTEGRATION_CANDIDATE_RECEIVER_MOTOR_AND_BOUNDED_PERCEPTION.md',
  report,
);
console.log(
  'PR200 report',
  matches.length,
  'matches;',
  local.rows.length + changed.rows.length + fresh.rows.length + (diagnosis?.rows.length ?? 0),
  'receiver continuations; NOT READY',
);
