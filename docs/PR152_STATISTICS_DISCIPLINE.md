# Canonical Participation, Statistics Semantics & Discipline Calibration

This is the expanded PR152 brief implemented after the original GitHub PR #152 was
merged. Its base is `main` at `91a30f4aeda64ca6d922f469032c551d88576dde`; the merged
participation work is retained. A fresh follow-up PR carries the additional semantics
and calibration work. Dead-ball continuity remains a separate future scope.

## Participation and active time

Canonical `touches` count continuous individual control/action episodes: reception,
recovery or interception through control/carry/retain to release or loss. A first-time
pass/shot is one episode. Attached-ball physics contacts and incidental blocks/parries
without control do not create possession episodes; granular contact and block evidence
remain separate. Removal, loss, release and restart placement close active control.
An attempted heavy/failed reception that immediately becomes loose also starts no
controlled episode. Its later actual recovery starts one; its contact and eventual
loss cause remain visible in their own evidence.

Outside an actual meaningful pending choice or an accepted human possession intent,
the controlled player uses shared autonomous football policy. No receiver quota,
controlled-identity passing preference or extra prompt frequency is introduced.

Diagnostics distinguish canonical possession episodes, episodes starting during visible
advancement, episodes starting during hidden advancement, visible sequences involving
the player, and actual displayed human prompts. Start-time coverage does not retroactively
reclassify a hidden reception when later lead-in/replay footage displays it. Defensive
involvement counts attempts, interceptions, recoveries and blocks; it is not a count of
defensive possessions. Role peers and own-team passing/possession shares are diagnostic,
not allocation targets.

Controlled-player per-45/per-90 rates use canonical active player seconds, with an
explicit source and rate basis. Four prompts before dismissal at 23:36 mean approximately
7.63 per active 45 and 15.25 per active 90. Whole-match presentation/runtime rates remain
separate. `activeSince` supports the exposure of a future later entrant without adding
substitution UI. Historical data without authoritative exposure reports its fallback
source rather than silently using the full match.

## Cause of loss and resulting restart

`lastPossessionLoss` identifies the actual opposing-team outcome and its football cause;
`lastRestartAward` identifies the subsequent award and can link `lossId`. Loss attribution
retains the responsible player/pass when the ball is unowned in flight. Exactly-once
identity ledgers and team cause counters agree with public player loss statistics,
bounded action-event evidence and flow telemetry. Restart bookkeeping is not a football
turnover cause.

| Outcome | Cause / accounting |
| --- | --- |
| Teammate completes a clean pass | Attempt and completion/actual reception; no team loss |
| Defender acquires a pass in its lane | `interception` |
| Opponent collects a displaced mis-hit near its physical endpoint | `bad_pass`, using intended/physical execution geometry |
| Untouched pass crosses touchline or goal line | `pass_out`, then throw-in/goal-kick award |
| Heavy/failed reception is later claimed by an opponent or goes out | `heavy_touch` / `failed_control`; own-team reclaim is not a team loss |
| Clean standing dispossession | `tackle` plus separate accepted/won challenge counters |
| Uncontrolled ball changes team with no stronger causal evidence | `loose_ball_claim`; a recovery is not another loss if one is already recorded |
| Shot actually ends the team's spell | `shot`; release alone is not a loss |
| Foul restarts play for the opposing team | `foul_stoppage`; a foul retaining the same team's spell creates an award without loss |

Offside awards retain an explicit restart reason. Football cause and award totals need
not be equal: same-team corners/free kicks, kickoffs and administrative setup are legitimate
differences. Received completions use the actual teammate and reconcile with the passing
network; crosses/non-shot headers retain their separate delivery classification. Old
snapshots without new evidence cannot recover a destroyed historical cause.

## Discipline

Challenge selection, physical outcome, foul severity and referee card decision remain
separate stages. NPC committed/slide attempts require an exposed, physically reachable
ball with a speed-dependent window. A slow unsuccessful standing poke does not become
impeding contact solely through lateness/proximity. Actual high-speed rear contact,
force, tactical context and SPA/DOGSO can still justify a card. Second yellow and active
roster removal retain their existing canonical incident histories.

Fixed-size `byTechnique` diagnostics retain attempts, outcomes, fouls and cards, including
delayed cards attributed through the original foul's technique. The 512-seed structural
micro-check reports ordinary standing: 4/512 fouls, zero cards; stretched stationary
standing: 512 misses, zero fouls; exposed committed at 4 m/s: 6/512 fouls; exposed slide
at 5 m/s with cover: 5/512 fouls/yellows. Deliberate fast rear committed/slide contact
preserves contextual yellow/red outcomes. These geometries are regression evidence,
not estimates of population-wide technique rates.

## Verification and scope

The paired matrix uses the merged PR152 tree above and frozen follow-up runtime
`4b8e9c2352866086d805618b3221446203b98b76befaf2d8330cec76b4b96e50`
(SHA256 of sorted runtime source paths/content, excluding tests). All 12 surfaced
fixtures reached 45 minutes with no statistics invariant failures. Seeds are `a/b`,
roles are CM/LB/ST, and "weak" means weak home versus strong away. Each arrow is
baseline → follow-up. H/V denotes hidden/visible possession starts; cards are Y/R.

| Role / fixture | Possessions | Received passes | H/V final | Human prompts | Team fouls | Team cards |
| --- | --- | --- | --- | --- | --- | --- |
| CM balanced a | 67 → 61 | 33 → 43 | 61/0 | 11 → 7 | 10 → 5 | 2/1 → 0/0 |
| CM balanced b | 58 → 54 | 49 → 42 | 52/2 | 14 → 11 | 10 → 2 | 3/1 → 0/0 |
| CM weak a | 153 → 83 | 1 → 2 | 83/0 | 3 → 2 | 0 → 0 | 0/0 → 0/0 |
| CM weak b | 124 → 75 | 2 → 2 | 73/2 | 7 → 6 | 0 → 0 | 0/0 → 0/0 |
| LB balanced a | 49 → 24 | 41 → 18 | 18/6 | 9 → 10 | 20 → 4 | 6/0 → 1/0 |
| LB balanced b | 65 → 54 | 51 → 44 | 45/9 | 14 → 14 | 15 → 7 | 1/0 → 0/0 |
| LB weak a | 67 → 45 | 27 → 21 | 40/5 | 10 → 14 | 2 → 0 | 1/0 → 0/0 |
| LB weak b | 62 → 52 | 21 → 20 | 49/3 | 11 → 4 | 3 → 0 | 0/0 → 0/0 |
| ST balanced a | 29 → 24 | 9 → 6 | 22/2 | 15 → 11 | 11 → 9 | 5/0 → 1/0 |
| ST balanced b | 31 → 30 | 8 → 6 | 24/6 | 26 → 37 | 19 → 10 | 5/0 → 1/0 |
| ST weak a | 12 → 11 | 0 → 0 | 10/1 | 1 → 1 | 0 → 0 | 0/0 → 0/0 |
| ST weak b | 11 → 7 | 0 → 0 | 7/0 | 0 → 0 | 0 → 0 | 0/0 → 0/0 |

Across these paired fixtures, fouls are 90 → 37, yellows 23 → 3 and reds 2 → 0.
These are sample totals across both teams, not league-rate estimates. Cause totals
are tackle 151, interception 551, bad pass 21, pass out 133, heavy touch 3, failed
control 9, loose claim 93, shot 27, foul stoppage 9 and other 13. There is no restart
catch-all. Technique counters give standing 4/282 fouls, committed 22/58 and slide
11/20; yellows are 0/1/2 respectively, with no red in this match sample. Physical
danger and tactical card regressions still exercise yellow, straight red and second yellow.

The reduced possession counts include removal of uncontrolled contacts and interrupted
pass completions; changed football outcomes also alter later trajectories. Prompt
selection frequency was not retuned. The ST balanced-b fixture still has 37 prompts
(74 per active 90), and weak strikers receive no completed passes. The weak CM's
83/75 episodes predominantly involve 78/70 loose recoveries; its exact-role peers
have 0–7 episodes. These remain role/strength/cadence calibration observations, not
evidence of a finished population-wide balance.

Five policies at five minutes have identical canonical state, statistics, action timeline
and behaviour hashes. Normal/DEV/capture, each repeated twice, match those four hashes;
capture records 12,001 actual recorder calls per run, normal records none. Six full-half
balanced fixtures compare controlled-autonomous/NPC for all three roles: statistics and
behaviour hashes match within each role, with no human prompts (CM 55, LB 52, ST 13
possession episodes). All 17 parity rows have no invariant failures. The runtime
fingerprint is unchanged before/after the matrix; final changes only update legacy
test expectations for the explicit new contracts.

Sequential matched-driver timing on Node 24.19.0 / AMD Ryzen 7 260, with no other
benchmark/test workload, gives the following single-fixture measurements. Normal
uses a 15-minute balanced CM fixture; capture uses five minutes and the actual
recorder plus detailed observers. Final hashing/export, React, renderer, video and
historical lead-in playback are excluded. Concurrent matrix timings and an initial
warm-up overlapping focused checks are excluded from performance claims.

| Driver mode | Baseline elapsed / canonical speed | Follow-up elapsed / canonical speed |
| --- | --- | --- |
| Normal, 15 min | 30.464 s / 29.54x | 26.889 s / 33.47x |
| Capture, 5 min | 60.505 s / 4.96x | 52.852 s / 5.68x |

Normal executes zero detailed-observer/recorder calls. Capture executes 12,003 baseline
and 12,001 follow-up recorder calls, with no invariant failures. Capture intentionally
costs substantially more than normal; its diagnostic detail remains enabled. Changed
football trajectories and the small sample prevent attributing the timing difference
solely to implementation overhead. Neither measured mode collapses to canonical
real time. Whole-session renderer/capture-video cost is not measured here.

Final `npm run verify` passes with `VITEST_MAX_WORKERS=2`: ESLint, 1,041 main tests
across 148 files, five full-career tests, TypeScript project build and Vite production
build. The generated world database contains 64 clubs / 1,824 footballers and the
production artifact contains `dist/data/world/pl-2026-v2.json`. The complete telemetry
reference retains its all-field hashes/schema/invariants with explicitly updated causal
contracts; legacy keeper-body and spatial-out tests now assert granular contact versus
control and the linked loss/restart respectively.
Raw machine outputs stay in ignored `.benchmark-artifacts/`. Headless renderer counts
are unavailable; the RunningLab integration test spies on renderer
calls while the actual canonical engine advances hidden football in normal/DEV/capture.
It also verifies that changing all observation modes and all five presentation policies
preserves a paused canonical snapshot. No pre-match start requirement is added.

Reproduce the main matrix with:

```sh
npm run benchmark:sanity -- --minutes=45 --seeds=a,b --positions=central_midfielder,left_back,striker --scenarios=balanced-balanced,weak-strong --observer-modes=normal --policies=key_player
```

Parity uses seed `a`, balanced CM, `--minutes=5`, all five
`--policies` or `--observer-modes=normal,dev,capture --repeats=2`; autonomy uses
`--minutes=45 --variants=controlled_autonomous,npc` across those three roles.

Large-sample role/team/style calibration, physical-force proxies and restart continuity
remain future work. This change establishes causal accounting and safer autonomous
challenge selection; a small deterministic matrix cannot establish final league rates.
