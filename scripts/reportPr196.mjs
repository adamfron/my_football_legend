import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { read } from './pr196Evidence.mjs';
const root = 'docs/performance/pr196',
  s = read(root + '/summary.json'),
  frozen = read(root + '/frozen-pr195.json'),
  release = read(root + '/release-counterfactuals-v1.json.gz'),
  profile = read(root + '/arrival-profile-v2.json'),
  verification = read(root + '/verification.json');
const f = (n) => (typeof n === 'number' ? n.toFixed(3) : 'unavailable');
const releaseTrials = release.rows.flatMap((r) => r.trials),
  uniqueRelease = releaseTrials.filter((t) => !t.reused);
const pairs = s.fullMatches
  .map(
    (r) =>
      `| ${r.design.toUpperCase()} / ${r.policy} | ${r.before.passes.attempted} / ${r.after.passes.attempted} | ${r.before.passes.completed} / ${r.after.passes.completed} | ${r.before.shots} / ${r.after.shots} | ${JSON.stringify(r.before.score)} / ${JSON.stringify(r.after.score)} | ${f(r.before.performance.wallSeconds)} / ${f(r.after.performance.wallSeconds)} |`,
  )
  .join('\n');
const skills = Object.entries(s.movement.bySkill)
  .map(
    ([skill, r]) =>
      `| ${skill} | ${f(r.old.mae)} | ${f(r.corrected.mae)} | ${f(r.corrected.p95Absolute)} |`,
  )
  .join('\n');
const passing = Object.entries(s.passing.byScenario)
  .map(
    ([name, r]) =>
      `| ${name} | ${r.n} / ${r.released} | ${r.directTouch} / ${r.controlled} / ${r.retained} | ${r.defensiveContact} / ${r.defensiveControl} |`,
  )
  .join('\n');
const changed =
  s.counterfactual.oldChoiceAndNewChoice
    .map(
      (r) =>
        `- ${r.design.toUpperCase()} / ${r.policy}: [saved state](${r.capture.replace('docs/', '')}); ${r.before.type} → ${r.after.type}. Exact targets, menus, scores and matched executions are retained in the counterfactual receipt.`,
    )
    .join('\n') || 'No inspected choice changed.';
const document = `# PR196 — Canonical Outcome Semantics, Defensive Reach & Match-State Calibration

## 1. Executive summary

The 0.8 m arrival predictor omitted finite body turning, relative movement speed, support loading and braking already present in canonical movement. An **opt-in** engineering forecast now calls that existing body integrator. It does not alter a defender's speed, reaction, contact surface, possession or success. On 240 held-out development geometries its mean absolute positional ETA error falls from **${f(s.movement.held_out_development.old.mae)} s to ${f(s.movement.held_out_development.corrected.mae)} s**. Maximum residual error is ${f(s.movement.held_out_development.corrected.maxAbsolute)} s. This is engine-consistency evidence, not physiological or independent football calibration.

The new original-delivery-v2 observer distinguishes direct delivery, deflected reception, control, endpoint retention, uninterrupted retention, opposition contact/control, new actions and censoring. Exact original long-pass inputs still have **${s.longPass.directTouches}/28 direct receiver touches**, but a whole-opposition observer finds **${s.longPass.allOpponentControls}/28 opposing controls**. PR195's zero contacts referred to its designated defender. That was insufficient evidence for a claim about the entire defence; historical receipts remain untouched.

Fifteen autonomous development prefixes supply ${s.harvest.captures} saved states; the first counterfactual stratum contains ${s.counterfactual.states} states, ${s.counterfactual.uniqueRequests} unique requests, ${s.counterfactual.passesRequested} pass requests and ${s.counterfactual.passReleases} actual pass releases. A complementary release-availability stratum adds ${release.rows.length} natural states and ${uniqueRelease.length} unique requests. Seven full-match pairs are reported separately below. **B remains default, corrected arrival remains opt-in, canonical NOT READY, independent confirmation sealed.**

## 2. Frozen PR195 baseline

Base: merged PR195 **${frozen.base}**. [Frozen manifest](performance/pr196/frozen-pr195.json) preserves exact normalized source hashes, original 133 statuses, all ${frozen.historicalEvidence.length} PR195 evidence blob IDs, pilot protocol/seeds, negative controls and five policy identities. PR195 source fingerprint: \`${frozen.sourceHash}\`. Existing pilot: 504 requests, 448 releases, 30 prescribed movement trials, two captures and eight alternatives. No PR195 receipt is refreshed to match new code.

\`npm run benchmark:pr195:check\` now extracts that exact merged source and runs the original inventory, 504-trial replay and summary check in an isolated directory. PR193/194 checks that assert exact kernel hashes likewise run against their original source through the historical wrapper. Current default-path replay and current-version tests remain separate. The PR195 report's skill-40 away arrival is 3.000 s; its 3.500 s example belongs to skill 20. The task's illustrative figures do not override the frozen receipt.

## 3. Registry item scope

Primary: MEAS-011, PASS-001/006/007, DEF-001/002/003/004/005, FIT-002, DEC-003/004. Secondary dependencies PASS-003/004/009, TACT-004, DEC-005/006/013 are traced, not implemented or closed. New stable discovery: MEAS-012, designated-defender versus whole-opposition attribution. All 133 historical IDs and their evidence remain; no assumption is COMPLETE.

## 4. Exact prediction/outcome definitions

Every observed episode records original actor/receiver/team IDs, request/release time, original passId or shotId, eight-second horizon, conditional-on-release denominator, terminal/censoring rules and privileged-observer information status. The controlled movement event is first entry inside 0.8 m of a prescribed target, with a ten-second cap. It is neither a contact event nor a probability.

Generated candidates, predicted admission, snapshot policy inspection, actual next-tick selection, motor readiness, executor request and real release are separate evidence stages. Existing candidate feasible/legal/readyAt/closesAt fields are preserved. A generated but unadmitted candidate may be submitted experimentally; the ordinary executor decides whether contact and release happen. It is never labelled released merely because it appears in a menu.

Historical expectedCompletion is compared diagnostically with direct intended-receiver touch before an intervening other-player touch/control, new action or restart. expectedRetainedPossession is compared separately with receiver control followed by own-team ownership one second later. These unfitted historical probability claims retain uncertain event-model fidelity; Brier/log-loss do not make them real-world probabilities. No coefficients are fitted in this PR.

## 5. Outcome attribution and censoring

Only new canonical ground/flight/last-touch witnesses count. Repeated inherited metadata does not. Any other-player contact ends uninterrupted original delivery; a later deflected receiver touch remains separate until control/restart/new release. Any player gaining control ends the original delivery. Opposing control followed by an immediate turnover cannot become original receiver success.

A rejected/unreleased request has null delivery outcomes. An absent receiver, unresolved loose ball or unavailable one-second endpoint is censored where the event remains unresolved. A boundary restart differs from a foul/offside restart. Requested shots are resolved by their own shotId and terminal outcome; a later unrelated goal cannot rescue them. Endpoint team possession and uninterrupted retention differ if the ball is lost and regained. Per-event null denominators are retained, rather than counting censoring as failure.

The 40 Hz observer can conservatively miss ordering of several releases/contacts within one tick. It does not invent a missing event to fill that gap. Full substitution and continuous sub-tick event-lineage coverage remain open in MEAS-011/012.

The released context of an existing restart remains live football. Contract v2 distinguishes that release phase from a new award. Earlier v1 receipts are retained: original non-restart counterfactual requests keep their witnessed first-action outcomes, while full-match episodes terminating on an origin or immediate restart are conservatively excluded from receiver/contact metrics, with explicit denominators and censor counts. The dedicated restart-outcomes-v1 laboratory interprets identical real kickoff continuations under v1 and v2; it changes no football state.

## 6. Defensive ETA model audit

The historical engineering estimator integrates acceleration toward desired velocity while holding target speed constant. The new optional branch calls integrateCanonicalMovement and reprojects locomotion as distance changes, carrying support balance forward. It therefore shares existing facing, directional-speed, support-loading and braking equations. It freezes physical fitness over the short forecast; actual lab movement advances fitness and sprint episodes. Contacts, tactical target changes, other-body constraints and reaction/attention are outside this positional forecast.

Direct engineering consumers include passDecision/passReception, matchActions, decisionPolicy, carryOpportunity/carryPursuit, crossOpportunity, playerDecision, reachableSpace, receptionContinuation, roleTactics, shootingOptions, spacePassing, aerialPositioning, goalkeeperClaim/Positioning and looseBallPhysics. carryRaceArrival avoids charging its old extra turning heuristic a second time when finite-body projection is enabled.

The bounded estimateUsefulContact envelope remains a separate uncertain prior (7.6 m/s, 5.2 m/s², explicit reaction/preparation). Its consumers include opportunityWindows, transitionMovement and strategicClearance. It is audited and measured without importing hidden ratings. B/R3 and other historical rankings retain their full-world information label; O/H/J scenes, candidates and selections retain hidden-rating invariance. DEF-001 remains open.

## 7. Canonical movement experiments

360 trials: five ability bands (20/40/60/80/100), twelve movement/body conditions, 4/8/15 m and two lateral mirrors. Conditions include toward/away/across momentum, standing aligned/away, accelerating, high initial speed/braking, 90°/180° facing, fatigue, low support balance and transverse runner tracking. Initial body state, velocity, facing, target, both ETA estimates, common bounded envelope, actual positional arrival, finite-foot access, turning time, minimum balance and final hash are retained in [movement-v5.json.gz](performance/pr196/movement-v5.json.gz).

Eight-metre cases are development anchors; 4/15 m cases are held-out **development geometries**, with shared orientations/skill strata. No parameter was selected on either set. Shared code naturally improves consistency; these are not independent confirmation or evidence that the physical equations themselves match real football. Low-support recovery is not a completed challenge-recovery lifecycle. Tracking cases prescribe a new objective and do not certify tactical anticipation.

## 8. Ground and aerial interception experiments

336 controlled requests cover short/progressive/through/lofted delivery, diagonal/full-speed receiver, wrong-way/close-turning/far-accelerating defenders, two defenders, weak first touch and deflection-capable geometry. Position, ball height/velocity, sampled nearby body motion, finite-foot access, support balance, jump height and canonical contact witnesses are retained. Both ETA forecasts in these controlled laboratories are evaluated against the same default physical execution; this isolates prediction error. The full-match pairs separately enable each forecast in its actual consumers. Ground projection alone never proves an aerial contact. Existing capsule/flight tests protect high-ball clearance and genuine reachable body contact; no lofted immunity is added.

| Scenario | Requests / releases | Direct touch / control / retention | Opponent touch / control |
|---|---:|---:|---:|
${passing}

Scene names describe initial conditions, not promised outcomes. A deflection-capable scene does not guarantee a deflection toward another attacker. Passive body geometry and actual jump scheduling remain as implemented; this PR does not certify calibrated aerial duel ability. In particular, the historical lofted lane-risk approximation still samples ground projection and requires a separate height-aware forecast repair.

## 9. Long-pass failure analysis

The exact 28 original development inputs are reproduced, with all opposing players observed. Their zero receiver contacts survive. The old designated-defender absence claim cannot explain all opposition. [Long-pass evidence](performance/pr196/long-pass-v4.json.gz) also measures unobstructed future travel of each **actually launched** ball as an engineering diagnostic; it does not replace live trajectories.

One-factor conditions vary launcher, receiver, distance, initial receiver movement, original/lane/remote-primary/remote-all opposition geometry, ground/lofted trajectory and initial reception orientation. Six released-state branches preserve exactly one launched-ball hash while varying receiver quality and awareness. Dispersion/physical target miss, other-opponent arrival and reception interact. Shorter or ground deliveries can reach a receiver where the original long loft does not; merely raising receiver ratings does not rescue the frozen original release. No universal long-pass success multiplier or artificial target correction is added. Wider delivery/receiver anticipation calibration is PR197 work.

## 10. Real-match snapshot harvesting

All five policies (B, R3, Opportunity, Hierarchical, Contextual) run on frozen WW/SS/SW development inputs, 600 seconds each. Total observed time: ${f(s.harvest.seconds)} s. The harvester combines the first eligible owner on a 120-second clock grid with first pressure/transition/final-third/long-option strata, capped at twelve captures per run. Reasons, exact state/seed/flags, permitted scene and observation age, menus, policy values and next-tick traces are retained. It does not store full-match tick streams or open independent inputs.

Candidate opportunity labels and snapshot policy inspection are distinct from an actual autonomous release. The complementary first-two-release sampling rule explicitly conditions on physical availability and makes no representative success-rate claim. Both strata and their selection bias are reported.

## 11. Missing attacking candidate examples

The initial stratum contains ${s.counterfactual.missingBoundedPasses} unique diagnostic pass requests absent from the bounded exact menu. A full-world B alternative is never re-labelled observed bounded knowledge. Missing candidate, present-but-unadmitted candidate and executor rejection remain distinct. Boundaries such as bounded 2–36 m versus B 2–68 m remain unchanged. Candidate-window reason counts cover emitted bounded traces only, not a complete denominator across all historical policies.

## 12. Counterfactual trials

First systematic, first pressure and last captured state are selected without reading continuation outcomes. The initial ${s.counterfactual.states} states yield ${s.counterfactual.labelledAlternatives} labelled alternatives and ${s.counterfactual.uniqueRequests} unique executions. Duplicate labels explicitly share an execution key. Of ${s.counterfactual.passesRequested} pass requests, ${s.counterfactual.passReleases} release and ${s.counterfactual.rejectedPassRequests} are rejected. Successful and failed declined progressive actions are both preserved.

The complementary availability sample contributes ${release.rows.length} states and ${uniqueRelease.length} unique executions, including ${uniqueRelease.filter((t) => t.action.type === 'pass').length} pass requests. Each intervention submits exactly one ordinary action, then resumes both autonomous teams for eight seconds at 40 Hz. No receiver teleport, forced ball path, disabled defender, fabricated release or guaranteed goal occurs. Shot/hold/carry categories remain unavailable when absent; later territory, shots and restarts are phase consequences, not original-delivery probabilities. Saved input/final/sample hashes and event witnesses make each branch reproducible.

## 13. Modrić–Pulisic-inspired dynamic run laboratory

The diagonal-loft family starts a wide/deep runner already moving toward future meeting space substantially ahead of the original position. Two defenders intervene, including a poorly oriented defender; ordinary flight and autonomous pursuit/reception follow. Paired initial geometries include anticipation, early offside, unreachable/late target, overhit flight, aerial opponent, heavy touch and nearby keeper. Outcomes are recorded even when a nominal positive fails or a nominal negative succeeds. This is a structural lab, not a recreation of a historical match. Initial runner motion is prescribed; no full pre-commit recognition sequence or lawful moving-run free-kick variant is claimed.

## 14. Selected correction and rationale

experimentalCanonicalArrival is an optional persisted boolean, absent by default. Its shared ETA consumer branch reuses canonical body integration and leaves physical locomotion, foot/body contact resolution, fatigue, actual reaction and all 28 attributes unchanged. No universal ETA percentage, attacking bonus, interception roll, success quota or policy promotion is introduced. The historical default path preserves old save/replay behaviour. This is a scoped foundation repair with a costly engineering forecast; bounded subjective calibration remains a separate gate.

## 15. Baseline versus corrected prediction quality

Held-out development positional ETA MAE: ${f(s.movement.held_out_development.old.mae)} → ${f(s.movement.held_out_development.corrected.mae)} s; bias: ${f(s.movement.held_out_development.old.bias)} → ${f(s.movement.held_out_development.corrected.bias)} s. Median and p95 absolute errors, tails and strata are in [summary.json](performance/pr196/summary.json). Pass direct-touch and retention diagnostics include distinct eligible/censored counts, Brier, clipped log loss (epsilon 1e-12), reliability bins and AUC by delivery/skill/scenario. Calibration and discrimination are separate. A better locomotion estimate need not repair uncalibrated reception thresholds or improve every pass probability stratum.

## 16. Skill and geometry sensitivity

| Ability | Old positional ETA MAE (s) | Corrected MAE (s) | Corrected p95 (s) |
|---|---:|---:|---:|
${skills}

Mixed 40:80 and 80:40 passing matchups are retained. Homogeneous ability bands and paired mirrored seeds are controlled apparatus assumptions, not realistic squad distributions. The remaining short-horizon fitness approximation is measured; no single multiplier was fitted to the original eight-metre example.

## 17. Policy decision changes

The first sampled stratum changes ${s.counterfactual.decisionChanges} of ${s.counterfactual.states} inspected choices. Full before/after menus, historical scores, bounded decisions and physical branches are retained. Recognition, candidate admission, motor preparation, release, execution and later phase outcome are not merged into a success count.

${changed}

Both successful declined progressive passes and actual defensive wins occur. These findings reject a blanket conclusion that cautious football is always wrong or that a more aggressive selection is automatically better.

## 18. Full-match development results

Seven exact-input pairs retain the same seed/policy/experimental PR194 flags, differing only in arrival model. Every row is a complete full_time receipt. Separate policy results are required; pooled shots cannot hide a WW/Hierarchical regression. Whole-match pass statistics retain canonical definitions; receiver contacts/control additionally use the versioned original-action observer.

Total shots fall **75 → 67**. WW/B falls **14 → 9**, SW/B **28 → 18** and SS/Opportunity **5 → 3**. WW/Hierarchical improves **0 → 5**, and SW/Hierarchical **16 → 20**. These are single paired development fixtures per configuration, not stable population effect estimates. The mixed transfer supports retaining the optional gate, not promoting the correction globally.

| Design / policy | Attempts before / after | Completions before / after | Shots before / after | Score before / after | Wall seconds before / after |
|---|---:|---:|---:|---|---:|
${pairs}

Detailed receipts retain progressive attempts/completions, long/through delivery, contact/control/disruption, final-third and box entries, carries, available law/restart telemetry, effective time, bounded decision distributions and CPU/RSS. Unvalidated dangerous-turnover/second-ball categories, failed-interception opportunity denominators and carried-distance progression are explicitly unavailable. No invented zero fills those gaps. Full-match observer/state final hashes are preserved; the protected confirmation cohort remains closed.

Receiver/contact metrics use the same non-restart eligibility restriction in both cohorts. The summary exposes each denominator and excluded origin/immediate-restart count; raw v1 receipts remain immutable. Canonical attempts/completions and score cover the full match. Corners, throw-ins, foul stoppages and penalty stoppages come from the canonical stoppage ledger; total fouls including advantage remain unavailable.

## 19. Negative findings and unresolved blockers

Whole-opposition attribution changes the interpretation of the old long-pass pilot without changing its zero-reception result. Body integration consistency is not a calibrated useful-contact model. The subjective opponent envelope, lofted lane-risk height treatment, reception-retention quality thresholds, incomplete candidate menus, action-specific shot forecasts and actual recovery/anticipation remain open. The positive dynamic geometry can fail; negative geometries can sometimes work. Individual probability strata and full-match policies may regress despite lower ETA error.

Early apparatus runs exposed planar ball velocity without z, source-archive write races and an orientation naming convention mismatch. These are versioned exploratory failures, not football successes. Initial Windows baseline verification lacked copied historical fixtures; those ENOENT failures are not model evidence. One focused test timed out while needlessly computing unasserted historical rankings; the bounded invariance assertions now exercise all three bounded paths directly. No historical test, integration timeout or independent gate is relaxed.

## 20. CPU, memory and determinism

The arrival microprofile records 600 calls/model on the same host; wall ${f(profile.rows[0].wallMs)} → ${f(profile.rows[1].wallMs)} ms. It is concurrent-host evidence, not a serial speed guarantee. Full-match CPU/wall/RSS and host are retained per row above. The accurate forecast is more expensive and remains opt-in. The 10–15-minute no-debug full-match target is not claimed achieved. Physics stays 40 Hz; no extra football delays or simplified contacts are used to improve statistics.

The optional forecast reuses a private projection state/body and memoizes only inside one pure ranking transaction. No cache survives a physical tick or changed world view. Exact checks preserve all 360 movement rows, 90 B/R3 rankings, 45 physical ticks and 71 saved full-match prefix states from the earlier unoptimized runs. Baselines ran under heavier host concurrency than the final cohort; elapsed wall ratios are confounded, and CPU totals also depend on the changed football trajectory. Only the matched ranking experiment isolates the implementation optimization; no universal full-match speedup is claimed.

Saved-state, repeated execution, bare canonical continuation, mutating sample/decision observers and hidden-rating regressions protect neutrality. \`benchmark:pr196:replay\` checks current canonical continuations from every policy/design with both arrival flags and reproduces original sampled branches. Raw verification logs and exact commands are retained in [verification.json](performance/pr196/verification.json).

## 21. Updated registry statuses

[ASSUMPTIONS_REGISTER](match-engine/ASSUMPTIONS_REGISTER.md) appends each scoped test, historical status, measured result, changed mechanism, full-match evidence and remaining I/F/E/T/M/C gates. MEAS-012 is appended with stable identity. All historical IDs remain. No entry is marked COMPLETE, and no source rewrite/green CI/single lab is treated as independent confirmation. Implementation commit: \`${verification.implementationCommit ?? 'recorded by the PR source manifests and final head'}\`.

## 22. Recommended PR197 scope

Start with a smaller PASS-001/006/007 + MEAS-011/012 bundle: validate the whole-opposition delivery ledger and sub-tick lineage, isolate long-pass launch dispersion/receiver anticipation on identical released balls, and give direct touch/control/one-second retention explicit forecast contracts. Add a height-aware lofted intervention forecast before interpreting a ground-projection lane penalty as interception. Optimize the finite-body predictor only with exact-output equivalence and fresh runtime evidence. Keep DEF-001's bounded observation-based capability calibration separate from privileged engineering forecasts. Do not simultaneously tune all utility, shots, fatigue, keeper or tactics.

## 23. Canonical readiness and verification decision

**NOT READY. B remains default. experimentalCanonicalArrival stays opt-in. Independent confirmation remains sealed.** Local verification status: ${verification.status}. Final-head CI is checked on the PR itself; it is not inferred from an earlier commit or embedded as a self-referential Git receipt.

Reproduction:

\`\`\`sh
npm run benchmark:pr195:check
npm run benchmark:pr196:historical
npm run benchmark:pr196:check
npm run benchmark:pr196:replay
npm run verify
\`\`\`

Recording commands refuse to overwrite versioned receipts. Full-match/harvest runners accept explicit fresh --version values; original development fixtures remain fixed. Source archives retain exact normalized contents and hashes. The experimental evidence and its limits form the next repair baseline, without claiming a real-football optimum.
`;
const target =
  'docs/PR196_CANONICAL_OUTCOME_SEMANTICS_DEFENSIVE_REACH_AND_MATCH_STATE_CALIBRATION.md';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== document)
    throw Error('PR196 report drift');
} else writeFileSync(target, document);
console.log('PR196 report', process.argv.includes('--check') ? 'CHECK PASS' : 'written');
