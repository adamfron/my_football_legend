# PR182 — Tactical Intelligence & Independent Policy Validation

## Review follow-up and evidence versions

The primary sixty-match results below describe the original frozen candidate and
its default-selection commit. They are preserved historical receipts. Review commit
`3d5d43c` fixes a second dismissal being ignored while `reorganise` was still the
current plan. A new dismissal now bypasses the same-plan check, while ordinary
plan persistence remains unchanged. Five new regressions cover consecutive central
dismissals in every selectable policy and preserve the remaining players' positions.

The failed GitHub run `39814777634` passed 1988 unit tests and the career job;
the main job failed at the full-half penalty test's execution lookup. That test
injected a foul at 415 seconds even during another stoppage. The ledger deliberately
retains the first incident ID when interruptions overlap. This made that lookup
depend on the physical trajectory at the injection time. The test now waits for
live open play. The original legacy half keeps its 90000 ms budget; a separate
default-B half has a 180000 ms budget and the same full-half, execution and liveness
assertions. Local B also exceeded the old wall limit (93.9 s), while the complete
16-test corrected penalty suite passed. No match clock, physics cadence or laws
were changed to repair the test.

This behavioural correction is a new candidate, not a rebranding of consumed
primary validation. `PR182-review-freeze.json` was committed and pushed in
`3d5d43c` before decoding the older reserved archive. Its source hash is
`fede3b2873e6ed5d0cf39f8a6487fc81364eda18544b2063cfc56cc39d7b24f1`.
Three previously unused designs (`pr180-reserved-ss-1`, `-sw-1`, `-ww-1`) receive
paired full B/legacy confirmation under the recorded correctness and hold gates.
This is three paired units, not six independent samples or a new policy search.
The shared archive is now opened; the remaining nine reserved designs are not run.
The separate [review confirmation](performance/PR182-review-confirmation.json)
records **6/6 full-time completions**, matching paired input hashes, valid final
schemas/statistics and no observer errors or strict pathological holds. Every run
uses fixed 0.025 s ticks. The new dismissal path is exercised by the five controlled
regressions; these six natural matches have no dismissals.

| New paired unit | Shots legacy / B | Score legacy / B | Maximum hold B |
| --- | --- | --- | --- |
| SS | 1 / 18 | 1–0 / 4–2 | 3.025 s |
| SW | 7 / 44 | 6–0 / 10–0 | 20.200 s |
| WW | 3 / 5 | 1–1 / 0–1 | 6.775 s |

These are descriptive results from n=3. The frozen follow-up harness omitted its
planned descriptive box-entry counter; it was not a gate, and no proxy or renewed
ranking claim replaces it. The primary box-entry results retain their original
source scope. Excessive SS circulation (2355 B pass attempts) and the SW result
reinforce the existing **NOT READY** summary-calibration decision. The provisional
B default is retained. Raw complete final states and detailed reports are under
`performance/pr182-evidence/review/`.

Review verification uses the unchanged `npm run verify` command. The current
[PR checks](https://github.com/adamfron/my_football_legend/pull/182/checks) and the
PR's review follow-up report its current result; the original 2051-test receipt
belongs to the original candidate. Expected review coverage is 2057 tests: 1993
unit, 55 match integration, four career contracts and five full-career tests.

## Plan and evidence boundary

Base: merged PR181 `b9c7bfb8dd341f258d684f19fba1ebd4c849a888`.
The authoritative PR176–181 reports, PROJECT_STATE and ROADMAP govern this work.
Existing deterministic physics, laws, human authority, competition substitutions and
career result application remain canonical. No new hybrid is planned without evidence.

1. Extend the existing collective role allocator, threat memory and substitution planner.
   Preserve coach profiles and their existing lineup/formation selection responsibilities.
2. Observe public positions and actual events with bounded, decaying evidence. Assess
   at sparse intervals, at halftime and after a dismissal. Record the rationale, evidence,
   selected role/preferences and subsequent physical behaviour. Allow no change.
3. Compare bench players with the actual requested role and score/time context, through
   the existing legal substitution lifecycle and participation statistics.
4. Reproduce historical holds and PR181 development cases. Correct demonstrated causes;
   no forced pass timeout, event quotas or universal accuracy penalty.
5. Run a modest development screen, controlled coaching continuations, determinism,
   laws/human/career checks and serial performance against PR181.
6. Commit and freeze production/configuration, observer/harness definitions, metrics,
   input hashes, selection criteria and resource budgets **before opening validation**.
7. Evaluate all twelve `pr182-sealed-*` designs, all five policies on identical initial
   states. Twelve paired designs are the experimental units, with four per SS/SW/WW.
   At the primary freeze, `pr180-reserved-*` remained unopened and was not part of
   the primary claim. The later review uses three as described above.
8. Analyse paired differences and uncertainty, document every blocker, decide default
   policy and summary-calibration readiness. Any later behavioural correction requires
   fresh unused inputs; consumed validation cannot be renamed independent evidence.
9. Supply a compact Match Lab comparison export and actual browser smoke, run the full
   original `npm run verify`, update project state/roadmap and open a reviewable PR.

Implementation and measured results are recorded below as work is completed.

## Coaching architecture and available knowledge

`coachIntelligence.ts` extends the canonical team rather than introducing another
match engine. The existing coach profile supplies adaptability and identity. Existing
XI selection already uses preferred/secondary formation, youth trust and experience;
coach tactical preferences carry rotation, experience, form patience and adaptability.
The collective allocator uses actual technical/physical attributes, position familiarity,
current reserves, adjacent responsibilities, depth partners and available cover.
Two bounded coordinate sweeps compare the catalogue rather than picking eleven
independent maximum individual scores. Possession can favour a distributing keeper,
inverted fullback and false nine; direct football can favour target/support/runner
relationships; counterattacking favours covered flanks and pace; pressing favours
players able to sustain closing work. A role grants neither acceleration nor a finish.

The new observer samples **public current player positions every five football seconds**.
It estimates space behind the defensive line and the frequency of a compact low block.
Effective sample count decays with a 180-second half-life. Confidence is an explicit,
uncalibrated engineering proxy `n/(n+8)`, not a measured probability of tactical truth.
Restart setup supplies no observations. A changed opponent line gradually replaces
previous evidence. One isolated run cannot establish a high-confidence pattern.

Actual entries, line exposure, isolation, shots and failed progression already belong
to `teamThreatMemory`; the coach reuses those decaying channel histories. No second
event counter pretends to independently confirm them. Existing `matchupCaution` is
an idealised pre-match scouting prior from squad quality, not observed in-match
knowledge. Live strategic decisions do not read the opponent's private instructions,
future actions, internal action ranking, random stream or future result. Prematch
role allocation no longer reads the opponent's private block-height setting.

Assessment runs every 45–93 football seconds according to adaptability, with a
separate structural review after discipline changes and an explicit halftime review.
Plan changes persist for 160–230 seconds unless halftime or a new dismissal warrants
reconsideration. These bounded engineering timings prevent oscillation; they do not
insert dead playing time. Existing threat responses still rise/fall gradually.

## Changes, halftime and physical consequences

Each decision records time, trigger, observed problem, sample coverage, score context,
candidate plan, channel, actual role changes and before/after team preferences.
The available plans exploit observed space with an actual fast winger, protect a
repeatedly exposed flank, provide complementary width against a low block, switch
an ineffective attacking route, preserve a late lead with a running outlet, chase
a goal with accepted exposure, and reorganise after a dismissal.

The requested A–F controlled scenarios retain both unchanged and coached physical
continuations. A supported pace plan changes a wide playmaker into a depth-capable
winger and offers more direct progression. Failed previous routes can switch the
emphasis to another wing. A central dismissal can transfer a surviving wide player's
responsibility into the vacant central berth, deliberately conceding width instead
of leaving an arbitrary central hole. Protecting a lead preserves a depth outlet;
chasing a goal changes fullback/midfield duties. With insufficient evidence, halftime
records that no change is justified. Repeating the same review is idempotent.

Changing a role or structural berth alters targets and future decisions. It never
sets a body to its destination or resets velocity. Actual locomotion, momentum,
fatigue, contact, offside, goalkeeper and human authority remain responsible for
the resulting play. The benchmark also records 30-second post-change windows of
player movement and actual passes/shots. Those windows provide temporal lineage,
not an unbiased causal estimate: the opponent, score and ball trajectory also change.
Controlled paired continuations provide the stronger local mechanism contrast.

The eight prescribed scenarios × five policies produce forty dependent local
experiments. A selects `exploit_space`, B `switch_route`, C `reorganise`, D
`protect_lead`, E `chase_goal`, the exposed flank `protect_flank`, and the compact
block `open_low_block` in all five policies. F records `balanced` with no change in
all five. The archived ten-second unchanged/coached continuations retain actual
positions, targets, passes and rankings. For example, the R3 pace winger moves
about 5.0 m versus 2.1 m unchanged. That demonstrates a physical consequence of
the instruction, not a claim that the intervention wins more matches.

The observation model is deliberately coarse: whole-line space and three channels,
not an identity-specific learned model of every opposing fullback. Confidence is
evidence coverage, not calibrated football certainty. This limits individual
matchup claims and remains an explicit extension boundary.

## Role-sensitive bench decisions

The existing legal substitution planner still owns named benches, limits, opportunities,
injury replacement, referee permission, physical exit/entry, participation and minutes.
It now compares replacement suitability for the requested role, current reserves and
pressing card exposure alongside effective positional ability, score/time, remaining
opportunities, injury and the cost of spending a substitution. The requested role and
numeric rationale travel with the request and completed substitution fact. A healthy
bench player does not inherit a departing player's fatigue or identity. No suitable
replacement or nonpositive expected improvement means no change.

## Demonstrated holding causes and bounded repair

The original PR178 worst hold and PR179 R2 goalkeeper hold are replayed unchanged.
The keeper's ground ball remains about 1.3 m from the body, outside both 0.82 m foot
envelopes. Preparation time has expired, but the old scanning target is tied to a
previous reception origin. Release remains correctly illegal; only hold and costly
carries survive valuation. This is unavailable physical preparation, not rational
protection, a lack of nominal pass candidates or useful anticipation of support.

Ordinary possession preparation now walks toward the actual ball when it lies
outside both feet but inside the existing control envelope. A real subsequent touch
restores release eligibility. The ball is not snapped to a foot and no remote kick
is granted. A current carry or explicit movement command retains its authority.
The same consequence-based waiting forecast now serves B as well as R1–R3; B's old
current-pressure-only holding estimate omitted approaching defenders and support.
No fixed possession timeout, forced pass, pass limit or accuracy modifier is added.

[Before](performance/PR182-hold-before.json) and
[after](performance/PR182-hold-regressions.json) retain both complete historical
input identities, all five rankings and 2/5/10/30-second physical checkpoints.
The two tested stationary failures disappear across all five policies. This is a
regression result for two known states, not proof that every future hold is rational.
The first development candidate exposed another WW hold. Its exact captured state
is retained as `pr182-evidence/r2-new-ww-hold-state.json.gz`. Readiness previously
sampled just after a foot touch, missing legal release windows at the next cadence;
the next eligible ranking now notices the physical release transition. Restart
possession also receives the same ordinary preparation. These fixes preserve contact
gates and the decision cadence ceiling. **The new state still remains within the
strict one-metre detector for the R3 30-second continuation.** This warning is retained;
two historical regressions passing is not an all-holds claim.

Full-match maximum duration and strict pathological-episode counts remain separate:
the strict detector can miss a very long hold that drifts farther than one metre.

Independent validation exposes a serious remaining **R3 SW2 goalkeeper sink**:
`footballer_pro_57_0` holds from 294.775 s to halftime, **2405.225 seconds**, with
0.742 m displacement, 5995 consecutive holds, 42 ranked alternatives and no opponent
intervention. Later 796 s and 1025 s episodes drift over one metre and therefore
escape the strict pathological flag; their duration still appears in the raw history.
This is a hard promotion blocker, even though the match clock reaches full time.

The post-validation diagnostic replays the unchanged consumed input to 330 s and
continues thirty physical seconds. Release is legal in **600/1200 ticks**, yet all
76 selected actions are hold. At a legal release snapshot, hold scores about
−0.00685 while available passes score about −0.0174 to −0.0176. The waiting forecast
continues to call 3.12 m of support movement useful, with no intervention within
its 2.5-second horizon. This supports investigating R3's phase blend and recurrent
support benefit; it does not establish that every available pass would succeed.
`inspectPr182ValidationHold.mjs` and its compressed state/diagnosis are explicitly
post-validation diagnostics. They do not alter the frozen primary runner or add an
independent design. No hold repair or score tuning follows this result in PR182.

## Football references and interpretation

The pinned StatsBomb Open Data sample is retained at commit
`4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`, with original hashes, licensing and event
definitions from PR171/175/179. Its twelve World Cup 2022 and twelve Bundesliga 2023/24
matches are descriptive senior-football samples. Approximate non-cross pass P10–P90
ranges 894–1196 / 1067–1245, shots 13–31 / 16–31 and corners 5–13 / 6–15 provide
context. They are not quotas and are not universal limits for weaker or youth teams.

FIFA's [movement in behind](https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/sessions/movement-to-attack-the-space-in-behind.php)
emphasises the relationship between pass weighting and run timing. Its
[attacking the cross](https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/sessions/attacking-the-cross.php)
links delivery to teammates arriving behind defenders. These support the tactical
questions; they supply no numerical MFL scoring weights or duel-frequency targets.
Current [IFAB Law 3](https://www.theifab.com/laws/latest/the-players/) preserves the
competition's substitution limits, separate halftime opportunity and legal entry
procedure. [Law 11](https://www.theifab.com/laws/latest/offside/) keeps offside tied
to the actual play/touch. Both official sources were checked on 22 October 2026.

Useful failed forward passes, crosses and take-ons are evaluated by their intended
opportunity, feasible contact, execution and ensuing opponent threat. Completion
and event volume alone cannot establish better football. Goal conversion, very
high circulation, scarce contested aerial contact and live-time excess remain
explicit investigation dimensions rather than reasons to impose event quotas.

## Development provenance and serial cost

The first implementation commit `1cf6c1f` has production fingerprint
`f1d255e5f04f48d40a357e7e3776828e63cd154f4da59e2a0ec79be78a0b7534`.
Its fifteen complete development matches and compact aggregate are archived under
`pr182-evidence/initial-full/` and `initial-development-comparison.json.gz`.
They revealed the new WW holding case and a dismissal review which failed to see
the already removed player. Discipline facts now supply the dismissal count.
The central replacement subsequently moves through ordinary locomotion.
The later fifteen 900-second screening prefixes are separately labelled in
`pr182-evidence/development-prefix/` and `PR182-development-comparison.json`.
Neither epoch is independent confirmation of the final candidate.

All policies receive explicit coach-issued role movements. R2/R3 additionally use
their existing autonomous role movement. Box delivery permits a target forward to
arrive beyond his normal support position. Cross lineage distinguishes actual
open-play deliveries, set pieces and edge cutbacks before judging receiver geometry.
An outside-area contact by itself does not prove a broken open-play crossing model.

`PR182-performance.json` records 28 fresh serial trials and an additional complete
observer window, with no other simulation/test workers during those trials.
The full-match pairs use identical starting states and unchanged 0.025-second physics.

| Policy | PR181 CPU s | Candidate CPU s | Change | Candidate sampled RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| R1 role-value | 161.983 | 197.812 | +22.1% | 470.6 |
| R2 role-intent | 183.750 | 276.844 | +50.7% | 606.3 |
| R3 phase-role | 172.781 | 180.688 | +4.6% | 433.6 |

There is one complete paired workload per policy, so these are measured costs,
not universal rates or narrow confidence intervals. Twenty 120-second windows
include two repeats per policy/source. Role/flow observers and all primary
observers have separate on/off measurements; the complete observer window adds
about 17% CPU and preserves the entire final state. A full R3 observed development
match also exactly matches its unobserved serial state and tick count. Later UI-only
pause/freeze/restart corrections leave the measured match-core fingerprint unchanged.
The frozen cost gate excludes R2 from default promotion on this measurement.

The original full verification initially found two expected telemetry snapshot
changes. Both old and new complete snapshots were reproduced twice per seed before
updating the explicit legacy reference. No ledger assertion, tick count, suite or
timeout was removed. `PR182-telemetry-reference.json` preserves those receipts.

## Match Lab review workflow

Start a native-club match in pause, edit roles before kickoff, then use **Zamroź role
i taktykę do powtórek**. Select each of the five existing policies through **Powtórz
z polityką**. This rebuilds the same squads, attributes, seed, formations, roles and
preferences; only the policy changes. **Restart — ten sam seed** also starts a fresh
run. The compact comparison export includes input identity, revision, canonical
shots/passes, first-time share, progression, delivery and contact counts, no-op holds,
role changes, substitutions and observer errors. The detailed export retains lineage.
Intentions, releases and actual contacts are explicitly distinguished in definitions.

`PR182-browser.json` and screenshots document a real Edge production-build smoke:
all five frozen starts agree, real download buttons work, restart returns to time zero,
and an actual human-selected pass enters the canonical trace with no AI ranking.
These are short UI fragments, not five watched halves or independent full matches.

## Preregistered independent comparison

The final behavioural candidate is commit `b66228c26d7897da44545dc37e4f0ade606a9e2d`.
`PR182-freeze.json` was written at **2026-10-22 15:15:51 UTC**, committed as
`bbf3ca5` and pushed before opening the reserved archive. The all-production source
fingerprint is `b4249e1a8a7311f827d5be1c995184e7342f7a835f44b3cb237530b6572e5ad8`;
the complete declared harness fingerprint is
`f08f8ac24868c927c708af8c38a522a47b2509b7c5b4748290628eb6fb7a7a9d`.
The freeze records the original input identities, criteria, configuration, metrics
and resource budgets. Source includes the Match Lab UI as well as core football.

Preparation verifies every original complete state/session digest before attaching
the archived canonical manager and empty observation memory/common roles. The
transformed complete inputs are archived and hashed in `PR182-validation-inputs.json`.
Twelve native designs contain four SS, four SW and four WW; each is run under all
five policies, with the same native attributes and named benches. No tier flattens
players to a constant rating. Formation, style and youth flags remain visible.

The 60 matches provide **twelve paired experimental units**. All rows and strata
are reported, including the weak side of SW. The fixed-seed 4000-resample paired
bootstrap is exploratory; four designs per stratum give limited precision and
multiple endpoints are not corrected. Temporal post-change windows do not prove
causality. Development cases, repeated observer runs and UI fragments add no new
independent fixture.

The runner checks source/harness fingerprints, exact transformed input hashes,
full-time completion, unique official/first-time pass identities, lineage completion,
statistics invariants and live/dead clock reconciliation. CPU limits remain 600 s
per child, wall limit 900 s and canonical stepping 0.025 s. Primary runs use ten
processes and their wall times are not serial performance claims.

For the primary selection, only the literal `DEFAULT_DECISION_POLICY` could change
after this comparison. Its normalized candidate fingerprint remained identical.
The consumed twelve designs cannot be relabelled independent evidence for a repair.
The review correction and its newly reserved confirmation are separately versioned
above; they do not rewrite the primary freeze or results.

## Primary results and policy decision

**60/60 matches reach full time**, with the frozen source/harness, exact common
inputs, no recorded observer errors and reconciled canonical pass identities and
live/dead clocks. The twelve paired designs, rather than sixty matches or individual
actions, remain the inferential units. Primary execution took 2172.3 wall seconds
with ten processes; this is not a serial speed measurement.

The table reports unweighted per-design means; maximum hold is the largest observed
episode across the policy's twelve matches. These are canonical physical shots.

| Policy | Pass attempts | Shots | Goals | Box entries | Largest hold s | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Legacy | 1622.6 | 3.83 | 2.83 | 24.92 | 6.50 | Replace as default |
| B state-value | 1515.9 | 21.42 | 5.58 | 32.75 | 10.95 | Provisional default |
| R1 role-value | 1629.6 | 15.00 | 4.08 | 27.83 | 10.43 | Experimental |
| R2 role-intent | 1505.8 | 18.50 | 5.50 | 28.17 | 8.63 | Experimental |
| R3 phase-role | 1368.0 | 13.92 | 4.67 | 22.83 | 2660.05 | Blocked by stagnation |

B improves shots in **12/12** designs and box entries in **9/12**. Its paired mean
shot difference is +17.58, exploratory bootstrap 95% interval **[12.83, 22.50]**;
box difference +7.83, interval **[2.75, 13.17]**. There are no strict pathological
holds in its primary runs. These support provisional attacking initiative, not a
claim of globally realistic football or a calibrated scoring distribution.

R1 improves shots in 12/12 but box entries in **7/12**, below the preregistered 8/12
requirement. Its box difference interval **[−3.00, 8.42]** crosses zero. R2 also has
7/12 positive box differences and fails the serial cost gate. R3 has only ten
positive shot differences and repeated multi-minute goalkeeper sinks. The criteria
are retained even though R1's short holds and serial cost are otherwise acceptable.
Legacy's low attacking activity and penalty-heavy shot sample provide no reason
to preserve it merely because it was the previous default.

Because B remains the eligible existing alternative, a single additional complete
serial PR181/B pair was planned before reading the candidate cost receipt, using
the same frozen performance harness and the same 35% cutoff. No other simulation
or test workers ran during that pair. CPU is **134.813 → 157.984 s (+17.2%)**;
the complete initial-state hash agrees. This extension adds no independent football
design and makes no change to primary metrics or selection thresholds. The plan
and both raw receipts are in `PR182-additional-cost-plan.json` and
`PR182-performance-B.json`. Single-workload uncertainty still applies.

The selected existing policy is **`state-value-v1`**. In the original selection,
the only post-validation production edit was the literal `DEFAULT_DECISION_POLICY`;
normalized candidate hash remained
`e547661e9b254aca7742401385326aee559dc90c70f2afef742359fef9f63b3a`.
The original selected production hash was
`8bac5f62e84c788c239876e7a6dd9d0b7f8bc5a30581da5f3eb82f2ef65dbf1f`.
All five choices remain available. This is the existing B architecture receiving
shared PR182 coaching and physical repairs; no new hybrid or save migration is added.

### Strength strata and weak-side football

Each cell is **shots / box entries per match**, four native designs per stratum.
All other stratum metrics and paired rows remain in the machine-readable comparison.

| Tier | Legacy | B | R1 | R2 | R3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| SS | 4.00 / 19.50 | 23.75 / 32.00 | 16.25 / 24.50 | 21.25 / 28.25 | 14.25 / 21.50 |
| SW | 6.00 / 39.75 | 30.75 / 46.50 | 21.75 / 38.25 | 28.00 / 40.75 | 20.50 / 31.50 |
| WW | 1.50 / 15.50 | 9.75 / 19.75 | 7.00 / 20.75 | 6.25 / 15.50 | 7.00 / 15.50 |

B's SW scores are **8–1, 7–1, 13–1 and 5–0**. Strong-side shots are 16/37/32/25,
weak-side shots 2/3/6/2. Weak-side pass completion is 44.1%, 23.9%, 19.5% and 17.0%.
This is a material execution/strength limitation, not evidence that weak football
is now realistic. SS mean completion is 65.2%, WW 28.1%; WW averages 1.5 goals
from 9.75 shots. The cohort contains no independent youth subgroup, so it cannot
validate youth-match quality. PR183's native world-strength work remains necessary.

### Passing, progression, wings and aerial execution

B's mean first-time share is **11.48%**, versus legacy 2.00%; mean final-third
entries rise from 68.4 to 144.8. SS still averages **2309 pass attempts**, far above
the descriptive senior reference. Its overall mean completion of 46.4% and WW
28.1% are also not plausible calibration targets. No universal accuracy modifier
or forced pause has been used to manufacture these rates.

Depth is not a uniform success: B has **196 intended behind-line releases and 37
actual completions beyond the release line**, versus legacy 205/64. R1 also has
37 such completions; R2 has 29 and R3 13. There are no snapshot fallbacks in B.
B records 3414 central-midfield receptions and about 43.95 km of summed positive
controlled forward reception distance across twelve matches. These quantities
measure different parts of the attacking funnel; high circulation or a nominal
run target does not establish useful penetration.

B records 22,299 wide take-on intentions and **1003 actual passages beyond a marker
with control**. Intentions can restart frequently and cannot be treated as provider
dribble attempts. There are 397 cross releases: 162 from open play and 235 from
set-piece contexts. **119/162 open-play targets and 214/235 set-piece targets are
outside the penalty area.** Edge cutbacks can be useful, but this distribution and
the recorded recipient geometry do not justify claiming a solved crossing model.
The raw release/receiver positions distinguish a useful delivery from an unsuitable
target. No event-count quota changes the decision.

There are 178 aerial-contact opportunities, 13 body-contested opportunities and
**12 actual contested contacts** in B. Physical contested resolution works in those
cases, while aerial play remains scarce. Opportunities are not reported as completed
duels. Controlled ten-metre counterattack progress occurs in 492 episodes; 96
recorded turnovers are followed by an opponent shot within ten seconds. These are
dependent, observer-defined episodes and temporal consequences, not independent
evidence that all accepted attacking risk is good or bad.

### Shooting, defending, coaching and substitutions

B's canonical **67 goals / 257 shots = 26.1%** conversion remains high. Of 254
detailed shot records, 250 are open play, two headers and two penalties; outcomes
include 67 goals, 85 misses, 49 blocks, 49 saves and four post/crossbar events.
Mean detailed distance is 19.46 m, base xG proxy 0.144 and effective expectation
proxy 0.063. Those proxies are not calibrated probabilities. The large discrepancy,
weak keepers, reachable flight geometry and actual interventions require focused
work before statistical calibration. `no_recorded_contact` does not prove that the
keeper could or should have saved the shot.

Detailed metadata omits **three B canonical attempts and one R1 attempt** across
the full cohort; their IDs and missing result coverage are explicitly listed in
`PR182-validation-description.json`. Primary selection uses canonical attempts.
Context/keeper averages describe the detailed subset. A complete B state-equality
replay also captures the first missing attempt's physical lifecycle for diagnosis;
this coverage limit must not be silently converted into a zero-error completeness claim.

`PR182-shot-coverage.json` reconciles these four IDs with foul stoppages and the
subsequent restart shots. The complete B replay shows the first shot physically
released at 1798.625 s, then interrupted by a slide-foul penalty whistle at
1798.825 s; the ball continues as a dead ball and cannot score. The other three
rows immediately precede close free kicks for fouls on the same shooter. Canonical
release attempts stay counted, while the detailed result needs an explicit
**whistle-interrupted/censored** category. This explains the coverage gap without
inventing a shot outcome; provider comparisons must resolve that definition first.

B's observed adaptation windows contain 112 actual changes: 56 flank protection,
31 pace exploitation, 12 chase-goal, 11 protect-lead and two reorganisations.
No changed halftime window appears in the primary cohort; A–F demonstrate supported
halftime changes and the no-change option locally. Changed players move a mean
15.4 m over the recorded thirty-second windows. This is temporal lineage, not a
causal estimate of improved defending. Primary `coachChanges` counts use the
retained 48-decision histories per team; the supplemental windows report the fuller
changed-decision record. Their bounded-history definitions remain explicit.

The same B matches complete **76 legal substitutions**, 40 tactical and 36 fatigue,
with actual role IDs and numeric benefit/opportunity costs retained. Position and
role demands, fresh reserves and score context affect the choice; physical exit,
entry, opportunities, identity and minutes stay in the canonical lifecycle. High
SW scoring, weak execution and the absence of a universal defensive improvement
remain limitations despite measurable flank-protection responses.

### Readiness and the next stage

**Canonical remains NOT READY as a trustworthy summary-calibration reference.**
The provisional B default improves actual attacking initiative across all strength
strata and avoids the observed no-op sink, within the measured cost limit. Law,
human-input, identity and deterministic state contracts are suitable correctness
checks; they do not validate shot/goal, possession, passing or aerial distributions.

The focused repair scope before PR184 calibration is: ordinary control/release and
restart timing behind excess circulation/live time; native weak-team execution;
shot/keeper expectation and interrupted-shot metadata; and open-play delivery with
recipient arrival. R3 needs a bounded waiting/support regression repair before
reconsideration. Any behavioural repair must use unused inputs for confirmation;
this consumed cohort cannot provide it. No indefinite audit programme or new
fractional PR numbering is proposed. **PR183 generational renewal/world strength →
PR184 summary and PlayStyles (calibration gated) → PR185 career UX → PR186+ world**
remains the planned sequence.

## Verification and test-policy scope

The full original `npm run verify` command is retained: lint, every unit suite,
match integration, exactly-once career result contracts, full-career tests,
TypeScript and production build. No suite or assertion is skipped and no timeout
is increased. A concurrent attempt hit two integration deadlines under ten active
benchmark processes; it is recorded as failed, not counted as a pass.

Changing the new-match default initially exposed 43 historical fixture assumptions
in 24 test files: legacy utility scales, legacy candidate lists and trajectories
after an NPC had already selected a different next action. Those historical
sessions now explicitly declare `legacy-pr176`; PR163/173 use their existing
factory-injection argument. Two historical benchmark fixtures also declare their
legacy baseline. The primary frozen harness is unchanged. An AST audit preserves
**3203 original expect/matcher calls and every explicit test timeout** across the
24 formerly failing test files. These are calls, not 3203 independent tests.

Six additional tests assert the new B default and human authority under each of
the five policies. The selected action starts with identical canonical ball/body
physics for human and NPC sources. The human's target and decision remain intact;
physical parity is checked until the NPC legitimately selects a different action.
That distinction prevents conflating a later AI choice with a physical input buff.
Original historical assertions remain unchanged, and B is separately covered by
all twelve full primary matches, complete observer replay and actual browser input.

The primary selected B replay reaches 5700 s in **228001 ticks** with final state
hash `9575887fd8e3d58806ccdef4e4922475cd974905da24efd098572f632059bcfa`,
identical with all primary observers/profiler present and absent. The passive
coverage snapshots do not modify the replayed state. Every policy also repeats the
same 120-second full state with/without observers. R1 has an additional complete
229287-tick equality check. Repeated runs provide correctness evidence, not new
independent football designs.

**Final full `npm run verify`: PASS, 2051 tests** (1988 unit, 54 match integration,
four career contracts and five full-career tests), lint, TypeScript and production
build. The unchanged career contracts play a real U-17 match with twelve human
choices, save/reload/calendar advance, and the same complete senior fixture twice
with identical results and duplicate/conflict rejection. No timeout is increased.
The final fresh Edge production-build smoke also passes: actual B default, five
identical frozen input identities, restart at zero, both JSON downloads and a real
human-selected B pass with no AI ranking. Screenshots were visually inspected.
Its brief fragments are still not five qualitative watched halves.

Selected B's serial full workload is 124.16 → 142.40 wall seconds and sampled
RSS 434.85 → 454.51 MiB. These supplement the CPU result, not a universal browser
speed or allocation-peak claim. Final production behaviour and primary harness
fingerprints remain unchanged apart from the preregistered default literal.

## Evidence index and reproduction

All paths below are relative to `docs/performance/`. Historical PR171–181 evidence
archives are preserved. Generated JSON is excluded from normal Git diffs; the
readable report and scripts explain definitions while complete receipts stay inspectable.

| Evidence | Artifact |
| --- | --- |
| Pre-opening source, criteria and budgets | `PR182-freeze.json` |
| Native original/transformed input identities | `PR182-validation-inputs.json`, `pr182-evidence/validation.json.gz` |
| All primary rows, strata and paired intervals | `PR182-validation-comparison.json` |
| Football context, shot/keeper, delivery and substitution detail | `PR182-validation-description.json`, complete primary receipts |
| Explicit selection and calibration decision | `PR182-decision.json` |
| Complete-state observer equality and repeats | `PR182-integrity.json`, `PR182-selected-integrity.json` |
| Serial CPU, wall and sampled memory | `PR182-performance.json`, `PR182-performance-B.json`, raw receipts |
| A–F and flank/block physical continuations | `pr182-evidence/coaching-continuations.json.gz` |
| Historical and new WW holding regressions | `PR182-hold-before.json`, `PR182-hold-regressions.json`, `PR182-new-hold.json` |
| Consumed primary R3 holding diagnosis | `pr182-evidence/validation-r3-sw2-hold-*.json.gz` |
| Real UI downloads, input equality, screenshots, human action | `PR182-browser.json`, `pr182-evidence/browser-*` |
| Exact old/new telemetry snapshot reproduction | `PR182-telemetry-reference.json`, raw compressed receipt |
| Censored physical shot attempts and whistle context | `PR182-shot-coverage.json`, selected full replay snapshots |
| Original assertions/timeouts after explicit historical policies | `PR182-test-fixture-audit.json` |
| Full original verification and failed attempts | `PR182-verification.json`, compressed logs |
| Review repair, separate freeze and unused-input confirmation | `PR182-review-freeze.json`, `PR182-review-confirmation.json`, `pr182-evidence/review/` |
| Separate development epochs | `pr182-evidence/initial-full/`, `development-prefix/`, `development-full-observer.json.gz` |

Reproduction uses Node 24.19.0 and the unchanged lockfile. Run verification on the
final PR checkout; run the primary commands in a clean checkout of freeze commit
`bbf3ca5` (which contains the manifest and the same behavioural source as `b66228c`).
The source guard deliberately rejects running primary validation on a changed default.

```sh
npm run verify
# Primary reproduction from the freeze checkout:
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/preparePr182Inputs.mjs --validation
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/runPr182Validation.mjs
node scripts/reportPr182.mjs --validation --runs=../pr182-validation
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr182Integrity.mjs --policy=role-value-v1
# Original selected B replay/coverage from d357eb8 with the same run directory:
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/inspectPr182ShotCoverage.mjs
```

Replaying consumed inputs is a reproducibility check, not fresh independent
validation. If the default is promoted, primary replay uses the frozen source
commit; the original selected-policy observer replay permits precisely the normalized
selection literal and belongs to checkout `d357eb8`. The review candidate uses
`scripts/validatePr182Review.mjs` and its own committed freeze instead.
