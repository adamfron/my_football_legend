# PR212 — Shared contact timeline and balance feasibility

Base: merged PR211, `a0b3396d2d0f2e81f68d2dbc65c6aedf92c8e7ae`. Research change: an explicitly selected standing defensive foot attempt participates in the existing canonical pending-ball interval. Local result: both physical orderings, rapid consecutive real impulses, a miss, body interruption and bounded uncertainty are reproduced. Integration effect: scoped experimental chronology improves; universal contact continuity is still incomplete. Promotion: **RETAIN_EXPERIMENTAL; general arbitration NEEDS_REPAIR**. PR201 remains maintained, B remains default, 40 Hz and 28 permanent attributes remain; independent confirmation stays sealed.

## 1. Initial source audit

Read PR205/209/210/211, the product roadmap, release backlog and integration/dependency/assumption registers. The actual executor is `matchSimulation.stepCanonicalMatch` → `stepTacticalMatchCore`, with canonical movement, ball branch, defensive selection/resolution, laws and observers. No second match, private prediction world, skeleton or ball solver is introduced.

| Existing path | Physical evidence and limitation |
| --- | --- |
| `pendingStrike.ts`, `pendingStrikeInterval.ts`, `pendingStrikeState.ts` | One persisted low-pass plan, actual interval body/foot path, bounded intersection, finite impulse and remainder. PR211 cancels on any active challenge because its time is unavailable. |
| `defensiveChallenges.ts` | Selection, pressing and technique intentions are separate. Historical resolution combines body/ball distance, readiness, skill, seeded execution and risk, then chooses clean win/loose/beaten/foul/missed. Reach is not precise collision time; historical loose velocity can be seeded rather than a witnessed impulse. |
| `ballContactGeometry.ts`, `footContact.ts` | Finite carry/reception impulse, motor recovery, effective foot centres and optional lower-body geometry. Current readiness and control remain separate from intention and nominal ownership. |
| `ballAcquisition.ts` | Proximity nominates preparation; finite contact must still be available. Historical securing has a seeded contested decision; selected finite reception supplies its own control evidence. |
| `ballContactResolution.ts`, `ballFlight.ts` | Persistent body support, geometric rearming at 1cm clearance, bounded eight-pass projection, no fresh restitution for continuous contact. Passive bodies retain inherited swept-segment approximations. |
| `ballPhysics.ts` | Shared flight/rolling/ground integration; `event-v1` owns its internal ground impact and remainder. Ground events are not separately migrated into the new candidate list. |
| `canonicalMovement.ts`, `lowerBodyGeometry.ts` | Finite turning/braking/acceleration and plant balance; connected posed legs follow the canonical body. No independently integrated falling body or support-polygon failure. |
| `matchRules.ts`, `matchInjuries.ts`, `injuryStoppage.ts`, `matchState.ts` | Existing referee, availability, career injuries, medical assessment and save authority. Existing injury exposure uses one-second movement assessment and exactly-once contact episode seeds; it is not a biomechanical fall model. |

`defensiveEpisodes` protects one discrete pair engagement: ownership/ball-episode changes alone do not rearm it; release, third player and spatial exit matter. A loose episode has its inherited bounded lifetime. `recentDuel` separately protects recent discrete resolution (including existing 0.8/1.35s technique intervals). Neither is a per-surface collision latch. PR211 competing-foot contacts did not record defensive challenge episodes and its interval excluded an already serviced actor only within that invocation. Ordinary motor readiness also retains its inherited minimum recovery. These functions must not be relabelled as universal geometric rearming.

## 2. Shared timing implementation and consumers

Select `experimentalContactTimeline: standing-contact-dev-v1` together with `experimentalPendingStrike: low-pass-dev-v1` and `ballEnvironment.groundContact: event-v1`. Saved incompatible selections fail validation; historical profile application clears the selection, foot latches and an unfinished physical challenge. Omission preserves PR211 and historical techniques.

`sharedContactTimeline.ts` defines the schema-backed local-time event contract and deterministic comparator. A candidate has physical local time, kind, stable key/rank and actor where applicable. The transient foot-search witness additionally carries actual foot centre/velocity, ball, normal and search outcome; relative velocity is their difference. Eligibility uses current participation, discipline, throw-in restriction and motor readiness. These witnesses are evaluated against the real current canonical body segment, never intention order.

`beginDefensiveChallenge` preserves existing selection/risk and creates a bounded `physicalAttempt` only for an outfield standing inside-foot poke without a clearance variant. It reuses the existing effective stroke and capability with a disclosed nominal 3m/s directional poke intention. That intention changes no ball state and grants no reach. Its 25ms nominal onset, 50ms swing, 120ms expiry and 35mm contact sphere remain engineering assumptions. The stored path is not replanned after the ball moves. No permanent attribute or new RNG roll is added.

The existing canonical ball branch now runs for either a pending pass or this standing attempt. It compares prepared pass, active standing foot, ordinary competing feet, passive body/frame, whole-ball exit, uncertainty and finite expiry. Actual numeric times precede ties in a 1ns bucket; ties retain legal boundary, body/uncertainty, competing/defensive foot, intentional pass, expiry and stable identity order. Tests cover comparator ties; the corpus does **not** claim an empirically validated simultaneous articulated tackle.

Both prepared feet use `canonicalStrikeFoot`, `findStrikeIntervalContact` and `executePendingContact` → `executeFootContact`, including current capability, height, normal, actual foot velocity and finite impulse/spin. A defensive contact writes one physical loose ball, contact fact and exactly one challenge resolution; it cannot directly call secure-possession turnover or install historical random loose velocity. The unused interval continues against the changed ball. Offside/restart/referee consumers retain authority. Shared boundary handling supplies the actual crossing state/time to the existing consumer, without installing an unstruck future endpoint.

Four events per interval and 160 evaluations per actor/foot search remain bounded. Already serviced actors remain excluded for that interval; general same-actor multiple contacts inside one tick are not certified. Persistent foot latches in this selected branch require geometric separation beyond the existing sphere plus 1cm before another candidate; another actor is independent. The latch does not create a one-second possession immunity or change old discrete challenge locks.

## 3. Source-bound development corpus and orderings

[Final summary](performance/pr212/summary-final-v3.json), [full initial states/frames/contact vectors](performance/pr212/canonical-final-v3.json.gz) and [source binding](performance/pr212/source.json) identify **16 constructed scenes and 48 schema reloads**, not a football success-rate sample. Final normalized source is `048b97bfbef36dec505ba6634be1493e378127dbd086acc3d0391ed326f82464`; its archive reconstructs changed runtime, harness, focused tests and CI against the merged base.

The paired 1m/s ball scenes differ only in defender swing onset:

| Intervention | First contact and continuation |
| --- | --- |
| Defender onset −20ms | Defensive foot at **10.050447376s**, old pass interrupted; a loose physical ball, later independent recovery |
| Defender onset unchanged | Pass at **10.089198804s**, then defensive contact at **10.092010986s**; both real impulses remain |
| Defender onset −10ms | Search exhausts at **10.063995087s**; both the uncertainty and unstruck continuation remain, without selecting a winner |

The separate 0.5m/s onset −10/0/+10ms scenes all contact with the pass first; their later challenge times and impulses differ. Earlier intention is not enough to touch first. The unchanged-onset 0.5m/s case gives pass **10.078915781s** and challenge **10.083160881s**, only **4.245ms** apart. Unit contracts verify `Δv = J / 0.43kg` for every axis; complete incoming/outgoing velocity, impulse, normal and spin are retained. Touch/deflection/control/retention are separate observations.

The close 0.34m defender scene misses both intended strokes and expires without a foul. A 1m separation produces a genuine later defensive contact; 1.5m misses the prepared challenge. The escaping 8m/s ball yields retained search uncertainty in this geometry, rather than a fabricated clean miss. Restored committed/slide controls keep `challenge_timing_not_supported`; these fixtures test the unsupported consumer, not NPC admission of those techniques.

## 4. Stationary duel and repeated contact

Two scenes start with both bodies and the ball stationary. Ordinary canonical movement and later choices continue; they are not frozen bodies throughout the experiment.

| Two-second continuation | Foot contacts | Passive contacts | New acquisitions | Owner changes across loose intervals | Controlling episodes including initial | Loose seconds | Ball path length, m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stationary duel | 3 | 2 | 1 | 0 | 2 | 1.45 | 7.099 |
| Stationary close | 4 | 1 | 2 | 1 | 3 | 1.40 | 6.693 |

No rapid stationary owner oscillation is reproduced in these scenes. They do not prove the defect impossible in all configurations. Full frames preserve clocks, actor motion, physical contacts, impulses, owner/control/acquisition records, defensive episode, motor recovery and foot latches. Contact totals count distinct actor/time/impulse witnesses, never repeated snapshots of the same latest fact. Controlling episodes use ownership start, not every increment of ball episode. Later repeated physical contact is retained; the same two players are not forced to finish with a winner.

The old continuous-body versus labelled-delivery parity failure from PR205 remains open outside this selected interval. Ordinary loose/acquisition/carry paths and the same-actor within-tick exclusion still require universal contact-episode unification. This PR does not claim to have eliminated every possession oscillation route.

## 5. Continuous body support and clinch

The shared branch reuses existing body persistence and support. Continuous bodies are excluded from *new restitution candidates before searching* so that one supported body cannot hide a later unrelated candidate. Existing geometric projection remains bounded, separate from an impulse.

The local clinch fixture places two inherited spherical bodies at x=±0.25m, z=0.9m around a grounded ball. Their expanded constraints conflict slightly. Eight existing projection passes retain a residual negative clearance, zero outgoing velocity and displacement below 1cm. The receipt marks this unresolved, awards no owner and requests no referee stop. A separately evidenced finite outgoing velocity allows the ball to escape both surfaces. That apparatus intervention tests the shared ball/support continuation; it is not a new live technique or automatic escape rule.

This supports a conservative body clinch diagnostic. It does not establish leg-to-leg entrapment, ball under a fallen torso or a simultaneous compliant multi-body solver. No artificial ball ejection is added.

## 6. Body contact, laws and goalkeeper scope

An active standing attempt also nominates a swept pair of existing 0.34m torso radii, using actual body segment displacement. A fresh approaching intersection can interrupt the pass before either foot. It supplies physical body-contact evidence to existing challenge/discipline consumers. Initial overlap is not asserted to be a new impact. **The player–player impulse/remainder is unsupported**: a lawful body encounter ends this interval conservatively with `continuationUnresolvedReason: body_impulse_not_supported`; it does not manufacture a fall, force or separation. The subsequent tick retains ordinary play. This is a timing witness and explicit limitation, not a full player collision solver or validated lower-limb tackle.

Current [IFAB Law 12, 2026/27](https://www.theifab.com/laws/latest/fouls-and-misconduct/) was consulted on 1 November 2026. Shielding is lawful within playing distance subject to its conditions. Dangerous play concerns threatened injury and an opponent prevented from safely challenging; prohibited contact is evaluated separately. A fall or lying on the ball alone does not establish either offence. Handball requires actual relevant arm/hand evidence; no inferred hand contact is added. Keeper hand control has special protection. The shared standing attempt refuses protected keeper-held control; active catching/parrying and sliding techniques are not migrated. Existing referee/advantage/restart and medical authority remain.

## 7. Balance and genuine fall feasibility

Six bounded probes retain the existing plant response to stable low speed, a miss without additional evidenced body load, fast redirection, one-leg disturbed support, mild recovery and a deliberately severe reverse command. They store every canonical movement step for two seconds. `derivePlantBalance` depends on requested redirection/reversal, agility and fitness recovery, clamps balance to **0.35**, and returns support/load. It has no angular body dynamics, ground impact posture or irreversible downed state. Lower-body pose can crouch/lead/rotate connected legs but follows an upright canonical body.

A missed ball does not currently create an independently measured support-leg loading event; assigning a universal stumble from that label would invent causality. Ordinary ball impulse alone is not a justified knockdown mechanism. `gameReading` receives no fall immunity. The correct gate decision is **fall implementation BLOCKED_BY_DEPENDENCY**. Preserve these diagnostic fixtures, the existing bounded disturbance/recovery foundation and committed/slide recovery. Next work must define body impulse/support evidence, finite inability to follow the movement command, compatible ground/foot geometry, action eligibility and actual recovery posture before a downed state or ball-under-body lab can be credible.

## 8. Injury interpretation and integration

[Della Villa et al., 2020](https://bjsm.bmj.com/content/early/2020/06/19/bjsports-2019-101247) analyses injury mechanisms and situational patterns in 134 cases. [Waldén et al., 2015](https://bjsm.bmj.com/content/early/2015/04/23/bjsports-2014-094573.full.pdf) identifies pressing, regaining balance after kicking and landing after heading among important situations. The [Qatari six-season video study, 2023](https://pubmed.ncbi.nlm.nih.gov/37077782/) describes mechanisms in a small injury-case series. These are conditional observations of injuries, not denominators of all kicks, misses, contacts or falls. They cannot calibrate a per-missed-kick injury probability.

Existing `matchInjuries` already accepts contextual exposure/force and separates deterministic injury seeds from action sampling. Actual opponent-contact diagnostics can reach that **existing** exactly-once episode path. No new failed-kick/fall exposure or probability is enabled, no extra per-tick draw is introduced, and no force threshold is interpreted as an ACL diagnosis. A future exposure adapter requires evidenced support/twist/body load and independent calibration. This gate is audited/deferred, not an anatomical injury implementation; career availability, substitutions, recovery and medical stoppages are preserved.

## 9. Negative evidence, cost, verification and integration decision

Pilot v2/v3 and their reconstructible source archives remain. Earlier failed attempts retain logs: an incorrect test expectation assumed an earlier onset must contact first; frame comparison initially included extra legacy 2D point properties discarded by the save schema; a metric initially attributed a competing contact to the interrupted striker. The final observer uses schema-normalized frames and distinct real contact identities. These corrections change measurement, not historical PR195–211 results. Windows sandbox cache/atomic rename failures are distinct from native test outcomes.

Final recording cost: **3.787s wall, 5.563s process CPU**, peak RSS **440312KiB**; exact units and values are in the receipt. The apparatus includes fixtures, full frame retention and 48 reload comparisons, not a match-runtime overhead estimate. Physical standing records occupy approximately **1.1–1.2KB JSON**. Searches run only for selected local attempts and nearby candidates; no broad policy matrix is added.

Final native **npm run verify PASS: 2616 tests** (2551 unit, 56 integration, four career contracts and five full-career tests), lint, TypeScript and production build. The focused set has **47 passing contracts** across original pending-strike and new chronology tests. All 18 history/CI gates and all six source-archive reconstructions pass. Existing Vite mixed-import/chunk-size warnings remain; hosted CI is separate. Complete `npm run verify`, current exact-source replay, historical and CI validation are recorded in [verification](performance/pr212/verification.json). Historical PR211 now runs its unchanged exact assertions in a real-file export/private Git index; PR195–210 receipts/assertions retain their source contexts. Current host source guards bind PR212. Existing 28 CI jobs remain; the new small replay is in the existing main group.

Reproduce with locked dependencies and Node 24:

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr212.mjs --check
node scripts/ci/replayPr211Check.mjs
node scripts/ci/replayPr210Check.mjs --replay
node --test scripts/ci/contracts.mjs
node scripts/ci/buildManifest.mjs --check
node scripts/ci/renderWorkflow.mjs --check
npm run verify
```

Gate A/B: locally validated for the named standing foot family; broader timing/body remainder remains partial. Gate C: no oscillation reproduced in the bounded corpus; general continuity remains partial. Gate D: conservative supported-clinch diagnostic, lower-limb entrapment unresolved. Gate E/F: feasibility audit and existing recovery retained; true falls/new injury outcomes deferred. Gate G: exact source/save/history and required checks as recorded. **Local general-contact gates are not all closed, so the conditional new full-match smoke and broad matrix are not run.** Default career compatibility is assessed separately by required tests.

The next highest-priority physical dependency is common persistent foot/body arbitration with a physically justified opponent-body impulse and remainder, including overlap/tangent uncertainty. Validate that before widening to committed/sliding or downed geometry. No automatic possession, foul, referee stoppage, promotion, calibration or universal tackle support is claimed. The separate [financial roadmap correction](MFL_PRODUCT_ROADMAP.md#a-ekonomia-kariery-i-finanse) audits existing personal balances/events and proposes focused future product stages; no economy runtime changes are included.
