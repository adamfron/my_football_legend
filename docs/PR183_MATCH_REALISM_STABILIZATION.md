# PR183 — Match Realism Stabilization

The closure candidate fixes the saved loose aerial-ball lock, the seven frozen R3
retreat regressions, and a selected free-kick delivery whose receiver run was lost
after a substitution. **Mechanical closure and full local verification pass.**
Merge requires green checks on the final PR head.
**Canonical remains NOT READY for summary-simulation calibration.** B
`state-value-v1` remains the provisional default; all five policies remain available.

## Source and evidence boundaries

The merged PR182 baseline is `16c2e71efcec98862b6d6c996f0737f02131235e`.
The rejected PR183 draft is `94550a3dd66d63f3386c1d42584893a2f8b2273c`, production
digest `be41fcb550b6d049343df36acc576c298e62bdc77e0510d887b238e64d0b06b1`.
Its original report and receipts remain historical evidence in
[PR183_REJECTED_DRAFT.md](PR183_REJECTED_DRAFT.md).

Frozen simulated production commit: `a5c11fa2b64607a3ae83a7bc95de2f29ed4b0ff9`.
Simulated production digest:
`4eef2287eb08f2990a0e728776eaaf2d316383d1844664f5d2fc552976cdc295`.
The final compilable source digest is
`57863da9df8f0a8c8c4bb6f638a85ea0d6272c271f409734a7501e8977b39321`.
Commit `71c2152c1acf348aae0d9148a9a5a06e3efb198b` only adds `| undefined` to two
optional TypeScript parameter declarations. All **324 production TS/TSX files**
emit byte-identical JavaScript, and Node's transformed changed module is identical;
runtime dependencies are unchanged. [The explicit type-only bridge](performance/PR183-closure-type-only-bridge.json)
preserves both source identities. Simulation receipts retain their actual frozen
hash; a type correction is not presented as a new independent experiment.
Freeze commit: `c9299bd8a819ed8f1dc8d6a853381fed8236bb6d`.
[The committed freeze](performance/PR183-closure-freeze.json) records source,
development/confirmation harnesses, unused input hashes and acceptance criteria
before the new confirmation's first tick. Physics remains 0.025 s.

All five owner exports and both supplied analyses were examined. Their byte hashes
and provenance remain in [PR183-owner-evidence.json](performance/PR183-owner-evidence.json).
The owner observed R3 retreats, ineffective support, very early substitutions,
abandoned dribbles, ownership churn, fouls, passive keepers, high conversion and
excessive circulation. Those observations guide investigation; text embedded in
telemetry is evidence, not an additional instruction source.

The original complete initial state was not exported. Matching seed and clubs
reconstructs only **37/2820** sampled player positions. Four native PR182 episodes
are therefore labelled mechanical reproductions matching player/defect anchors,
not exact reconstructions of the owner's hidden decisions. The three additional
closure episodes are exact deterministic reconstructions of the rejected draft's
consumed cohort inputs. They are regression evidence, not independent confirmation.

## Mechanical closure

The loose-ball failure at 239.625 s kept a ball near 1.7 m supported over a crowd.
The loose branch could attempt foot acquisition but did not run the reachable
aerial-contact lifecycle used by deliveries. It now uses that same resolver.
The saved state produces a physically reachable header clearance after **0.025 s**,
without granting secure possession. Height, contact point, reach and repeat-contact
locks remain authoritative. Out-of-range bodies do not gain a header. In the
20-second continuation the draft makes zero decisions; the correction makes ten.
[Receipt](performance/PR183-closure-liveness.json).

R3's retreat combines release-window starvation with territorial value errors.
Routine dribble contact could consume a real foot window before ranking. Merely
reserving a tick still allowed the rolling ball to leave reach. A reconsiderable
decision now ranks and executes at the actual release window, before the routine
impulse. Human agency and already committed defensive challenges retain authority.
The existing standing-tackle regression remains unchanged and passes. Build-up
outlets and central role connections now contribute attacking value at their
actual pitch depth. There is no backward-action penalty, carry-distance limit,
forced-pass timer or remote possession grant.

| Frozen R3 episode               | Rejected draft maximum retreat | Closure maximum retreat |
| ------------------------------- | -----------------------------: | ----------------------: |
| PR182 native away12             |                         3.97 m |                  0.72 m |
| PR182 native cm13-earlier       |                         8.80 m |                  0.01 m |
| PR182 native cm13               |                         6.66 m |                  3.55 m |
| PR182 native cm14               |                         4.42 m |                  3.07 m |
| Draft development WW1           |                        38.74 m |                  1.64 m |
| Draft consumed confirmation WW1 |                        44.58 m |                  9.53 m |
| Draft consumed confirmation SW1 |                        33.25 m |                  1.34 m |

The four original PR182 states had 17.35/14.27/28.67/39.03 m before the first draft.
All seven closure continuations end with actual passes in under 20 s. Rounding
includes at most one 0.025 s endpoint difference. Complete ranks, teammates' finite
movement, role/phase/coach context and passing alternatives are retained in
[the 70 paired policy continuations](performance/PR183-closure-retreat-reproductions.json)
and its detail archive. Forward alternatives exist at real release windows;
candidate existence alone does not prove a playable forward pass at every tick.

The wider development series exposed another concrete lock: after a substitution,
restart geometry was rebuilt without the selected delivery, although that action
remained selected. An edge-support player could stay 30 m from the intended landing
point indefinitely. Rebuilding geometry now retains the selection. Tests for both
teams require the receiver to walk into range and the same lawful award to release.
Obsolete/unavailable selections still use the existing invalidation path.

## Other stabilization changes and controlled screens

The first draft corrected double-counted recoverable burst in substitution value
and priced scarce future changes. A native 147.75 s request without injury had
only +0.8078 modeled benefit. Actual numerical reasons remain in the historical
receipt; no cause is inferred solely from the owner's picture. Emergency injury,
serious mismatch and defensive reorganization changes remain available and tested.
Final cohort substitution facts include identity, legal exit/entry and the full
benefit decomposition in the compressed diagnostic archive.

Recoverable own touches use shared human/NPC finite pursuit. Nine canonical probes
retain trajectories, successful recoveries and genuine losses; pace helps in an
open race but cannot overcome arbitrary distance. Pursuit never attaches the ball
or grants possession. A stretched poke is separated from controlled acquisition,
and stale rival contact checks are corrected. Flip counts remain screening metrics,
not proof that every handover is invalid. No independent duplicate-foul incident
was established; there is no global foul-probability multiplier.

The keeper's finite positioning/rushing response considers an uncovered carrier,
angle and covering defenders. Ten prescribed one-second continuations retain
actual movement and existing catch/parry/punch authority. Seven wing role/coverage
screens retain candidate routes and physical forecasts; availability is not a
completed byline run. Some open-wing rankings still prefer recycling.

The 192 prescribed shots and 72 human/NPC parity pairs preserve distance/quality/
pressure/contact effects and identical physical execution. These controlled
releases are not league conversion estimates. Full-match shot accounting joins
physical records to counted ledger attempts by shotId; uncounted/censored releases
remain separate with their actual status. Missing resolution is not called a miss
or automatically attributed to a whistle. Expectation values are uncalibrated proxies.

Current-source controls: [carry](performance/PR183-closure-carry-recovery.json),
[keeper](performance/PR183-closure-goalkeeper-1v1.json),
[shooting](performance/PR183-closure-controlled-shooting.json),
[wing routes](performance/PR183-closure-wing-routes.json).

## Full matches, independence and remaining retreats

**30/30 development, 15/15 new confirmation and 3/3 supplemental R3 full matches finish.** The six development designs and three old confirmation designs are consumed regression inputs. The three genuinely new paired SS/SW/WW confirmation designs were untouched at freeze c9299bd; five policies on each design are three independent units, not fifteen. No previously consumed input is relabelled independent.

| Development: six designs per policy | Mean passes | Shots | Goals | Conversion | Mean fouls | Live min |
| ----------------------------------- | ----------: | ----: | ----: | ---------: | ---------: | -------: |
| legacy-pr176                        |        1679 |    15 |    12 |      80.0% |       10.7 |     86.1 |
| state-value-v1                      |        1543 |   143 |    41 |      28.7% |       40.8 |     75.8 |
| role-value-v1                       |        1667 |   124 |    37 |      29.8% |       41.0 |     76.5 |
| role-intent-v1                      |        1561 |   129 |    51 |      39.5% |       39.0 |     78.5 |
| phase-role-hybrid-v1                |        1709 |    89 |    33 |      37.1% |       33.7 |     79.7 |

| New confirmation: three designs per policy | Mean passes | Shots | Goals | Conversion | Mean fouls | Live min |
| ------------------------------------------ | ----------: | ----: | ----: | ---------: | ---------: | -------: |
| legacy-pr176                               |        1684 |     3 |     3 |     100.0% |       10.0 |     87.2 |
| state-value-v1                             |        1660 |    63 |    18 |      28.6% |       30.7 |     78.9 |
| role-value-v1                              |        1645 |    49 |    10 |      20.4% |       40.3 |     77.1 |
| role-intent-v1                             |        1550 |    58 |    14 |      24.1% |       32.0 |     78.0 |
| phase-role-hybrid-v1                       |        1588 |    44 |    14 |      31.8% |       29.3 |     76.3 |

[Current comparison](performance/PR183-closure-policy-comparison.json) contains all 48 source/input/final hashes, 30 exact-input pairs against the rejected draft and three B pairs against true PR182. In those three PR182 pairs, shots change **32→28 / 37→32 / 7→11** and passes **2451→2517 / 1447→1329 / 904→753**. Attacking behavior is not universally improved; SS circulation remains excessive. There is no policy promotion.

The 45 primary runs have **717 counted shots**. Across all 48, **751 counted attempts** have 751 matched physical details; three additional censored releases remain explicitly uncounted. Their observed interruption context is free_kick_close, without inferring an exact referee cause. Audited ball-first clean-win/loose-ball challenge attribution mismatches are **zero**. These narrowly defined checks do not prove every contact valid.

Retreat diagnostics now retain the **maximum own-goal excursion during continuous
ownership**, its pressure, duration, endpoint and recovered-forward distance.
A regression test proves that a later forward recovery cannot hide an earlier
large retreat. The old net-only metric remains labelled historical and is not
silently compared as if it measured the same thing.

All **11 R3 excursions >=15 m** across the twelve R3 full matches were replayed from hashed >12 m snapshots on the identical execution program. Development peaks at **19.32 m**, new confirmation at **23.98 m**. No 30–45 m march recurs in these cohorts. The largest new case lasts **15.15 s** and ends in a real pass; the 20.44 m case turns forward before losing ownership. Mean pressure in the audited episodes is **0.47–0.65**; actual release-ready rankings and forward candidates occur. Seven episodes end with a pass, one with a cross, and three with physical ownership loss. Some recover 25–42 m forward after retreating, which the old net-only metric concealed.

These results establish removal of the saved starvation/value-trap regressions, not a universal proof that every remaining conservative carry is tactically sensible. Some are still too passive. The complete rankings, roles/phases/coaching, pressure, actual ball endpoint and loss/contact facts are retained in [the current retreat audit](performance/PR183-closure-current-retreat-audit.json). Further route/risk calibration remains open; no artificial retreat ceiling was added.

Development and confirmation use the same peak/base observers. The confirmation
harness additionally validates the complete final state and the new manifest;
both harness digests are explicit. All fixed ticks, legal restarts, statistics and
live/dead clocks remain checked. The archive preserves five-minute pass direction,
distance, reciprocal exchanges, central receptions, line breaks, width, shots,
fouls, substitutions and actual source/input/final-state identities.

## Browser, integrity, cost and verification

Actual public-UI runs on the closure program: R3 spectator, fixture fixture-a8aec9e1, capture mode, reaches **1055.550 s (17:35.550), 2:1**, Runtime OK. A fresh human B match, fixture fixture-2a343252, controls Adam Krawczyk and reaches **343.425 s, 3:0**. Two manually selected natural-restart passes increase attempts **2→3** and **4→5**; the visible final human ledger is **6/14**. These are short genuine gameplay smokes, not a full human match. Warning/error console logs are empty. All five policies and default B were observed in the launcher. The earlier export click did not yield a file receipt, so no successful browser export is claimed. [Browser receipt and screenshot](performance/PR183-closure-browser.json).

All five policies have identical complete-state hashes for an observed 120 s run and two unobserved repeats. A complete B SS1 repeat matches the primary observed final state after **228597 equal fixed ticks (5714.925 s)**, hash 4759142910a7dc8bd18c674b390996356352fcbccae4f71ef0fcfe1ae32d820e. [Integrity receipt](performance/PR183-closure-integrity.json). True PR182 and closure golden telemetry run in fresh processes twice per seed; the existing accepted legacy hashes remain unchanged (b9a869d6… / e2f554e8…). Full identity/schema assertions remain intact. [Telemetry receipt](performance/PR183-closure-telemetry-reference.json).

Whole-match CPU is **264.141–491.062 s**, wall **237.707–487.102 s**, sampled RSS **417.52–736.40 MiB**. True PR182→closure paired B CPU is **394.719→316.454 / 423.204→406.937 / 436.749→365.235 s**. Event counts, full-match time and concurrent load differ; these are not isolated marginal-function costs.

The complete unchanged **`npm run verify` passes**, exit 0: **2027 unit + 56
match integration + 4 career contract + 5 full-career = 2092 tests**. ESLint,
TypeScript and Vite build pass. [Verification receipt](performance/PR183-closure-verification.json)
records the exact log digest and tested code identity. Earlier runs under concurrent
benchmark load hit resource limits; their red logs remain in work rather than being
presented as passes. The final complete pass ran after the full-match cohorts ended.
GitHub's final required checks remain the authoritative merge gate.

The remaining CI failure was the legacy penalty-half child reaching its original
89.5 s process budget on a shared runner. CI now gives V8 a 64 MiB maximum
semi-space for short-lived simulation objects. A complete identical-input local
probe takes **83.21 s with default GC settings and 80.08 s with this setting**;
complete result and final-state hashes are identical. A fixed 64 MiB minimum adds
no improvement and is not selected. This small measurement does not guarantee
every host's timing. [Heap receipt](performance/PR183-closure-ci-heap.json) retains
all configurations. Original 90/180 s tests, fixtures, physics and assertions remain.

The controlled-substitution UI test now advances a measured-work clock during real
canonical steps. Previously its frozen performance clock let each background slice
simulate the maximum unrelated football before React could display the completed
change. This repairs the fake-time harness: legal exit/entry, controlled identity,
spectator UI, continued football, all original assertions and the 30 s timeout
remain. No simulated match duration or physical accuracy is reduced.

CPU, wall time and sampled RSS for complete matches are in
[PR183-closure-performance.json](performance/PR183-closure-performance.json).
These are concurrent processes and potentially different football workloads, not
isolated per-function overhead. No expensive global planning at every tick was
introduced. Confirmation rejects a match above the predeclared 600 CPU-second or
7200 simulated-second budget. No test assertion/timeout or physical duration was
weakened, no fixture was shortened, and no unnecessary save migration was added.

## Answers to the 34 questions

1. R3 combined lost release windows with build-up/outlet and role connection value
   that failed to price actual attacking depth.
2. Seven frozen native cases retain actual ranks and releases. The inaccessible
   original owner's precise decisions cannot be asserted.
3. Readiness, ranking and role/phase value interact; finite movement pursuit is a
   distinct mechanism.
4. Partners move in the native traces. Literal inactivity in the original remains
   unproven; usefulness and timing vary, so movement alone is insufficient evidence.
5. Forward pass candidates and real release windows occur in corrected cases.
   Turning remains physically prepared; universal feasibility is not claimed.
6. Yes. Backward passes/carries remain legal and the recycling regression is retained.
7. Yes in all seven frozen cases: actual pass <20 s, peak retreat <12 m. This is a
   test criterion, never an engine cap. Whole-match residuals are audited separately.
8. Retreats also occur in R1/R2; the policy rows preserve their own peak measurements.
9. Recoverable burst was double-counted and scarce future substitutions underpriced.
10. The native 147.75 s request was not an injury; its full benefit calculation is
    retained. The original hidden request is not claimed reconstructed exactly.
11. Yes: emergency injury, severe mismatch and reorganization paths remain tested.
12. Recoverable own touches receive finite shared pursuit; real technical losses remain.
13. Open fast-wing probes exploit arrival advantage; no universal route-selection
    or match-quality claim follows from a controlled race.
14. Player acceleration and independent ball impulses remain finite; trajectories
    and the saved aerial rebound continuation are retained.
15. A touch may precede insecure acquisition and another contest. Flip counts alone
    cannot establish duplicate incidents; stretched control/stale checks were corrected.
16. Yes: deflections and heavy touches remain distinct from secure possession.
17. No independent duplicate-foul incident was proven. Audited attribution errors
    are narrower than a claim of no invalid contacts anywhere.
18. Excessive fouls are not fully explained by contact churn; per-technique counts
    remain visible and probabilities were not globally scaled.
19. Finite keeper positioning now considers angle reduction against an uncovered carrier.
20. Controlled rush contexts use real ETA, cover and reach, without automatic possession.
21. Existing claims/parries/punches remain; reachable loose aerial continuation now
    shares their established contact lifecycle instead of trapping the ball above bodies.
22. Selection, execution, pressure/context and keeper response all matter. Controlled
    gradients work; aggregate conversion still lacks trustworthy calibration.
23. Goals, misses, blocks, saves, frame and censoring remain separate in retained records.
24. Counted attempts reconcile by ID. Uncounted/censored releases are retained;
    exact whistle causation cannot be inferred from missing physical resolution.
25. Actual central receptions and forward-control metres are retained alongside
    invitation counts; these are distinct measures, not interchangeable claims.
26. Physical byline options remain, but reliable route choice is not demonstrated universally.
27. The release/value trap is corrected mechanically. Circulation remains excessive
    in some designs and is not fixed by adding arbitrary backward penalties.
28. Fixed-tick clocks/statistics are checked, and both proven liveness locks are
    repaired. Excessive live minutes remain a realism issue distinct from arithmetic.
29. The current per-policy development/confirmation tables report distinct profiles;
    matched rejected-draft pairs use the same six inputs. Three new paired designs
    do not establish a policy winner.
30. No blanket preservation claim is justified. Per-fixture shots, line breaks,
    width and possession outcomes are retained, including negative changes.
31. B remains the best supported provisional default from PR182; this small study
    does not justify promoting another policy.
32. R3 retains role/phase behavior and removes the seven extreme regressions;
    finite pressured backward recycling remains and is explicitly audited.
33. Circulation/live time, weak-team execution, conversion/keeper quality, route
    selection, foul frequency and censored-release causation remain unreliable
    for summary calibration.
34. The proven completion/retreat blockers are addressed here. Broader career
    development can resume with those calibration limitations recorded. Summary
    work needs focused quality/outcome evidence and new unused confirmation inputs.

## Reproduction, receipts and roadmap

Use Node with `--experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs`
for TypeScript-backed research scripts. Run frozen simulations from commit c9299bd; final-branch analysis tools explicitly verify the type-only bridge. `preparePr183ClosureInputs.mjs` materializes
inputs without stepping. `runPr183ClosureCohort.mjs --cohort=development` runs six
consumed designs × five policies; `freezePr183Closure.mjs` validates the committed
freeze; `runPr183ClosureValidation.mjs --cohort=validation` runs the three new designs
× five. Those inputs are now consumed: rerunning never restores independence.
`benchmarkPr183ClosureIntegrity.mjs` checks complete observer equivalence.
`reportPr183Closure.mjs` rejects mixed/incomplete cohorts and rebuilds compact
summaries from work receipts. `auditPr183ClosureRetreats.mjs` retains the exact
peak continuations of at least 15 m. Gzip archives are lossless; hashes identify
their detail. The complete merge gate remains **`npm run verify`**.

Numbering remains integer-only: **PR183 stabilization → PR184 Generational Renewal
& World Strength → PR185 Summary Simulation & PlayStyles → PR186 Career UX
Consolidation → PR187+ World Expansion**. PR184 retains 20–25 seasons, ageing,
retirement, youth, transfers and world strength. UX retains calendar, summaries,
archive, substitution presentation and direct goal-click shooting. Summary
calibration remains gated; no character-system scope is added to PR183.
