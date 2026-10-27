# PR198 — Receiver Synchronisation, Autonomous Opportunities & Emergent Disruption

## 1. Executive summary

PR198 reproduces PR197's exact 180 released passing-family cases and isolates all eight combinations of its three switches. On these fixed released balls the reception regression belongs to the receiver-anticipation path: direct touches/control/retention change **160/128/107 → 154/123/116**. Defensive-reception and height-aware switches have no observed post-release effect in this particular catalogue. That does not invalidate their separate release/ranking mechanisms or PR197's original 28 long-pass findings.

The new, separately flagged synchronisation experiment couples a local contact point, absolute time, incoming velocity, body objective, facing and finite movement projection. On 13 shared actual-contact cases, spatial/time mismatch falls **2.56 → 0.28 m / 0.49 → 0.06 s**. This conditional self-consistency result is **not a validated better controller**: the final 180-case outcome is **149/113/108**, with lost and gained receptions retained. The rejected first prototype's **129/102/91** remains frozen.

A separate observed-loft experiment repairs a missing bounded delivery repertoire without increasing native range. Across two 280-case autonomous cohorts, sampled loft-candidate scenarios increase **55 → 152**; actual decision witnesses reveal 24 additional short windows, giving **55 → 176** with either witness. Autonomous lofted releases change **0 → 5**. Those releases do not prove deliberate opportunity recognition or the entire desired causal chain. Research ledgers retain real deflections, keeper interventions, second balls, restarts, defender movement and dangerous losses. No chaos reward, shooting rewrite or scripted rebound is added.

**Canonical NOT READY; B remains default; all experiments opt-in; canonical arrival independently false in the paired cohorts; independent confirmation sealed.**

## 2. Frozen PR197 source and evidence baseline

Base: merged PR197 `fb8e38fce3087a0713a26cfafb5cde6f1e6c0097`; implementation/report head `9d8daa6db3ea89d2dade51bf9de3365ee521d763`. The [frozen manifest](performance/pr198/frozen-pr197.json) binds normalized source fingerprint **`1123b7ca2a220622bd619b1eb7b24f6495cd1964cc97c10025777188fa05a435`**, all 134 historical ID/status pairs and Git blob identities for PR195–197 receipts. No historical receipt is rewritten.

[Released states](performance/pr198/releases-v1.json.gz) reconstruct all 220 original PR197 family inputs, assert exact historical input and launched-ball hashes, and freeze **180 genuine releases plus 40 rejected requests**. Every reception branch starts after that kick. Actor/receiver, initial body, seed, pass ID, release time, actual ball and original source identity remain attached. The earlier 28-case long-pass experiment is preserved and independently source-replayed; it is not replaced with these easier family cases.

Windows checkout conversion initially caused historical byte/template checks to fail. Working files were restored to their authoritative Git bytes and line-ending rules prevent recurrence. This is an environment correction, not refreshed evidence or weakened historical expectations.

## 3. Registry scope

Primary: PASS-004/006/009/010, TACT-001/002/004, DEC-003/004 and MEAS-011/012. Scoped dependencies include PASS-003/007/011/012, DEF-003/004/010, TACT-003/006/009, DRIB-002/003/009, SHOT-006/007 and DEC-008. Restart dependencies REST-004/009/012 remain open; no new restart strategy is implemented.

The [register](match-engine/ASSUMPTIONS_REGISTER.md) updates 22 existing entries and adds **TACT-013**, preserving every old identity and order. I/F/E/T/M/C remain separate. There are **135 open identities, zero COMPLETE entries**. Local implementation evidence cannot close empirical calibration, tactical validity, match transfer or independent confirmation.

## 4. Separate experimental ablations

All rows share the same 180 already released balls; canonical arrival is false throughout. Control and retention below require the direct-touch path. All have explicit released denominators and censor counts.

| Model | Released | Direct touch | Direct-path control | Direct-path retained 1s | Censored |
| --- | --- | --- | --- | --- | --- |
| baseline | 180 | 160 | 128 | 107 | 0 |
| defence | 180 | 160 | 128 | 107 | 0 |
| height | 180 | 160 | 128 | 107 | 0 |
| receiver | 180 | 154 | 123 | 116 | 0 |
| dh | 180 | 160 | 128 | 107 | 0 |
| dr | 180 | 154 | 123 | 116 | 0 |
| hr | 180 | 154 | 123 | 116 | 0 |
| combined | 180 | 154 | 123 | 116 | 0 |
| synchronized | 180 | 149 | 113 | 108 | 0 |

D = defensive reception, H = height-aware passing, R = receiver anticipation, S = synchronisation. The full D/H/R factorial is computationally bounded at eight seconds per release. D and H have zero observed marginal and interaction effect in this post-release catalogue; all R-containing arms coincide. Release-time candidate ranking and launch decisions are held fixed, so this is not a claim of zero effect in live autonomous football. Paired mirrors/seeds are dependent; no independent Bernoulli significance or real-football calibration is asserted.

## 5. Receiver spatial forecast analysis

PR197's `projectLiveReceptionTarget` returned the motor body's offset movement target while callers stored it as a contact location. Its local planner could also return the last low sample even when its ETA exceeded the sampled 2.4-second future. Position and contact-time evidence therefore described different meetings.

The experiment stores a distinct `meetingPlan.contactPoint`, `movementTarget`, `contactAt` and observed incoming velocity. Failed local prediction has no release-time engineering fallback. Missing/stale/future/owned observations cannot supply a new contact. Ordinary tactical movement continues when no prepared contact exists; this does not certify every inherited off-ball/aerial controller as bounded.

## 6. Receiver temporal forecast analysis

Previously, a revised observed point retained `receptionPreparation.expectedArrivalTime` from the release-time engineering calculation. Locomotion urgency and continuation scheduling could therefore refer to another meeting. An observed point alone is not a complete plan.

The new locomotion/facing branch consumes the local absolute clock. The release-time point/clock remain historical diagnostics. An attainable commitment is revalidated against a new actual observation and retains its absolute time when that observation agrees. The rejected prototype instead selected distant middle-horizon samples and repeatedly deferred the meeting; its poor results are retained as negative evidence. The final three-probe shortlist starts around the existing local analytical ETA. Quantized local flight, frozen short-term fitness, observation gaps and shortlisting remain approximation limits.

The inherited movement-authority expiry still uses the release-time reception clock when another coordination target competes. Its match-level frequency and the release-time awareness gate remain unresolved source-level synchronisation questions under PASS-004/009; this PR does not claim that every consumer of preparation has become coherent.

## 7. Body orientation and braking

At most three candidate body projections reuse `integrateCanonicalMovement` at 25 ms, including initial velocity, finite acceleration, speed-dependent turning, plant load and braking. The same approach/facing rule is consumed by live movement. Initial momentum, braking distance, turn angle, projected balance and facing error are recorded.

No snap, instant braking or physical speed-cap increase is introduced. Receiving effort does change: the local plan's sprint demand replaces the older distance/urgency effort choice. That component is part of the experiment and still requires its own negative-case ablation. The two local 25-sample passes and three projections are bounded; only the intended receiver uses this path at the existing 10 Hz planning cadence. Forecasted reach is not guaranteed execution: other bodies, perception changes, articulated pose updates and changing fitness can invalidate it.

## 8. Contact preparation and finite-surface access

Candidate admission uses the existing finite foot geometry, low-ball height and motor-ready time. Canonical contact, surface choice, impulse, support balance, first-touch ability, pressure and control remain authoritative. No foot radius, gravity, passing accuracy, restitution, attribute or first-touch bonus changes.

Detailed frames retain last actual observation/time/age, approximate uncertainty, point/time, incoming velocity, body target/facing/momentum, support leg/balance, foot accessibility, actual contact and reception outcome. Foot accessibility, touching, cushioning and retained ownership are separate. The body projection does not establish anatomically calibrated chest/thigh/head reception or a guaranteed correctly prepared surface.

## 9. Same-release baseline versus corrected outcomes

PR197 combined is the relevant physical baseline for S: **154 touches, 123 direct-path controls and 116 retained paths**. S yields **149, 113 and 108**. Paired transitions include **8 lost touches and 3 gained touches**; these do not cancel the harmed cases.

| Family | Combined n/touch/control/retained | S n/touch/control/retained |
| --- | --- | --- |
| short_ground | 20/20/20/20 | 20/20/20/20 |
| medium_ground | 20/20/20/18 | 20/20/19/18 |
| progressive_ground | 20/20/15/15 | 20/20/14/14 |
| through_ball | 20/20/14/13 | 20/20/12/12 |
| long_ground | 20/18/8/8 | 20/18/8/8 |
| long_lofted | 20/4/2/2 | 20/4/1/1 |
| moving_lead | 20/16/10/9 | 20/16/8/8 |
| cross_field | 20/16/14/11 | 20/11/11/7 |
| first_time | 20/20/20/20 | 20/20/20/20 |

| Contact subset | n | Spatial MAE m | Temporal MAE s |
| --- | --- | --- | --- |
| combined shared contacts | 13 | 2.557 | 0.493 |
| synchronised shared contacts | 13 | 0.278 | 0.058 |

The meeting-error subset was predetermined: skill 20/80 and sample 0, 18 deliveries per controller. Fourteen combined and thirteen S cases have both a contact and a retained local plan; the common paired subset has thirteen. Every measured point here comes from a real finite-surface witness. Errors are conditional on contact and cannot score the missing contacts as zero, establish real-football calibration, or outweigh harms in the full 180-case denominator.

An eight-second original-delivery-v3 contract ends the original route at real incoming redelivery, another action, control/restart or horizon. Later autonomous football cannot rescue the initial reception. Fixed actual launch errors remain fixed; the controller does not learn the intended final landing point. Conditional spatial/temporal contact diagnostics are available only when their witnesses exist; a missing contact is not assigned zero error.

## 10. Negative receiver cases

The [sensitivity matrix](performance/pr198/sensitivity-v2.json.gz) has **448 trials: 16 frozen balls × 14 initial conditions × two controllers**. It covers early/late awareness, facing away, sprinting toward, lateral and retreating momentum, accelerating approach, plant balance, first touch, agility, concentration/reading and nearby pressure. Stationary/moving, weak/strong and mirrored deliveries remain.

S destroys **17** previously achieved touches and gains **10** in this matrix. Delayed awareness can improve some original controls; it can also miss the delivery. All difficult attempts remain in the denominator. We do not infer benefit by avoiding them.

One exact example is `moving_lead`, ability 20, sample 0, actual ball hash `e857cef4aebfa9c0e02f9e15373c321c40864aed238976fddc9637aceec526db`: under the PR197 receiver controller, delayed awareness changes a failed control into control with touch at 15.000 s. This is one paired development case, not evidence that delay is generally beneficial; no such control gain occurs under S in this selected sensitivity set.

Incoming speed/height are stratified across actual ground/lofted releases. Changing either after release would violate the fixed-ball experiment, so they are not falsely labelled independent same-ball interventions. A standalone second-contact scheduling intervention is unavailable; actual recovery and subsequent contests are measured. Further controlled incoming-state and second-contact apparatus remains open under PASS-004/006 and DRIB-009.

## 11. Autonomous run opportunity chain

Both 280-case cohorts begin with a standing wide attacker and autonomous teams. Fourteen conditions cover an emerging lane, movement before passer selection, good/bad defender orientation, recovering opponent, longer target, shorter ground option, early/late attempt, offside, poor delivery, poor first touch and closed corridor. Each uses 40/80 ability and mirrored geometry on fixed development seeds.

| Model | Scenarios | Sampled loft | Decision-only additions | Either witness | Autonomous loft releases | Forced alternatives |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 280 | 55 | 0 | 55 | 0 | 7 |
| loft | 280 | 152 | 24 | 176 | 5 | 6 |

Native menus are sampled every 0.2 s; actual bounded decisions/preparation/attempts are witnessed. A receiving-position adjustment, transition run and structural movement are labelled separately. Each first causal attempt closes at the original passer's first release or opposing control. Reacquisition cannot finish an earlier attempt. Stages are not a nested probability funnel, and full-world sampled menu absence is not exhaustive proof of absence. Deliberate runner recognition remains a major unresolved first stage even when a later lofted release occurs.

The 24 decision-only candidate scenarios show why sparse sampling cannot certify absence in a short window. Final reporting uses their union with sampled presence. B/R3 sampled candidate presence is not actual admission; readiness there is unavailable. The raw apparatus's older `admissibleLoft` presence proxy is not promoted into that claim.

## 12. Candidate-generation and admission gaps

The native bounded transition branch derives a ground through action from an observed moving teammate but offers no lofted delivery. Consequently O/H/J have **zero lofted-candidate scenarios in 168 baseline trials**. B/R3 retain different full-world menus and their existing conditional loft generation.

The independent `experimentalObservedLoftedPasses` experiment adds at most two distinct lofted through candidates to already observed moving teammates. It requires recent, sufficiently reliable evidence and retains the native 36 m receiver/target range. B/R3's ordinary 68 m envelope and observation limits are not enlarged. Proposed own kicks reuse the existing launch routine; future kick error, hidden opponent ratings, unseen bodies and canonical future state are unavailable.

Lofted local lane evaluation uses a common approximate height envelope rather than a ground ray. Candidate preparation and benefit/risk use existing consequence units; no loft, initiative or chaos bonus is added. The executor still rejects impossible contacts. Seven baseline forced alternatives and six experimental forced alternatives are separately labelled; their successes prove only local execution possibility, not autonomous recognition.

## 13. Scoped corrections and causal justification

| Demonstrated issue | Scoped action | Remaining gate |
| --- | --- | --- |
| Offset body target stored as contact; revised point with old clock | Separate observed meeting plan and shared movement/facing consumption | Final reception outcomes still regress |
| Beyond-horizon low sample treated as a meeting | Finite body/surface admission on a bounded shortlist | Approximate local flight, body collisions and anatomical preparation |
| Replanned meeting drifts forward and skips attainable earlier samples | Preserve revalidated absolute commitment; shortlist around local ETA | No parameter fitted to a touch quota |
| Observed moving receiver has no native bounded loft alternative | Independent two-candidate delivery experiment | Recognition, admission, selection and successful reception remain separate |
| Ordinary carry touches/loose intervals/optional rebound tag mislead diagnostics | Versioned observer corrections using canonical contacts, ownership history and keeper outgoing ball | Empirical state value and comprehensive causal attribution remain open |

The failed S prototype, inferior final S outcomes, unsuccessful forced kicks, defended runs and missing opportunity recognition are not removed. No global utility, shooting, goalkeeper, stamina, restart or defensive-strength rebalance occurs.

## 14. Disruption and second-ball diagnostic contract

`disruptionLedger.ts` is imported by research harnesses/tests, not the acting policy. It observes first intended/unexpected contacts, finite unowned deflections, shot catch/parry, actual keeper rebound, loose-ball onset/location, next controllable action, defender displacement/orientation, defensive-line spread, nearby support, cover, turnover location and legal restart type/spot.

Nearest-two-per-team positional ETAs are engineering estimates; they do not award or guarantee future ball contact. Threat is the existing **uncalibrated positional proxy**, not measured goal probability or fitted V. Actual opposing shot witnesses are separate. Shape change is descriptive; paired alternatives investigate causality without naming every subsequent movement an effect of the initial action.

The first observer revision overcounted owned carry touches as deflections and missed ownership losses through a loose interval. It also relied on optional `reboundSource`, which the live shot path does not always populate. Those exploratory receipts remain. Final revisions require actual finite contacts and a keeper parry with an unowned outgoing ball, and retain the previous controlling team through the loose interval. Three complete observer-only replays require identical physical final states/ticks/initial states; saved-prefix tests additionally compare bare, hostile bounded-observer and disruption-observer execution.

## 15. Shot and rebound laboratory

[64 original shots](performance/pr198/rebounds-v1.json.gz) span four preregistered geometries, two ability bands, four development seeds and mirrors. **Two** create a genuine original-shot keeper contact followed by an unowned physical ball. Catch, miss, block, defended shot and successful keeper-away outcomes remain. No rebound, corner, support-player recovery or goal is guaranteed.

The broader paired ledger compares one requested hold/pass/driven shot and then autonomous football. Rebounds generated by a later autonomous shot are phase consequences and cannot be credited to the initial hold or another original shot. Available categories include finite deflection, keeper catch/parry, loose contest, control and legal restart. Calibrated second-ball value, full anatomical keeper-hand calibration and a complete technique repertoire remain missing; no new shot technique is introduced.

## 16. Pressured diagonal and territorial clearance laboratories

The [paired laboratories](performance/pr198/disruption-v3.json.gz) compare short pressured passing, ground diagonal, contested loft, distant-exit requests and control/short/long/touchline challenge clearances. All resulting contacts, ownership, positions, legal restarts, cover and opponent-shot witnesses are retained. A requested distant target does not establish a distant throw-in.

| Scene | Branches | Finite unowned deflections | Loose episodes | Keeper rebounds | Turnovers | Opponent shots |
| --- | --- | --- | --- | --- | --- | --- |
| shot_protected | 12 | 6 | 6 | 0 | 10 | 0 |
| shot_support | 12 | 2 | 2 | 0 | 1 | 0 |
| shot_challenged | 12 | 10 | 13 | 1 | 10 | 0 |
| pressured_diagonal | 16 | 11 | 15 | 0 | 4 | 0 |
| pressured_short | 16 | 1 | 12 | 0 | 11 | 0 |
| clearance_emergency | 16 | 7 | 7 | 0 | 0 | 8 |
| carry_corridor | 12 | 1 | 6 | 0 | 3 | 0 |
| carry_challenged | 12 | 2 | 10 | 0 | 3 | 0 |
| carry_exposed | 12 | 0 | 6 | 0 | 7 | 0 |
| carry_counterattack | 12 | 9 | 31 | 0 | 13 | 2 |

Existing clearance execution is a finite ground impulse after the legal duel. It does not implement a separately calibrated emergency lofted-clearance motor repertoire. Where the desired distant playable contest/restart is not produced, that outcome is **not elicited**, not manufactured. DEF-010, PASS-012 and TACT-006 retain the physical/valuation gaps. A technically incomplete long action and a dangerous completed short pass are not assigned identical consequences by the observer; their common calibrated action value remains future work.

## 17. Defender carry opportunity laboratory

The actual carrier is an existing centre-back, not a renamed midfielder or privileged historical identity. Open corridor, immediate challenge, exposed cover and near-own-goal counterattack cases compare hold/pass/carry. Ordinary canonical travel, finite touches, lost control, successful defending and recovery continue. Actor paths and real challenges are retained; the counterattack case runs up to 12 seconds.

Native on-ball menus already contain carries. The unconditional centre-back/defend protection in `receivingPositions` governs off-ball recruiting; it is not a universal physical carry ban. No verified on-ball prohibition justified another role-gate fix. Technically strong defenders are not forced to become liberos, and no defender dribbling bonus is added. Counterattack trials retain genuine losses and reduced cover; no opposing shot is guaranteed. Dedicated **TACT-013** covers comparative role/initiative/cover value, with broader tactical liberalisation deferred.

## 18. Expected-value modelling implications

The modelling objective remains `Q(s,a) = Σ P(o|s,a) [R(o,s,a) + V(s′o)]`, using comparable units and genuinely feasible alternatives. The new ledger supplies observed states; it does not calibrate P or V. Territory, a keeper rebound, a corner and controlled possession are distinct outcomes, and unpredictability has no intrinsic positive value.

Existing positional threat and candidate risk are declared heuristics. Paired shot/pass/hold/carry/clearance results include bad attacking choices and successful defending. No probabilities are fitted from highlights, no safe action is assumed perfect, and no global shooting/utility rewrite is hidden in this PR.

## 19. Policy selection differences

| Policy | n/arm | Loft presence baseline→experiment | Ready-now native decision witnesses | Loft releases baseline→experiment |
| --- | --- | --- | --- | --- |
| B | 56 | 23→23 | unavailable (full-world) | 0→0 |
| R3 | 56 | 32→32 | unavailable (full-world) | 0→0 |
| O | 56 | 0→35 | 0→28 | 0→3 |
| H | 56 | 0→51 | 0→44 | 0→0 |
| J | 56 | 0→35 | 0→28 | 0→2 |

| Band | n/arm | Position-job recognition baseline→experiment | Loft presence baseline→experiment | Loft releases baseline→experiment |
| --- | --- | --- | --- | --- |
| 40 | 140 | 36→36 | 48→123 | 0→1 |
| 80 | 140 | 18→16 | 7→53 | 0→4 |

B/R3 use full-world action menus; bounded O/H/J use whitelisted scenes. Deliberation/preparation and actual release are distinct. Five bounded autonomous lofted releases are a new execution-stage observation, not five complete deliberate run chains or assists. Higher skill is varied without named-player privileges; these dependent small cohorts do not establish a universal monotonic recognition rate.

The stronger band produces four releases versus one in the weaker band, but fewer receiving-position job/candidate scenarios. This non-monotonic recognition proxy remains a calibration failure, not a reason for a scripted skill bonus. The own-team ability band varies runner attributes too; this is not an isolated passer-only causal effect.

## 20. Full-match development comparisons

Seven preselected WW/SS/SW pairs cover B, R3, O, H and J, including WW/O, WW/H, SS/O, SW/J and SW/B. Both arms use common PR194 recovery/restart/transition/clearance/perception/receiving-position/tempo experiments and all three PR197 flags. Canonical arrival is false. Only S and observed loft repertoire differ. These complete-match pairs do not separately identify their interaction; local laboratories provide the controlled component comparisons.

| Pair/model | Attempted/completed | Shots | Score | In-play min | Wall / CPU s | Peak RSS MiB |
| --- | --- | --- | --- | --- | --- | --- |
| WW/O/baseline | 1031/378 | 0 | 0–0 | 86.2 | 786.1 / 816.1 | 477.1 |
| WW/O/corrected | 1026/391 | 0 | 0–0 | 85.2 | 772.4 / 801.5 | 468.5 |
| WW/H/baseline | 908/364 | 3 | 0–2 | 85.1 | 780.7 / 808.5 | 558.4 |
| WW/H/corrected | 912/375 | 3 | 0–0 | 85.3 | 704.2 / 733.5 | 471.0 |
| SS/O/baseline | 1412/711 | 5 | 0–2 | 84.0 | 714.4 / 744.2 | 476.6 |
| SS/O/corrected | 1374/780 | 11 | 3–2 | 81.9 | 770.5 / 800.5 | 584.7 |
| SW/J/baseline | 1072/472 | 29 | 13–0 | 84.3 | 727.3 / 761.0 | 501.5 |
| SW/J/corrected | 1071/547 | 30 | 10–0 | 82.2 | 751.5 / 785.4 | 490.0 |
| SW/B/baseline | 1436/945 | 22 | 8–0 | 81.2 | 592.9 / 629.1 | 587.2 |
| SW/B/corrected | 1413/959 | 17 | 9–0 | 80.2 | 487.4 / 519.6 | 593.5 |
| WW/R3/baseline | 615/412 | 15 | 1–1 | 81.8 | 552.8 / 582.3 | 569.0 |
| WW/R3/corrected | 621/434 | 14 | 2–0 | 81.7 | 542.4 / 571.8 | 578.6 |
| SS/B/baseline | 2205/1672 | 7 | 2–1 | 83.2 | 441.8 / 475.3 | 574.7 |
| SS/B/corrected | 2156/1619 | 22 | 0–1 | 81.2 | 358.5 / 386.7 | 629.4 |

| Pair/model | Non-restart releases | Direct touch / control / retained | Lofted/long/progressive | Final-third/box entries | Def.contact/control | Loose/GK rebound/turnovers | Throw-ins/corners |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WW/O/baseline | 999 | 341/366/212 | 0/50/209 | 119/9 | 504/374 | 838/0/309 | 19/1 |
| WW/O/corrected | 995 | 361/372/181 | 143/75/308 | 126/25 | 512/361 | 857/0/306 | 22/1 |
| WW/H/baseline | 876 | 347/370/228 | 0/39/141 | 74/20 | 403/299 | 704/0/248 | 19/1 |
| WW/H/corrected | 880 | 358/380/221 | 92/44/196 | 99/21 | 422/286 | 672/0/241 | 16/1 |
| SS/O/baseline | 1356 | 580/595/245 | 0/48/249 | 100/10 | 601/455 | 900/0/403 | 5/0 |
| SS/O/corrected | 1320 | 645/651/254 | 192/64/337 | 126/46 | 549/414 | 872/1/399 | 6/0 |
| SW/J/baseline | 1021 | 414/431/203 | 0/38/184 | 101/93 | 483/353 | 761/6/299 | 9/4 |
| SW/J/corrected | 1016 | 445/465/224 | 161/84/293 | 130/74 | 441/310 | 766/5/307 | 6/2 |
| SW/B/baseline | 1346 | 771/730/407 | 117/87/288 | 148/34 | 395/317 | 587/4/299 | 20/3 |
| SW/B/corrected | 1311 | 804/751/371 | 133/73/261 | 159/28 | 362/262 | 553/2/271 | 23/1 |
| WW/R3/baseline | 552 | 343/360/330 | 1/10/72 | 85/40 | 144/108 | 318/0/103 | 12/3 |
| WW/R3/corrected | 549 | 358/369/327 | 1/5/73 | 88/35 | 139/111 | 269/0/100 | 15/1 |
| SS/B/baseline | 2126 | 1379/1259/400 | 122/38/489 | 127/11 | 459/361 | 730/1/314 | 7/0 |
| SS/B/corrected | 2084 | 1356/1240/434 | 120/33/471 | 144/27 | 481/367 | 703/0/315 | 8/2 |

| Pair/model | Bounded decision menus / loft / unready | Receiving-job / moving-job instances | Native overlap/underlap starts |
| --- | --- | --- | --- |
| WW/O/baseline | 10761/0/24228 | 11115/10181 | 406/20 |
| WW/O/corrected | 10327/6386/27856 | 10388/9627 | 383/14 |
| WW/H/baseline | 11614/0/23852 | 11198/10254 | 431/31 |
| WW/H/corrected | 11705/6756/25768 | 11019/10113 | 377/21 |
| SS/O/baseline | 10906/0/27278 | 11751/10999 | 205/12 |
| SS/O/corrected | 11120/6587/35461 | 11853/11086 | 215/8 |
| SW/J/baseline | 12059/0/24130 | 11611/10794 | 271/10 |
| SW/J/corrected | 11617/5761/30226 | 10980/10285 | 292/25 |
| SW/B/baseline | unavailable (full-world) | 11352/10652 | 225/20 |
| SW/B/corrected | unavailable (full-world) | 10878/10168 | 315/20 |
| WW/R3/baseline | unavailable (full-world) | 10590/9813 | 523/76 |
| WW/R3/corrected | unavailable (full-world) | 10574/9766 | 538/90 |
| SS/B/baseline | unavailable (full-world) | 11850/11119 | 391/13 |
| SS/B/corrected | unavailable (full-world) | 10990/10359 | 156/3 |

Aggregate shots change **81 → 97**, while SW/B regresses **22 → 17** and WW/R3 **15 → 14**. Box entries regress SW/J **93 → 74**, SW/B **34 → 28** and WW/R3 **40 → 35**. SS/B receiver controls fall **1259 → 1240** despite shots increasing **7 → 22**. WW/O remains **0 → 0** shots. SW/J's **13–0 → 10–0** and SW/B's **8–0 → 9–0** remain unrealistic mismatch results. These are dependent single-pair development observations, not stable policy effect estimates.

Canonical pass/shot/score totals cover whole matches. Direct touch, receiver control, retention and delivery counts use explicit non-restart-release denominators. In the full-match table control/retention may follow an intervening deflection; those columns are not nested under direct touch. The family ablation table instead uses explicitly direct-path control/retention. Through/progressive events, territory entries, native run starts, receiving-job/moving-job instances, bounded candidate/rejection/preparation traces, actual second-ball/keeper/restart/turnover witnesses and CPU/RSS are retained in raw rows. Full-world missing-candidate denominators remain unavailable; they are not replaced with zero. Receiving-job observation instances are not unique deliberate runs.

No seed is replaced to improve a score. Interrupted v1 match prefixes belong to the rejected receiver prototype and are not counted as completed comparisons. The final cohort uses the same declared v2 seeds; observer-only reruns preserve exact physical final hashes. Policy-specific regressions and unrealistic score/circulation patterns prevent promotion even when an aggregate improves.

## 21. Performance and memory

| Process | Model | Calls | Wall ms | CPU user/system ms | Peak RSS MiB |
| --- | --- | --- | --- | --- | --- |
| serial | legacy | 240 | 4.57 | 0.00/0.00 | 226.5 |
| serial | synchronized | 240 | 34.12 | 63.00/0.00 | 226.5 |
| concurrent-1 | legacy | 240 | 5.87 | 0.00/0.00 | 224.3 |
| concurrent-1 | synchronized | 240 | 34.99 | 78.00/16.00 | 224.3 |
| concurrent-2 | legacy | 240 | 5.10 | 16.00/0.00 | 224.9 |
| concurrent-2 | synchronized | 240 | 37.17 | 47.00/15.00 | 224.9 |

Profiles use twelve actual locally observed receiver frames and 240 calls/model/process. The two 25-sample local passes, at most three body probes and at most 96 canonical movement steps/probe remain bounded. S is more expensive than the legacy forecast. Serial means one measured profile process; concurrent means two identical profile processes. Other development work competes on the host. CPU, wall and peak RSS are reported separately; CPU zero can be below clock granularity, not free work.

The observed-loft shortlist is capped at two proposed kicks. Each uses the existing four-iteration, at-most-five-second own-launch routine, not a match rollout for every speculative teammate. Full-match CPU includes that cost together with changed football and research observers; an isolated loft-generation speed effect is not claimed.

Per-match wall/CPU/RSS and coordinator concurrency receipts are separate. No noisy wall-time ratio proves a speed improvement, no 10–15 minute no-debug target is claimed, and canonical 40 Hz is unchanged.

## 22. Historical replay compatibility and verification

Old experimental fields remain optional; S depends on R and changes nothing when absent. Observed loft repertoire has its own optional scene/state flag. Save/replay persistence retains both. B, 28 attributes, RNG, gravity, contact geometry, canonical movement integration and laws remain unchanged. Historical PR195–197 source/evidence are preserved; source replay reconstructs exact archived code before read-only comparison.

Local verification: **PASS**. Exact commands, exits and compressed actual logs are in [verification.json](performance/pr198/verification.json).

```sh
npm run benchmark:pr195:check
npm run benchmark:pr196:historical
npm run benchmark:pr196:check
npm run benchmark:pr196:replay
npm run benchmark:pr197:check
npm run benchmark:pr197:replay
npm run benchmark:pr197:source-replay
npm run benchmark:pr198:check
npm run benchmark:pr198:replay
npm run benchmark:pr198:source-replay
npm run verify
```

New CI source-replay groups run reception, opportunity and disruption cohorts independently; the required quality gate includes them. Final-head CI is checked on the actual PR head, not inferred from an earlier green commit or stored as a self-referential source receipt.

## 23. Registry changes and deduplication

| Requested concept | Stable identity used |
| --- | --- |
| Value of disrupted defensive organisation | TACT-003, TACT-006 and DEC-005; dedicated PR198 development notes |
| Loose/second-ball opportunity valuation | DEC-008 and DRIB-009 |
| Shot-generated keeper rebound | SHOT-006/007 and GK-003 |
| Territorial versus possession clearance value | DEF-010, PASS-012 and TACT-006 |
| Long diagonal under pressing | PASS-010/011/012 and TACT-004/009 |
| Dynamic initiative from defensive positions | New TACT-013, linked to DRIB-002/003 |
| Advancement and rest-defence risk | TACT-013 and existing TACT-006; no duplicate physical issue |

All 134 old identities remain in order. TACT-013 is the sole new ID. Investigated entries record I/F/E/T/M/C and remaining gates individually. No local code repair or green check closes an item, and no sealed independent material is opened.

## 24. Recommended PR199 scope

Start with the remaining receiver-controller regression: freeze the **eight lost and three gained** direct-touch cases, separate spatial shortlist, speed/facing and observation-gap effects, and test achievable early contact versus later prepared control without fitting a contact quota. The final S model remains optional until its negative outcomes are explained and its proposed advantages transfer.

Then isolate deliberate opportunity recognition from structural movement using decision-time native witnesses, including full-world menu instrumentation rather than sparse absence claims. Keep actual loft selection/preparation failures and successful defending. Expand incoming-state and genuine second-contact controls before broader probability calibration.

Use the real rebound, pressure escape, clearance and defender-carry witnesses to design future comparable outcome-value experiments. Role/cover calibration and emergency lofted-clearance capability are separate follow-ups, not reasons to add a global attacking or shooting bonus. Independent confirmation stays sealed until development gates are frozen and satisfied.

## 25. Canonical readiness assessment

**NOT READY. B remains default. No experimental mechanism is promoted.** S reduces specific plan representation inconsistencies but does not yet improve overall reception; opportunity repertoire improves a stage while the intended full causal chain remains unproven. Full-match harms, observation/controller limits, anatomical calibration, territorial/second-ball value and real-football calibration remain open. The evidence supplies the next honest repair baseline, not a declaration of realistic spectacular football.
