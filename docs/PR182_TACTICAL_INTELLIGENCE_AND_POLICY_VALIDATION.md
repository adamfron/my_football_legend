# PR182 — Tactical Intelligence & Independent Policy Validation

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
   `pr180-reserved-*` remain unopened and are not part of the primary claim.
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
