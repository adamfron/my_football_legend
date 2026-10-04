# PR151 — Match Cadence Calibration + Reactive Team Tactics

PR151 combines the remaining PR150 playtest corrections with the first reactive team layer.
The canonical fixed-step match remains the authority. There is no coach UI, formation editor,
fatigue ledger, injury/substitution system or added time in this milestone.

## Architecture and ownership

- `teamThreatMemory.ts` owns validated, bounded per-team/channel/player evidence in
  `teams[side].threatMemory`. Canonical possession changes, pressure, progressive exposure,
  territorial pressure, overloads and shots produce evidence. Long carries do not produce
  repeated entry/line observations. Memory uses canonical time, a 180-second half-life,
  two-second response evaluation, 24-second minimum persistence and separate gradual rise/fall.
- Matchup quality provides a continuous, limited prior. Recent danger, territory, score and
  minute determine the response. Missing coaching attributes use neutral modifiers and do not
  disable basic defensive adaptation. Caution remains bounded; tactical changes decay.
- `tacticalPositioning.ts` consumes the response through the existing block transform,
  compactness, threatened-channel protection and two staggered short support outlets.
  The ordinary locomotion integrator moves toward these targets. `matchActions.ts` changes
  actual pass utility for safer recycling and repeatedly pressured receivers. Short support
  and pressure-relief preferences require a current nearby presser; recycling gains value
  from an actual reduction in pressure. Remembered danger does not penalize unpressured
  carries or reward harmless backward circulation. A regression fixes this boundary.
- `defensiveChallenges.ts` recruits at most one extra local presser for a chosen hold, shielding,
  confined possession, advanced slow possession or a learned double-press response. Ordinary
  covered scanning retains containment. Distance, central cover, dangerous receivers and inherited marking
  constrain the choice. An availability callback is the future stamina hook. Selection is
  deterministic and does not depend on an elapsed shielding timer.
  The stable goal-side primary keeps screening without resetting its pair lock; an already
  locked secondary is skipped for a fresh safe partner. Central cover is projected toward
  the goal centre. The partner approaches the opposite ball shoulder through ordinary
  locomotion, then the same narrow standing-contact window and shared challenge resolver.
  Cooperation does not force a human action or guarantee a win.
- `playerDecision.ts` distinguishes new routine receptions from meaningful incoming choices.
  Speculative first-time shooting availability and harmless long distribution alone no longer
  open agency. Through balls, crosses, credible finishes and existing human possession
  checkpoints retain control. `matchMoment.ts` values new NPC shot sequences using their
  canonical scoring expectation; controlled shots remain visible.
- `locomotion.ts` centralizes attribute-based walking, jogging, running, maximum/sustained
  sprint and acceleration. Stamina is a fixed athlete capability, without accumulating fatigue.
  Arrival and keeper reach use the shared acceleration model. Neutral future capacity modifiers
  preserve intention and provide an insertion point for later physical-state systems.
- Penalty setup uses legal box/arc clearance and rebound positions. The keeper starts on the
  actual goal line; goalkeeper movement can remain there without the previous 0.4 m clamp jump.
  The kick immediately clears restart positioning while its shot diagnostic retains penalty
  context. Normal flight, keeper contact and rebound logic then apply.

## Telemetry and benchmark definitions

Match Lab export version 3 adds explicit collection scope. When DEV observers were never enabled,
`matchFlowTelemetry`, `decisionTelemetry`, `playerAgency` and sampled positioning are `null`, with
`dev_observer_not_enabled`; this is not a measured zero. Real `presentationRuntime` and canonical
statistics remain available. Partially enabled DEV coverage has explicit intervals and duration;
its detailed counters are valid only for those intervals. No values are reconstructed.

Human lead-ins now increment the episode counters on entry from hidden football. Further prompts
inside the connected sequence do not add episodes. Historical PR150 UI episode counts excluded
these lead-ins, so that export counter alone cannot be compared as an unchanged definition.

`benchmark:cadence` counts **all hidden-to-visible sequences**, including human lead-ins, using
the shipped agency, moment, episode and consequence-window laws for both revisions. It reports
non-interactive episodes separately, actual prompts, prompts/sequence, public touches, carries,
hidden/visible canonical seconds, physical shape samples, tactical memory and hashes. Lead-in
playback is historical footage and adds no canonical seconds. `full_match` is visible throughout,
so it has zero hidden-to-visible sequences and an unavailable prompts/sequence ratio.

Timing is headless work with one exact agency probe per canonical step and structure sampling
every two seconds. It excludes React publication, renderer, RAF, context capture, human thinking
time and playback. Hidden renderer calls are zero because the harness has no renderer. Existing
orchestration regressions separately verify the shipped hidden UI does not render. These timings
are not a measurement of the full browser experience or an isolated tactical-overhead estimate.

The matched baseline is merged PR150 `95bc7d1a1a724105099bbf80d9e371a7a35c4535`.
Both revisions receive the same fixtures and explicit DEV selections at exact decision boundaries;
physics, tactics and agency changes can alter later choices and match outcomes.
The winger fixture selects an actual squad right winger and forces him into the existing XI when
needed; it never silently substitutes another primary position.

## Shooting audit

Human and NPC equivalent shot actions enter the same canonical action/shot resolver and flight.
The shared shooting menu accounts for keeper geometry on both paths. The parity benchmark pairs
the same shooter/keeper attributes, identity, location, orientation, velocity, pressure, target,
style, decision index and seed. It compares menus, launch error/target, keeper inputs and complete
first physical-result diagnostics, then reports distributions and post/bar/on-target/save/goal
frequencies. Public on-target results are reported separately from launch classification.

The benchmark covers six physical contexts, driven/placed/chip styles and two explicit targets.
It tests source parity under equivalent choices, without equating naturally different match
chances. It does not cover incoming volleys/headers or establish that one playtest's conversion
rate was statistical noise. No accuracy bonus or NPC finishing nerf was introduced.

## Reproduction

```sh
npm run verify
npm run benchmark:reactive
npm run benchmark:shot-parity -- --repeats=16 --out=.benchmark-artifacts/shot-parity.json
npm run benchmark:cadence -- --minutes=45 --seeds=a,b,c --output=.benchmark-artifacts/cm45.json
npm run benchmark:cadence -- --minutes=45 --position=right_winger --scenarios=balanced-balanced,strong-weak --seeds=a,b --output=.benchmark-artifacts/rw45.json
npm run benchmark:cadence -- --minutes=90 --position=right_winger --seeds=a --repeats=2 --output=.benchmark-artifacts/rw90.json
```

The same cadence script accepts `--engine-root=/path/to/pr150 --revision=PR150`. All raw local
logs remain outside the repository or under ignored `.benchmark-artifacts/`. Committed evidence
is a compact summary rather than tick dumps. Scenario and benchmark schemas validate new data.

## Limits and later work

This is a bounded tactical survival layer, without a full tactical manager or coaching personality
simulation. Formation slots remain unchanged and a weaker team retains attacking outlets.
Local cooperation uses current spatial cover rather than a full pass-network optimizer. Longer
league and human playtests are still needed to calibrate role-specific density and football
distributions. Cadence is selected from football value, without a hard episode quota. Future
fatigue, injuries, substitutions and added time remain separate milestones.

## Observed calibration and validation

Full `npm run verify` passed: 973 main tests across 141 files + 5 full-career tests, ESLint, TypeScript and production build. Existing chunk-size/dynamic-import build warnings remain.

| Matched fixture          | Visible sequences before → after | Prompts before → after | Controlled public touches | Headless work s | Work-time change |
| ------------------------ | -------------------------------: | ---------------------: | ------------------------: | --------------: | ---------------: |
| CM 45 balanced a         |                           15 → 7 |                 6 → 11 |                   43 → 67 |   45.85 → 75.13 |            63.8% |
| CM 45 balanced b         |                          10 → 14 |                11 → 13 |                   49 → 59 |   49.82 → 80.23 |            61.0% |
| CM 45 balanced c         |                           14 → 9 |                  7 → 8 |                   39 → 69 |   43.06 → 81.89 |            90.2% |
| RW 45 balanced a         |                            4 → 6 |                  2 → 6 |                    24 → 7 |   45.14 → 40.51 |           -10.3% |
| RW 45 balanced b         |                            8 → 5 |                  5 → 0 |                    34 → 9 |   53.20 → 40.67 |           -23.5% |
| RW 45 strong-weak a      |                            2 → 2 |                  1 → 9 |                    13 → 7 |   35.86 → 43.97 |            22.6% |
| RW 45 strong-weak b      |                            7 → 3 |                10 → 14 |                    17 → 8 |   40.11 → 41.83 |             4.3% |
| RW 90 balanced a         |                          13 → 10 |                  9 → 9 |                   57 → 13 |   83.18 → 76.09 |            -8.5% |
| RW 90 balanced a repeat2 |                          13 → 10 |                  9 → 9 |                   57 → 13 |   83.18 → 66.03 |           -20.6% |

All complete 45/90-minute fixture hashes, hidden/visible canonical seconds, prompts per sequence, shape samples and tactical reasons are in [compact evidence](performance/PR151-summary.json). The repeated final 90-minute fixture reproduces complete state, statistics, tactical timeline and observational football/presentation values; only wall-clock timings vary. Three ten-minute release_minimal/normal/DEV observer modes reproduce identical canonical/player/statistics/event/RNG hashes, with zero background renders.

A substantial CM slowdown was investigated before publication. In the ten-minute attribution fixture, controlled ownership changed 23.8→49.6 seconds before the local pressure correction. Sampled agency work increased alongside repeated full action rankings. Short support and recycling now require an active nearby threat and real pressure relief; a regression confirms that strong stored evidence alone leaves unpressured carry/pass utility unchanged. Final controlled ownership is 53.1 seconds. The inclusive sampled spans in the compact evidence are attribution diagnostics, not an isolated percentage cost of reactive tactics. Football trajectories and action mixes also change, so the table's timings must be read with the accompanying shots/touches/statistics. No agency tick is skipped for speed.

The final CM work-time regression remains material: **61.0–90.2%**, with controlled passes 67→144 across the three 45-minute fixtures. The final ten-minute sampled agency projection is 9.21 s versus 5.89 s baseline, alongside longer controlled ownership and more full action rankings; this does not isolate the cost of any one feature. The physical double-press correction restores a stalled fixture's action flow, which also changes its work. Repeated 90-minute RW work is 76.09 / 66.03 s. Further optimization should preserve exact decision boundaries; the milestone does not claim uniform speed improvement.

The three controlled press-trap scenarios yield physical build-up lines 40.77→38.50, 41.04→38.79, 40.96→38.72 m after eight seconds with a nearby presser. Short-support distance changes 19.69→10.35, 19.79→10.52, 19.58→10.30 m, with two outlets. In twelve intentionally risky paired contexts per seed, actual recycling choices change 3/12→12/12, 3/12→12/12, 3/12→12/12. This demonstrates response, not a claim of eliminating turnovers. The weaker defensive row narrows 39.25→35.20 m and drops 37.64→34.08 m while retaining two attacking outlets. Safe/unsafe double press, released GK build-up evidence, shot-save attribution, decay, persistence and long-carry deduplication pass their scenarios.

Eight physical cooperative-press regressions additionally require actual secondary standing contact for both attack directions with the primary pair pre-locked, zero primary reattempts, zero high-risk intents/fouls, ordinary movement steps below 0.25 m, and deterministic complete replay state. A legal partner can engage when the nearest body is locked; a dangerous receiver still prevents recruitment, and an already locked partner can be replaced safely. Ordinary covered scanning does not recruit a partner; a chosen hold, shielding, confinement, advanced danger or learned response is required. In the natural CM b45 diagnostic, maximum stationary possession fell 1649.725→13.025 s; passes changed 167→424 and shots 1→8. That diagnosis uses exact agency probes without presentation windows and is separate from the final cadence measurements. No forced human release or guaranteed challenge outcome is used.

Shot parity: **576 paired launches / 1152 physical flights**, six contexts × three styles × two targets × 16 repeats. Menu, launch, keeper-input and complete physical-result differences: **0**; maximum paired placement-error delta: **0**; unresolved: **0**. Human and NPC results agree exactly: on target 47.57%, saves 14.58%, goals 32.99%, posts 3.47%, crossbar 3.47%. These controlled fixtures do not represent natural match conversion rates.

Touches guard: forty carry intentions and 1,600 substeps followed by a pass remain **one public touch**, while forty internal carries are retained. Existing PR150 intent/space-passing/accounting coverage passes.

The playtest's exact 20 episodes/66 prompts is contextual evidence, not the baseline for this matrix: its seed, setup and human action trace were not supplied. No claim that every role reaches a quota or every seed reduces prompts is made. Raw logs remain local; the committed summary is bounded.
