# PR189 — Ball Contact, Duel Geometry & Deadlock Resolution

## 1. Executive findings and scope

The frozen PR188 WW/A match reproduces **1,984.700 s** of stationary possession.
This PR repairs a demonstrated scheduling deadlock, captures actual resumable
states, shares finite contact readiness between observation and execution
scheduling, and lets a safely covered experimental defender probe a static carrier.
It also repairs the captured SW/C ceremonial free-kick placement jam by routing
an encroaching defender around all obstructing bodies, including opposing support
players and bodies close to the route endpoint. Actual legal-distance checks remain.
It is a **staged draft**, not completion of the entire articulated-body mission.

**B remains default; canonical is NOT READY; the independent cohort is unopened.**
No named trick, forced turnover, pass quota or inactivity timer is added.

| Gate                                     | Verdict                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1 — real pathological captures           | PASS for frozen WW/A, full-state replay and passive stationary detection                                            |
| 2 — control/release handoff              | PASS for the recovered PR188 episode and six actual captured stages                                                 |
| 3 — repositioning/shielding              | PARTIAL: existing finite movement and directional geometry regression-tested; no articulated posture extension      |
| 4 — defensive progression                | PARTIAL: covered static probes and six physical neighbours; full contextual defensive controller remains incomplete |
| 5 — lower-body geometry                  | NOT IMPLEMENTED                                                                                                     |
| 6 — body-surface disruption and leg gaps | NOT IMPLEMENTED; existing contact resolver limitations remain                                                       |
| 7 — timed/deceptive pass                 | NOT IMPLEMENTED; requires earlier geometry/contact gates                                                            |
| 8 — full development/verification        | PASS recorded development: 15/15 reach full time within 7,200 s. Final technical outcomes are reported separately   |

## 2. Frozen PR188 baseline

Merged base: `a74be9ee846ac4958fd67e42795cf3d86946e937`; PR188 head:
`ecadd16747a9ab34297dfb5fd430ea38c9d1e2d5`. Frozen source manifest:
`ab3b02e29abc0f50ef48dde242ca8520ff0b0d09b093ddc013dc07c16e8a366d`.
PR188 reports 2,244 passing tests and final-head CI PASS; these remain historical
results, not this PR's validation. Existing PR188 evidence, including negative
experiments, is unchanged. CI checks it in a frozen-source archive, then replays
the captured state. Current source must not be hashed as if it generated PR188.

The original archived full input is reused byte-for-byte after JSON serialization:
`a3c827a958bccbd7edbfed74528564333db86b6a1d41bdb16134aac1123a510f`.
WW: 4-2-3-1 versus 4-3-3, attributes 39:44, pressing,
seed `pr187-development-ww-01`, `opportunity-driven-v1`, 0.025 s physical steps.
SS/SW and all five policies use their own frozen PR188 full-match input archives.

## 3. Actual reproduction of the long episode

`capturePr189Baseline.mjs` reproduces all 220,801 ticks to full time. The maximum
stationary interval is 1,984.700 s, ending at approximately 2,759.975 s, owner
`geometry:anchor:5`. The six compressed captures are actual full canonical states
at 775.025, 795.300, 835.300, 1,075.275, 1,975.300 and 2,759.275 s.
The first is near the episode's onset, not a fabricated pre-possession state.
The PR188 partial diagnostic snapshots were never promoted into complete inputs.

The baseline continuation of the 20-second capture for 800 ticks gives the exact
same state hash `ab35d0453625c3c6c575506cf12d6d761ef85914625224ebebf300e516ed38b0`
and the same observed event hash when restored; disabling the observer preserves
the state hash. Profiles, balance, contact clocks, knowledge, tactical memory,
discipline, restarts and preparation remain in the captured graph.

PR188's earlier observed/diagnostic raw final hashes differ only in object-key
order under `departedPlayers`. Deep strict comparison confirms identical values.
Both historical bytes and the original `equalFinalState: false` are preserved;
`replay-labs-restart.json` records the independent explanation.

## 4. Causal trace: selection is not release

The tick moves bodies, checks the owner's decision before the ordinary control
impulse when contact is ready, advances the controlled ball, resolves defensive
actions, and checks the owner again. Simply moving the decision before control
was already present in PR188 and does not repair the failure.

In the recovered state, control touches occur at 795.300, 795.550, 795.800 s, etc.
The policy's perception delay is approximately 0.2298 s and its decision ticks
settle at 795.325, 795.575, 795.825 s. Every evaluation sees the post-touch
blackout. Intermediate inspection can select an executable pass, but that
inspection is not an executed policy decision. Preparation age is already over
23 seconds, the ball is within reach, and the canonical pass would release.
There are no autonomous pass attempts in this repeating interval.

The minimal repair lets an existing `preparationCandidateId` trigger current
candidate revalidation when `contactReady` becomes true, without waiting through
another visual latency. It does not force the old candidate to remain selected.
The current scene, legality, receiver and action-specific preparation still win.

The first development cycle exposed a second failure in SS/H: a surface reported
0.303 s motor recovery while the next control touch was scheduled after 0.195 s.
The release respected recovery, but recurring control did not. SS/H reached
82.025 s stationary (versus 0.975 s historically), so the first patch was rejected
as a complete repair. Both captured SS states and the entire failed engine overlay
are retained. Reconstructing that overlay reproduces its original source manifest
exactly; no state or missing field was fabricated to explain the regression.

An 800-tick causal replay records 36/44 premature controls in those original
continuations. The corrected engine records zero and launches a pass after
0.225/0.125 s respectively. The original continuations also eventually release
after 7.3/8.9 s; these two particular captures are not claimed to be permanent holds.

Cycle two exposes a third failure: nominal locomotion reports 0.44 m/s, but body
collision holds the carrier at exactly the same position. The ball is behind the
presented feet, outside their envelope; the next planned contact is already past.
The nearest defender is 0.486 m from the ball, but control remains protected.
The 120-second capture replays 20 more seconds with **zero actual body movement**,
no release and unchanged ownership. Its complete source is preserved independently.
The corrected tick marks the physically missed contact and makes the ball loose;
only the ordinary acquisition lifecycle can award the next owner.

## 5. Contact scheduler and finite recovery

`motorContactReadyAt` supplies the common recovery deadline for control plans,
their execution guard, contact-window forecasts and release readiness. Sequential
contacts in an existing multi-touch move also respect their surface's recovery.
`releaseContactReadiness` is shared by `canReleaseControlledAction` and bounded
observation. It requires actual ownership, low height, an available foot envelope,
and elapsed recovery `max(0.12, last surface recoverySeconds)`. The captured
contact's actual recovery is about 0.19708 s, so the corrected release occurs
after **0.200 s**, not the old 0.125 s floor. Control touches, spin, ball position,
balance and the 40 Hz physical integrator are not replaced.

The existing canonical pass launch produces a moving unowned ball and updates
the pass/statistical lifecycle. This PR does not claim that generic settled-pass
launches have been replaced by a complete articulated foot-surface solver.
Trace attempts distinguish preparation, height, reach, motor recovery, required
foot, canonical rejection and a changed state without release. The diagnostic
taxonomy is incremental: missed windows, opponent interruption and inaccurate
surface impulses still need richer contact-level instrumentation.

## 6. Foot repositioning and movement

The existing canonical owner movement already steps toward a low ball outside
the convenient foot envelope but within the control pursuit envelope. A regression
moves the body toward an inconvenient ball through ordinary acceleration over
0.3 s, with no new tactical carry or coordinate attachment. No foot, knee or ball
teleportation was added. Explicit support-foot and ankle repositioning is deferred.

When an already due follow-up touch is out of foot reach and the attempted recovery
step is physically blocked, protected control ends. This uses measured pre/post
body positions rather than desired velocity. A moving recovery at the same ball
distance retains control; distance alone does not trigger an opponent award.
The failing contact is recorded as unexecuted, with no impulse or extra physical
contact count. The actual ball/spin continue through the normal loose-ball system.

## 7. Shielding

Existing body-side geometry remains authoritative within its current simple body
model. A rear approach can be occluded while an independent front approach reaches
the same ball; strength or a shielding flag does not disable all opponent contacts.
This is regression evidence, not a newly implemented articulated shielding model.
The fixed torso projection cannot yet express a legal reaching corridor through
the legs, which is an open limitation.

## 8. Defensive containment and approach

Only the three experimental policies gain a covered probe. Conditions include a
stationary carrier, slow ball, nearby opponent, actual defensive cover, available
outlet, no protected receiver assignment and no uncovered dangerous context.
Existing movement and the ball-side orbit target execute the approach. It is not
an order to tackle after any duration. Historical B/R3 defensive preference logic
is retained; shared contact readiness and legal restart routes can still change their match
trajectories and is measured separately.

Six reconstructed Lab B neighbours vary zero/one/two covering teammates and ball
side. They reserve the carrier through a canonical human retain action, allowing
ordinary carrier movement and every defensive/rules process. Zero-cover variants
retain containment; covered variants engage. Minimum defender-to-ball distances
include 0.913 m with one cover and 0.858 m with two. Results include a clean win,
a beaten defender and approaches without a challenge: engagement guarantees no win.
The full moving-winger/contextual laboratory matrix remains incomplete.

## 9. Lower-body geometry

NOT IMPLEMENTED. Current foot origins, torso envelope and nominal reach are
retained. Pelvis/hip/thigh/knee/ankle chains, height-dependent reach, bounded
stance transitions and renderer debug primitives need a separate coherent change.
No persistent kinematic schema was introduced, so no save migration is claimed.

## 10. Contact and possession outcomes; Laws audit

The existing challenge resolver gates by reach, orientation, body occlusion and
timing, but still uses ratings/seeded execution to classify clean wins and loose
balls. It can directly award a clean win after that classification. This has not
been replaced by explicit shin/knee/thigh collision impulses and subsequent
ordinary acquisition. Gate 6 is open; reachable geometry is not evidence of a
fully geometric intervention solver.

The [IFAB 2026/27 Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/)
was checked on 2026-10-25: legal shielding requires playing distance; a fair
challenge is possible there. Careless, reckless and excessive-force challenges
have distinct sanctions. Touching the ball does not excuse dangerous contact,
and ordinary opponent contact alone does not establish an offence. Existing foul,
discipline, injury and restart classification is preserved; this is no claim of
complete new Law 12 calibration.

## 11. Leg-gap and goalkeeper tests

NOT IMPLEMENTED. The existing monolithic lower-body collider still blocks some
trajectories that a future articulated stance should permit. No nutmeg success
probability, frozen goalkeeper or widened invisible reach was added. Mandatory
Lab C/D surfaces, changing gaps and legal keeper-hand response remain open.

## 12. Fast versus prepared action

NOT IMPLEMENTED. An executable prepared pass now reaches a contact window;
that does not demonstrate a choice between mechanically distinct toe/inside/heel
actions against an approaching defender. Existing PR185 surfaces were audited
and are reused unchanged, not duplicated as new labels.

## 13. Deception

NOT IMPLEMENTED. Separate gaze, remembered-target uncertainty, visible foot cues
and a defender response to those cues require the later information/contact work.
There is no surprise bonus and no hidden-action read.

## 14. Replayed pathological states and diagnostic boundaries

All six original states produce a real pass under the repaired engine. Each has
equal restored state/event hashes and observer-off state hashes over 160 ticks.
These continuations revalidate real targets; they do not prescribe a kick.
`repaired-after-4s-restart.json.gz` preserves an actual post-repair continuation.
Full-match stationary detections capture at most two states per variant, with
one additional capture for continuous same-owner possession reaching 120 s. Detection
is external to the live engine and cannot choose an action or transfer possession.
Other trace signal labels are supported, but only stationary/same-owner detection is automatic
in the development runner; a comprehensive rejection/oscillation detector is open.

The original replay laboratory's redundant historical-challenge filter was removed
in v2; the final recovery-aware replay is authoritative. All earlier receipts and
traces remain. First full-match v1 receipts for WW/A/H precede formatting and had an
unavailable `lastChallengeDiagnostic` counter; canonical `defence` totals remain
valid. Cycle one is superseded after the SS recovery conflict was discovered;
Cycle two is superseded after the collision-blocked missed contact was exposed;
The v3 series exposes the SW/C restart jam. The final table uses the complete v4
series after its physical route repair, on one frozen source. Earlier results remain.
Early runner hashes were read at process completion during apparatus maintenance;
they are file hashes, not attestations of the loaded evaluator bytes. The physical
source manifest is always captured before stepping. The v2/v3/v4 runner freezes its own
hash at process start as well.

Capture `sourceCommit` identifies the base commit (merged PR188 or pre-restart PR189),
not a claim that the base engine generated modified states. Modified captures identify their actual source manifest in the
reason and corresponding receipt. Frozen failed-source overlays preserve the
exact earlier engine bytes. Automatic stationary measurements now use actual
pre/post body positions, rather than the attempted locomotion velocity.

Ninety-six reconstructed six-second neighbours cover four equal/unequal skill
pairings, both directions, three policies and four situations. All preserve
observer-on/off state equality; their longest stationary interval is 1.125 s.
These are development probes, not independent confirmation or evidence for a new
foot surface. New full-match captures are replayed separately, including negative
or longer continuations.

## 15. Full development results

<!-- DEVELOPMENT_RESULTS -->

15/15 frozen variants reach full time within the unchanged 7,200-second development limit. Cutoff rows are incomplete matches, not accepted full-match results. Final table source: `62dc162b90a9d804ba7c01523176d89782fe2a37f25686ff4234d212132c066e`. A/H/C are experimental; B/R3 are historical controls.

| Design | Policy | Result    | Stationary s, old → new | Same owner s | Completed/attempted passes | Shots | Fouls |
| ------ | ------ | --------- | ----------------------: | -----------: | -------------------------: | ----: | ----: |
| WW     | A      | full_time |        1984.700 → 1.350 |        9.050 |                    25/1915 |     1 |    12 |
| WW     | H      | full_time |         436.750 → 2.800 |       60.925 |                    19/1559 |     5 |    13 |
| WW     | C      | full_time |         475.750 → 1.850 |       58.425 |                    10/1600 |     4 |    21 |
| WW     | B      | full_time |          3.875 → 11.825 |       60.200 |                     61/541 |    11 |     9 |
| WW     | R3     | full_time |           3.925 → 5.750 |       36.425 |                     80/674 |     9 |    12 |
| SS     | A      | full_time |           1.150 → 1.825 |        9.825 |                  1209/2693 |     1 |    66 |
| SS     | H      | full_time |           0.975 → 4.350 |       15.925 |                  1784/2272 |     0 |    39 |
| SS     | C      | full_time |           0.925 → 3.550 |       11.100 |                  1902/2426 |     2 |    49 |
| SS     | B      | full_time |           1.775 → 2.475 |        8.150 |                  1234/2000 |    37 |    54 |
| SS     | R3     | full_time |           1.775 → 1.525 |        9.675 |                  1467/2156 |    16 |    55 |
| SW     | A      | full_time |           0.975 → 1.025 |       18.200 |                   550/2263 |     5 |    50 |
| SW     | H      | full_time |           1.100 → 2.525 |       19.525 |                   453/1331 |    49 |    49 |
| SW     | C      | full_time |           0.925 → 0.975 |       19.350 |                   630/1518 |    44 |    44 |
| SW     | B      | full_time |           5.350 → 4.375 |       19.275 |                   702/1701 |    39 |    42 |
| SW     | R3     | full_time |           3.950 → 3.900 |       17.800 |                   642/1547 |    46 |    57 |

<!-- END_DEVELOPMENT_RESULTS -->

Inputs are three paired development designs, not fifteen independent experiments.
No policy is promoted based on these matches. High circulation, poor reception,
remaining long holds, zero-shot outcomes and default-policy regressions must be
reported alongside removal of the original self-blocking cycle.

All v4 inputs and outputs use source `62dc162b90a9d804ba7c01523176d89782fe2a37f25686ff4234d212132c066e`.
SW/C ends at **6,135.5 s**, score **21:0**, without a clock or harness-budget change.
WW/A now has 25/1,915 completed passes and one shot, despite its 1.35 s stationary
maximum. Default B's WW maximum worsens to 11.825 s from 3.8 s in v3 (3.875 s
historically), and SS/H has zero shots. Completion is not evidence of football
quality or justification to promote a policy.

The superseded v3 SW/C 7,200-second cutoff was repeated exactly with the same final-state hash.
The full canonical capture is `sw-contextual-judgment-v1-cutoff-diagnosis-cutoff.json.gz`.
This is a genuine restart deadlock, not merely a busy match exceeding a short budget:
the same ceremonial `free_kick_close` awarded at 4,319.025 s is still preparing at
7,200.025 s. Ball/taker/tactical readiness are true, legal readiness is false with
`opponent_restriction`. The active stoppage makes `requiredEndAt` drift to
8,760.025 s, with `periodEndPending: false`. No restart, clock, player position or
law was reset to turn that failure green. The old 14/15 result remains negative
in `summary-v3.json`, the original receipts and archived source `f8d3e09`.
An 800-tick continuation on that engine retains the same award and legal blocker and moves the
deadline by another 20 s. Opponent `geometry:opponent:3` remains 9.0007 m from the
spot despite an assigned legal target farther away; its measured displacement is
under a micrometre.

The route aimed between `geometry:anchor:7` and `geometry:anchor:6`, which stood
at the ordinary 1.15 m body boundary. Escape planning considered only the wall,
so these opposing support bodies were invisible to the route planner while the
physical collision solver correctly blocked passage. The repair reuses the existing
legal bypass search for every body and checks its closed endpoint envelope too.
It changes movement intentions; no coordinates, collider sizes, referee tolerances,
awards or time budgets are altered.

`restart-replay.json` compares that exact captured state under frozen `f8d3e09`
and current source, twice observed and once unobserved per engine. The old engine
does not release. The repaired one reaches legal readiness after 0.85 s and executes
after **1.05 s**, with minimum opponent distance **9.28484 m** and ball speed
26.865 m/s. The formerly blocked defender walks 1.282 m; the largest setup step
by any player is 0.05535 m per tick. All state/event repeats and observer comparisons
match. `restart-repaired-after-4s.json.gz` is the actual continued canonical state.

The captured state's already accrued lost time is preserved: its required end
remains at least 8,760.025 s and settles at 8,761.075 s after execution. The full v4
matches start from the original frozen PR188 initial inputs; they do not shorten
the clock of this already delayed cutoff state.

The superseded `adversarial.json` replays all 14 real development captures from the retained
cycles and cutoff, twice observed and once unobserved. Every state/event replay
is deterministic and observer-neutral. Thirteen continuations record an actual
pass by the original actor; the restart has no progress. The six original PR188
captures remain separately replayed in the canonical contact laboratory.

The follow-up `adversarial-restart.json` repeats all 14 captures on the repaired
source with matching state/event hashes and observer neutrality; none has zero
measured progress. Its original-actor pass/shot counter remains zero for the free
kick because that counter does not cover every restart launch. The dedicated
restart replay verifies the actual launch against the stoppage ledger, moving
ball, lawful opponent positions and retained clock instead of inferring a kick
from that coarse counter.

Superseded cycle-two WW/A reports 1.275 s stationary from nominal velocity, but
continuous same-owner possession reaches **357.450 s**, with **20 completed passes
from 1,832 attempts and zero shots**. The full same-input audit has the exact same
final hash and proves that the apparent movement was false. Those small nominal
stationary numbers must not be cited as actual liveness acceptance. Final v3/v4
measurements and the automatic detector use actual position displacement. PR188's
historical summary used nominal velocity; the original 1,984.7-second episode was
also physically stationary, but other cross-version maxima have that metric caveat.

## 16. Performance, determinism and replay

The 8,000-tick paired observer-off performance probe uses the same frozen WW/A
input after 400 warm-up ticks, same Node 24 and heap flags, separate sequential
processes on a shared host. The restart follow-up uses Node 24.22.1 for both
engines: two alternating measurements give CPU user+system of 14.656/12.093 s
baseline and 11.515/11.484 s current, means 13.375 versus 11.500 s. Mean RSS is
404.74 versus 315.99 MB. The earlier paired Node 24.19 measurements (means
12.227 versus 11.875 s, RSS 318.37 versus 320.89 MB) remain as pre-restart evidence.
Both repetitions within each engine have identical final-state hashes.
Earlier single noisy probes (including 10.796 versus 14.578 s) and the initial
incomplete patch's 10.907 s are retained, not silently replaced. Football trajectories diverge,
so this is a workload comparison, not an isolated instruction-cost estimate or
a statistically established overhead bound. Full-match CPU/RSS are in each receipt.

`replayPr188Baseline.mjs` archives the exact baseline commit into a checked temporary
directory, validates all 181 historical evidence artifacts and executes the
800-tick observer-on/off baseline replay. The PR189 index checks current source,
runner and artifact hashes. Neither historical evidence nor current measurement
files are regenerated by CI. The failed cycle-one source overlay and both SS
states also replay under CI, requiring repeatable old premature controls, zero
premature controls after correction and real releases.

Read-only reproduction commands:

```sh
npm run benchmark:pr188:replay
npm run benchmark:pr189:replay
npm run benchmark:pr189:failed-cycle
npm run benchmark:pr189:blocked-recovery
npm run benchmark:pr189:restart
npm run benchmark:pr189:check
npm run verify
```

To repeat the complete original baseline, use `capturePr189Baseline.mjs` with
`--engine-root=<PR188 checkout>` and a fresh `--output-root=<scratch directory>`.
Its original source-manifest check must pass. New full runs accept a fresh
`--version` label. Generators refuse to overwrite the retained measurements.

## 17. Verification and compatibility

<!-- VERIFICATION_RESULTS -->

Before the restart follow-up, commit `f8d3e09` passed complete local verification:
2,197 unit + 56 integration + 4 career-contract + 5 full-career tests = **2,262**,
lint and build. Its exact-head CI passed all three jobs in run `40144103303`.
`validation-before-restart.json` and `verify-before-restart.log.gz` preserve this
completed result separately; it does not validate the follow-up source.

The follow-up adds three meaningful regressions: actual opposing-body escape,
route-endpoint clearance and lawful deterministic execution with unchanged clocks.
All **21 PR189 regressions** and both complete telemetry reference tests pass.
The full follow-up unit stage passes all **2,200** tests and integration passes
all **56**, in 146.03 s with the unchanged native test budgets.
The old 90-second native penalty limit, every assertion and all pipeline stages remain.
The complete follow-up `npm run verify` and new exact-head CI run after this
evidence snapshot. Their final results are recorded in the pull request description
and GitHub Checks; a passing earlier commit is not substituted for the final head.
`prepublication-verify.log` and `run-logs.zip`/`run-log-index.json` retain the
original publication snapshot. `prepublication-verify-restart.log` and
`run-logs-restart.zip`/`run-log-index-restart.json` preserve the follow-up snapshot,
completed development/replay logs and its initial corrected fixture assertions.

<!-- END_VERIFICATION_RESULTS -->

No policy IDs, default policy, attributes, match initialization, human agency,
identity, substitution or save schema changes. Shared recovery timing is an
intentional physical scheduling change, not exact old trajectory compatibility.
No UI change or new visual-pose claim is made. The isolated sandbox Vitest attempt
could not rename its cache files; the native focused run passed and its initial
environment failure is retained in the development logs. Cycle one's earlier
full verification passed but does not validate the final physical correction.
The first recovery-aware verify correctly rejected the old full telemetry hashes.
Before updating them, all 80 fields, schemas, ledgers and exact 2,400-tick payloads
were reproduced twice per seed/engine in eight fresh serial processes. Pristine
PR188 reproduces the old PR185 hashes; the new input hashes are identical and the
changed trajectories repeat completely. No field, assertion or tick was removed.

## 18. Remaining work and roadmap

Before general liveness or body realism can be certified: complete articulated
limb/surface collision, genuine release impulse coupling, all mandatory C/D and
timed-action experiments, broader cover/moving-winger variants, additional
pathology neighbours/mirrors/skill bands and independent validation. Remaining
long holds are fresh diagnostic material, not erased as success. The captured SW/C
opponent-restriction restart now has a physical placement repair and frozen replay;
broader restart/route coverage remains development work rather than independent confirmation.

The unfinished body/contact gates are assigned to **PR190**. Generational Renewal
& World Strength moves from PR189 to **PR191**, preserving
the entire 20–25-season NPC development, squad/best-XI/position strength, age,
academy integration, veteran blocking, aging/retirement/replenishment, talent
trajectories/ceilings, transfers and world-strength analysis. Summary/PlayStyles,
career UX and world expansion remain subsequent unfinished commitments. Remaining
physics prerequisites remain explicit; renumbering is not completion.

## 19. Readiness verdict

The confirmed PR188 self-blocking release cycle is repaired on actual captured
states. This is a reviewable incremental change with retained negative evidence.
It does **not** satisfy every PR189 final acceptance criterion. Gates 3/4 are
partial, 5/6/7 are unimplemented, broad football readiness is **NOT READY**, and the
PR stays draft. Technical verification and CI outcomes are reported separately.
