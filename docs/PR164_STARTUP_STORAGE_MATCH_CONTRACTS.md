# PR164 — Startup, Storage, Match Contracts & Restart Integrity

Base: merged PR163, `f812e96`. Scope: release ownership, prepared free-kick choices,
release-time offside presentation, measured loading/storage/tempo, and a validated
headless career boundary. Canonical physics remains at 0.025 s; no new dependency,
global pass-speed multiplier, mandatory possession timer or shot quota was added.

## Evidence and limits

The prompt describes `lab-mv3zlmht` at 183.650/185.225/185.425/185.450 s and
`lab-mv40xcii` with 1089 attempts, 89.6% completion, one shot and one goal over
46 minutes. Their original exports were not present in the supplied attachment or
local export locations. Those numbers are user-provided observations, not newly
reproduced measurements. The restart regression uses a fresh equivalent canonical
fixture; the pass audit uses explicitly constructed matched geometry. Neither is
presented as an exact replay of the historical match.

Receipts are in [performance/PR164-browser.json](performance/PR164-browser.json),
[PR164-storage-world.json](performance/PR164-storage-world.json),
[PR164-passing.json](performance/PR164-passing.json), and
[PR164-contract.json](performance/PR164-contract.json). Browser transfer is an actual
Edge/CDP measurement over HTTP, with production artifacts and real Brotli bodies;
artifact gzip/Brotli sizes are separate compression estimates. CPU measurements
are single local Node samples, not browser FPS or hosting latency. Browser scenario
elapsed time includes a network-idle wait and is not a pure UI rendering measurement.

## Restart ownership and target-first choices

`isRestartSelectionAvailable` previously rechecked a shot after physical release.
`canExecuteCanonicalShot` correctly rejects a second shot while `ball.shot` exists;
the restart lifecycle incorrectly interpreted this as an obsolete original choice,
cleared the selection and restored setup. With the ball already moving, setup then
reported `ball_not_placed`. Selection/taker replacement now applies only before
execution. The released episode retains its action, award, decision identity,
statistics and stoppage ledger while ordinary ball physics resolves it.

Ceremonial free kicks with an actual wall build its legal geometry before the human
chooses a final target/profile. Previously a wide free kick could acquire a wall only
after shot selection. The same prepared roles and targets survive shot selection.
Permission is `restart.authorisedAt`, derived from canonical legal/tactical readiness,
including wall distance to its real target and speed. The UI displays
“Sędzia pozwala wznowić” from that state. Setup advances the match clock; mandatory
human choice freezes canonical time. Readiness marks the open stoppage interval;
only actual execution closes it. An explicit quick free kick remains quick even
when the chosen action is a shot or cross. There is no fixed wall waiting duration.

This follows the distance/wall procedure and quick-kick interception exception in
[IFAB Law 13](https://theifab.com/laws/latest/free-kicks/) and the ceremonial whistle
guidance in [IFAB practical guidelines](https://www.theifab.com/laws/latest/guidelines/body-language-communication-and-whistle/).
The existing canonical law and physical contact checks remain authoritative.

The goal click is projected through the active camera onto the goal plane; ordinary
and specialist choices are then generated for that goal target. `under_wall` and
`wall_gap` require their actual eligible geometry. Indirect kicks cannot offer a
direct goal shot. Grass near receivers offers a ground delivery or forward floated
cross while existing exact delivery choices remain available. Clicking a real wall
member (or its small nearby area) offers “Z całej siły w mur”: a normal driven kick
aimed through the selected physical point. It has no scripted hit or injury. No wall
means no Easter egg. Rejected choices keep the decision open; projections do not
consume RNG or replace an already selected human action.

Both attack directions and all five physically available specialist profiles have
regression coverage through actual release and subsequent physical resolution.
The test places bodies legally to isolate the defect; existing live retrieval,
distance, geometry and liveness tests separately cover setup movement.

## Offside replay

The replay observer retains a detached snapshot at the canonical pass release,
then links it to a later actual offside offence. Replay opens paused at that frame:
the line uses the recorded ball/second-last-opponent calculation, the attack direction
is explicit, relevant attackers are red and the two deepest defenders green.
Subsequent positions cannot redraw that adjudication. Replay remains read-only,
bounded and outside persistence; its memory estimate includes the additional frame.
The model uses canonical player positions, not calibrated head/foot/body-part VAR
geometry. The renderer does not claim that additional precision.

## Passing tempo

120 releases: six lengths, ground/lofted, three matched seeds; at 25 m vary skill,
pressure, receiver orientation, first-time contact, phase and pitch zone. At 25/35/45 m
also compare support/progressive/direct intent. 115/120 resolve completed in this
deliberately open geometry. These are selected physical passes, not an NPC selection
frequency or population accuracy calibration.

Median baseline release-to-contact seconds and launch speed (m/s):

| Length | Ground contact | Lofted contact | Ground speed | Lofted speed |
| ------ | -------------: | -------------: | -----------: | -----------: |
| 5 m    |          1.250 |          1.225 |        6.995 |        9.538 |
| 15 m   |          1.775 |          1.375 |       11.394 |       13.747 |
| 25 m   |          2.450 |          1.350 |       13.474 |       18.403 |
| 35 m   |          2.400 |          1.675 |       18.620 |       23.820 |
| 45 m   |          2.175 |          1.850 |       22.771 |       28.059 |
| 60 m   |          2.150 |          2.500 |       29.155 |       34.125 |

At 45 m, progressive ground speed is 26.409 m/s/contact 1.775 s; direct is
30.000 m/s/contact 1.475 s. The length-adaptive launch plan compresses travel-time
differences at long range. This merits later comparison with a real reference dataset,
but three seeds in open geometry do not establish a justified universal speed reduction.
Support forecasts at 5/15/25 m are 1.300/1.425/2.125 s versus actual contacts
1.250/1.775/2.450 s: prediction and physical arrival must be reported separately.

Baseline initial routine readiness is 1.000 s; low skill 1.225, high skill 0.825,
pressure 0.650. The explicit first-time contact has no owned-possession wait.
At 25 m ground, median control is 2.450 s after release, routine consideration
2.675 s, and next physical release 8.275 s. Lofted gives 1.350/4.475/4.775 s.
The intervening time includes turning, pressure, choice and possible carrying,
not just a hidden preparation timer. Null next-release values are right-censored
by a 20 s observation window. Physical first-time follow-ups can release without
owned control or before the next routine probe; metrics are not assumed to be
a mandatory linear sequence. Earliest reachable defender contact is a separate
sampled forecast (0.1 s), not a guaranteed interception.

Hundreds of safe passes with few shots remain consistent with recycling utility,
terminal opportunity creation and reception/selection ranking. Slowing every pass
would reduce counts without demonstrating better attacking decisions. PR164 makes
no broad football calibration claim; sparse shooting, forecast calibration and the
equal-4-4-2 logical-identity asymmetry documented in PR162/163 remain open.

## Production loading and bandwidth

The start shell no longer imports career creation/simulation or Three/match code
eagerly. Career and canonical Lab have useful lazy boundaries; the legacy narrative
match view also loads on demand. In-app navigation preserves loaded modules and a
mounted career, while leaving the Lab disposes its live renderer, recorder and loops.
The world loader shares concurrent requests and retains one validated world in memory;
failed loads can retry. DEV URLs and a deep-link reload still work. Career UI continues
to use its existing narrative match path: production career-to-canonical-match wiring
belongs to PR166. The first/second playable canonical match browser steps use the Lab.

Baseline has one 1,697,893-byte JS artifact (480,927 gzip / 393,093 Brotli),
37,056-byte CSS and 207-byte HTML. New production artifact sizes and hashed filenames
are enumerated in the browser receipt. Three/renderer remains the largest deferred JS
payload; the world dominates first career creation. No heavy dependency was added.

Across every artifact, including the world and deferred screens, totals are
5,015,105→5,025,869 raw bytes, 819,999→830,212 gzip9 and
593,056→610,813 Brotli11. Code splitting improves entry cost and reuse, while total
compressed delivery of all features increases about 3.0% through chunk overhead
and the new code. The canonical Lab chunk is 1,146,791 raw / 311,849 gzip /
254,767 Brotli bytes. The build still warns about that deferred chunk exceeding
500 kB; this PR does not claim the entire game or renderer became smaller.

Actual HTTP/CDP encoded transfer, including response overhead, on the controlled
Brotli server (final exact byte counts in receipt):

| Scenario                                             | Measured bytes |
| ---------------------------------------------------- | -------------: |
| Baseline cold menu                                   |        402,084 |
| New cold menu                                        |        117,425 |
| Warm menu reload                                     |            308 |
| Return after deploying new artifact hashes           |        117,425 |
| Create first career, incremental                     |        237,427 |
| Resume existing career, incremental                  |            623 |
| First playable canonical Lab match, incremental      |        257,718 |
| Return to mounted career after match, incremental    |              0 |
| Second playable Lab match, same page                 |              0 |
| Reload Lab deep link                                 |            794 |
| Legacy migration plus resume in a new context        |        237,735 |
| Storage blocked: creation attempt in a fresh context |        354,852 |

The cold menu reduction is about 70.8%. Totals are stage increments, not sums of
every resource timing entry; cache hits transfer zero body bytes. The server uses
`Content-Encoding: br`, `Vary: Accept-Encoding`, strong content ETags,
`Cache-Control: public, max-age=31536000, immutable` for hashed assets and
`public, max-age=0, must-revalidate` for HTML/world. The receipt records the headers
actually returned. This is a tested hosting policy, not a claim about current GitHub
Pages headers, a published deployment or users' network speeds. A changed world
version must use a new URL; unchanged resources should remain cacheable.

The world is 3,279,949 UTF-8 bytes / 330,027 gzip / 191,940 Brotli: 64 clubs,
1824 footballers and 12 cohort lists. Node JSON parse 12.89 ms, Zod validation
38.67 ms, new career construction 0.09 ms; save hydration is a separate operation
(71–126 ms in these local samples). Scaling samples: 1000 records 1.874 MB/111.7 kB
Brotli, 1824 records 3.280 MB/192.0 kB, 3648 records 6.448 MB/204.3 kB. The latter
duplicates schema-shaped records with different map keys and is a compression lower
bound, not a realistic newly generated population or changed production identity.

Recommendation: retain the stable global ID/version manifest; if the world grows,
split immutable region/competition rosters into versioned chunks and preserve the
existing procedural-player ID algorithm. Generate later cohorts from stable IDs and
seeds, rather than serializing repeated base profiles or regenerating IDs per visit.
There is no new global chunk format or identity migration in this PR.

At approximately 0.6 MB for menu + first career + first canonical Lab match under
this Brotli policy, 100,000 uncached visits are about 60 GB of transfer, before other
assets and overhead; this is an extrapolation, not usage telemetry. Uncompressed
world delivery alone costs 3.28 MB per cold load. Repeated same-session matches
should add no module transfer. [GitHub Pages documents a 100 GB/month soft bandwidth
limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits);
compression and cache policy must be checked on the actual chosen host.

## Save growth and integrity

The deterministic `pr164-save` career plays real calendar fixtures through the
existing summary path, settles rounds and advances season/world lifecycles. It
serializes, validates and hydrates production schema v7 at each rollover. These
are not fabricated arrays and not 20 seasons of canonical full-match output.
The adapter stores ordinary JSON. gzip/Brotli columns estimate compressed backup or
transfer sizes, not bytes actually charged to IndexedDB/localStorage by the browser.

| Completed seasons | UTF-8 bytes | gzip bytes | Brotli bytes | Serialize ms | Parse + validate ms | Hydrate ms |
| ----------------- | ----------: | ---------: | -----------: | -----------: | ------------------: | ---------: |
| New               |       3,796 |      1,846 |        1,512 |         4.47 |                0.64 |      71.45 |
| 1                 |      91,810 |      9,815 |        7,009 |        11.93 |                3.46 |      75.37 |
| 5                 |     706,384 |     51,903 |       36,942 |        12.58 |               10.84 |      95.65 |
| 10                |     886,266 |     63,884 |       46,956 |        14.98 |               10.77 |     125.57 |
| 20                |   1,211,563 |     82,537 |       61,217 |        18.64 |               20.50 |     115.69 |

At 20 seasons, state overrides 368,396 bytes, memberships 256,316, season archive
155,602 (including 130,325 match bytes), transfers 93,555, manager state 88,195 and
facts 79,617 dominate. Section measurements overlap where a parent includes a child;
do not add all section columns. Procedural profiles remain references; newFootballers
and full footballerOverrides are empty in this career. The existing 3 MB soft budget
is adequate for this measured summary path, not a universal browser quota or proof
that indefinitely retained canonical result snapshots fit it.

The native browser IndexedDB receipt writes/reads a 91,810-byte payload, verifies
equality and explicitly aborts a replacement transaction while preserving the old
value. Actual legacy migration removes localStorage only after write/readback.
The final browser run measures 1.1 ms write / 1.0 ms read for that payload. A fresh
context with unavailable IndexedDB and a throwing localStorage getter reaches the
creator, displays the Polish save-failure alert and retains the creator rather than
advancing the career. Optional notice preferences cannot crash that flow.
Fault-injection tests separately cover quota/abort, denied storage, read/open failure,
invalid legacy/current payloads, older v6 normalization, readback failure, overlapping
migration/load/save and queue continuation after rejection. They are transaction
failure doubles, not a claim to exhaust arbitrary browser crash timing. Loads/deletes
join the write queue; initialization is shared; blocked late opens close their handle.
Invalid primary data is not overwritten from legacy storage. Failed migration keeps
the legacy source. Cross-realm quota errors are classified by error name.

Schema v7 stays readable. One missing persistence allowlist field is repaired:
`footballerConditionOverrides` now survives save/load. No replay, renderer, pending
decision, DEV diagnostic or per-tick match state enters the career save.

## Versioned career boundary

`src/core/careerMatchContract.ts` exports Zod input/result version **1** and pure
`createCareerMatchInput`, `startCareerMatch`, `finishCareerMatch`,
`applyCareerMatchResult`; `CareerMatchEvidence` is a caller-owned observer.

| Input group        | Required canonical data                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture/provenance | Calendar fixture ID, season/competition/date/round, both club IDs, owner player and career seed                                                                        |
| World              | Fixed version/seed and `canonical-base-with-career-overlays-v1` policy                                                                                                 |
| Football           | Fixture-derived seed; snapshot of both clubs, manager selection/formation, eleven unique slots/IDs, named bench, profiles/traits, condition/injury, substitution rules |
| Environment        | Current standard 105×68 pitch, canonical ball, neutral weather defaults                                                                                                |
| Presentation       | Separate seed, stable stadium ID and player visual-ID references                                                                                                       |

The session is the existing `SingleMatchSession`, not a UI-only simulation.
Default selection is the manager's; forceIntoXI is an explicit test/DEV option.
Unavailable players and unsupported academy/trial rosters lacking a full native XI
are rejected, not silently padded. The normalized football snapshot has a stable
sorted-data FNV integrity checksum; it is not a cryptographic anti-tamper signature.
Presentation fields are excluded from the checksum and from football initialization.
The local adapter verifies the current career/world/calendar and rebuilt football
snapshot before committing; unknown versions, stale inputs and conflicts fail.

The output is full-time only, **at most 96,000 UTF-8 bytes**, with unique actual
participants (XI plus entered substitutes, including departed/dismissed players),
actual minutes/stats, condition/injury, score, team accounting, bounded substitutions
(10), cards (80), structured narrative facts (24), and human evidence (32 intent groups
and 12 recent resolved outcomes). Starter flags and substitution identity/order are
validated against the named input. NPCs have compact per-match statistical summaries,
not action or trajectory recordings. Goal narrative entries are end-of-match summaries;
the result does not invent precise historical goal timestamps.

Human evidence retains deliberate selections, resolved results, progress, pressure,
retention/turnover and pass outcomes. PR166 can derive playstyle progression from
accumulated meaningful decisions; this PR introduces no new acquisition algorithm.
The observer deduplicates decision/card identities and never alters canonical RNG.

Applying once updates the real fixture/round, participation, appearance history,
actual condition and discipline, plus one `canonical_match_result` structured fact.
Other league fixtures use the existing deterministic settlement routine. The same
completion after save/load returns the same career object and has no effects; a
different result for that fixture is rejected. The commit is immutable and can be
saved atomically by `CareerStorage`; there is no partial live-career mutation.
The canonical counters currently export no xG/xA, key-pass/rating or personal-impact
model: compatibility appearance fields use neutral zero defaults and omit rating.
Detailed injury conditions preserve recovery dates; no summary injury RNG reroll occurs.
Development/coach/news/style consequences and live UI transition belong to later stages.

The integration test starts from an actual generated professional offer/calendar
fixture, explicitly includes the controlled player, runs two complete canonical
matches with real human selections, compares their validated results, commits,
serializes/hydrates v7 and attempts the duplicate/conflicting/wrong-career commit.
The compact receipt records duration, score, participant count, result/save bytes and
decision evidence. Changing only the presentation seed yields identical canonical
initial state. Input/output is independently replayable headlessly without React.

Measured fixture `league_2027_1_1`, football seed
`pr164-contract:canonical:2027-28:league_2027_1_1`, input checksum `a01dd2d5`:
two identical full-time 0:0 results at 5534.200 s, 28 actual participants, six
substitutions, 11 selected/resolved human decisions, 35,361-byte result and
112,528-byte committed v7 save. Both complete runs took 619.75 s together in the
integration test; this is local CPU wall time, not a realtime browser benchmark.

Retention limitation: the 96 kB limit is per match. This version stores a full bounded
result in its history fact; hundreds of such results can exceed 3 MB. The 20-season
summary audit must not be used to hide that growth. Before PR166 enables full career
integration, define seasonal aggregation/archival of rich decision outcomes, retain
completion IDs/fingerprints and compact NPC season summaries, and measure the new
canonical-career path. Visual IDs are references suitable for PR165 identity/aging
and PR170 stadium extensions; a changed football/environment model needs an explicit
versioned contract migration, not cosmetic RNG leaking into football.

## Validation and answers to the requested questions

Final validation status and source receipts are recorded in
[PR164-validation.json](performance/PR164-validation.json). The initial unrestricted
parallel test run exceeded existing CPU time limits and exposed an obsolete menu
expectation (three profiles rather than target-valid regenerated choices). Focused
serial reruns passed the parity tests; menu coverage now retains exact crosses and
validates target-specific techniques. Main verification uses two workers; integration
and full-match contract runs are serial. Existing individual test timeout limits
were not raised.

**`npm run verify`: PASS** — lint, 1553 main tests in 187 files, 31 renderer/liveness
integration tests, two contract tests, five full-career tests (1591 total), TypeScript
and production build. Follow-up final lint and 26 focused UI/storage tests also pass,
as does the native Edge HTTP/lifecycle/denied-storage audit. Final browser artifact
hashes match the production build produced by the complete verify run. No merge or
deployment is part of this PR.

The first [GitHub CI run](https://github.com/adamfron/my_football_legend/actions/runs/38164271701)
was cancelled by the workflow's 15-minute job budget during the full-fixture contract
test. Its 1553 main tests passed in 482.55 s and its 31 renderer/liveness tests passed
in 95.96 s; the contract run then had only about five minutes left. The completed
local contract run took 623.61 s, and the full-career suite another 73.19 s. These
measurements already exceed 21 minutes when combined with the observed CI main
suite, before installation, lint and build. CI now allows 30 minutes for the whole
job. The test coverage and individual test timeouts are unchanged.

| #   | Answer / evidence                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Post-release shot eligibility was incorrectly reused to invalidate the original restart; `ball.shot` caused reset and then `ball_not_placed`.              |
| 2   | Both directions/all five eligible specialist profiles release and physically resolve without retroactive setup; validity still depends on actual geometry. |
| 3   | Yes for ceremonial kicks: initial wall geometry, real target/speed/legal readiness precede final choice.                                                   |
| 4   | Yes, cue comes from canonical `authorisedAt`, with no independent UI timer.                                                                                |
| 5   | Yes, readiness leaves the ledger open; execution closes it once.                                                                                           |
| 6   | Yes, explicit quick pass/shot keeps the quick exception even while opponents retreat.                                                                      |
| 7   | Goal-plane target regenerates only valid profiles; indirect direct shots and impossible wall choices are excluded.                                         |
| 8   | Yes, driven fixed-point wall kick uses ordinary launch/contact physics, with no guaranteed hit/injury.                                                     |
| 9   | Human clock freezes; selected action/identity survives menu projection and release; rejected input keeps choice open.                                      |
| 10  | Actual ground/lofted contact medians by length are in the tempo table; forecasts are separate.                                                             |
| 11  | Long-range time compression/direct 45 m cap is observed; this small open fixture cannot justify a global realism correction.                               |
| 12  | Example 25 m ground: contact/control 2.450 s, consideration 2.675, next release 8.275; preparation is contextual, not one constant.                        |
| 13  | Safe circulation does not guarantee terminal space/shot ranking; the historical one-shot observation lacks a complete export.                              |
| 14  | Prioritize measured reception/decision-ranking and forecast work; no blind physics multiplier or artificial wait.                                          |
| 15  | Actual production artifact raw/gzip/Brotli bytes, including deferred modules, are in the browser receipt.                                                  |
| 16  | Cold menu about 117 kB versus 402 kB baseline under measured Brotli HTTP policy.                                                                           |
| 17  | Warm reload is header/revalidation traffic; immutable cached bodies are reused.                                                                            |
| 18  | Menu plus first career about 355 kB in this policy; world loads once on demand.                                                                            |
| 19  | First canonical Lab match adds about 258 kB after career creation; no career-canonical UI claim.                                                           |
| 20  | Second same-page canonical match adds zero network bytes.                                                                                                  |
| 21  | World 3.280 MB raw/330 kB gzip/192 kB Brotli; parse/validation/hydration costs are separated.                                                              |
| 22  | World at first career; Three/renderer at first Lab; base framework/shared schema code at menu.                                                             |
| 23  | Roughly 60 GB per 100k uncached complete-entry flows under measured Brotli; actual host policy/limits must be checked.                                     |
| 24  | 1/5/10/20 summary seasons: 91,810 / 706,384 / 886,266 / 1,211,563 UTF-8 bytes.                                                                             |
| 25  | NPC state/membership, archive, transfers, managers and facts; base profiles remain shared/procedural.                                                      |
| 26  | 3 MB is useful for measured summary careers, not a guarantee for retained canonical results or localStorage quota.                                         |
| 27  | Native abort/readback plus fault tests preserve last-good writes and migration sources; arbitrary crash timing is not exhaustively proven.                 |
| 28  | Yes, existing v7 and older normalization/legacy paths remain; condition override persistence is repaired.                                                  |
| 29  | Versioned fixture/world/owner, full native XI/bench/profiles/formation/condition, rules/default environment and football seed.                             |
| 30  | Fixture-derived football seed drives simulation; presentation seed/visual IDs do not affect it.                                                            |
| 31  | Score, participants/minutes/stats, changes/cards/injuries/condition, bounded human evidence and structured narrative facts.                                |
| 32  | Deliberate intent/result/progress/pressure aggregates plus recent outcomes; acquisition algorithms are deferred to PR166.                                  |
| 33  | Per-participant match stats/team accounting and compact facts, without NPC action histories.                                                               |
| 34  | Yes, fixture completion fact + result fingerprint; identical duplicate is a no-op, conflict rejected, including after reload.                              |
| 35  | Yes, validated session starts the canonical engine headlessly; two full fixture runs compare deterministically.                                            |
| 36  | Stable visual/player/stadium references and separate seeds support expansion; football model changes require versioning.                                   |

Next stages: PR165 Visual DNA & Character Creator; PR166 Career–Match Integration &
Playstyles; PR167 NPC Development & Footballer Diversity; PR168 Coaches, Match
Briefings & Tactical Intelligence; PR169 Career Stories, News & Season Narratives;
PR170 Match Atmosphere & Stylized Visual Polish.
