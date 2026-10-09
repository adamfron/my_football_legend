# PR158 — Ball Contact Geometry, Press Resistance, Duel Cadence & Tactical Pressing Intelligence

The corrected shared acquisition/contact implementation and paired matrices are complete. The fixed 90-minute windows retain their actual native end status. This is a draft for gameplay calibration: reduced attacking involvement, worse short possession spells and demanded-turn/foul counterexamples remain material limits. Engineering verification and isolated performance measurements are complete.

## Scope and provenance

The implementation starts from merged PR157 / `main`, `73c0fabed04ee4a31da85fa918f19bbc42344975`. PR158 removes body-attached controlled-ball placement, integrates finite physical contacts into the existing 25 ms match engine, makes access to an exposed ball explicit, adds situational pressing and a reusable six-axis tactical preference vector, and enlarges presentation picking independently of physical contact ranges.

The motivating interactive export could not be located. The supplied 45-minute figures—208 attempts, 97 wins and 194 possession changes—remain unverified user-reported observations. The listed causes (97 tackle, 64 interception, 28 loose-ball claim) sum to 189; the other five changes cannot be classified without the original file. The described snapshot at 752.05 seconds was also unavailable. The new restart tests establish the accounting contracts in deterministic fixtures, rather than claim to reproduce that missing capture.

Historical PR157 autonomous evidence does establish an increase in tackle density. Its twelve paired full matches reported 1,112 → 4,207 attempts, 214 → 74 shots and increased shielding/stationary high-pressure time. That historical comparison is PR156 → PR157, not the new PR157 → PR158 acceptance comparison. Keep the two distinct.

## Findings by category

| Category                             | Confirmed finding                                                                                                                                                                                           | PR158 response / evidence boundary                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Physical/mechanical defect           | PR157 recalculated controlled ball coordinates from body position and a direction/micro-offset every tick. Rotating the body could rotate the ball without an intervening foot contact.                     | Successive velocity impulses at actual reachable contacts, with the canonical rolling integrator between them. Body rotation alone cannot move the ball.                                                     |
| Physical/mechanical defect           | Ownership and broad rear/body assumptions could reject a legally reachable exposed-side ball.                                                                                                               | Shared challenge resolution checks actual ball access and torso occlusion. A careful rear-side poke may be legal if the ball is exposed; unsafe committed/sliding body contact retains foul risk.            |
| Physical/mechanical integration defect | Broad loose-ball proximity could grant ownership before actual foot reach, stop pursuit, or exclude a physically reachable competitor behind an anticipatory nominee. | Secure only at current legal foot contact; preserve chase before contact and let another reachable actor start its own preparation. Never reserve a ball or borrow a nominee's clock. |
| Presentation integration defect | Live/replay animation could redraw a carrying ball at a face-relative offset despite the new canonical finite trajectory. | Carrying frame projection must preserve canonical ball placement for live and replay rendering. Presentation cannot hide exposed/inter-contact motion behind a glued visual ball. |
| Physical/mechanical integration gap  | Initial shielding Strength metadata could not affect legal tackle success: shielding required occlusion, while a legal ball-first tackle required no occlusion.                                             | Actual protecting torso compression and relative motion load balance; Strength/Agility resist that load and change ensuing contact timing/trajectory. Exposed-side accessibility is independent of Strength. |
| Ranking defect                       | Carry expected value did not represent the preparation and exposure of the proposed turn.                                                                                                                   | Candidate-specific contact window/difficulty, defender access ETA and exposure enter utility alongside useful target space, support and ordinary passing value. No blanket ban on pressured dribbling.       |
| Tactical deficiency                  | A close/high-press preference did not adequately account for safe connected defensive outlets and the opportunity cost of pursuit.                                                                          | Readiness, lane geometry, local numbers, cover, touch quality, orientation, touchline and risk behind distinguish engagement from screening/blocking.                                                        |
| Telemetry/interpretation defect      | Intent attempts, physical contact, clean win, final recovery and team possession changes were conflated in interpretations.                                                                                 | Preserve separate canonical counters and observer measures; reachable resolved attempts are separate from all attempted intents.                                                                             |
| Telemetry defect found during review | Nearest-presser switches recounted pressure, simultaneous pressers disappeared, snapshots split carry episodes, backwards passes looked progressive, and old shot results looked like post-regain releases. | Bounded per-presser episodes, nonmutating snapshots, signed progression and actual release-time checks; seven independent cross-contract regressions.                                                        |
| Telemetry defect found during review | Stoppages/DEV restart placement leaked into transition clocks and workload.                                                                                                                                 | Cumulative censored transitions; open-play workload intervals; sent-off players and restart placement excluded.                                                                                              |
| Disproved / not established          | `scenario_changed` to `free_kick_wide` proves a real foul or advantage recall.                                                                                                                              | It only establishes a changed scenario field. DEV injection has bookkeeping provenance; a legitimate earlier released shot remains valid.                                                                    |
| Disproved                            | Every demanding rotation must fail, or elite players require an exemption from contact.                                                                                                                     | A tested elite two-contact rotation retains possession with genuine displacement under incoming pressure; the same physical resolver remains available to a defender.                                        |
| Not established                      | Fewer challenges, rotations or static episodes by themselves prove league realism.                                                                                                                          | Use the final paired matrix, outcomes and tradeoffs; no event-provider count target or universal realism claim.                                                                                              |

## Canonical architecture

`ballContactGeometry.ts` adds one bounded `controlledBallContact` and one next-contact plan. Its fields include actor, body region, intended ball position, earliest contact time, expected orientation, reachable radius, outgoing direction and difficulty. The plan is anticipation, not a reserved outcome. A changed direction can delay/revise it, a moving ball may miss the reach envelope, and a defender can intervene before execution.

Lightweight player contact geometry uses metres and the existing orientation convention: angle zero faces positive pitch y. Left/right foot regions are transformed from the body, the torso supplies occlusion, and lower-leg/head region metadata leaves later extension possible. There is no skeletal collision engine or renderer geometry in canonical football.

At an actual reachable foot contact, the engine changes ball velocity. Between contacts, `integrateGroundRolling` advances the real ball using existing canonical physics. The player no longer supplies ball coordinates through an orientation transform. Difficult turns combine heading angle, body error, angular velocity, running speed, relative ball speed, offset, balance and existing skills. Technique/Dribbling govern controlled redirection, Agility contributes preparation/balance, First Touch/Composure contribute control, and Strength has a physical role in protecting-body contests. Outside the bounded control envelope, ordinary loose-ball and recovery machinery takes over.

Defender contact ETA includes access around a protecting torso. Carrier next-contact ETA and exposure support tactical anticipation; actual resolution still requires current access/geometry. The existing seeded tackle execution model and foul/card pipeline resolve the contest. Aggression affects willingness/risk and selection, not a success premium for an identical selected contact. Pair episode/re-arm locks remain; an independent second defender keeps an independent opportunity.

Release, restart and ownership discontinuities clear stale anticipation at canonical action/step boundaries. Contact evidence is granular; `projectControlEpisodes` preserves public `touches` as one continuous control episode across several finite contacts, carrying, shielding and release. A physical contact count is not a public-touch count.

Loose-ball proximity nominates a pursuit; it cannot announce secure control. Ground acquisition
must reach a current transformed foot envelope before resolution. A waiting nominee cannot
reserve the loose ball: a different legally reachable player starts its own preparation,
without inheriting the nominee's clock or outcome. That boundary keeps loose-ball chase,
control episodes and finite contacts consistent rather than repairing flips with a timer.

The same engine resolves NPC and human-selected actions. PR155 controlled-shot and PR156 controlled non-throw-in restart ownership remain authoritative. Observers, presentation policy, rendering, projected UI picking and diagnostic clocks do not decide a football outcome or advance mutable canonical RNG.

## Coach preference and team suitability

All axes use the supported continuous range 0–1. Missing preferences map from the existing style, preserving formation/style compatibility.

| Axis                 | Actual responsibility                                                    | Main interaction                                                                                        |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `blockHeight`        | Preferred defensive depth and engagement-line access.                    | Recovery/cover abilities reduce an unsuitable high block continuously; actual cover still matters.      |
| `organisedPress`     | Willingness to engage a settled build-up when a useful trigger exists.   | Readiness/outlets, isolation, heavy touch and cover determine whether engagement is worthwhile.         |
| `counterpress`       | Willingness to exploit a recent loss and local transitional opportunity. | Geometry and exponential age decay combine; the old phase label does not impose an eight-second cutoff. |
| `compactness`        | Width/spacing of the block.                                              | Preserves central protection while interacting with flank width and outlet screening.                   |
| `possessionPatience` | Scanning delay, retention utility and support spacing.                   | Pressure and actual contact risk can make release valuable without a forced turnover timer.             |
| `verticality`        | Progressive/direct passing value, forward runs and transition urgency.   | Relative wing versus central circulation ability shifts its usefulness continuously.                    |

| Existing style    | Block | Organised | Counterpress | Compactness | Patience | Verticality |
| ----------------- | ----: | --------: | -----------: | ----------: | -------: | ----------: |
| Balanced          |   .50 |       .50 |          .50 |         .50 |      .50 |         .50 |
| Possession        |   .58 |       .58 |          .62 |         .70 |      .85 |         .32 |
| Direct            |   .54 |       .45 |          .48 |         .36 |      .25 |         .85 |
| Counter-attacking |   .32 |       .28 |          .25 |         .80 |      .35 |         .90 |
| Pressing          |   .72 |       .92 |          .90 |         .82 |      .40 |         .70 |

`deriveTacticalSuitability` evaluates the actual active XI: central circulation, channel transition, pressing capacity and recovery cover. It exposes preferred press cost and preferred line risk. `deriveTeamTacticalPreferences` makes a small continuous adaptation, preserving the preferred philosophy. No ability threshold makes a style eligible/ineligible; preferences never change physical execution quality or success draws.

`deriveEconomicalMovementCost` represents route distance, turns and existing Stamina/Agility capability in decision/assignment cost. Reading/Positioning affect assignment, and actual targets use ordinary locomotion. This can prefer a nearby useful lane or cover job over distant pursuit; it does not deduct stamina. Future coach profiles can supply `teams[side].tacticalPreferences`; recruitment, reputation and autonomous long-term manager learning are outside PR158.

## Research and clock definitions

[StatsBomb's counterpressing methodology](https://blogarchive.statsbomb.com/articles/soccer/how-statsbomb-data-helps-measure-counter-pressing/) treats pressure following possession loss as a process that can be assessed within an analytical five-second window. Pressure and recovery are distinct outcomes. [Its World Cup pressing article](https://blogarchive.statsbomb.com/articles/soccer/pressing-issues-at-the-world-cup/) also discusses possession won **or disrupted**, which is broader than controlled regain; opposition, incentives and sample size matter.

[Rangnick's Champions Journal interview](https://www.champions-journal.com/500/press-play) describes favourable eight-second recovery and ten-second attacking opportunities. These are qualitative transition references, not calibrated success probabilities or universal deadlines. [Klopp's Liverpool interview](https://www.liverpoolfc.com/news/first-team/321479-jurgen-klopp-liverpool-tactics) supports distinguishing counterpressing from high pressing and adapting to opponents that bypass the press.

[Metrica sample data](https://github.com/metrica-sports/sample-data) provides synchronized anonymous tracking/events with 0–1 coordinates on a 105×68 m pitch. Its [event definitions](https://github.com/metrica-sports/sample-data/blob/master/documentation/events-definitions.pdf) include clear ball-playing attempts, body checks and receiving duels within CHALLENGE, and some interference/dead-ball returns within RECOVERY. Those are not MFL's attempted-intent and controlled-regain definitions. The definitions document alone does not establish a factor for double-sided duel counts. Do not normalize MFL attempts to provider counts without actual deduplication and source-specific semantics.

The bounded observer separates six clocks: loss → first attempted pressure, loss → controlled regain, first pressure → controlled regain, regain → progressive action, regain → shot release, and regain → goal. Each uses 0–1 / 1–3 / 3–5 / 5–8 / 8–10 / >10-second bins. A shot release is independent of its later result, xG or goal. Progression requires signed forward geometry (at least 3 m); a backward direct/lead pass label alone does not count. Interrupted losses and regains are censored explicitly rather than later attributed to a restart attack.

## Evidence protocol and completed matched results

The base is merged PR157 `73c0fabed04ee4a31da85fa918f19bbc42344975`. The corrected current non-test match-engine source hash is `47f99f54b75785040c94e7e81c0799af79d42ceb92d501b09388c089be3ca0ba`; baseline is `ead52806e69247434e2ef41a9181994213836d0620ea227fe62bf8ce5e180351`. Both flow revisions use identical read-only observer source `e4d34d77c209739e8edc9d6cb71398d8da5b8dfd7acfd239f3ca7bde9e22e153`. All affected current exports were rerun after the loose-ball acquisition reach/chase fix. Superseded prototype measurements are excluded from the final comparison.

Six fixture families × three paired seeds × 90 canonical minutes yield 18 fixed windows per revision, 36 total. Each side has 1,620.002 canonical minutes. Both halves are explicitly started and agency disabled symmetrically. Actual horizon statuses are baseline {"second_half":4,"full_time":14} and current {"full_time":12,"second_half":6}. A pending native period-end transition is not a fabricated full-time whistle or added-time simulation. Concurrency wall times are excluded from performance evidence.

The [flow export](performance/PR158-flow-summary.json) retains every row's source/hash/status, all 22 player records, full directed pass network, outcomes and clocks. Formal intent attempts, resolved contact, loose ball and controlled recovery remain separate. This sample is football-mechanical evidence, not calibrated league realism.

### Main totals

| Metric | PR157 | PR158 | Definition / limit |
| --- | ---: | ---: | --- |
| Formal attempts | 6,645 | 4,418 | Intent commitments, not every candidate opportunity. |
| Resolved clean wins | 2,885 | 1,804 |  |
| Loose challenge results | 1,025 | 615 |  |
| Pass attempts | 13,112 | 15,770 |  |
| Completed passes | 10,005 | 13,074 | 76.3% → 82.9% completion |
| Public touches | 17,550 | 19,588 | Continuous control episodes. |
| Receptions | 10,005 | 13,074 |  |
| First-time passes | 423 | 326 |  |
| Carries | 5,027 | 3,150 |  |
| Final-third entries | 2,360 | 875 |  |
| Box entries | 308 | 119 |  |
| Box touches | 345 | 60 |  |
| Shots | 110 | 16 | Outcome frequency, separate from shared launch calibration. |
| Goals | 68 | 10 |  |
| Possession changes | 5,631 | 4,210 |  |
| Carrier episodes | 16,738 | 18,792 |  |
| Absolute rotation >180°, net <2 m | 9,372 | 8,170 | 56.0% → 43.5% of carrier episodes |
| Absolute rotation >360°, net <3 m | 5,867 | 4,098 | 35.1% → 21.8% of carrier episodes |
| Heading reversals | 24,248 | 1,743 |  |
| Adjacent-tick possession flips | 24 | 94 |  |
| Possession spells <0.5 s | 51 | 189 |  |
| Fouls | 308 | 295 |  |
| Yellow cards | 55 | 21 |  |
| Red cards | 2 | 0 |  |

The rotation diagnostic sums absolute body-angle changes over one uninterrupted carrier episode; it includes legitimate scans and opposite rotations. It does not require a one-direction circle or a named skill move. A denominator change matters as much as the count. The shot/goal and short-spell changes above remain visible even when other mechanics improve.

Final-third possession time is 14,721.200 → 5,332.750 s. Physically released-shot expectation samples are 110 → 16, their summed internal selection estimates 41.113 → 4.803 and mean 0.374 → 0.300. These are internal expectation diagnostics of actually released shots, not externally calibrated xG, unexecuted option counts or goals. Threat-flow progressive receptions are 2,141 → 4,074, linked final-third entries 469 → 310, box entries 2 → 0 and resulting shots 110 → 16.

### Paired fixtures

Each row sums three fixed 90-minute windows. Counts are baseline → current.

| Fixture | Attempts | Shots | Goals | Completed passes | Adjacent flips | Spells <0.5 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-balanced | 1,149 → 581 | 10 → 0 | 5 → 0 | 1,794 → 2,381 | 6 → 17 | 12 → 30 |
| native-433-pressing-442 | 1,237 → 784 | 19 → 3 | 9 → 3 | 1,762 → 2,317 | 5 → 13 | 10 → 28 |
| strong-weak | 579 → 573 | 30 → 8 | 24 → 5 | 1,135 → 1,538 | 1 → 17 | 2 → 34 |
| high-press | 1,242 → 964 | 15 → 2 | 8 → 1 | 1,756 → 2,262 | 4 → 19 | 10 → 35 |
| fast-wings | 1,141 → 653 | 14 → 1 | 8 → 0 | 1,809 → 2,387 | 2 → 13 | 7 → 26 |
| safe-defensive-outlets | 1,297 → 863 | 22 → 2 | 14 → 1 | 1,749 → 2,189 | 6 → 15 | 10 → 36 |

### Role participation

All 22 records and directed edges remain available per match; totals below aggregate roles without imposing a touch quota.

| Role | Public touches | Attempted passes | Receptions | Carries | Shots |
| --- | ---: | ---: | ---: | ---: | ---: |
| center_back | 2,884 → 4,250 | 2,038 → 3,755 | 1,927 → 3,339 | 154 → 538 | 4 → 1 |
| central_midfielder | 4,957 → 3,461 | 3,827 → 2,682 | 2,831 → 1,993 | 1,243 → 484 | 29 → 2 |
| goalkeeper | 112 → 41 | 102 → 41 | 26 → 5 | 2 → 1 | 0 → 0 |
| left_back | 2,402 → 3,232 | 1,811 → 2,610 | 1,802 → 2,404 | 737 → 496 | 6 → 0 |
| left_winger | 1,360 → 1,942 | 1,119 → 1,538 | 803 → 1,197 | 499 → 374 | 8 → 0 |
| right_back | 2,236 → 3,273 | 1,620 → 2,653 | 1,699 → 2,480 | 551 → 462 | 1 → 0 |
| right_winger | 1,336 → 2,313 | 1,057 → 1,893 | 729 → 1,553 | 470 → 469 | 19 → 5 |
| striker | 2,263 → 1,076 | 1,538 → 598 | 188 → 103 | 1,371 → 326 | 43 → 8 |

More aggregate passing does not prove better central connectivity. Interpret the central-midfielder row separately from defensive/fullback circulation and keep any remaining regression explicit.

### Six natural transition clocks

Both teams and every tactical context contribute. Counts are baseline → current, not counterpress-only success probabilities.

| Clock | ≤1 s | 1–3 s | 3–5 s | 5–8 s | 8–10 s | >10 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Loss → first pressure | 3,598 → 2,517 | 469 → 419 | 119 → 180 | 780 → 251 | 75 → 36 | 361 → 489 |
| Loss → controlled regain | 66 → 254 | 269 → 415 | 840 → 515 | 659 → 351 | 493 → 176 | 2,866 → 2,007 |
| Pressure → controlled regain | 80 → 203 | 619 → 629 | 1,025 → 548 | 651 → 308 | 424 → 168 | 2,319 → 1,701 |
| Regain → progression | 3 → 1 | 82 → 37 | 597 → 625 | 715 → 165 | 107 → 303 | 1,121 → 1,079 |
| Regain → released shot | 12 → 0 | 27 → 0 | 7 → 0 | 9 → 3 | 2 → 0 | 14 → 5 |
| Regain → goal | 2 → 0 | 17 → 0 | 16 → 0 | 4 → 2 | 2 → 1 | 14 → 3 |

Observed losses 5,502 → 4,075, controlled regains 5,193 → 3,718, incomplete/censored loss transitions 309 → 357, and censored regain chains 5,189 → 3,712. A chain can progress or shoot before later censoring; those are not exclusive endpoint classes. Shot release is separate from later shot result, xG and goal.

### Finite-contact and demanded-turn lab

The [paired contact summary](performance/PR158-contact-paired-summary.json) contains 55 cells × 32 paired seeds × six seconds per revision (1,760 trials each). The initial open-play carrier episode stops at first ownership loss **or stoppage** before counting the interrupted movement interval. Six-second defender outcomes still describe the entire trial. Final retention is not equivalent to uninterrupted dribble retention: a foul/restart can later return the same actor to ownership. Demanded sharp/roulette cells deliberately revise targets; they are separate from autonomous selection frequency.

Across all cells, >180°/net<2 m diagnostic trials are 112 → 36; >360°/net<3 m trials are 2 → 16. Final retained ownership 984 → 523, pass releases 96 → 128, attempts 1,195 → 1,529, clean wins 584 → 558, loose results 154 → 152 and fouls 90 → 369. Preserve contact-lab regressions; full-match foul density is a different sample. PR157 finite contact counts are unavailable/null; PR158 records 23,488 initial-episode contacts.

The current low-roulette cell has 32/32 fouls and 0/32 final ownership, so its endpoint cannot establish a technical-control failure. The independent canonical low-turn regression supplies that narrower contract. The elite cell has 24 → 24 fouls and 2 → 16 full low-progress rotations; retain that worsening result alongside the successful physical possibility test. Interrupted initial episodes number 90 → 369.

| Lab cell (32 trials each) | Final retained /32 | Pass released /32 | Mean owned net m | Mean owned travel m | Mean initial episode s | Whole-trial fouls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| context:stationary | 10 → 15 | 0 → 0 | 0.27 → 0.76 | 0.42 → 1.40 | 2.47 → 3.26 | 0 → 0 |
| context:moving | 6 → 4 | 0 → 0 | 3.82 → 5.56 | 4.80 → 6.57 | 2.06 → 2.56 | 0 → 0 |
| context:shallow_turn | 11 → 6 | 0 → 0 | 3.12 → 5.65 | 4.18 → 6.51 | 2.22 → 2.75 | 1 → 0 |
| context:sharp_turn | 17 → 3 | 0 → 0 | 4.94 → 4.62 | 6.55 → 5.67 | 3.83 → 2.80 | 1 → 8 |
| context:roulette | 16 → 9 | 0 → 0 | 3.02 → 3.53 | 9.67 → 9.32 | 5.00 → 4.43 | 1 → 8 |
| context:shield_front | 32 → 32 | 0 → 0 | 1.24 → 1.25 | 4.82 → 4.81 | 6.00 → 6.00 | 0 → 0 |
| context:shield_side | 32 → 32 | 0 → 0 | 0.60 → 0.70 | 4.58 → 4.56 | 6.00 → 6.00 | 0 → 0 |
| context:shield_back | 32 → 32 | 0 → 0 | 0.89 → 1.79 | 4.66 → 4.84 | 6.00 → 6.00 | 0 → 0 |
| context:shield_two | 32 → 30 | 0 → 0 | 1.57 → 1.89 | 2.27 → 3.17 | 6.00 → 5.81 | 0 → 2 |
| context:push_run | 0 → 0 | 0 → 0 | 3.43 → 9.45 | 3.43 → 9.45 | 0.66 → 1.68 | 32 → 0 |
| context:shield_release | 0 → 0 | 32 → 32 | 0.41 → 0.42 | 0.42 → 0.42 | 0.75 → 0.75 | 0 → 0 |
| context:autonomous | 0 → 0 | 16 → 32 | 2.40 → 2.68 | 2.75 → 2.99 | 1.40 → 1.33 | 0 → 0 |
| elite:roulette | 6 → 5 | 0 → 0 | 3.44 → 2.69 | 5.26 → 8.17 | 2.41 → 3.77 | 24 → 24 |
| low:roulette | 2 → 0 | 0 → 0 | 0.48 → 3.71 | 6.06 → 4.20 | 4.14 → 2.24 | 0 → 32 |

Single-attribute cells hold the other attributes/setup fixed. They establish outcome sensitivity, not monotonic retention for every seed: trajectory, contact delay, defensive arrival and foul timing interact.

| Attribute cell (32 trials) | Final retained /32 | Mean owned net m | Mean initial episode s |
| --- | ---: | ---: | ---: |
| attacker:dribbling:20 | 18 → 3 | 4.85 → 4.55 | 3.73 → 2.62 |
| attacker:dribbling:60 | 17 → 3 | 4.94 → 4.62 | 3.83 → 2.80 |
| attacker:dribbling:95 | 21 → 16 | 5.45 → 5.22 | 4.41 → 3.96 |
| attacker:technique:20 | 16 → 5 | 4.94 → 4.61 | 3.83 → 2.85 |
| attacker:technique:60 | 17 → 3 | 4.94 → 4.62 | 3.83 → 2.80 |
| attacker:technique:95 | 18 → 12 | 5.17 → 5.37 | 4.07 → 3.76 |
| attacker:agility:20 | 21 → 10 | 4.56 → 4.70 | 4.03 → 3.31 |
| attacker:agility:60 | 17 → 3 | 4.94 → 4.62 | 3.83 → 2.80 |
| attacker:agility:95 | 32 → 0 | 7.14 → 5.22 | 6.00 → 3.52 |
| attacker:firstTouch:20 | 16 → 9 | 4.94 → 4.94 | 3.83 → 3.06 |
| attacker:firstTouch:60 | 17 → 3 | 4.94 → 4.62 | 3.83 → 2.80 |
| attacker:firstTouch:95 | 17 → 8 | 4.94 → 5.04 | 3.83 → 3.40 |
| attacker:strength:20 | 9 → 8 | 4.27 → 5.01 | 3.13 → 3.40 |
| attacker:strength:60 | 17 → 3 | 4.94 → 4.62 | 3.83 → 2.80 |
| attacker:strength:95 | 18 → 7 | 5.16 → 4.92 | 4.07 → 3.14 |
| attacker:composure:20 | 16 → 7 | 4.94 → 4.88 | 3.83 → 2.96 |
| attacker:composure:60 | 17 → 3 | 4.94 → 4.62 | 3.83 → 2.80 |
| attacker:composure:95 | 18 → 7 | 4.94 → 5.15 | 3.83 → 3.28 |

The lab's exposed-seconds metric is a ≤0.95 m defender-ball-distance proxy. The canonical full-matrix exposure is stricter: a live opponent in the local 3 m shortlist must satisfy actual ball access/torso occlusion via `deriveBallContactAccess`. PR158 records 329,488 actual physical contacts, 64,771.725 between-contact seconds and 3,603.025 such legally exposed seconds; PR157 has no corresponding instrumentation. Physical contact frequency remains distinct from the public control-episode touch count.

### Tactical suitability and bounded pressing

The [tactical summary](performance/PR158-tactics-summary.json) covers seven squad families × five vectors × three paired seeds × 600 s per revision (105 short windows each), plus seven bounded setups × the same vectors/seeds × 12 s (105 each). It retains all 35 family/profile and 35 bounded scenario/profile cells. PR157 ignores the optional new vector and uses the compatible legacy style; organised high press and immediate counterpress therefore share the same baseline pressing football. Every row uses the same canonical engine and the final source above.

Profile totals below each sum 21 windows (210 nominal minutes). Completed/central passes, shots and goals refer to the profiled home team. Independent pressure counts and workload include both teams. Controlled regains within five seconds use the home loss→regain clock, separate from pressure→regain. Pressing metres are a demand proxy, not stamina depletion or sole proof of useful defending.

| Profile | Completed home passes | Home central passes | Home shots | Home goals | Pressure episodes (both teams) | Home regains ≤5 s | Pressing metres (both teams) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neutral | 825 → 929 | 486 → 436 | 3 → 2 | 2 → 2 | 3,295 → 2,078 | 92 → 47 | 10,790.09 → 6,939.28 |
| organised_high_press | 811 → 866 | 441 → 387 | 10 → 0 | 6 → 0 | 3,109 → 2,860 | 90 → 54 | 9,947.57 → 7,307.34 |
| immediate_counterpress | 811 → 992 | 441 → 438 | 10 → 3 | 6 → 1 | 3,109 → 2,538 | 90 → 50 | 9,947.57 → 7,317.56 |
| patient_midblock | 793 → 820 | 487 → 393 | 7 → 0 | 6 → 0 | 3,093 → 2,106 | 71 → 63 | 10,335.34 → 7,183.03 |
| compact_direct | 695 → 871 | 403 → 406 | 15 → 2 | 9 → 1 | 3,427 → 2,538 | 80 → 85 | 10,798.96 → 7,346.66 |

Across the 105 windows, home shots 45 → 7 and goals 29 → 4 worsen despite home completion 83.8% → 87.2%. Both-team adjacent flips are 23 → 40 and spells <0.5 s 38 → 90. Home sprint distance falls 38,094.42 → 16,804.99 m, while useful-target holds fall 6,037 → 1,022 and accumulated nearest-defender-to-target distance rises 49,213.06 → 184,780.10 m. The last two are sampled at 1 Hz and are planned-position proxies, not measured pressure success or travelled distance. They do not support a general improvement in economical positioning.

Each family/profile row below sums three windows (30 nominal minutes). The last column records current continuously computed preferred press cost / preferred line risk, not a success bonus or ability eligibility gate. Compare actual outcomes/costs rather than declaring one vector universally superior.

| Squad family | Vector | Completed home passes | Home central passes | Home shots | Home regains ≤5 s | Pressing m (both teams) | Current preferred press cost / line risk |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced | neutral | 121 → 134 | 74 → 70 | 0 → 0 | 6 → 14 | 1,414.99 → 1,051.45 | 0.115 / 0.110 |
| balanced | organised_high_press | 133 → 115 | 76 → 52 | 1 → 0 | 21 → 6 | 1,466.80 → 1,072.05 | 0.213 / 0.172 |
| balanced | immediate_counterpress | 133 → 117 | 76 → 60 | 1 → 0 | 21 → 3 | 1,466.80 → 1,048.98 | 0.126 / 0.132 |
| balanced | patient_midblock | 128 → 119 | 77 → 63 | 0 → 0 | 19 → 9 | 1,552.50 → 1,098.43 | 0.082 / 0.092 |
| balanced | compact_direct | 98 → 107 | 70 → 54 | 1 → 0 | 12 → 9 | 1,490.39 → 1,042.43 | 0.055 / 0.057 |
| fast_wings | neutral | 147 → 153 | 88 → 72 | 0 → 0 | 17 → 4 | 1,526.61 → 1,017.84 | 0.112 / 0.110 |
| fast_wings | organised_high_press | 98 → 122 | 58 → 50 | 2 → 0 | 12 → 9 | 1,412.63 → 1,102.76 | 0.209 / 0.172 |
| fast_wings | immediate_counterpress | 98 → 158 | 58 → 66 | 2 → 0 | 12 → 5 | 1,412.63 → 1,133.94 | 0.124 / 0.132 |
| fast_wings | patient_midblock | 139 → 119 | 91 → 56 | 0 → 0 | 5 → 6 | 1,408.52 → 1,019.41 | 0.081 / 0.092 |
| fast_wings | compact_direct | 104 → 152 | 49 → 62 | 2 → 0 | 12 → 14 | 1,652.29 → 958.27 | 0.054 / 0.057 |
| central_passers | neutral | 115 → 146 | 72 → 67 | 0 → 0 | 22 → 5 | 1,589.91 → 892.67 | 0.114 / 0.102 |
| central_passers | organised_high_press | 142 → 117 | 68 → 51 | 0 → 0 | 16 → 8 | 1,507.03 → 1,086.84 | 0.212 / 0.160 |
| central_passers | immediate_counterpress | 142 → 142 | 68 → 65 | 0 → 0 | 16 → 15 | 1,507.03 → 1,111.00 | 0.125 / 0.123 |
| central_passers | patient_midblock | 101 → 80 | 60 → 36 | 2 → 0 | 3 → 3 | 1,559.48 → 1,205.84 | 0.082 / 0.086 |
| central_passers | compact_direct | 120 → 105 | 70 → 59 | 1 → 0 | 22 → 18 | 1,640.49 → 1,110.68 | 0.055 / 0.053 |
| pressing_athletes | neutral | 129 → 147 | 70 → 68 | 1 → 0 | 20 → 9 | 1,891.04 → 1,178.03 | 0.063 / 0.089 |
| pressing_athletes | organised_high_press | 123 → 122 | 67 → 58 | 1 → 0 | 13 → 4 | 1,670.25 → 1,185.91 | 0.118 / 0.138 |
| pressing_athletes | immediate_counterpress | 123 → 143 | 67 → 59 | 1 → 0 | 13 → 9 | 1,670.25 → 1,178.46 | 0.070 / 0.106 |
| pressing_athletes | patient_midblock | 138 → 100 | 85 → 44 | 0 → 0 | 19 → 12 | 1,640.25 → 1,206.08 | 0.046 / 0.075 |
| pressing_athletes | compact_direct | 98 → 119 | 60 → 42 | 1 → 2 | 9 → 13 | 1,720.80 → 1,315.66 | 0.030 / 0.046 |
| slow_cover | neutral | 117 → 111 | 68 → 50 | 0 → 0 | 12 → 6 | 1,742.12 → 1,340.52 | 0.138 / 0.308 |
| slow_cover | organised_high_press | 109 → 104 | 64 → 46 | 0 → 0 | 13 → 6 | 1,424.33 → 1,207.28 | 0.256 / 0.480 |
| slow_cover | immediate_counterpress | 109 → 111 | 64 → 45 | 0 → 0 | 13 → 4 | 1,424.33 → 1,309.34 | 0.151 / 0.369 |
| slow_cover | patient_midblock | 99 → 142 | 60 → 53 | 0 → 0 | 9 → 9 | 1,549.16 → 1,129.35 | 0.099 / 0.258 |
| slow_cover | compact_direct | 93 → 136 | 44 → 59 | 0 → 0 | 11 → 13 | 1,654.53 → 1,247.21 | 0.066 / 0.160 |
| fragile_playmaker | neutral | 118 → 80 | 65 → 39 | 0 → 0 | 10 → 2 | 1,446.62 → 810.65 | 0.137 / 0.119 |
| fragile_playmaker | organised_high_press | 112 → 145 | 60 → 67 | 1 → 0 | 14 → 7 | 1,367.98 → 1,090.50 | 0.254 / 0.185 |
| fragile_playmaker | immediate_counterpress | 112 → 164 | 60 → 76 | 1 → 0 | 14 → 5 | 1,367.98 → 923.17 | 0.150 / 0.142 |
| fragile_playmaker | patient_midblock | 113 → 142 | 74 → 68 | 0 → 0 | 14 → 10 | 1,518.97 → 814.62 | 0.098 / 0.100 |
| fragile_playmaker | compact_direct | 111 → 130 | 65 → 60 | 1 → 0 | 9 → 6 | 1,449.35 → 950.13 | 0.066 / 0.062 |
| strong_vs_weak | neutral | 78 → 158 | 49 → 70 | 2 → 2 | 5 → 7 | 1,178.80 → 648.11 | 0.115 / 0.110 |
| strong_vs_weak | organised_high_press | 94 → 141 | 48 → 63 | 5 → 0 | 1 → 14 | 1,098.55 → 562.00 | 0.213 / 0.172 |
| strong_vs_weak | immediate_counterpress | 94 → 157 | 48 → 67 | 5 → 3 | 1 → 9 | 1,098.55 → 612.68 | 0.126 / 0.132 |
| strong_vs_weak | patient_midblock | 75 → 118 | 40 → 73 | 5 → 0 | 2 → 14 | 1,106.45 → 709.30 | 0.082 / 0.092 |
| strong_vs_weak | compact_direct | 71 → 122 | 45 → 70 | 9 → 0 | 5 → 12 | 1,191.11 → 722.27 | 0.055 / 0.057 |

The slow-cover XI illustrates the remaining cost tradeoff: current organised high press produces 46 home attempts and 576.7 home sprint metres versus neutral 22 attempts and 342.7 m. Continuous suitability cost/risk is observable, but the adaptation has not established an optimum for every XI.

Bounded setup totals sum 15 runs per row. Screen/engage counts are actual initial intentions, not integrated duration. Attempts/wins and demand cover both teams across the trial; final home ownership at 12 s does not prove a first counterpress regain. Artificial initial losses in these setups are configuration facts and never enter naturally observed loss-clock totals.

| Bounded setup | Initial screen /15 | Initial engage /15 | Whole-trial attempts | Whole-trial tackle wins | Final home owner /15 | Pressing m (both teams) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| safe_cb_outlets | 0 → 15 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 125.52 → 0.93 |
| isolated_pursuit | 0 → 15 | 0 → 0 | 5 → 0 | 2 → 0 | 2 → 0 | 168.97 → 1.57 |
| covered_heavy_touch | 0 → 0 | 15 → 15 | 19 → 16 | 11 → 16 | 13 → 11 | 151.18 → 108.84 |
| coordinated_press | 0 → 0 | 15 → 15 | 15 → 17 | 5 → 16 | 15 → 12 | 28.97 → 123.74 |
| early_counterpress | 0 → 0 | 15 → 15 | 15 → 16 | 10 → 15 | 15 → 11 | 37.26 → 117.14 |
| late_local_counterpress | 0 → 0 | 15 → 15 | 15 → 16 | 5 → 15 | 15 → 12 | 28.97 → 142.43 |
| reorganised_opponent | 0 → 15 | 0 → 0 | 4 → 0 | 2 → 0 | 2 → 0 | 95.84 → 0.00 |

The opportunity `mode` labels classify preference/transition context and cannot stand in for actual engagement. A recent-loss counterpress label can coexist with engagement zero and a screen intention when numerous safe outlets veto pursuit. After 8.1 seconds a useful local opportunity remains possible; there is no eight-second cutoff. Nearest-defending-presser x and lane/exposed-transition samples are positional proxies. The independent pressure, actual loss/regain clocks, football outcomes and workload remain distinct evidence. Suitable/coordinated versus isolated setups also change geometry/outlets, so the table is not an isolated causal estimate of one extra defender.

Safe-outlet, isolated-pursuit and reorganised-opponent setups reduce both-team sprint demand, but aggregate total distance does not drop in those three setups. Coordinated and early/late counterpress setups can raise sprint demand. These are deliberate situational tradeoffs, not evidence of universally lower running or improved recovery outcomes.


### Representative canonical trace

The [paired representative trace export](performance/PR158-contact-representative-traces.json) retains fixed repetition 0 for 12 prespecified contexts, including both revisions. The table selects the final-source elite/low demanded turns at matched sampled elapsed times and the first censored sample. It is not cherry-picked by success. Body/ball snapshots are every 0.25 s; contact counts and last-contact timestamps come from actual canonical contact state, not inferred velocity changes. Defender ETA is the stated bounded closing-speed proxy; carrier ETA comes from the actual plan. Last-contact timestamps below use the absolute canonical clock, whereas the first column is elapsed trial time. Full-precision values and actual outcomes remain in the JSON.

| Demanded cell | Elapsed s | Owner | Orientation ° / omega rad/s | Ball x,y m | Relative ball vx,vy m/s | Defender-body / ball m | Defender / next-contact ETA s | Contacts / last absolute contact s | Phase / initial episode |
| --- | ---: | --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| elite:roulette | 0.025 | carrier | 81.7 / -5.810 | 52.30, 34.00 | -5.70, 0.00 | 3.45 / 3.14 | 1.015 / 0.203 | 1 / 600.025 | open_play; owned episode |
| elite:roulette | 0.525 | carrier | -58.9 / -4.097 | 50.19, 34.00 | -0.59, 0.00 | 2.76 / 3.45 | 0.486 / 0.135 | 3 / 600.475 | open_play; owned episode |
| elite:roulette | 1.025 | carrier | -20.3 / 4.753 | 48.38, 34.25 | 3.63, 1.50 | 2.07 / 2.80 | 0.339 / 0.182 | 5 / 600.950 | open_play; owned episode |
| elite:roulette | 2.025 | carrier | 81.8 / -0.010 | 48.82, 35.51 | -0.54, -1.21 | 1.48 / 1.33 | 0.168 / 0.016 | 9 / 601.825 | open_play; owned episode |
| elite:roulette | 3.025 | carrier | 73.8 / -0.162 | 48.86, 32.98 | 0.12, 0.33 | 1.18 / 1.52 | 0.152 / 0.003 | 14 / 602.850 | open_play; owned episode |
| elite:roulette | 3.525 | carrier | 71.9 / 0.000 | 48.85, 33.08 | unavailable | 17.53 / 15.54 | 14.588 / unavailable | 16 / unavailable | free_kick_far; censored |
| low:roulette | 0.025 | carrier | 85.8 / -2.960 | 52.35, 34.00 | -3.85, 0.00 | 3.45 / 3.10 | 0.993 / 0.299 | 1 / 600.025 | open_play; owned episode |
| low:roulette | 0.525 | carrier | 7.6 / -2.672 | 50.73, 34.00 | -1.27, 0.00 | 2.22 / 2.94 | 0.410 / 0.096 | 2 / 600.325 | open_play; owned episode |
| low:roulette | 1.025 | carrier | 15.2 / 2.615 | 50.51, 34.23 | 1.09, 1.54 | 1.25 / 1.48 | 0.123 / 0.261 | 4 / 600.975 | open_play; owned episode |
| low:roulette | 2.025 | carrier | 83.2 / 0.169 | 49.47, 36.87 | -0.08, -0.09 | 1.19 / 1.23 | 0.059 / 0.159 | 7 / 601.900 | open_play; owned episode |
| low:roulette | 2.275 | other | 85.4 / 0.000 | 49.67, 36.92 | unavailable | 18.08 / 17.61 | 16.656 / unavailable | 8 / unavailable | free_kick_far; censored |
| low:roulette | 3.025 | other | 85.4 / 0.000 | 49.67, 36.92 | unavailable | 18.08 / 17.61 | 16.656 / unavailable | 8 / unavailable | free_kick_far; censored |

A censored sample can show restart placement or a later return of ownership; its movement is excluded from initial owned-net/travel/contact metrics. The dedicated canonical elite regression proves a three-second, two-contact, >2 m successful pressured turn; this fixed trial table also shows failures and interruptions without promising every elite turn succeeds.

In these two fixed repetition-0 trials, the actual first-to-second contact interval is 0.225 s for elite and 0.300 s for low. These are representative timestamps, not a distribution or proof of monotonic success across the paired lab.



## Explicit answers to the 23 acceptance questions

### 1. Why were repeated stationary pirouettes attractive in PR157?

Controlled-ball coordinates were replaced from body orientation each tick, letting body rotation redirect a ball without an intervening foot contact. Candidate carry value did not pay the proposed contact preparation/exposure cost. PR158 uses successive reachable impulses and candidate-specific turn windows; it does not prohibit rotation or named skill possibilities.

### 2. How often did they occur before and after?

In the autonomous main matrix, >180° absolute rotation/net<2 m episodes are 9,372 → 8,170 out of 16,738 → 18,792 carrier episodes (56.0% → 43.5%); >360°/net<3 m are 5,867 → 4,098 (35.1% → 21.8%). These include scans/reversed rotation. Demanded-turn lab counts are above and exclude restart placement; neither metric proves every episode is a one-direction stationary pirouette. The original interactive capture is unavailable.

### 3. Is the ball physically exposed between contacts?

Yes. The canonical rolling integrator advances velocity between reachable foot contacts, while current geometry permits an independent opponent contact. The full matrix records 64,771.725 between-contact seconds and 3,603.025 legally exposed seconds, with actual torso access required. Lab distance-only exposure is labeled separately; baseline finite-contact counts are unavailable.

### 4. Can defenders intervene during a failed turn?

Yes. A 48-seed between-contact regression uses the shared challenge resolver while the carrier plan is pending; independent defenders remain eligible. The canonical low-skill-turn regression loses control through ordinary geometry/pending-loss lifecycle. Existing pair/re-arm locks prevent a new formal challenge every tick. No timer guarantees a turnover.

### 5. Does Technique/Dribbling/Agility meaningfully affect turn execution?

Yes at the contact-window level: paired independent-attribute tests shorten the difficult second-contact preparation window. The single-attribute lab above shows actual trajectory/control sensitivity and nonmonotonic final retention, so a universal improvement claim would be incorrect. Strength/Agility also resist actual protecting-torso balance load; exposed-side access remains legal.

### 6. Can exceptional players still perform demanding skill moves?

Yes. The canonical elite regression retains the ball for three seconds under an approaching defender, makes at least two physical contacts, rotates over 180° and moves over 2 m. That proves physical possibility, not guaranteed roulette success. Final elite/low lab rows and the trace above include failed outcomes and foul sensitivity.

### 7. Do ordinary players more naturally choose a pass or shielding under pressure?

The utility now includes candidate contact difficulty, exposure and defender ETA alongside ordinary receiver solutions. Actual full-matrix counters are high-pressure holds 5,298 → 5,436, carries 5,027 → 3,150 and passes under pressure 3,684 → 3,625. Those counters overlap and are not one choice denominator. The autonomous lab row measures actual release choice; explicitly chosen pass/turn cells cannot establish autonomous preference. Retaining may remain sensible without a safe release.

### 8. Does dribbling create useful displacement rather than repeated rotation?

Possible useful displacement is demonstrated by the elite rotation and push-and-run regressions. Actual demanded owned net/travel and episode time are above. Heading reversals in full windows are 24,248 → 1,743; high-pressure carry distance 8,781.70 → 4,842.65 m and carry time 4,648.400 → 1,974.000 s. Lower duration/count alone is not success; movement after loss or restart placement does not count as owned dribble.

### 9. Did geometry or repeated decisions create excessive formal attempts?

The attached-ball/access defect is confirmed, but no isolated causal decomposition attributes all PR157 density to it. The result funnel is initiated 6,645 → 4,418, resolved 6,645 → 4,418, reachable 6,514 → 4,374, formal body contacts 6,233 → 3,974, clean wins 2,885 → 1,804 and loose results 1,025 → 615. This does not count every rejected candidate opportunity. Repeated decision indices are not fresh physical contests; pair locks already existed.

### 10. What fraction of attempts correspond to an exposed-ball opportunity?

Reachable resolved / initiated is 6,514/6,645 (98.0%) → 4,374/4,418 (99.0%). Resolved totals 6,645 → 4,418 leave 0 → 0 unresolved intents in these windows. Report the resolved denominator separately even when equal. Baseline evidence cannot reconstruct unrecorded torso access, and this is a result-time reach fraction rather than a denominator of every potential opportunity.

### 11. Are possession changes and micro-spells more plausible?

Counts are possession changes 5,631 → 4,210, adjacent-tick flips 24 → 94 and spells under 0.5 s 51 → 189. The fixture table retains every worsening result. Loss causes are tackle 2,871 → 1,797, interception 1,935 → 1,362, failed control 3 → 393 and heavy touch 9 → 44. These observations do not by themselves establish realism; no quota/filter hides them.

### 12. How often do high presses fail against simple circulation?

The bounded setup table above measures final control/pursuit for safe outlets separately from isolated recipients. In natural safe-outlet windows, signed progressive escapes are 6 → 8, forward-on-CB pressure episodes 282 → 347 and completed passes 1,749 → 2,189. These do not identify every broken high press or make generic pressure releases a successful-escape percentage.

### 13. Can teams intentionally screen and fall into a block?

Yes. Safe connected outlets can select screen/block, and the preference-dependent structure changes through ordinary locomotion. Bounded actual plan counts distinguish that from a diagnostic opportunity mode. Lane-location samples are proxies for useful intention/positioning, not proof that every outlet was eliminated or intercepted. A tackle is not required for defensive value.

### 14. Does coordinated counterpressing outperform isolated pursuit?

The bounded setup table shows suitable local/coordinated versus isolated-safe-outlet outcomes, with running cost and final ownership. Those setups also differ in geometry/outlets, so they do not isolate the causal benefit of one additional defender. The natural six clocks include every team/context and retain late/censored results; they must not be presented as counterpress-only success probabilities. PR158 need not dominate on every endpoint.

### 15. Does a broken press expose valuable space behind it?

Cover/risk explicitly enter opportunity selection and actual positions retain the space. The short-transition geometry proxy is 3,124 → 3,141 samples; regain → progression 2,625 → 2,210, released shot 71 → 8 and goal 55 → 6. These are distinct clocks, not linked missed-press conversion probabilities. A stronger causal danger claim remains unestablished.

### 16. Do preference vectors cause measurable distinct behaviour?

Independent tests confirm distinct depth/width/engagement, patience and direct ranking, including organised/counterpress vectors sharing one compatible legacy style. All 21 matched family/seed organised-high-press versus immediate-counterpress football pairs are identical in PR157 and distinct in PR158. The completed profile table above reports actual movement, pressure and outcomes; differing outputs do not establish one universally better vector. Diagnostic mode labels remain separate from actual engagement plans and physical regain clocks; changed labels alone are not tactical evidence.

### 17. Do tactics respond sensibly to actual squad attributes?

Suitability continuously adapts press/counterpress cost, cover/line risk and wing-versus-central usefulness without changing physical skills or imposing eligibility thresholds. The seven-family table above compares actual outcomes/effort under five vectors. A technically strong low-Stamina playmaker has higher route cost, not current fatigue depletion. Changed effective axes demonstrate adaptation; successful suitability requires the measured outcomes and tradeoffs, not a universal best style.

### 18. Can patient possession invite pressure without artificial triggers?

Patience permits support/scanning/retention while actual exposure, readiness/orientation and closed outlets invite engagement. The safe-outlet fixture completes 1,749 → 2,189 passes and creates 22 → 2 shots. That is evidence of circulation, not an isolated estimate of intentionally invited pressing value. No ownership deadline or possession quota is added.

### 19. Can direct counterattacking exploit advanced opponents?

Directness affects progression/runs and suitability values strong channels; actual cover/pass/contact geometry still decides. Fast-wing windows record progressive escapes 9 → 16, regain → progression 438 → 335, released shot 7 → 0 and goal 6 → 0. Total shots are 14 → 1. Available actions do not guarantee superiority or a ten-second scoring rule.

### 20. Can intelligent positioning contribute without excessive running?

Yes as a legal attribute-dependent choice: useful lane/block targets and economical route assignment depend on Reading/Positioning and existing movement cost. The bounded safe-outlet setup and profile tables compare lower pursuit demand with actual continuation/escapes/control. Reduced movement is not defensive success by itself, and patient positioning is not universally optimal.

### 21. Do intensity events support long-/short-term stamina in PR160?

They give bounded evidence, not a calibrated fatigue curve: open-play distance 3,424,766.01 → 3,221,374.43 m; high-intensity pressing 79,721.80 → 57,575.84 m; sprint starts 13,011 → 7,731; repeat efforts within five seconds 71 → 71; sharp turns 120,984 → 145,096; low-effort 1,415,776.30 → 1,457,774.07 s. Speed-bin acceleration/deceleration is a proxy; formal body contacts do not fully count continuous shielding load. PR160 must validate physiology/outcome mappings.

### 22. Can repeated intense pressing be distinguished from economical positioning?

Yes. Per-player bounded records separate sprint intervals, repeat efforts and high-intensity pressing distance from low-effort seconds and short-route/block choices. The matched profile/family outputs expose distinct demands. Long-term reserve and faster burst readiness/recovery remain future canonical state; observer data must not become a hidden present penalty.

### 23. Can workload be measured without premature penalties?

Yes. The observer is read-only and parity-tested; PR158 has no depletion, recovery or age modifier. Existing Stamina is capability/suitability input. Future slow match/recovery capacity can constrain faster burst readiness with conceptual `shortTermAvailable <= longTermAvailableCapacity`. This is documentation, not an implemented meter or numeric curve.

## UI and accounting contracts

Player picking uses a 32–48 CSS-pixel radius around the projected body and the caller's legal contextual-action IDs. Nearest eligible screen target wins; unrelated overlap and explicit empty lists are handled. Tests span camera presets/orbits/zoom, crowds, near-touchline geometry, CSS offsets/DPR and dismissed presentation state. Canonical foot/tackle ranges, RNG and state are unchanged until a real committed action.

The live and replay carrying projections also preserve canonical ball placement. A remaining
face-relative animation fallback could otherwise make the visible ball appear glued to the
owner while the football engine recorded a finite trajectory. The presentation fix and
regressions keep the renderer/replay aligned with actual ball coordinates without changing
physical contact, ownership, or canonical RNG.
The focused renderer/model/animation group passes 73 tests, including a real six-tick canonical
turn with one foot contact projected through visible live, hidden context and recorded replay
paths. Carrying/shielding animation labels remain available without overriding the real ball.

Restart accounting tests distinguish valid advantage plus a physically released shot, failed advantage recalled to the original point, and a manual DEV restart. A later DEV `free_kick_wide` preserves the earlier legitimate shot exactly once. A pre-execution period whistle cancels a pending shot and rejects a later submission without creating a completed shot. No original production accounting bug was demonstrated from the unavailable snapshot; no speculative deletion of valid statistics was introduced. Full restart menus, wall behaviour and position continuity belong to PR159.

## Reproduction and raw evidence

Run from the repository root with installed dependencies and a pristine sibling `../baseline` checkout at merged PR157. The same current benchmark and observer scripts load each engine through `--engine-root`; changing fixture, world, profile or observer bytes requires rerunning both revisions. Default paired seeds are `lab-muwhj3er,pr155-natural-b,pr155-natural-c`.

Primary flow groups are `a=balanced-balanced,native-433-pressing-442`, `b=strong-weak,high-press` and `c=fast-wings,safe-defensive-outlets`. For each group/revision run the following, substituting the recorded fixture group, engine root (`../baseline` or `.`), revision (`PR157` or `PR158`) and group name:

```powershell
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158Flow.ts --minutes=90 --observer=normal --engine-root=<engine-root> --revision=<revision> --fixtures=<fixture-group> --out=../pr158-reproduced-flow-<before-or-after>-<group>.json
node scripts/summarizePr158Flow.mjs --prefix=../pr158-reproduced-flow
```

The summarizer requires all six raw files, 18 unique paired fixture/seed rows per revision, complete all-22 player/workload records and actual 5,400-second statuses. The following generators use the same engine-root/revision substitutions, followed by the summarizers once both revisions are complete:

```powershell
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158Contact.ts --engine-root=<engine-root> --repetitions=32 --seconds=6 --output=docs/performance/PR158-contact-<baseline-or-current>.json
node scripts/summarizePr158Contact.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158Tactics.ts --engine-root=<engine-root> --revision=<revision> --seconds=600 --out=docs/performance/PR158-tactics-<before-or-after>.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158TacticalScenarios.ts --engine-root=<engine-root> --revision=<revision> --seconds=12 --out=docs/performance/PR158-tactical-scenarios-<before-or-after>.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/summarizePr158Tactics.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr157Integrity.ts --revision=PR158 --seconds=60 --out=../pr158-integrity.json
node scripts/summarizePr158Integrity.mjs ../pr158-integrity.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158TelemetryReference.mjs
node scripts/validatePr158Accounting.mjs .benchmark-artifacts/PR158-pre-accounting
node scripts/validatePr158TacticalAccounting.mjs
node scripts/generatePr158SourceProvenance.mjs
```

Contact generation also writes the two single-revision summaries. Paired contact summarization retains fixed representative traces; tactical summarization requires all 105+105 paired rows and preserves all 35 cells of each matrix. The [evidence manifest](performance/PR158-evidence-manifest.json) inventories the frozen raw, source and report snapshots, with byte hashes, producing commands and compact-table mapping. The local output `outputs/PR158-evidence.zip` contains 824 hash-checked entries; five compact summaries were regenerated exactly from the archived inputs. The ZIP is provided as a local output/attachment; its checksum is recorded separately in local archive metadata. Pre-watermark comparison inputs are separately labelled, and older prototypes are excluded. Concurrent benchmark wall times are not performance measurements. Isolated performance is reproduced sequentially with `node scripts/benchmarkPr158Performance.mjs --baseline=../baseline --minutes=10 --repetitions=3` and `node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158ObserverCost.ts --seconds=600 --repetitions=3` after other heavy jobs finish.

## Performance, determinism and verification

The next-contact plan and workload/transition observer remain bounded: one current plan, at most 22 player workloads/pressure entries, two pending team transitions, one active carrier and at most 12 representative rotation traces. Local ball/body candidates are rejected before more detailed access checks. Canonical physics remains 0.025 s.

The [accounting audit](performance/PR158-ledger-audit.json) found high-rate physical-control contacts growing the pre-existing exact-once `observedContactIds` ledger: one public touch still produced 600 IDs in 120 s and 2,000 IDs in the 400 s observer comparison. The full matrix records 329,488 physical contacts. Physical evidence now uses one optional latest-contact timestamp per player; repeated/older contacts remain rejected after release or half-time, earlier statistics branches stay immutable, and legacy saves retain their historical IDs for deduplication. Existing pass/shot/control ledgers remain discrete accounting events. Four new regressions and 34 focused tests pass. The [accounting parity proof](performance/PR158-accounting-parity.json) compares all exported football fields of 18 rerun windows, 1,760 contact trials and all 66 integrity identities/RNG streams exactly; the [tactical proof](performance/PR158-tactical-accounting-equivalence.json) compares all 210 tactical/scenario rows exactly. Only explicitly named timing and bookkeeping state-checksum fields are omitted. This proves the stated exports, rather than complete pre/post canonical-state equality or arbitrary unseen fixtures. Observer microbenchmark timings in the audit are not full-engine throughput measurements.

### Isolated performance results

The [performance export](performance/PR158-performance-summary.json) contains three alternating fresh-process PR157/PR158 pairs on one fixed ten-minute controlled-player fixture, after competing benchmark/test jobs finished. Each process measures four observer modes over 24,000 canonical ticks. Host: v24.19.0, AMD Ryzen 7 260 w/ Radeon 780M Graphics, 16 logical CPUs. Values below are medians of three runs; the fixture's actual football differs across revisions, so these are measured workload comparisons rather than isolated per-mechanic speedups or broad match-performance guarantees.

| Mode | PR157 elapsed s | PR158 elapsed s | Elapsed change | ms/tick PR157 → PR158 | Canonical s/wall s PR157 → PR158 | Repeat fingerprints / mode check PR157 / PR158 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| release_minimal | 15.393 | 14.987 | -2.64% | 0.64139 → 0.62447 | 38.98 → 40.03 | 3/3; pass / 3/3; pass |
| normal | 14.587 | 14.235 | -2.41% | 0.60779 → 0.59314 | 41.13 → 42.15 | 3/3; pass / 3/3; pass |
| dev | 15.616 | 16.087 | +3.02% | 0.65066 → 0.67030 | 38.42 → 37.30 | 3/3; pass / 3/3; pass |
| capture | 101.172 | 99.935 | -1.22% | 4.21549 → 4.16394 | 5.93 → 6.00 | 3/3; pass / 3/3; pass |

Normal timing is slightly lower in this fixture while DEV is higher; the inclusive canonical-step span also rises. Capture measures the headless debug recorder, without pitch rendering or MediaRecorder. Export packaging/serialization is outside the simulation timer. The experiment does not establish browser/frame/video-capture cost.

Inclusive estimated sampled spans below use milliseconds per canonical tick, sampled every 37 ticks. Nested spans overlap and cannot be added as exclusive CPU shares. An uninstrumented baseline or mode is **n/a**, not zero measured cost. `ball_contact_control` measures the actual controlled-ball/contact path. `pressure_decision` covers only the inclusive hot movement call to `derivePressingPlan`, rather than every pressure computation.

| Inclusive scope, ms/tick | release_minimal PR157 → PR158 | normal PR157 → PR158 | dev PR157 → PR158 | capture PR157 → PR158 |
| --- | ---: | ---: | ---: | ---: |
| agency_projection | 0.27859 → 0.23224 | 0.25077 → 0.21568 | 0.25609 → 0.23470 | 0.26503 → 0.22631 |
| tactical_planning | 0.05986 → 0.08939 | 0.05381 → 0.07935 | 0.05582 → 0.08228 | 0.06759 → 0.09361 |
| movement_physics | 0.09093 → 0.12414 | 0.08036 → 0.11695 | 0.08387 → 0.12049 | 0.09126 → 0.13081 |
| ball_physics | 0.01047 → 0.02243 | 0.00936 → 0.01910 | 0.00966 → 0.01977 | 0.01018 → 0.02259 |
| action_resolution | 0.15585 → 0.15545 | 0.14083 → 0.14240 | 0.14302 → 0.14524 | 0.14894 → 0.14337 |
| pass_contact_evidence | 0.00446 → 0.00475 | 0.00371 → 0.00434 | 0.00390 → 0.00454 | 0.00559 → 0.00638 |
| statistics | 0.02838 → 0.02850 | 0.02324 → 0.02516 | 0.02396 → 0.02661 | 0.03618 → 0.03976 |
| canonical_step | 0.36234 → 0.43754 | 0.31954 → 0.39125 | 0.32791 → 0.40844 | 0.36861 → 0.44469 |
| benchmark_evidence | 0.00091 → 0.00160 | 0.00081 → 0.00135 | 0.00087 → 0.00136 | 0.00102 → 0.00160 |
| interception_eta | 0.14771 → 0.17112 | 0.13804 → 0.16925 | 0.15442 → 0.18828 | 1.14406 → 1.17914 |
| ball_contact_control | n/a → 0.01011 | n/a → 0.00857 | n/a → 0.00873 | n/a → 0.01116 |
| pressure_decision | n/a → 0.01782 | n/a → 0.01467 | n/a → 0.01546 | n/a → 0.01708 |
| match_moment | n/a → n/a | 0.00374 → 0.00423 | 0.00281 → 0.00293 | 0.00521 → 0.00629 |
| context_history | n/a → n/a | 0.00441 → 0.00443 | 0.00347 → 0.00384 | 0.00629 → 0.00699 |
| diagnostics | n/a → n/a | n/a → n/a | 0.00203 → 0.00221 | 0.00350 → 0.00374 |
| match_flow | n/a → n/a | n/a → n/a | 0.05433 → 0.04032 | 0.06112 → 0.04379 |
| debug_serialization | n/a → n/a | n/a → n/a | n/a → n/a | 0.17359 → 0.17983 |
| debug_construction | n/a → n/a | n/a → n/a | n/a → n/a | 3.48362 → 3.47413 |
| debug_retention | n/a → n/a | n/a → n/a | n/a → n/a | 0.00680 → 0.00732 |
| debug_capture | n/a → n/a | n/a → n/a | n/a → n/a | 3.49123 → 3.48261 |

Every mode/repeat within each revision preserves canonical state, players, statistics, major-event sequence/count and the seed/decision-index/ball-episode evidence fingerprint. Complete hashes remain in the JSON; representative repeated fingerprints are below. The performance `randomnessEvidence` field hashes event-key/effect evidence, not the actual draw stream. Actual canonical RNG calls/streams are independently checked in the integrity section. PR157 and PR158 hashes differ as expected after changed gameplay/accounting.

| Revision | Canonical-state SHA256 | Event-key evidence SHA256 | Major events | Complete same-revision checks |
| --- | --- | --- | ---: | --- |
| PR157 | `d5a51f2ed186d7c6cd616f90ce68859350c728710537e8f83a775df48f846152` | `31ea86847a18b482dd7565dea217176e710f61744a615cdde0b0f9906e5fc5d7` | 216 | 4/4 modes; 3/3 repeats |
| PR158 | `3e601e33293ff221f39a36a6b28d07aebf265b80f8ac4f64879c9fd6524f9ee2` | `805a0b4054f313394c4ebd3a619abb771b211a31f4d2b2326010ff2f23398aca` | 224 | 4/4 modes; 3/3 repeats |

The separate [observer benchmark](performance/PR158-observer-cost.json) measures three alternating enabled/disabled pairs of the read-only ContactTacticalTracker on the final spectator engine, 24,001 ticks per run. Median elapsed time is 6.556 s disabled → 6.720 s enabled (+2.50%); 0.27315 → 0.27997 ms/tick. The median sampled estimate for the observer itself is 217.178 ms, or 0.00905 ms/tick; it is a sampled cost estimate, distinct from the median elapsed difference. All six complete-state hashes equal `63c37a5cef2e952fe06a2858e6c590221ad8ca42f0a48c39df797cb1465deac1`. Source `23fe0b3c0ff0147e274b2d7406ea8d3b4fd1ec820ea0e57e93415a696dac289e` covers only `src/core/matchSimulation/contactTacticalDiagnostics.ts`; canonical source is the final hash above. This experiment excludes renderer, replay, DEV/export and physiological penalties.


Final `npm run verify` passes with exit 0: lint, 1,263 main tests in 163 files, five full-career tests in one file, TypeScript build and Vite production build. Strict benchmark TypeScript also passes. A work-only npm wrapper supplies the standard `--maxWorkers=2` option to the main suite, while workspace `TEMP`/`TMP` avoids the earlier sandbox rename failure before test collection. No assertions, timeouts or exclusions were relaxed. Vite reports bundle-size/dynamic-import warnings. Earlier CPU-contention timeouts did not establish state inequality; the final bounded-concurrency run completes successfully.


### Completed integrity and complete-field reference

All 66 disabled-identity comparisons preserve canonical state and actual RNG streams. Enabled-agency prefixes compare 125,536 ticks through the first genuine decision boundary, preserving football state and canonical draw order; independent seeded projection draws are reported separately. All 18 selected human/NPC shot-launch cells preserve launch/RNG parity. The 144 illegal controlled-shot proposals preserve every football field except the permitted request and consume 0 canonical draws. Three seeds preserve complete normal/DEV/capture snapshot and RNG parity. [Integrity evidence](performance/PR158-integrity-summary.json) keeps all 66 compact identity rows.

| Seed | Canonical snapshot SHA256 (normal = DEV = capture) | Canonical RNG SHA256 | Calls |
| --- | --- | --- | ---: |
| lab-muwhj3er | `ac6f516dfd32ca21871666d4548052a9b9286a6ec603f1bbe9b69f641ccae674` | `3ffa7d5b931e4ca2ea40147253285c5faeb1c5673a161754a3778099d409cb85` | 54,370 |
| pr155-natural-b | `83f208190a57169249df304f89f84992196e5487765f551a00e107699f779b42` | `4522eff7915bf81d6ee0385a45311aa30168ec47e2f77491cc5eadd0c0b8e1f0` | 54,066 |
| pr155-natural-c | `0bf6c21435ac0732f5b753ccfe49345c8cbc53d2397cf0e284b636f04d969d49` | `eb12df3189a5e41e2b8ab8a7a12929d73d89780c3d62fc31423b4d173b64e762` | 53,887 |

The complete PR146 telemetry reference preserves all 80 exported fields and is repeated twice per seed/revision. Pristine PR157 hashes are reproduced before updating current expectations. Runtime schemas, telemetry invariants and possession/restart identity ledgers pass; [reference evidence](performance/PR158-telemetry-reference.json) retains old/new hashes and every changed/unchanged field, avoiding a selected-field fingerprint.

| Seed | Reproduced PR157 SHA256 | PR158 SHA256 (two identical runs) | Exported fields |
| --- | --- | --- | ---: |
| pr146-flow-reference:a | `1f2c62cc5ab35f0b10e645cc44173813a669478932a64d58b728e0cae9c39387` | `4f57214717cf0333e33d1f87efd6f558e3c93e2260454ed6de0391bbb9a09352` | 80 |
| pr146-flow-reference:b | `590c427bc9ca46ab6bf96007f6c145c252c0dfbd15e798473afc58b485c6b36a` | `fe08348ff81b80757263e317045b7700d0f1c1651efdb871b1fdcd532b61a1e0` | 80 |


## Future dependencies and remaining limits

PR159 owns dead-ball/restart continuity and richer restart choice/positioning. PR160 owns fatigue, injuries, substitutions and added time. Its long-term capacity should reflect accumulated match effort, incomplete recovery and later durability/conditioning; faster burst readiness should reflect consecutive accelerations, sprints, turns/presses and low-effort recovery, constrained by capacity. PR158 enables no such depletion/recovery penalties.

PR161 owns presentation/replay/stadium polish. Later coach profiles may supply the existing vector. Aging and long-term development remain separate: physical, technical, intelligence, stamina, workload and recovery must not share one blanket age penalty. Future trajectories should allow early physical decline and retained positioning/passing/finishing, including exceptional longevity through ordinary attributes/history rather than named-player exceptions.

Material remaining limits: attacking-flow and central-midfield-connectivity regressions, more short spells, contact-lab foul sensitivity, and no isolated causal estimate of natural press escapes/linked dangerous transitions. The full-window autonomous rotation denominators and all-22 role/network evidence are retained above and in the export. Gameplay calibration remains necessary before merging despite passing engineering checks. The explicitly selected first-time lab cell is not a real incoming-flight reception and should be labeled accordingly unless supplemented. Missing original interactive artifacts remain a provenance limitation, not a reason to fabricate a baseline. Observational screening/exposure/workload proxies remain explicit; neither scores nor frequencies have been calibrated to event-provider targets.
