# Match Engine Handoff

## PR161 contracts and next work

- Baseline is merged PR160 `d4b389b`; read the [PR161 report](PR161_MATCH_PRESENTATION_REPLAY_STADIUM.md)
  and compact traces. Next work is the **Combined Match Engine Realism & Playability Audit**,
  not another isolated feature calibration. Final verification/performance are in that report.
  `npm run verify` passes 1529 main/5 career tests, lint, TypeScript and build.
  One uninjected match ends legally at 90+1 with 877 pass attempts, five changes and
  zero shots; do not reinterpret this continuity result as scoring realism.
- Test raw ball coordinates against whole-ball legality. Clamp only the pursuing
  player's intention. Preserve physical acquisition/contest coordinates, existing
  foot reach and exact trailing-edge legality. `lab-mv2640wz` is an equivalent
  geometry fixture because the original complete export was unavailable.
- Loose-ball diagnostics are bounded observations only. Never resolve a state,
  create an out, move a ball or grant possession after diagnostic elapsed time.
- `canonicalPresentation` is shared by live/context/replay. Missing acceleration
  across gaps, NPC assignment reasons and contact timestamps stay missing.
  Planned contact and executed/failure evidence are separate; no pose is football authority.
- Retain canonical roots/ball path; no visual foot attachment or successful named
  skill inferred from repeated contacts. Temporary keeper is a match role in every path.
  Staged/departing bodies are distinct from active eligibility and retain actor IDs.
- Keep bounded before/after event keyframes and do not interpolate across owner,
  contact, roster, score, restart, period or long observation gaps. Dense contact
  retention can shorten lead-in; do not claim a complete tick archive.
  Preserve optional recorded release cues (throw/header/volley/distribution), one
  per actor, at the shared 620 ms TTL; rapid A→B must retain A's real contact kind.
- Replay cursor/camera/controls read history and explicitly restore the prior
  presentation phase, including a human decision. Generation tokens invalidate
  reset callbacks. Hidden normal/DEV/capture must execute zero renderer updates.
- All diagnostic groups default off. Actual/movement/nominal/ideal markers differ;
  do not run decision ranking to invent unpersisted assignments. Club hash/stadium
  detail never use canonical RNG or become interaction targets.
- Small SVG exports use actual scene/rigs but are software evidence. Native WebGL
  FPS, shading, draw-call counts and live UI layout remain an interactive review
  task after loopback browser timeout. Use exposed renderer metrics for that review.
- Carry zero/low shots, scarce CM receptions, low-progress rotations, rigid formation
  restoration, unstable contests and pressure/carry ranking into the combined audit.

## PR160 contracts and next work

- Baseline is merged PR159 `09c05fa`; PR161 presentation/replay/stadium remains next.
  Read [PR160 report](PR160_FATIGUE_INJURIES_SUBSTITUTIONS_ADDED_TIME.md) and its
  compact evidence before editing. Final `npm run verify` passes lint, 1452 main
  tests/177 files, five full-career tests and build. The uninjected full match
  ends legally at 90+1 with five substitutions and zero shots. Three alternating
  300 s CPU pairs measure +22.54% median cost; preserve this measured limitation.
- Legal intentions must accommodate locomotion arrival. Preserve the existing
  0.3 m penalty-area clearance even when a proposed target is just outside; the
  historical 0.06886 m arrival left a body inside and blocked penalty selection.
  Never declare readiness or force a kick after a timeout. Bounded diagnostics
  distinguish slow preparation, CPU soft lock and genuine pending human input.
- `goalkeeperRole` is temporary match responsibility. Do not rewrite permanent
  primary positions/attributes. Award, legal readiness and physics use the same
  actual actor; a normal keeper entering clears fallback assignment.
- Update fitness from completed motion/contact, not elapsed minute or requested
  sprint. Capacity and immediate readiness differ; recovery is capped by capacity.
  Keep ordinary/held-interval samples disjoint and do not count contact time twice.
  Preserve shared human/NPC resolvers and exact normal/DEV/capture RNG parity.
- Serious injuries remove active agency before contacts/actions, retaining released
  physics and final participation. Assessment/substitution reasons merge in one
  ledger. Dropped-ball play starts at ground contact and needs two distinct player
  contacts for a goal. Full medical re-entry and source-free own goals remain limited.
- Bench profiles are actual squad identities with their own condition and health.
  Outgoing/incoming bodies are distinct from the active football roster; projection
  shows walkoff without restoring eligibility. Entry is at halfway after legal
  exit/referee permission. Delayed entrants wait for a stoppage starting after the
  restarted minute, with the halftime rest handled deterministically.
- Participation begins/ends at actual entry/exit/dismissal. Preserve departed bodies
  for condition commit and stats. Clean stale action/ball/contact/retrieval plans.
  Controlled departure stops decisions, retains ID/summary and never transfers control.
- Use `stoppageLedger` as the only lost-time evidence. Completed period totals
  survive retention. Announced minimum never decreases; additional lost time
  extends the deadline. Second half gets 2700 s after the real first-half end.
  Complete terminal penalty/retake physics, then end without a goal kickoff.
- Career persistence uses existing dates and sparse world overlays. The canonical
  adapter/committer is ready; narrative quick appearances are marked `summary`.
  Do not claim physical workload for background fixtures not run by this engine.
- PR161 visual inspection: real exit/entry and delayed entry, injury removal/drop,
  controlled spectator transition, added time and terminal penalty rebounds,
  temporary keeper identity, fatigue gait/contact recovery and replay statistics.
  Carry all PR158/PR159 open football-flow issues into the subsequent combined audit.

## PR159 contracts

- Natural awards preserve real player/ball positions, velocities and immutable
  incident provenance. Distinguish `origin: live_event` from frozen `dev_fixture`;
  keep legacy optional fields readable. Never use DEV geometry to place a live roster.
- `preparing -> awaiting_decision -> kick_preparation -> release` is owned by core.
  Retrieval/placement, taker reach, legal readiness, tactical readiness and actual
  action preparation govern transitions. Missing takers/retrievers reassign within
  the same award. A watchdog cannot choose for a controlled non-throw taker.
- Queue human selection once. Rejected autonomous proposals must preserve canonical
  execution RNG, physical state and accounting. One option still requires a human.
  Use the same shot/pass/cross/contact resolver for every action source.
- Derive role/zone plans at award or changed delivery; reserve cover before receivers.
  Update bounded movement targets from current positions/marking and the saved plan,
  not full all-pairs geometry every tick. After release use normal football contacts.
- Ordinary legally direct placed/driven shots remain available independent of xG.
  Chip and free-kick profile availability share pure physical eligibility and are
  revalidated at execution. Keep actual ball spin in runtime, forecasts, keeper reads,
  interceptions and rebounds. Missing spin must preserve the calibrated old trajectory.
- Wall jump is defensive state, never a guarantee attached to under-wall selection.
  Finite moving body capsules and ball radius decide under-wall/gap contact. Keep
  attacker 1 m separation for a wall of at least three and the quick-kick exception.
- Post-goal movement preserves real state; urgent retrieval reaches the scored ball
  and transports it physically. The conceding team owns the next kickoff. The simple
  canonical enclosure is independent of renderer/stadium art.
- Stoppage ledger records canonical timestamps, one active interval, overlapping
  reasons and the last 512 completed intervals plus retained totals. No UI wall-time,
  automatic 1:1 added-time policy or observer may change canonical football.
- UI/replay project existing spot, ball, taker, wall, target and readiness. They do
  not create eligibility, change placement or schedule execution. Final animation,
  stadium and cinematic replay are PR161 scope.
- Rule reference is IFAB 2026/27. Preserve tested special locations, physical other
  touches and immediate-reception offside exceptions. Document scope limits honestly:
  indirect menu currently hides shot actions; full handball/penalty protocol,
  countdown and half-end penalty extension remain deferred.
- Final full verify PASS: lint, 1367 main tests/171 files, five career tests, build.
  Code revision: `6e303b97eb1d82685f206fd1aea5dd5aeea5969a`. Focused smoke releases
  12/12 and returns to open play, with zero award displacement; runtime +16.4%
  over 9600 ticks (comparable seeded fixtures, geometry differs between revisions).
  Exact-state 160-tick observer/step parity and persisted transport/release PASS.
  Simplified frame rebounds and general source-free own-goal handling remain gaps. Central
  report: [PR159_DEAD_BALL_RESTART_CONTINUITY.md](PR159_DEAD_BALL_RESTART_CONTINUITY.md).
- Retain PR158 open issues: shots 110→16, goals 68→10, CM touches 4957→3461 /
  receptions 2831→1993, flips 24→94, spells <0.5 s 51→189 and low-progress
  rotations. Do not infer open-play realism from improved restart continuity.
  Historical PR158 draft remarks below describe prior evidence; PR158 is merged.
- Next: PR160 fatigue/injuries/substitutions/added time, PR161 presentation/replay/
  stadium, then a combined full-match diagnostic and realism audit. No new isolated
  18-match calibration campaign solely for PR159.

## PR158 contracts

- Preserve the one deterministic 0.025 s engine. `controlledBallContact` is one bounded
  anticipation plan; it does not reserve possession or a successful next contact.
- Apply finite reachable foot-contact impulses and the existing rolling integrator between
  contacts. Do not restore body-relative ball coordinates, rotate the ball with the owner,
  snap actors to targets, or create a second physics path for a skill move.
- Keep candidate-specific turn/contact difficulty and defender/carrier ETA separate from
  actual contact resolution. Technique, Dribbling, Agility, First Touch and Composure answer
  control demands; Strength/Agility resist actual protecting-torso load through balance.
  A strong shield still exposes its accessible side and remains vulnerable to another defender.
- Release, restart and ownership discontinuity must clear stale contact plans. Several physical
  contacts within continuous control remain one public touch; do not make a 25 ms contact a
  new human decision or public possession episode.
- Keep physical-contact accounting bounded with one optional latest-contact timestamp per
  player. Repeated/older evidence must remain deduplicated after release or half-time; earlier
  statistics branches remain immutable. Old saves retain historical contact IDs, while new
  impulses do not append them. Existing pass/shot/control ledgers are discrete event accounting.
  The `47f99f54` fix passes four new regressions and 34 focused tests. Exported football matches
  in all 18 windows, 1,760 contact trials and 210 tactical/scenario rows; stated timing and
  bookkeeping checksums are omitted explicitly. Final verify passes lint, 1,263 main tests/163
  files, five career tests/one file and build; strict benchmark TypeScript passes. Record the
  isolated final performance honestly: release_minimal -2.64%, normal -2.41%, dev +3.02%, capture -1.22%;
  observer median elapsed overhead +2.50%. Keep absent baseline instrumentation
  as n/a, nested spans nonadditive, and the hot derivePressingPlan scope separate from all pressure
  computation. No broad speedup or browser/MediaRecorder timing was established.
- Preserve the calibrated shared challenge/foul resolver, actor-source physical parity and
  pair re-arm locks. An independent second defender retains a legal opportunity. Aggression
  changes willingness/risk rather than an identical contact's success quality.
- Six tactical preference axes use 0–1 and default from existing styles. Coach philosophy
  controls positioning and ranking, never execution accuracy. Suitability uses the active XI
  with continuous cost/adaptation, not role/ability eligibility gates or hidden quotas.
- Situational pressure considers ready safe outlets, lanes, contact/orientation, local numbers,
  touchline and cover/risk behind. Screen/block can be useful without a tackle. Recent-loss
  opportunity may remain after eight seconds; observer clock bins must never cancel tactics.
- Keep all six transition clocks distinct. Record actual shot release, not its later result;
  forward progression needs signed geometry. Censor interrupted losses/regains. Per-presser
  episodes must survive nearest-player switches, and snapshots must not mutate live episodes.
- Workload is bounded read-only open-play observation: intensity distance, sprint intervals,
  repeat efforts, turns, pressing distance and low effort. Speed-bin crossings and formal
  challenge body contacts are explicit proxies, not calibrated physiological reserves.
- UI picking is projected CSS-pixel geometry with caller-supplied legal contextual targets.
  Its 32–48 px radius must not enlarge foot/tackle range, consume RNG or alter state before commit.
- Live and replay carrying projections preserve canonical ball coordinates. Do not restore
  face-relative visual placement that would hide inter-contact travel/exposure from the player.
- Preserve PR155 shot and PR156 non-throw restart ownership for every action source. A real
  advantage shot remains after a later DEV restart; a whistle before execution creates no shot.
  `scenario_changed` alone proves neither a natural foul nor an advantage recall.
- Evidence, reproduction, numerical tradeoffs and limitations:
  [PR158_BALL_CONTACT_PRESSING_TACTICS.md](PR158_BALL_CONTACT_PRESSING_TACTICS.md),
  [preference contract](PR158_TACTICAL_PREFERENCES.md).
- Secure a loose ball only at an actual reachable contact. Anticipated acquisition at a wider
  radius must preserve the chase and loose-ball opportunity, rather than announce ownership
  and stop before contact. Keep public touches/reception accounting on actual secured control.
- Preserve the final matched evidence and every remaining tradeoff: attempts
  6645→4418, completed passes 10005→13074,
  shots 110→16, goals 68→10,
  adjacent-tick flips 24→94 and
  short spells 51→189.
  Neither quotas nor filtering may repair a result. The fixed 25 ms engine remains authoritative.
  Low-progress absolute rotation includes scans/reversals: >180° uses net <2 m; >360° uses
  net <3 m. Stop lab owned movement at stoppage as well as loss, excluding restart placement.
- A nomination never reserves a loose ball. Another actually reachable legal foot starts its
  own preparation and cannot borrow the prior nominee's clock. An unreachable opponent cannot
  create a physical contact contest or pair lock merely by entering the broad nomination radius.
- Final source/hash, complete verification, integrity and performance are retained in the
  PR158 report. Superseded prototype results must not be mixed into the final matrices.
- Keep this a draft for calibration before merging. Central-midfielder touches
  4957→3461 and receptions 2831→1993
  regress despite increased aggregate passing. Demanded-turn >360°/net<3 m trials
  2→16
  and lab fouls 90→369 also worsen.

The [evidence manifest](performance/PR158-evidence-manifest.json) inventories archived raw, source and report snapshots. The local output/attachment `outputs/PR158-evidence.zip` contains 824 hash-checked entries; five compact summaries regenerated exactly. Its checksum is retained separately in local metadata.

Next: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue, Injuries, Substitutions
& Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**. PR160 should separate
a slowly changing long-term capacity from short-term burst readiness constrained by capacity;
PR158 implements no depletion/recovery penalty. Future age/development must keep physical,
technical, tactical intelligence, stamina, workload and recovery separate, without blanket age
reductions or named-player longevity exceptions. A later coach profile may own the existing vector.

## PR157 contracts (validated)

- Keep one seeded canonical engine at 0.025 s. Pressing plans are continuous tactical
  projections, never forced-tackle or forced-pass deadlines. Contain/screen can deliberately
  stop outside contact; engage targets the accessible ball shoulder through actual locomotion.
- Aggression means willingness/risk, not tackle quality. Preserve paired fixed-contact
  Aggression equality and independent Tackling outcome tests. A yellow shifts commitment,
  recruitment and risky technique preference, but immediate danger may still justify contact.
- Keep defensive episode/re-arm protections. The shield eligibility fix aligns with the existing
  0.95 m physical reach; do not enlarge shared tackle radii to remove static situations.
- Prefer an attainable safe standing contact before a slower risky technique. Prepared committed/
  slide choices forecast ball/body geometry at their existing contact time, including safe-side
  shielding. Do not calibrate them with quotas or observed match-wide foul totals.
- Carrier microfootwork and carry routing anticipate defender momentum using existing skills.
  Preserve the chosen destination and actual acceleration/turning; never stun the defender,
  teleport an actor or automatically release a controlled possession on pressure.
- Preserve PR155 controlled shot and PR156 non-throw restart ownership at every source.
  An illegal autonomous controlled shot can add only `shotAgencyRequest`; ball, statistics,
  RNG and action ledger stay untouched, including absent/stale ledgers and repeated proposals.
- `deriveShootingDifficulty` is the common ability × context model. Finishing/Heading answer
  placement, Technique contact/turning, Composure pressure and Agility body control. No duplicate
  balance/acceleration/shot-power skill is added where the canonical model lacks it.
- Keep the full shooting funnel: execution/error/speed/contact, projected and public on-target,
  blocks/frame/misses, physical keeper contact/handling, final save/goal. Keeper ability must
  not change the shooter's launch; the shot boundary injects geometric shooting pressure.
- Keeper reach/contact remain physical. Saturated central save cells, open-goal cells, chip/
  close-range geometry and wall blocks remain explicit calibration limits. Family preference
  and shot-versus-pass/carry decisions are distinct measurements.
- Preserve the sampled goal ray through the goal plane. The earliest physical pitch-boundary
  crossing records one shot result; a later boundary must not overwrite a resolved same-shot
  save/block. Generated headers may choose the existing placed target, but never replace an
  explicit human aim.
- `PressingTracker` is an optional read-only observer. Its static diagnostic requires ≤2.6 m,
  both actor speeds and actual controlled-ball motion relative to the body <0.35 m/s,
  controlled possession and ≥2 s of unchanged sampled solution.
  Refresh presser assignments at 4 Hz and expensive option/geometry/evolution probes at 1 Hz;
  observe speeds/action/carry-mode/microphase changes every 25 ms; decision-index increments
  alone do not reset stationarity. Retain ≤256 episodes ×8 samples and a fixed
  241-bin duration histogram (one-second bins, final bucket ≥240 s).
  Challenge events are separate from terminal episode outcomes. No canonical code consumes it.
- Compare exact disabled-identity and normal/DEV/capture canonical hashes/RNG streams.
  Independently seeded diagnostic/agency ranking draws are recorded separately; they do not
  advance a mutable football RNG. Waiting for a genuine controlled decision is an agency pause.
- Existing direct free kicks are benchmarked through their current restart/physical path.
  Full wall/restart choreography and richer strike/cross menus belong to PR159.
- Verification passed: lint, 1,215 main tests in 156 files, 5 career tests and build; four new
  benchmark scripts pass strict TypeScript. All 66 identity comparisons, 124,345 pre-decision
  ticks, 18 shot launch comparisons and 144 blocked proposals preserve their required state/RNG
  contracts. See [integrity summary](performance/PR157-integrity-summary.json).
- Twelve 90-minute matches per revision: static 164/13,126→10/16,243, but attempts 1,112→4,207,
  shots 214→74, stationary high-pressure time 1,824.81→3,327.01 s and shielding 4,390.15→13,016.69 s.
  Keep these density/shot-selection/passivity limitations explicit; fewer static episodes do not
  establish realism. [Flow evidence](performance/PR157-flow-summary.json).
- Six alternating 600-second runs (three pairs) without renderer: median runtime ratio 1.00754,
  approximately +0.75%. [Performance evidence](performance/PR157-performance.json).
- Reproduction, numerical relationships and remaining limitations:
  [PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md](PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md).
- Next: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue, Injuries, Substitutions
  & Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**.

## PR156 contracts

- Keep all ordinary canonical fields/source ledgers identical when agency is disabled and only
  controlled identity changes. The fixed XI all-22 benchmark includes full halves and actual RNG draws.
- Every enabled controlled non-throw restart requires `human_selected`, regardless of watch policy,
  legal option count, previous gate, setup age or DEV delegation. Rejection must not draw RNG or
  alter ball/statistics/ledger; throw-ins retain their explicit exception.
- `derivePassDifficulty` is shared by physical execution and expected-outcome selection. Do not
  replace continuous uncertainty/control/recovery costs with distance gates or role bonuses.
- Low airborne control is a real continuous contact. Clip contact to reachable height before
  ordering against a boundary. Waiting above control height must not create a touch or aerial lock.
- The aware receiver corrects toward the actual forecast flight through normal movement. Preserve
  the original desired meeting point as evidence; never snap a player or ball to an objective.
- Preserve `receiverRelationshipAtRelease` on pass identity and resolved copies. Overlap completion
  must not be reclassified by later receiver geometry. Underlap/other relationships remain available.
- Network and pressure evolution are bounded observers. Keep genuine adjacent control contests;
  classify ownership changes with current contact evidence, not a stale diagnostic or a filtered count.
- Attribute semantics concern individual skills; OVR, generation and career distributions stay intact.
- Reproduction, measurements and limits: [PR156_AGENCY_PASSING_CONNECTIVITY.md](PR156_AGENCY_PASSING_CONNECTIVITY.md).
- Current next sequence after PR158: PR159 restart continuity, PR160 fatigue/injuries/substitutions/added time, PR161 presentation.

## PR155 contracts

- Enabled human agency reserves every controlled shot, including first-time/header finishes
  and restart shots. The canonical boundary rejects every source except `human_selected`.
  A rejected legal autonomous proposal sets `shotAgencyRequest`; the pure agency projection
  must expose it through every presentation policy, even after a previously delegated choice.
- Explicit `playerAgencyEnabled: false` retains the existing no-intervention comparison mode.
  A committed incoming human action retains its source at actual contact. DEV selection
  cannot silently execute or relabel a controlled shot as human.
- One-touch passes use ordinary pass targets, launch plans, execution error and accounting.
  Physical incoming contact must be low enough for a kick; no settled preparation delay.
  Feet, lead, space and lofted choices use the same physical resolver for human and NPC.
  The receiver's control value must never inherit the previous carrier's scanning clock.
- Last contact, acquisition attempt and secure control are different facts. Airborne redirects
  cannot themselves flip canonical possession. Physical overlap locks an aerial contest until
  separation; loose-ball acquisition keeps one candidate while control is unresolved.
  Failed control stays loose. Do not fix turnover noise by filtering telemetry.
- Loose-ball contestants chase the actual intercept. Formation blend/noise must not keep
  them outside contact radius. Support jobs are escape, pivot, third man, width and rest defence;
  the next midfield line can approach deep build-up. Do not enforce touch shares/CM utility bonuses.
- Pressure/support and central-lane probes remain read-only, bounded and sampled at 1 Hz.
  Public touches still mean continuous control episodes. Preserve identity accounting,
  fixed 25 ms stepping, replay/observer parity and zero background renderer calls.
- Reproduction and measured limitations:
  [PR155_PLAYER_AGENCY_STABILITY.md](PR155_PLAYER_AGENCY_STABILITY.md).
- Current next sequence after PR158: PR159 restarts, PR160 fatigue/injuries/substitutions/added time, PR161 presentation.
  Full post-goal/restart choreography remains outside PR155.

## PR154 contracts

- `passDecision.ts` scores intended solutions before seeded execution error. Keep selection,
  physical release, receiver control and defender interception separate in diagnostics.
- The reception target is the predicted meeting point; do not advance it beyond the ball
  each tick. Ordinary chosen carry uses the shared `carry` movement mode for every source.
- Possession urgency requires current pressure after physical preparation. Free scanning
  and late lead protection at a corner retain value; no timer forces a pass.
- `recentSolutions` is bounded to 32 entries inside existing team threat memory. Penalties
  decay with time and disappear with changed origin/pressure; there is no permanent ban.
- Support exists before remembered traps: two escape angles, a midfield third man and CB
  reset when applicable. Targets go through normal movement. Never enforce touch shares.
- A dangerous receiver's mark may be abandoned only after geometric coverage can inherit it.
  Weak forward screening changes intent selection; explicit tackles keep shared contact physics.
- Keeper claim arbitration chooses one primary player; the other covers. Agency requires
  a relevant local threat and distinct actionable arrival geometry, with actual flight direction.
- Canonical shot distance comes from the released shot record, including post-goal/restart
  aggregation. UI attributes/OVR and micro-lab results are observational, never engine multipliers.
- New pressure/connectivity probes are DEV/capture only and cannot alter canonical state.
  Replay, observer parity and statistical ledgers remain mandatory regression checks.
- Reproduction, measured results and remaining limits:
  [PR154_FOOTBALL_INTELLIGENCE.md](PR154_FOOTBALL_INTELLIGENCE.md).
- Current next work after PR158 is GitHub PR159 restarts, PR160 fatigue/injuries/substitutions/added time, PR161
  presentation/replay/stadium. Full restart resets and stamina remain outside PR154.

## Expanded PR152 statistics / discipline contracts

- Preserve `lastPossessionLoss` football cause across `lastRestartAward`; link award to loss
  without recording a second loss. Pass provenance survives loose flight and restart setup.
- Completed passing means actual controlled teammate reception; error/recovery/interception
  evidence and granular contact do not imply completion or another possession episode.
- Controlled-player agency rates use active seconds and expose their source; whole-match
  presentation rates remain separate. Later entrants use their canonical `activeSince`.
- Autonomous risky challenges require physical access to the ball. Contact, foul severity
  and card decision remain distinct. Delayed cards retain the original challenge technique.
- Accounting ledger events remain silent in floating feedback. Normal hidden simulation
  still does not call the renderer. Headless benchmarks report renderer evidence unavailable.
- Expanded brief, compact results and remaining calibration scope:
  [PR152_STATISTICS_DISCIPLINE.md](PR152_STATISTICS_DISCIPLINE.md).

## PR152 contracts

- Canonical football participation, human decisions and selected footage are independent.
  A controlled identity never removes a player from passing, positioning or autonomous action
  policy. Exact meaningful agency pauses the snapshot; selected carry/retain intentions keep
  their existing ownership. Routine hidden and visible football uses ordinary NPC policy.
- `playerAgencyEnabled: false` disables intervention while retaining canonical player identity
  for deterministic no-intervention comparisons. It is not a lower-detail simulation or a
  presentation policy. The default remains meaningful human agency with PR151 sparse cadence.
- Shot/cross, incoming first-time contact, restart and defensive action reservations depend on
  a real pending decision. Keep agency projection at the caller boundary; defensive schema/
  physics modules must not reverse-import the decision module and create initialization cycles.
- Public `touches` remain continuous possession/control or intervention episodes. Executed
  carry intentions are a separate counter. Preserve receive→carry→pass and first-time semantics;
  do not equate all counters or compensate distributions with quotas.
- Count tackle commitments/results once by canonical challenge identity, credit clean wins to
  the challenger, and retain explicit possession-acquisition actors across an immediate release.
  Interceptions, uncontrolled-ball recovery, physical blocks and contested duel wins are distinct.
  Autonomous standing safety uses deteriorated physical context for all identities; a random
  execution mistake is not preemptively withdrawn. Explicit committed actions retain their risk.
- Match Lab export v4 contains cheap whole-match `canonicalSanity` even without DEV observers.
  Presentation-owned scalar deltas attribute hidden involvement and visible player sequences.
  Optional absent coverage remains null; observers never influence RNG or canonical football.
- Sanity bands only warn. Multi-seed distributions separate accounting failures, contact-policy
  causes and remaining calibration/seed variation. One playtest is not a global tuning target.
- Implementation, measurements and exact restart-reset entry paths:
  [PR152_CANONICAL_PARTICIPATION.md](PR152_CANONICAL_PARTICIPATION.md).

Next recommended scope after this statistics/discipline follow-up: **Dead Ball & Restart Continuity**. Replace hard restart
position assignment with physical repositioning, add a goal-reaction state and score/time-driven
celebration versus urgent restart, retrieve the ball after a late comeback goal, derive restart
readiness, and establish canonical stoppage-time accounting. PR152 does not implement that scope.

## PR151 contracts

- `teams[side].threatMemory` is validated canonical evidence, not presentation telemetry.
  Observe football events through both step wrappers; never scan full history or count every
  carry substep. Decay and response timing use canonical seconds only.
- Apply bounded reaction through existing tactical targets and actual action scoring. The
  normal locomotion integrator moves the shape. Neutral coaching defaults preserve universal
  adaptation; missing attributes must not disable it. Keep persistence and gradual relaxation.
  Short build-up support and safer recycling require current nearby pressure and real pressure
  relief; remembered threats alone must not penalize free carries or reward backward loops.
- A cooperative press reserves at most one additional defender, preserving central cover and
  dangerous receiver marking. Availability is a neutral hook for future physical state.
  Keep the stable primary screen and pair locks; skip locked partners for a fresh safe defender.
  Project cover toward the goal centre and use ordinary movement/contact access and the shared
  challenge resolver. No forced human release or guaranteed tackle result.
- Presentation density and agency continuity are separate. Routine new receptions can stay
  autonomous; an existing human possession still owns meaningful passes, crosses and finishes.
- Match Lab export v3 uses null/reason/explicit intervals for unavailable or partial DEV data.
  Always retain real presentation runtime. Human hidden-to-visible lead-ins count as episodes.
- Movement capability is shared by locomotion, arrival and keeper acceleration. Stamina is a
  fixed capability here, without a fatigue ledger. Penalty setup dissolves when kicked; retain
  penalty shot context and legal goal-line keeper coordinates.
- Human/NPC parity compares the same canonical intent, target, physical state and seed family.
  Do not retune finishing from a single match or add source-specific accuracy.
- Evidence, reproduction and limits: [PR151_REACTIVE_TACTICS.md](PR151_REACTIVE_TACTICS.md).
  Fatigue, injuries, added time, substitutions and coaching personalities remain later.

## PR150 contracts (supersede historical public-touch/network definitions below)

- Preserve PR148 cadence. Routine contacts never reopen human agency by themselves.
  `humanPossessionEpisode` owns the player's goal; route obstruction needs actual blocking
  geometry plus stalled progress. AI adjusts execution without changing that target.
- Public `touches` counts continuous control/intervention episodes. Detailed contact IDs
  remain internal. Release, loss, another intervention and restarts close the public episode.
- Completed network edges use actual reception: relocate the original attempt when a different
  teammate receives, never invent an attempt. No self edge; outgoing/incoming totals reconcile.
- `space_pass` is a location intent. Release-time runner geometry selects an ordinary canonical
  pass with execution metadata; physical error may leave the pitch. Never favour controlled IDs.
- Offside uses frozen launch positions and meaningful participation. Direct goal kicks (short
  and long), corners and throws are exempt. Offside free kicks are indirect at the commit boundary.
- Reception retains quality-dependent momentum. Queued first-time releases preserve the incoming
  resolved delivery and create a fresh outgoing identity/offside snapshot.
- Motion arrows observe current velocity only; headless canonical state cannot depend on them.
- Evidence and limits: [PR150_CONTINUOUS_INTENT.md](PR150_CONTINUOUS_INTENT.md),
  [PR150_ACCOUNTING.md](PR150_ACCOUNTING.md). PR151 extends these contracts above.

## PR149 contracts

- Preserve `npcPossessionDecisionDelay` and the sparse human agency model. `onBallPreparation.micro`
  is canonical bounded footwork/orientation/protection, not another action or touch per tick.
- Never clear incoming velocity/height before physical reception. Poor control leaves a real
  loose ball and recovery requirement; quality evidence supports future calibration.
- `lastResolvedPass` survives a queued next pass/first-time finish. Successful teammate contact
  uses `actualReceiverId`, which can differ from `intendedReceiverId`. PR150 now relocates
  the original attempt to that actual relationship; the intended target remains diagnostic.
- `state.matchEvents` persists beyond short action label retention and uses canonical IDs/time.
  Extend the schema/feed/UI together for future substitutions, injuries and other event kinds.
- `projectMatchCentreStatistics` includes dismissed player records and credits canonical live
  possession time. Restart counters count awards. Second yellow adds a yellow and a dismissal.
- `MatchReplayHistory` is renderer-free, optional to headless consumers, 5 Hz / 12 s / <=64 samples,
  eight event windows / <=50 samples each. Observe hidden ticks; never reconstruct missed outcomes.
  Windows are immutable to consumers, old events survive footage eviction, and errors cannot stop
  canonical progression. UI animation and replay use recorded frame time and roster boundaries.
- `npm run benchmark:readability` compares a clean engine via `--engine-root`, retains reception/
  hold/agency/accounting evidence and hashes, and can measure `--replay=true` observer cost.
- The former stamina plan remains later than **PR151 reactive tactics**. Cinematic replay, final art,
  stadium archetypes and large league calibration remain separate. Details and final evidence:
  [PR149_IMPLEMENTATION_CALIBRATION.md](PR149_IMPLEMENTATION_CALIBRATION.md).

## PR148 contracts

- `players` is the active roster. Below seven on either side, `matchRules.enforceMinimumPlayers`
  produces `status: abandoned` with `termination: { reason, at, team, activePlayers }`; never
  fabricate a competition result. Both tick entries, stale actions/decisions, restarts and hidden
  UI scheduling respect the terminal state. Statistics keep the dismissal-time minutes.
- Defensive episodes join lingering close-pair contacts across a win/reclaim. Separation,
  progression, another player or a new deliberate delivery creates new football context;
  another defender can challenge immediately. Booking suppresses risk; PR152 makes physical
  withdrawal from unsafe autonomous standing challenges shared by every player.
  Relative component ability remains stochastic.
- Historically PR148 `touches` counted canonical discrete contacts. PR150 supersedes the public
  counter with continuous episodes and preserves this detailed evidence internally. One
  meaningful executed carry supplies one contact and `dribble` event. Stale reception evidence
  cannot be renewed by another player's preparation.
- `chooseNpcAction` remains the shared pure policy. `chooseNpcRoutineAction` adds live
  contextual possession readiness, allowing support movement and scanning. Explicit human/DEV
  choices keep immediate agency. Stale return passes lose utility unless context supports a wall pass.
- Routine press commitment uses cover, threat, control exposure and player attributes. Calm,
  covered marking jockeys at a standoff; deliberate carries and genuine threats still invite a
  challenge. Scanning keeps the ball at the feet rather than permanently exposing a running stride.
  A completed chosen hold invites closure; physical pressure then restores the owner's agency.
  A timer alone neither opens a prompt nor delegates a major action.
- Explicit DEV hold/carry selections preserve the same ownership/waypoint handoff as human
  selections. PR152 protects a real pending choice and selected possession intent;
  otherwise delegated autonomous shots use the ordinary NPC policy.
- Locomotion brakes at target, excludes collision correction from distance, and treats a live
  delivery separately from a loose-ball race. Sprint maturation/hysteresis controls burst counts;
  sprint distance remains continuous. See [PR148_CALIBRATION.md](PR148_CALIBRATION.md).

## Filozofia

My Football Legend to deterministyczna symulacja kariery piłkarza: nie manager i nie zręcznościowa
gra ruchowa. Gracz wybiera znaczące decyzje, rutynowy futbol jest symulowany, a znaczący rozgrywany.
Każde zjawisko futbolowe ma jeden system kanoniczny.

## Architektura w jednej stronie

- `TacticalMatchState` jest kanoniczną migawką. `matchSimulation.ts` wykonuje przejścia.
- Fizyka działa zawsze przy `FIXED_MATCH_DT = 0.025`; planowanie celów ma cadence 0,1 s z
  natychmiastową invalidacją zdarzeniową.
- `matchActions.ts` enumeruje i uruchamia wspólne akcje człowieka/NPC; wyspecjalizowane pliki
  rozwiązują lot, kontakt, przyjęcie, prowadzenie i bramkarza.
- PR147 `defensiveChallenges.ts` wykonuje wspólne fizyczne próby standing/committed/slide/tactical;
  PR152 rezerwuje faktyczną oczekującą decyzję człowieka, a poza nią stosuje wspólną politykę NPC.
  `matchRules.ts` rozstrzyga
  faul/kartkę i korzyść na kanonicznych faktach, korzystając z istniejących wznowień.
- `actionEvents.ts` zachowuje kanoniczne dowody przez 12 s / maks. 96 zdarzeń. Mikrofeedback
  odczytuje czas wyświetlanej klatki live/lead-in/replay, nie animację ani zegar aktualnego core.
- `shootingOptions.ts` wyprowadza wspólne możliwości strzału i fizycznie osiągalny kontakt;
  `shotIntent.ts` oddziela technikę od kontaktu. `shotResolver.ts` nadaje jawny profil wykonania,
  a lot nadal obsługuje ten sam integrator 3D. Cel PR141 nie może spłaszczyć podcinki.
- `playerDecision.ts` jest czystą projekcją okazji. `decisionOutcome.ts` zamyka zdarzeniowe okno
  wyniku; checkpoint sprawczości może łańcuchować kolejną decyzję.
- `possessionAgency.ts` utrzymuje własność ludzkiego posiadania. Prowadzenie kończy się granicą
  decyzji przy waypoint albo istotnej zmianie sytuacji; upływ cooldown nie oddaje akcji AI.
- `matchMoment.ts` obserwuje; polityka prezentacji wybiera epizody, nie wyniki futbolu.
- `TacticalMatchSandbox.tsx` zarządza batchami i fazą widoku. Three.js tylko renderuje klatki.
- `matchFlowTelemetry`, statystyki i debug capture są obserwatorami i nie zużywają RNG.
- Benchmark `npm run benchmark:background` rozdziela core, telemetrię, moment, complete i profile.
- PR146 `npm run benchmark:performance` mierzy 10/45/90 min i tryby minimum/normal/DEV/capture,
  pełne hashe, pięciominutowe przedziały, podsystemy i kolekcje. Ref kanoniczny w UI jest
  niezależny od coalescingu React; wszędzie zachowano exact agency i 0,025 s.

## Inwarianty

1. `FIXED_MATCH_DT = 0.025` i jeden integrator fizyki piłki.
2. Prezentacja nie zużywa RNG, renderer nie rozstrzyga futbolu.
3. Flaga kontroli nie zmienia preferencji kolegów wobec adresata podania.
4. AI nie wykonuje wysokowartościowej akcji kontrolowanego gracza, gdy człowiek posiada epizod.
5. Udana akcja z zachowaniem/zdobyciem posiadania może prowadzić do kolejnej decyzji człowieka.
6. Sprawczość każdej znaczącej decyzji jest niezależna od polityki oglądania; polityka wybiera
   wyłącznie materiał do oglądania. Kontekst jest historią prezentacji, nigdy rollbackiem futbolu.
7. Podział tych samych ticków na batche nie zmienia wyniku.
8. Wybór wysokiego ryzyka nie gwarantuje kontaktu/odbioru/faulu; bez kontaktu nie ma przewinienia.
9. Faule/kartki i korzyść są faktami core. Etykieta albo gest nie może ich przyznać ani cofnąć.

## Ewolucja od PR126

- **Sprawczość/kamera/cel:** stabilne śledzenie, płaszczyzna bramki, checkpoint po akcji.
- **Orientacja/piłka:** orientacja ciała, jeden lot 3D i kontaktowa geometria.
- **Skrzydła/przyjęcie/prowadzenie:** relacje, dośrodkowania, plan podania, fizyczne przyjęcie i carry.
- **Flow/runtime:** stały krok, bezpieczne nadrabianie, semantyczne decyzje i żywotność wznowień.
- **Bramkarz:** pozycja, projekcja interwencji oraz wspólny kontakt catch/parry.
- **Momenty/tło/performance:** obserwacyjny `MatchMoment`, selektywna prezentacja, benchmark PR139 i
  kanoniczny multi-rate fast path PR140.

## Debug workflow

Reprodukuj w Single Match Lab ze stałym seedem. Do zgłoszenia dołącz benchmark-session JSON,
kanoniczny czas i ±10 s debug capture; WebM dodaj, gdy problem dotyczy ruchu. Porównuj wszystkie
tryby `npm run benchmark:background`, panel wydajności, decyzje prezentacji, flow/keeper telemetry
i seed. Preferowane dowody: stan przed/po, decision id, ball episode i action source.

## Znane problemy

- pełny rozkład zaangażowania, wolumenu podań i decyzji dla wszystkich pozycji wymaga dalszych playtestów;
- krótka próbka PR145 nie ustala końcowej skuteczności strzałów/bramkarzy w normalnych meczach;
- nowe łańcuchowanie epizodów wymaga długich testów manualnych;
- udział bramkarza i podania zwrotne wymagają obserwacji;
- brak zmęczenia, zmian, pełnej integracji kariery i kanonicznej oceny meczowej;
- PR147 wdraża spójny podzbiór przepisów, nie wszystkie edge cases IFAB; progi kontaktu,
  korzyści/DOGSO, reakcja ról na wykluczenie i pełny lejek podejścia wymagają dalszej kalibracji;
- modele i animacje 3D pozostają lekkim prototypem; kamera, hitboxy i baza strojów mają fundament PR141.

## PR143 — prezentacja i sprawczość

`projectPlayerAgency` jest jedyną projekcją własności decyzji: znaczący wybór człowieka albo
kanoniczna autonomia. Polityka nie wykonuje proxy; `resolveDevPlayerDecision` jest jawną delegacją
DEV. Jedna rzeczywista opcja menu nie zatrzymuje meczu. `PlayerAgencyTracker` liczy semantyczne
wejścia, osobno od liczby renderów i kandydatów materiału.

`PresentationContextHistory` zapisuje 10 Hz / 6 s / <=62 lekkie próbki również w tle. Gdy decyzja
istnieje w T, core stoi; lead-in od T−N pokazuje wyłącznie zapis, a zegar odpowiada tej klatce.
Interakcje są aktywne dopiero po dojściu do T. Wynik obserwuje dowody kanoniczne i krótki ogon;
nie wpływa na RNG ani wynik akcji. Replay jest osobnym stanem z własnym widocznym buforem.

## Roadmap

PR141–PR147 ukończone w opisanym zakresie; kalibracja realizmu dyscypliny pozostaje PR148.
PR145 używa osiągalnego punktu spotkania odbiorcy, legalnego autu z
zakazem ponownego kontaktu wykonawcy, loftu 3D oraz wspólnego oporu toczenia 3,2 m/s².
Cel podania nie wyhamowuje lotu. Kontakty i completed/received/network mają wspólne dowody;
rutyna i przechwyt należący do wcześniejszego kolegi nie tworzą bezsensownego promptu.
Reakcja i aktywny zasięg bramkarza są osobne od pasywnej kolizji ciała. Zachowano epizod
człowieka PR144 także po przyjęciu autu. Finalne verify: exit 0, 697 + 5 testów.
Próbka 3 × 600 s: projekcja 408 → 42 decyzje / 90 min; 224 kontrolowane strzały dowodzą
miss/save/goal, nie końcowego rozkładu zwykłych meczów. Definicje, stałe i pełne metryki:
[MATCH_BEHAVIOUR_CALIBRATION.md](MATCH_BEHAVIOUR_CALIBRATION.md).

PR146: DEV45 466,19 → 62,15 s, normal90 108,36 s; kanoniczne hashe A–D10/A–C90 i PR14545
pozostały równe. Verify exit 0, 720 + 5 testów. Normal nie płaci stale za flow/debug capture;
capture 40 Hz jest jawny, a WebM dodatkowo opt-in i widoczny. Milestone headless <5 min spełniony;
pełnego grywalnego czasu 4–6 min i video kosztu jeszcze nie zmierzono. Dokładne dowody:
[BACKGROUND_SIMULATION_PERFORMANCE.md](BACKGROUND_SIMULATION_PERFORMANCE.md).

Zweryfikowano **PR147 — Rules, Discipline & Match Feedback**: 777 + 5 testów, lint/build,
normal10 BEFORE/AFTER i pełna zgodność hashy minimum/normal/DEV10. Próbka ma 17 fauli,
13 żółtych i 5 wykluczeń po drugiej żółtej; nie jest realistycznie skalibrowana, a niższy czas
nie dowodzi optymalizacji przy zmienionym futbolu/składzie. Architektura, ograniczenia,
weryfikacja i benchmark: [RULES_DISCIPLINE_MATCH_FEEDBACK.md](RULES_DISCIPLINE_MATCH_FEEDBACK.md).
Dalej **PR148 — Possession Rhythm, Roles & Duel Calibration**, potem
**PR149 — Animation, Replay & Match Presentation v2**. Fatigue nie maskuje złej częstości ruchu.
Klubowy stadion docelowo ma stabilny seed/profil i niezależną zmienność środowiska; MFL nie
ma minigry budowy stadionu. Żaden późniejszy etap nie został włączony do PR147.
