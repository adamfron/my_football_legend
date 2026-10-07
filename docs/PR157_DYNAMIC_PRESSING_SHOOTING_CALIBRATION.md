# PR157 — Dynamic Pressing, Ball-Carrier Response & Shooting Difficulty Calibration

Base: merged PR156/main `83570049ef86622f9ebefd26e3afc6bb654ae6ba`.
Final on-disk match-engine source fingerprint: `977e70b1e12438eb6803ad9e8a114939f313f122d116f7e76577fce49fc25d3a`.
The fingerprint hashes sorted non-test TypeScript paths and raw file bytes in
`src/core/matchSimulation`, separated by NUL; it is a Windows working-snapshot
fingerprint, not a Git tree hash. The validation manifest also records content hashes.
Its line-ending-normalized source digest is
`247b88d08cda9c63d148ec2f95ed9215d17096d404122c5c206c09e8f1e79711`.

## Implementation order and scope

1. Read the current state/audit/handoff and PR156/PR145 evidence; preserve an immutable
   merged-main checkout. Reproduce target/reach mismatch and gather paired baseline
   pressing/shooting measurements before changing the corresponding mechanics.
2. Give pressing a continuous commitment and contain/screen/engage/emergency intention;
   align tactical and actual movement targets with the existing contact geometry.
   Keep aggression separate from challenge quality. Make carrier footwork/routes respond
   to physical momentum and retain local support/cover assignments.
3. Calibrate shared shot execution before adjusting its expected-placement utility.
   Isolate attributes, contact difficulty and keeper ability; fix confirmed pressure,
   diagonal-ray, generated-header targeting and first-boundary defects.
4. Repeat paired micro matrices, then four fixture families ×three seeds ×90 minutes
   in both revisions. A full-match prototype exposed excessive committed contact:
   safe standing priority and prepared-contact geometry corrected it. Preserve that
   failed experiment separately rather than presenting it as final evidence.
5. Verify ownership/determinism/observer independence, regenerate full telemetry
   references honestly, measure performance without competing matrix workers, run
   the complete repository verification, and update the handoff/roadmap.

The canonical step remains **0.025 s**. Human and NPC actors use the same physical
resolvers. No role quota, stat target, hidden strength multiplier, forced-release or
forced-tackle timer, stun, teleport, new skill attribute, or second match engine was
introduced. PR158 owns richer restart/free-kick interaction; PR159 owns fatigue,
injuries/substitutions/added time; PR160 owns presentation/replay/stadium polish.

## Pressing measurement definition

An episode begins with a closing approach within12m (or contain/screen within4m),
then records contact/release/escape/handoff/recovery. Static means controlled ball,
distance≤2.6m, both actor speeds and ball motion relative to the carrier body <0.35m/s,
no active challenge and an unchanged football solution lasting≥2s. This timer is
an observer only. Repeating a decision index or restarting an identical carry identity
does not reset it; actual action/mode/microphase, target/lane/cover changes do.
The corrected definition was used for both final revisions. Earlier static counts
are superseded and are not mixed into the comparison.

Assignment is sampled at4Hz; expensive context/ranking/structure probes at1Hz;
physical motion and stationarity at40Hz. Storage retains≤256 episode summaries,
≤8 evolution samples each, exact totals and a241-bin duration histogram (last bin
is≥240s). Full-match files publish≤9 representative episodes per match; totals cover
every observed episode. Quantiles are one-second bins, not exact percentiles.

Across all12 paired matches, final corrected-observer static incidence was
**164/13126 (1.25%) → 10/16243 (0.06%)**. The fixture/seed tables below expose heterogeneity.
An episode is not the same as a tackle; pressure-associated pass/reset is not proof
that a defender causally forced that decision. The combined escape/shape-recovery
ending is not a pure successful-dribble count.
`staticSeconds` sums close stationary candidate intervals, including brief stops;
only `staticEpisodes` applies the continuous two-second threshold. More shielding or
stationary high-pressure seconds can therefore coexist with fewer prolonged static
episodes. Balanced/native/high-press rows have more such stationary time, fewer shots
and lower completion despite more carrier/team movement; this is a remaining
pressure-density and attacking-response calibration weakness, not a uniform improvement.

Final pressing runtime is frozen at 2026-10-07 T22:05:15.172 Z.
Current source hash: `977e70b1e12438eb6803ad9e8a114939f313f122d116f7e76577fce49fc25d3a` (77 files).
Baseline source hash: `f1c194c4ce225cfd8e8e648323e377d0aaa31b5ec4058388643df9306e873204` (75 files), commit `83570049ef86622f9ebefd26e3afc6bb654ae6ba`.
Hash scope is sorted non-test .ts files in src/core/matchSimulation, relative path + NUL + source bytes + NUL. The wider integrity fingerprint has a separate documented scope. These four matrices ran on the frozen source; fingerprints were appended after source verification, as recorded in their provenance. The benchmark now fingerprints before/after every future run.

## Confirmed bugs and physical corrections

The tactical target and a separate radial movement override could stop outside the shared challenge envelope. Both now use the pure schema-validated derivePressingPlan projection: contain/screen/engage/emergency, continuous commitment, target, stand-off, booking, cover and reason. Engage moves toward the exposed ball shoulder via a short orbit, with carrier velocity anticipation. Contain deliberately holds space. The nearest-player override has an 18 m locality limit. Remote defenders make a smaller locality-weighted structural shift; formation and dangerous-receiver protections remain.

The shield-only .72 m action eligibility gate was geometrically inconsistent with the existing .95 m physical poke: 1.15 m body stand-off minus .32/.38 m safe-side ball offset is .83/.77 m. Its removal aligns action eligibility with the unchanged shared resolver; stricter shield facing alignment remains. No resolver tackle radius was enlarged.

Cooperative primary screening holds the goal-side body position at 1.12 m without an artificial central lateral shift, allowing the arriving partner to challenge a different angle. Otherwise shielding followed the secondary forever. Existing primary episode locks still prevent another challenge. All 8 cooperative tests retain contact, zero-foul, no-teleport, coverage and determinism assertions.

The first exploratory full-match implementation had a separate serious selection defect: safe reachable standing contact was routinely ranked below slower committed contact. Native first-seed exploration produced 491 attempts/83 fouls, including 363 committed attempts/69 fouls. These exploratory outputs are superseded. Final selection prioritises the attainable comfortable standing contact. If the chosen shoulder offers that physical solution, the player continues approaching. Prepared committed/slide contacts instead predict relative ball and body position at the existing .1/.18 s contact time, including shielding's safe-side touch. They require exposed aligned ball access. No timer, quota, random foul budget, resolver quality modifier or foul-roll change was added.

Aggression changes commitment and selected risk. Tackling remains physical quality; it is absent from the commitment formula. Composure, reading, cover, phase, score, time, booking and real danger adjust willingness. Issued and queued bookings are soft contextual penalties. Immediate central DOGSO at progress>=88 permits even cautious/booked closing, without forcing contact. Cautious ordinary stationary final-third containment still occurs and is documented below.

Carrier finite-footprint footwork now reassesses pressure direction and projected presser momentum. Carry route candidates score projected defender trajectories, and urgent approach can invalidate route hysteresis. Actual turning/acceleration create separation; the original selected destination stays unchanged. There is no stun, guaranteed escape roll, forced release or elapsed-hold tackle trigger.

## Protocol and corrected data

Core: 122 cells × 32 paired repetitions = 3904 six-second duels per revision. Risk extension: 15 cells × 32 = 480, with three late-trailing cells overlapping the core. Distinct core+extension total is 134 cells/4288 duels; fixed-contact rows repeated in extension files are duplicates, not extra evidence. Core fixed contact: 40 cells × 128 = 5120 identical forced standing attempts per revision.

Every skill is 60 except the reported attribute(s). Seeds depend on repetition only. Attacker and defender aggression/tackling/reading/positioning/composure/strength/pace/agility plus attacker dribbling/technique/composure/pace are isolated where relevant. The player model has no separate balance or acceleration attribute: existing agility is body recovery and pace/agility/strength feed derived physical acceleration. Emergency stress profiles explicitly set Tackling/Reading/Positioning 90 and Composure 10, rather than claiming an aggression-only comparison to ordinary cells.

The earlier late-trailing fixture incorrectly set 83 minutes while retaining first_half, ending the half on its first tick. All four final matrices were fully rerun with second_half for those contexts. Earlier aggregate 2173/648 and provisional 751/2849 static/attempt values are invalidated; use the numbers below.

Static micro diagnostic: both actors<.25 m/s within 2.5 m, controlled ball relative speed<.3 m/s, no active challenge or action/intent/micro-phase change, no target/ball displacement>.35 m over a continuous second. This describes the two actors, not whole-team freezing; support may still move. Most fixtures hold the major action cooldown at 20 s to isolate physical response; release cells permit ordinary choices. Therefore this is not the natural full-match static rate. The external full-match observer adds meaningful action and tactical/cover/escape changes and gives the stronger lifecycle result.

All per-cell approaches, minimum distance, contact speeds, containment, techniques, body contacts, clean/loose/beaten/foul/card counts, moving carrier, release/escape/retention, local teammate movement, cooperative assignment and structural proxy samples are in JSON. Actual issued card identities are counted; advantage-pending cards are not counted as issued. Uncovered-central-receiver samples are a proxy, not attributed conceded chances. Traces are bounded to 2/cell; float presentation is 6 decimal places. Wall times include concurrent workloads and are not performance evidence.

## Core aggregate

| Revision | duels | local static | %     | attempts | body contacts | clean | loose | beaten | fouls | issued cards |
| -------- | ----- | ------------ | ----- | -------- | ------------- | ----- | ----- | ------ | ----- | ------------ |
| PR156    | 3904  | 2213         | 56.69 | 738      | 712           | 349   | 125   | 233    | 31    | 0            |
| PR157    | 3904  | 801          | 20.52 | 2761     | 2419          | 1434  | 487   | 790    | 22    | 0            |

## Isolated aggression: commitment is distinct from quality

32 stationary clean-control paired duels per row; all other skills 60. All baseline bands had 0 attempts and 32 local static episodes. Commitment is observable even when safe geometry rejects a contact: there is no universal monotonic challenge count once opponents respond physically.

| Aggression | attempts | frequency % | body | clean | beaten | fouls | approach s | min distance m | contact m/s | contain s | carrier m | techniques               |
| ---------- | -------- | ----------- | ---- | ----- | ------ | ----- | ---------- | -------------- | ----------- | --------- | --------- | ------------------------ |
| 10         | 0        | 0.0         | 0    | 0     | 0      | 0     | 1.902      | 2.346          | —           | 6.000     | 0.927     | —                        |
| 30         | 0        | 0.0         | 0    | 0     | 0      | 0     | 1.859      | 2.244          | —           | 6.000     | 0.929     | —                        |
| 60         | 32       | 100.0       | 32   | 13    | 12     | 0     | 0.978      | 0.971          | 0.898       | 0.872     | 2.295     | standing:32              |
| 90         | 25       | 78.1        | 8    | 15    | 7      | 0     | 0.978      | 1.109          | 2.140       | 0.248     | 2.377     | committed:21, standing:4 |
| 100        | 27       | 84.4        | 6    | 12    | 7      | 0     | 0.978      | 1.121          | 2.081       | 0.284     | 2.404     | committed:24, standing:3 |

Higher aggression closes much sooner and spends less time containing, but the 60 cell produces 32 comfortable standing contacts versus 25/27 attempted contacts at 90/100. Aggressive movement can miss a legal forecast window; increasing willingness does not mean every aggressive press tackles. At fixed identical forced contact, all aggression bands produce 55 clean/23 loose/49 beaten/1 foul out of 128: aggression supplies no contact-quality bonus.

Risk is contextual rather than strictly monotonic. Stationary aggression sweep produces 0 fouls in every final band. Heavy-touch 60→90 increases beaten 8/32→10/29 and foul 0/32→1/29, with clean 18→11; slow carry 30→90 increases beaten 13/32→19/46 and committed actions 0→46, but fouls remain 0. These samples do not establish a universal monotonic aggression→foul rate. Existing resolver physics still makes high-speed/rear/body-first contact risky. Overall core fouls 31→22 after safe selection; this is not a reason to re-inject an arbitrary aggression foul multiplier.

## Physical quality at fixed aggression/contact

128 paired reachable standing contacts, all other skills 60, aggression 60. The resolver itself is unchanged from baseline.

| Tackling | clean | loose | beaten | fouls |
| -------- | ----- | ----- | ------ | ----- |
| 10       | 36    | 18    | 72     | 2     |
| 30       | 41    | 24    | 62     | 1     |
| 60       | 55    | 23    | 49     | 1     |
| 90       | 68    | 21    | 38     | 1     |
| 100      | 72    | 24    | 31     | 1     |

| Isolated skill | band | clean | loose | beaten | fouls |
| -------------- | ---- | ----- | ----- | ------ | ----- |
| gameReading    | 10   | 40    | 24    | 63     | 1     |
| gameReading    | 100  | 67    | 19    | 41     | 1     |
| positioning    | 10   | 40    | 24    | 63     | 1     |
| positioning    | 100  | 67    | 19    | 41     | 1     |
| strength       | 10   | 48    | 23    | 56     | 1     |
| strength       | 100  | 60    | 19    | 48     | 1     |

Naturally evolving approach sweeps can change contact timing and geometry, so they are not substitutes for fixed-contact quality isolation. Complete five-band data for each dimension remains in the JSON.

## Yellow-card distribution

Same 32 stationary duels after PR157; booked and unbooked pairs share seeds and skills. A yellow card shifts ordinary risk substantially but does not make all contact impossible.

| Aggression | unbooked attempts | booked attempts | unbooked / booked contact m/s | unbooked / booked containment s | booked techniques | booked clean / beaten / fouls |
| ---------- | ----------------- | --------------- | ----------------------------- | ------------------------------- | ----------------- | ----------------------------- |
| 10         | 0                 | 0               | — / —                         | 6.000 / 6.000                   | —                 | 0/0/0                         |
| 30         | 0                 | 0               | — / —                         | 6.000 / 6.000                   | —                 | 0/0/0                         |
| 60         | 32                | 0               | 0.898 / —                     | 0.872 / 6.000                   | —                 | 0/0/0                         |
| 90         | 25                | 0               | 2.140 / —                     | 0.248 / 6.000                   | —                 | 0/0/0                         |
| 100        | 27                | 22              | 2.081 / 0.691                 | 0.284 / 0.105                   | standing:22       | 13/4/0                        |

Booked aggression 100 still finds 22 standing contacts (13 clean/4 beaten/0 foul), compared with unbooked aggression 30 zero. In emergency-run stress cells, booked 30/60 use 33/35 standing contacts, while booked 90 retains 36 slides. Actual second-yellow dismissal occurs once in booked 30, proving physical contact/card risk is not disabled by booking. Issued-card counts may differ from foul counts because some cards stay pending under advantage at the six-second endpoint.

## Attacker execution and defender interaction

Each row 32 duels at defender aggression 90, with dribbling/agility varied together only in the four interaction rows. Multiple attempts may follow genuine spatial separation; close-pair re-arm protections remain unchanged.

| Tackling | attacker dribbling/agility | attempts | clean | beaten | fouls | carrier m |
| -------- | -------------------------- | -------- | ----- | ------ | ----- | --------- |
| 30       | 30                         | 40       | 24    | 11     | 0     | 3.790     |
| 30       | 90                         | 47       | 12    | 26     | 1     | 7.298     |
| 90       | 30                         | 33       | 26    | 1      | 0     | 1.825     |
| 90       | 90                         | 34       | 13    | 14     | 1     | 6.050     |

| Isolated attacker skill | band | attempts | clean | beaten | fouls | carrier m | moving s |
| ----------------------- | ---- | -------- | ----- | ------ | ----- | --------- | -------- |
| dribbling               | 10   | 40       | 23    | 7      | 0     | 5.023     | 2.441    |
| dribbling               | 100  | 41       | 18    | 17     | 1     | 5.256     | 2.527    |
| technique               | 10   | 36       | 27    | 4      | 0     | 2.934     | 1.447    |
| technique               | 100  | 39       | 19    | 10     | 0     | 4.133     | 2.040    |
| agility                 | 10   | 40       | 25    | 9      | 2     | 4.042     | 1.795    |
| agility                 | 100  | 47       | 18    | 19     | 0     | 6.295     | 2.993    |
| composure               | 10   | 38       | 28    | 7      | 0     | 3.639     | 1.795    |
| composure               | 100  | 39       | 21    | 8      | 0     | 3.891     | 1.919    |
| pace                    | 10   | 41       | 24    | 13     | 2     | 4.313     | 2.129    |
| pace                    | 100  | 41       | 24    | 9      | 3     | 4.938     | 1.880    |

Stronger attackers generally expose an aggressive presser: at Tackling 30, opposition 30→90 increases beaten 11→26 and carrier movement 3.790→7.298 m. Tackling 90 improves comparable weak opposition to 26 clean/1 beaten. Composure/pace effects in these short carry cells are not strictly monotonic, so no universal skill ordering is claimed from their endpoints.

## Context matrix at aggression 60

32 paired duels per row, skills 60. This table preserves stationary risk contexts and non-tackle outcomes. Full 30/60/90 context cells are in the machine-readable matrix.

| Context       | PR156 / PR157 attempts | PR156 / PR157 local static | PR157 contain s | PR157 clean / beaten / fouls | carrier m | local support m | cooperative s | techniques               |
| ------------- | ---------------------- | -------------------------- | --------------- | ---------------------------- | --------- | --------------- | ------------- | ------------------------ |
| stationary    | 0/32                   | 32/0                       | 0.872           | 13/12/0                      | 2.295     | 147.466         | 0.000         | standing:32              |
| slow          | 16/41                  | 0/0                        | 1.410           | 21/15/0                      | 7.223     | 88.295          | 0.000         | standing:36, committed:5 |
| fast          | 0/0                    | 0/0                        | 0.000           | 0/0/0                        | 8.632     | 9.943           | 0.000         | —                        |
| heavy_touch   | 0/32                   | 32/0                       | 0.637           | 18/8/0                       | 1.669     | 128.485         | 0.000         | standing:31, committed:1 |
| clean         | 0/32                   | 32/0                       | 0.872           | 13/12/0                      | 2.295     | 147.466         | 0.000         | standing:32              |
| shield        | 0/0                    | 0/0                        | 0.000           | 0/0/0                        | 4.525     | 198.285         | 0.213         | —                        |
| touchline     | 0/1                    | 32/0                       | 4.898           | 1/0/0                        | 1.514     | 101.226         | 0.000         | committed:1              |
| danger        | 32/32                  | 15/8                       | 1.160           | 19/8/0                       | 0.775     | 3.405           | 0.000         | standing:32              |
| good_cover    | 0/32                   | 32/0                       | 0.872           | 13/12/0                      | 2.295     | 147.466         | 0.000         | standing:32              |
| poor_cover    | 0/0                    | 5/32                       | 6.000           | 0/0/0                        | 1.252     | 183.996         | 0.000         | —                        |
| cooperative   | 0/0                    | 0/0                        | 0.000           | 0/0/0                        | 3.432     | 198.327         | 5.180         | —                        |
| booked        | 0/0                    | 32/32                      | 6.000           | 0/0/0                        | 1.262     | 193.867         | 0.000         | —                        |
| late_trailing | 32/32                  | 11/14                      | 2.000           | 17/14/0                      | 0.889     | 5.943           | 0.000         | standing:32              |
| turned        | 0/32                   | 32/0                       | 0.887           | 17/12/0                      | 2.437     | 144.457         | 0.000         | standing:32              |
| moving_press  | 16/33                  | 0/0                        | 2.195           | 10/10/0                      | 8.673     | 134.912         | 0.000         | standing:30, committed:3 |
| release       | 0/19                   | 0/0                        | 0.044           | 10/4/0                       | 3.220     | 23.153          | 0.000         | standing:19              |

Good-cover 60 allows 32 contacts; poor-cover 60 zero with 6 s containment. Cautious moving-press 30 still obtains 8 clean/3 loose with 2.306 s containment and 28 safe standing attempts; it need not always engage aggressively to intervene. Ordinary release cells yield 16/17/17 reset passes at aggression 30/60/90, rather than 32/32/32 baseline resets; earlier tackles compete with a normal release. This is not an automatic-pass policy.

Cooperative shielding remains moving retention:32/32 retentions,3.432 m carrier movement,5.288 moving seconds,5.180 s secondary assignment and 198.327 m cumulative local teammate movement. Baseline also retained 32/32 at 3.563 m/5.547 s, so the micro matrix does not prove invincible shielding has been cured in natural play. Explicit pincer tests do reach the physical standing envelope; full-match lifecycle evidence is still necessary.

Local support already responded strongly in baseline: stationary 60 support 194.628 m versus 147.466 m after, partly because after duels end sooner. Actual movement is not latency or evidence of newly created options by itself. New local pressure compression, receiver coverage tests and root observer option/cover measurements support the structural interpretation. The uncovered-central-receiver proxy is 0 in these controlled cells, so it cannot establish the absence of natural defensive-shape failures.

## Risk extension and late-trailing fixture

32 paired duels per row. Late-trailing is stationary 83 min/x 83 m; immediate DOGSO is central/x 91 m. Emergency run/booked emergency explicitly use 90 tackle/reading/positioning,10 composure and 3.5 m/s advancing carry. Tactical-break starts x 72 m with poor cover.

| Context / aggression | PR156 attempts / clean / beaten / foul / cards | PR157 attempts / clean / beaten / foul / cards | PR156 / PR157 local static | PR157 techniques | PR157 contact m/s | PR157 contain s |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- | -------------------------- | ---------------- | ----------------- | --------------- |
| late_trailing/30     | 26/13/11/1/0                                   | 0/0/0/0/0                                      | 18/32                      | —                | —                 | 6.000           |
| late_trailing/60     | 32/17/10/1/0                                   | 32/17/14/0/0                                   | 11/14                      | standing:32      | 1.220             | 2.000           |
| late_trailing/90     | 32/17/10/1/0                                   | 32/19/12/0/0                                   | 11/12                      | standing:32      | 1.205             | 1.712           |
| emergency_run/30     | 24/19/1/0/0                                    | 36/24/6/0/0                                    | 0/0                        | slide:36         | 5.067             | 0.499           |
| emergency_run/60     | 24/19/1/0/0                                    | 36/24/5/0/0                                    | 0/0                        | slide:36         | 5.074             | 0.463           |
| emergency_run/90     | 24/19/1/0/0                                    | 36/24/5/0/0                                    | 0/0                        | slide:36         | 5.041             | 0.480           |
| booked_emergency/30  | 0/0/0/0/0                                      | 33/23/1/1/1                                    | 0/0                        | standing:33      | 2.104             | 1.938           |
| booked_emergency/60  | 0/0/0/0/0                                      | 35/24/4/1/0                                    | 0/0                        | standing:35      | 3.656             | 0.417           |
| booked_emergency/90  | 24/19/1/0/0                                    | 36/23/5/0/0                                    | 0/0                        | slide:36         | 5.073             | 0.463           |
| tactical_break/30    | 0/0/0/0/0                                      | 13/6/5/0/0                                     | 0/0                        | standing:13      | 1.586             | 5.888           |
| tactical_break/60    | 7/4/2/0/0                                      | 45/17/18/0/0                                   | 0/0                        | committed:45     | 4.470             | 1.561           |
| tactical_break/90    | 26/0/0/26/0                                    | 45/13/21/0/0                                   | 0/0                        | committed:45     | 4.384             | 1.659           |
| immediate_dogso/30   | 29/15/8/0/0                                    | 32/19/8/0/0                                    | 14/8                       | standing:32      | 1.321             | 1.158           |
| immediate_dogso/60   | 32/14/15/0/0                                   | 32/14/13/0/0                                   | 15/13                      | committed:32     | 2.791             | 1.886           |
| immediate_dogso/90   | 32/14/15/0/0                                   | 32/16/12/0/0                                   | 15/0                       | committed:32     | 2.790             | 1.740           |

Unresolved limitation: cautious late-trailing 30 has 32 local stationary duels/0 contacts versus baseline 18/26. This is x 83 ordinary stationary danger, not the x 91 immediate-DOGSO override. Teammates still move 13.594 m cumulatively, and major action choice is deliberately held. It is a real micro-level passive case; the PR should not describe all stationary pressure as fixed. Higher-aggression late 60/90 make 32 standing attempts and 17/19 clean outcomes. Immediate cautious DOGSO improves 29→32 attempts,15→19 clean,14→8 local static. There is no forced challenge after a fixed number of seconds.

## Short natural native check after foul-explosion correction

Paired 10 minutes, seed lab-muwhj 3 er, native 4-3-3 balanced vs 4-4-2 pressing, spectators. These runs use the normal observer and ordinary autonomous choices. They are smoke evidence, not the final 90 min flow matrix.

| Revision             | attempts | attempts/min | clean | loose | beaten | missed | fouls | yellow | red | static whole episodes | carrier m |
| -------------------- | -------- | ------------ | ----- | ----- | ------ | ------ | ----- | ------ | --- | --------------------- | --------- |
| PR156                | 2        | 0.20         | 0     | 1     | 0      | 0      | 1     | 0      | 0   | 0                     | 100.524   |
| PR157 safe selection | 56       | 5.60         | 30    | 7     | 16     | 1      | 2     | 0      | 0   | 0                     | 296.176   |

| PR157 technique | attempts | clean | beaten | fouls |
| --------------- | -------- | ----- | ------ | ----- |
| standing        | 26       | 15    | 6      | 0     |
| slide           | 7        | 2     | 5      | 0     |
| committed       | 23       | 13    | 5      | 2     |

## Final native natural 90-minute paired matrix

Three native spectator seeds use the corrected lifecycle observer. Pressure-episode denominator includes physical-geometry/primary-player handoffs, so attempts per episode is an aggregate ratio rather than the probability that an eligible episode tackles. Many physical attempts fall outside an observer pressure episode.

| Seed / revision        | pressure episodes | attempts | attempts/min | attempts/episode | clean | loose | beaten | missed | fouls | local whole static |
| ---------------------- | ----------------- | -------- | ------------ | ---------------- | ----- | ----- | ------ | ------ | ----- | ------------------ |
| lab-muwhj 3 er/PR156   | 1003              | 89       | 0.989        | 0.0887           | 30    | 10    | 24     | 4      | 21    | 3                  |
| lab-muwhj 3 er/PR157   | 1405              | 400      | 4.444        | 0.2847           | 178   | 55    | 147    | 2      | 18    | 2                  |
| pr 155-natural-b/PR156 | 1298              | 143      | 1.589        | 0.1102           | 71    | 15    | 30     | 3      | 24    | 3                  |
| pr 155-natural-b/PR157 | 1413              | 416      | 4.622        | 0.2944           | 184   | 75    | 137    | 1      | 19    | 1                  |
| pr 155-natural-c/PR156 | 948               | 52       | 0.578        | 0.0549           | 17    | 5     | 13     | 2      | 15    | 2                  |
| pr 155-natural-c/PR157 | 1341              | 421      | 4.678        | 0.3139           | 180   | 65    | 149    | 3      | 24    | 0                  |

| PR157 seed / technique     | attempts | clean | loose | beaten | missed | fouls |
| -------------------------- | -------- | ----- | ----- | ------ | ------ | ----- |
| lab-muwhj 3 er/standing    | 212      | 101   | 30    | 79     | 1      | 1     |
| lab-muwhj 3 er/slide       | 23       | 10    | 0     | 12     | 0      | 1     |
| lab-muwhj 3 er/committed   | 162      | 67    | 25    | 56     | 1      | 13    |
| lab-muwhj 3 er/tactical    | 3        | 0     | 0     | 0      | 0      | 3     |
| pr 155-natural-b/standing  | 250      | 106   | 50    | 89     | 1      | 4     |
| pr 155-natural-b/slide     | 16       | 7     | 4     | 2      | 0      | 3     |
| pr 155-natural-b/committed | 147      | 71    | 21    | 46     | 0      | 9     |
| pr 155-natural-b/tactical  | 3        | 0     | 0     | 0      | 0      | 3     |
| pr 155-natural-c/standing  | 241      | 100   | 42    | 92     | 3      | 4     |
| pr 155-natural-c/committed | 152      | 68    | 20    | 53     | 0      | 11    |
| pr 155-natural-c/tactical  | 6        | 0     | 0     | 0      | 0      | 6     |
| pr 155-natural-c/slide     | 22       | 12    | 3     | 4      | 0      | 3     |

| PR157 seed       | successful-tackle pressure outcomes | loose-ball pressure outcomes | backwards resets | pressure releases | press handoffs | foul pressure outcomes |
| ---------------- | ----------------------------------- | ---------------------------- | ---------------- | ----------------- | -------------- | ---------------------- |
| lab-muwhj 3 er   | 177                                 | 55                           | 249              | 443               | 456            | 14                     |
| pr 155-natural-b | 182                                 | 74                           | 223              | 453               | 460            | 8                      |
| pr 155-natural-c | 173                                 | 65                           | 257              | 412               | 394            | 21                     |

Native total 284→1237 attempts across 270 minutes,1.052→4.581/min (4.36×), with pressure episodes 3249→4159 and aggregate attempts/episode.0874→.2974. Fouls 60→61, clean 118→542, loose 30→195, beaten 67→433, missed 9→6. The density increase remains explicit calibration risk despite the exploratory first-seed 83 fouls falling to 18. Per-seed first 400 vs 89 is 4.49×. First strong/weak 185 attempts/8 fouls versus 90/3 is detailed in the final full matrix below. Unchanged episode/re-arm tests prevent repeated 25 ms close-pair contact, but alone do not prove that natural tackle density or reclaim cadence is acceptable. The full-match episode/outcome/technique and possession-flow measurements are authoritative for that question. Source is not being tuned to force historical aggregate rates.

## Explicit numeric answers to the ten pressing questions

1. PR156 native natural whole-pressure static:8/3249 episodes=.246%. Core micro local static:2213/3904=56.69%. The micro physical-isolation diagnostic has a different meaning and denominator; it is not the natural freeze rate.
2. PR157 native natural whole-pressure static:3/4159=.072%. Same micro protocol:801/3904=20.52%. Cautious intentional containment remains. Other natural formations/levels appear in the full-match tables below.
3. Aggression 30→90 stationary:0→25 attempts,6→.248 s containment,2.244→1.109 m minimum distance,0→21 committed actions. At 60 there are 32 standing contacts; frequency is not strictly increasing 60→90. Slow carry 30→90 gives 32→46 attempts.
4. Contextual risk increase is observed but not universal: heavy-touch 60→90 gives 8→10 beaten and 0→1 foul, clean 18→11. Slow carry gives 13→19 beaten 30→90, with 0 fouls throughout. Stationary final sweeps all 0 fouls; no strict monotonic foul claim. Overall core 31→22 fouls.
5. Fixed 128 paired standing contacts, aggression 60: Tackling 10→100 increases clean 36→72 and lowers beaten 72→31. Sweeping Aggression 10→100 at identical contact leaves 55 clean/49 beaten/1 foul unchanged.
6. At Aggression 90 yellow changes 25 attempts→0 and.248→6 s containment. At 100 it changes 27 mixed contacts→22 standing,2.081→.691 m/s contact;13 clean/4 beaten/0 foul remain. Booked emergency 30 still 33 standing with 1 actual second-yellow; booked 90 still 36 slides.
7. Cautious moving-press 30:28 standing attempts,8 clean/3 loose,2.306 s containment,21 active-containment endpoint outcomes. Cautious stationary 30 holds 6 s without contact. Release 30 yields 16 backwards resets; interpretation remains context-sensitive.
8. Aggressive moving contest vs dribbling/agility 90 at Tackling 30:26 beaten/47 attempts,1 foul; carrier 7.298 m. Heavy-touch 90 loses 10/29 with 1 foul. Strong attacker/weak tackle remains costly.
9. Stationary 60 carrier movement.634→2.295 m and moving time.925→2.841 s; stationary 90 .634→2.377 m/.925→3.470 s. Active responses improve in those geometries. Cooperative shield movement 3.563→3.432 m, not an improvement; retention remains 32/32. All carry destination and momentum tests preserve physical choices.
10. Teammates move: stationary 60 local attacking distance 194.628→147.466 m with shorter duels; cooperative 198.046→198.327 m and secondary assignment 5.155→5.180 s. Controlled structural proxy 0; creation/closure of options needs root's lifecycle option/cover counters and is not proved by movement alone.

## Tests and historical contract changes

125 focused tests across 8 files pass: PR157: 12, PR147/PR148: 55, cooperative 8, PR154/locomotion 20, PR148 agency/cadence 30. Targeted ESLint passes. Root owns full npm verify, determinism/agency/observer ownership hashes, PR156 passing regressions, performance and final 12 paired natural flow games.

Historical assertions were strengthened rather than weakened to retain old outputs:

- PR147 “NPC high-risk intent enters the same canonical physical resolver”: present .7 m safely reachable ball now correctly chooses standing. Fixture changes to .9 m ball with 5 m/s relative cross-press, retaining exact tactical/autonomous_npc/foul assertions.
- PR148 “booked defenders and an already queued booking suppress ordinary risky choices”: same new risky geometry asserts unbooked tactical, booked undefined; then .5 m safe ball admits standing, including pending booking. Old non-standing expectation on an immediately comfortable poke was invalid.
- PR148 “a booked NPC can still commit when exceptional danger, temperament and late score justify it”: .95 m exposed ball and closing velocities beyond comfortable reach now assert slide specifically, stronger than merely non-standing.
- PR148 poor-cover routine intention now asserts containment while safe exposed standing remains available; low reading no longer disables aggressive temperament. PR157 covers good cover→poor cover→danger transitions explicitly.
- PR154 cautious forward test holds Tackling 20→80 with identical target, then Aggression 30→100 changes stand-off. Fixed 96 seed aggression/quality comparison replaces interchangeable-skill semantics.
- PR157 regressions explicitly require maximum-aggression standing priority and reject prepared contact when a projected safe-side shield makes the same current ball geometry inaccessible. No RNG-quality expectation was changed.

Guarded re-arm fixtures remain explicit in PR148: “does not reopen a close unchanged contest after its short recovery timer, but releases on separation”; “a genuinely different attacker can challenge immediately without a global lock”; “a clean win advances possession without re-arming the close pair until a football release”. They protect the original per-pair recovery/episode semantics and allow independent participants. They do not assert a historical match-wide tackle quota or exclude rapid different-participant ownership changes on their own.

## Reproduction

Use the configured Node runtime and existing scripts/registerTypescriptLoader.mjs. The default core matrix commands are:

`npm run benchmark:pressing -- --repetitions=32 --out=docs/performance/PR157-pressing-after.json`

`npm run benchmark:pressing -- --engine-root=../baseline --repetitions=32 --out=docs/performance/PR157-pressing-before.json`

Risk extension: append `--contexts=emergency_run,booked_emergency,tactical_break,immediate_dogso,late_trailing`, writing corresponding risk-before/risk-after files. Full-match and integrity reproduction is in root's final report. No external football target rates were imposed, and no realism claim follows merely from these semantic tests.

## Provenance and bounded method

Pristine merged main baseline: 83570049. Both main revisions use the same 283-cell matrix, 64 paired release seeds per cell (18,112 physical attempts each): 49 distance cells, 119 context cells, 91 isolated-attribute cells, and 24 keeper cells. Distance: 4/8/12/16/20/25/32m; skill bands: 5/10/20/40/60/80/100. Context coverage includes two noncentral angles (0.35/0.65 radians), placed/driven/chip, first-time speed14/26m/s, half-volley, volley, header, turned body, weak foot, geometric pressure, blocker, and the actual existing direct free-kick restart/wall lifecycle. This is a tractable subset, not a cross-product of every angle/range/contact.

Main final shooting source hash: 977e70b1e12438eb6803ad9e8a114939f313f122d116f7e76577fce49fc25d3a. Generated-header supplement uses 977e70b1e12438eb6803ad9e8a114939f313f122d116f7e76577fce49fc25d3a. Hash convention is SHA256 over sorted non-test matchSimulation source paths relative to that directory, NUL-separated paths and bytes. Main and generated-header after runs use the same final frozen PR157 source, matching the current non-test canonical source hash.

Baseline totals: {"attempts":18112,"rejected":0,"unresolved":0,"trajectoryParityFailures":512}. Final totals: {"attempts":18112,"rejected":0,"unresolved":0,"trajectoryParityFailures":0}. Keeper parity compares actual launch velocity, intended execution error, and actual sampled goal target across keeper bands for the same shooter/seed: baseline 512 mismatches, final 0. Main baseline runtime 163.9s; final 217.5s. These micro-lab wall times were CPU-contended and are **not** an equivalent full-match performance measurement; use root's controlled flow/performance evidence.

Each attempt executes the canonical action and steps the actual ball/movement/CCD pipeline at 0.025s until its first physical result (maximum8s). Fixed action cooldown prevents unrelated later actions. No counter-driven success gate, fallback goal, quota, or frequency change was added. Auxiliary projections never resolve outcomes. Diagnostic storage is compact aggregate cells, without per-tick histories.

## Units and definitions

All on-target/goals tables below show counts out of64. Public on-target means final goal or save; projectedOnTarget is the unobstructed release trajectory's physical goal-plane classification. Blocks and frame contacts are separate. Keeper contacts count every resolved shot carrying keeperId, including passive-body contacts (all goalkeeper-kind contacts attach that identity in finishShotContact). Contacts minus saves gives non-save keeper contacts; it is not an exact passive-only classifier, because passive bodies may also resolve saves when the projection permits. Failed keeper contacts become blocks. The raw files expose every funnel stage, contact type, launch speed, quality distribution and release-time keeper reaction/reach distribution.

Horizontal error is mean absolute sampled target-coordinate error ×3.66m; vertical is ×2.44m. These represent execution error at the target plane, not a replacement for integrated ball height/drag/keepers. Prior PR145 prose called normalized sigma “metres”; old code's horizontal sigma0.12 represented0.4392m and vertical0.10 represented0.244m. New profiles record both normalized and explicit metre sigma.

ExecutionQuality is skill/contact/pressure execution quality. It intentionally omits range, angle and target-window penalties; those affect intrinsicDifficulty and spatial sigma. Equal quality across distances does not mean equal precision. Intrinsic context is continuous and independent of Finishing/Technique/Composure; current weak-foot context already includes the existing competence measurement. No nonexistent Balance/Acceleration/ShotPower attribute was introduced. Agility supplies body control, Heading is the primary header placement skill.

Pressure recipes0.45/0.9 position a defender at fixed separation; actual measured shooting pressure is0.279/0.556. Report those actual values, rather than calling the recipes measured pressure.

## Fixed ability × distance

Each cell is pristine→PR157 final public on-target/64. Keeper starts12m to the side, leaving an open goal; very slow long-range trajectories can still allow legitimate later recovery.

| Bundle ability | 4m    | 8m    | 12m   | 16m   | 20m   | 25m   | 32m   |
| -------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| 10             | 46→64 | 39→60 | 38→56 | 38→52 | 35→43 | 31→38 | 33→31 |
| 60             | 60→64 | 59→64 | 59→64 | 57→64 | 55→64 | 54→63 | 49→62 |
| 100            | 64→64 | 64→64 | 64→64 | 64→64 | 64→64 | 64→64 | 62→64 |

The PR156 additive sigma ceiling flattened poor long-range uncertainty while its normalized floor made an easy tap-in unnecessarily noisy. PR157 converts continuous angular/contact uncertainty to target-plane metres. Ability10 now drops from64/64 at4m to31/64 at32m. This open central target saturates elite rows in the64-seed sample; it does not prove perfect elite accuracy under difficulty.

## Context isolation, bundle60

Before/final columns are on-target/goals. Main header rows intentionally preserve a central legacy human-controllable target (horizontal0, vertical0.55); see generated NPC headers below. Other main contexts use the target recipe recorded in the row.

| Context                   | Before O/G | Final O/G | H MAE(m) | V MAE(m) | Actual pressure | Quality |
| ------------------------- | ---------- | --------- | -------- | -------- | --------------- | ------- |
| settled                   | 46/16      | 60/29     | 0.731    | 0.490    | 0.000           | 0.600   |
| pressure-moderate         | 42/14      | 47/19     | 1.321    | 1.009    | 0.279           | 0.527   |
| pressure-strong           | 38/10      | 37/10     | 2.177    | 1.762    | 0.556           | 0.437   |
| turned                    | 42/14      | 54/23     | 0.892    | 0.595    | 0.000           | 0.579   |
| angled                    | 34/28      | 54/48     | 0.906    | 0.604    | 0.000           | 0.600   |
| angle-moderate            | 37/21      | 57/45     | 0.830    | 0.554    | 0.000           | 0.600   |
| weak-foot                 | 40/12      | 47/19     | 1.374    | 1.013    | 0.000           | 0.521   |
| first-time                | 40/12      | 54/24     | 0.931    | 0.677    | 0.000           | 0.574   |
| first-time-fast           | 37/12      | 53/24     | 1.011    | 0.752    | 0.000           | 0.564   |
| half-volley               | 37/11      | 52/22     | 1.084    | 0.820    | 0.000           | 0.555   |
| volley                    | 36/12      | 49/19     | 1.247    | 0.973    | 0.000           | 0.536   |
| header                    | 35/15      | 56/14     | 0.914    | 0.707    | 0.177           | 0.527   |
| driven                    | 40/14      | 54/30     | 0.931    | 0.623    | 0.000           | 0.600   |
| chip-rushing-keeper       | 52/52      | 59/59     | 1.017    | 0.784    | 0.310           | 0.517   |
| blocked                   | 0/0        | 0/0       | 1.836    | 1.455    | 0.443           | 0.474   |
| existing-direct-free-kick | 0/0        | 1/1       | 1.529    | 1.160    | 0.280           | 0.527   |
| difficult                 | 31/15      | 24/7      | 3.910    | 3.109    | 0.556           | 0.366   |

## Individual attributes, all others60

Each cell is final on-target/goals; horizontal MAE. Heading uses central controlled targets here, independently of Finishing.

| Attribute | Context         | 10            | 60            | 100           |
| --------- | --------------- | ------------- | ------------- | ------------- |
| finishing | settled         | 38/11; 2.167m | 60/29; 0.731m | 63/27; 0.378m |
| finishing | pressure-strong | 27/12; 3.613m | 37/10; 2.177m | 40/13; 1.824m |
| finishing | volley          | 33/12; 2.683m | 49/19; 1.247m | 54/24; 0.893m |
| technique | settled         | 53/19; 1.016m | 60/29; 0.731m | 61/33; 0.661m |
| technique | pressure-strong | 35/9; 2.461m  | 37/10; 2.177m | 37/13; 2.107m |
| technique | volley          | 35/12; 2.348m | 49/19; 1.247m | 53/23; 0.976m |
| composure | settled         | 60/29; 0.731m | 60/29; 0.731m | 60/29; 0.731m |
| composure | pressure-strong | 20/6; 5.982m  | 37/10; 2.177m | 49/20; 1.240m |
| composure | volley          | 49/19; 1.247m | 49/19; 1.247m | 49/19; 1.247m |
| heading   | header          | 40/16; 2.027m | 56/14; 0.914m | 59/7; 0.640m  |
| agility   | settled         | 60/29; 0.731m | 60/29; 0.731m | 60/29; 0.731m |
| agility   | pressure-strong | 37/10; 2.177m | 37/10; 2.177m | 37/10; 2.177m |
| agility   | turned          | 53/24; 0.999m | 54/23; 0.892m | 57/26; 0.866m |

Composure has exactly zero effect in the unpressured settled fixture (identical on-target60/64 and goals29/64 for every band), while pressure changes on-target20→49/64 from Composure10→100. Technique10→100 changes volley on-target35→53/64, compared with settled53→61/64. Finishing10→100 changes settled38→63/64. Agility10→100 changes turned-body53→57/64 and has zero effect in aligned easy contact. These paired results disprove the old universal blended-quality hypothesis.

## Generated NPC header targeting

The lab confirmed a separate choice defect: generated headers omitted goalTarget and always defaulted to goal centre. Better Heading concentrated those shots into the keeper (central control Heading10→100: goals16→7/64 despite on-target40→59/64). Generated headers now select the existing geometry-based placed-shot goal target. This changes an NPC's chosen aim; an explicit human target remains authoritative.

Supplementary before/after each contain14cells×64=896 physical attempts, with zero rejections/unresolved. Below is isolated Heading with other skills60; cells show on-target/goals.

| Heading | Generated before O/G | Generated final O/G | Final H MAE(m) |
| ------- | -------------------- | ------------------- | -------------- |
| 10      | 26/13                | 35/16               | 2.027          |
| 60      | 35/15                | 51/31               | 0.914          |
| 100     | 47/18                | 57/41               | 0.640          |

## Full funnel, representative bundle60 cells

| Context                   | Projected on | Block | Post | Bar | Wide | Over | GK contacts | Catch | Parry | Save | Goal |
| ------------------------- | ------------ | ----- | ---- | --- | ---- | ---- | ----------- | ----- | ----- | ---- | ---- |
| settled                   | 60           | 0     | 1    | 0   | 3    | 0    | 31          | 13    | 18    | 31   | 29   |
| pressure-strong           | 37           | 0     | 2    | 1   | 15   | 9    | 27          | 10    | 17    | 27   | 10   |
| volley                    | 49           | 0     | 3    | 0   | 8    | 4    | 30          | 12    | 18    | 30   | 19   |
| blocked                   | 40           | 47    | 0    | 0   | 14   | 3    | 0           | 0     | 0     | 0    | 0    |
| existing-direct-free-kick | 43           | 51    | 1    | 1   | 6    | 4    | 0           | 0     | 0     | 0    | 1    |
| difficult                 | 24           | 0     | 2    | 3   | 22   | 13   | 17          | 5     | 12    | 17   | 7    |

The blocked lane and existing direct free kick demonstrate why placement cannot stand in for final results. The actual existing free-kick wall blocks most of the present low-target actions; PR158 should address contextual dead-ball choices/choreography. No new menu was added and none of those blocks was relabelled a keeper save.

## Physical keeper sweep, shooter bundle85 fixed

Same shooter and release seeds/targets/errors at every keeper band. “Projected reachable” is release-time advisory reach; saves/catches/parries/goals are actual first physical outcomes. Reaction is seconds; displacement/reach are metres.

| Context                 | GK  | On  | Save | Catch | Parry | Goal | Contacts | Non-save contacts | Reaction | Need(m) | Reach(m) | Projected reachable |
| ----------------------- | --- | --- | ---- | ----- | ----- | ---- | -------- | ----------------- | -------- | ------- | -------- | ------------------- |
| keeper-central-low      | 10  | 64  | 64   | 5     | 59    | 0    | 64       | 0                 | 0.333    | 0.269   | 1.328    | 64                  |
| keeper-central-low      | 40  | 64  | 64   | 10    | 54    | 0    | 64       | 0                 | 0.252    | 0.269   | 1.461    | 64                  |
| keeper-central-low      | 70  | 64  | 64   | 32    | 32    | 0    | 64       | 0                 | 0.171    | 0.269   | 1.695    | 64                  |
| keeper-central-low      | 100 | 64  | 64   | 57    | 7     | 0    | 64       | 0                 | 0.090    | 0.269   | 2.060    | 64                  |
| keeper-central-high     | 10  | 64  | 63   | 5     | 58    | 1    | 63       | 0                 | 0.333    | 0.716   | 1.333    | 63                  |
| keeper-central-high     | 40  | 64  | 64   | 7     | 57    | 0    | 64       | 0                 | 0.252    | 0.716   | 1.470    | 64                  |
| keeper-central-high     | 70  | 64  | 64   | 25    | 39    | 0    | 64       | 0                 | 0.171    | 0.716   | 1.710    | 64                  |
| keeper-central-high     | 100 | 64  | 64   | 49    | 15    | 0    | 64       | 0                 | 0.090    | 0.716   | 2.082    | 64                  |
| keeper-near-post        | 10  | 62  | 1    | 0     | 1     | 61   | 1        | 0                 | 0.356    | 2.207   | 1.290    | 1                   |
| keeper-near-post        | 40  | 62  | 2    | 1     | 1     | 60   | 2        | 0                 | 0.275    | 2.207   | 1.385    | 2                   |
| keeper-near-post        | 70  | 62  | 5    | 5     | 0     | 57   | 5        | 0                 | 0.194    | 2.207   | 1.568    | 4                   |
| keeper-near-post        | 100 | 62  | 11   | 9     | 2     | 51   | 11       | 0                 | 0.113    | 2.207   | 1.869    | 14                  |
| keeper-far-post         | 10  | 63  | 1    | 0     | 1     | 62   | 1        | 0                 | 0.356    | 2.280   | 1.334    | 1                   |
| keeper-far-post         | 40  | 63  | 1    | 0     | 1     | 62   | 1        | 0                 | 0.275    | 2.280   | 1.473    | 1                   |
| keeper-far-post         | 70  | 63  | 7    | 1     | 6     | 56   | 7        | 0                 | 0.194    | 2.280   | 1.715    | 5                   |
| keeper-far-post         | 100 | 63  | 11   | 8     | 3     | 52   | 11       | 0                 | 0.113    | 2.280   | 2.090    | 19                  |
| keeper-close-one-on-one | 10  | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.333    | 1.339   | 1.250    | 0                   |
| keeper-close-one-on-one | 40  | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.252    | 1.339   | 1.250    | 0                   |
| keeper-close-one-on-one | 70  | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.171    | 1.339   | 1.250    | 0                   |
| keeper-close-one-on-one | 100 | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.090    | 1.339   | 1.256    | 22                  |
| keeper-chip             | 10  | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.333    | 2.943   | 2.267    | 0                   |
| keeper-chip             | 40  | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.252    | 2.943   | 2.970    | 37                  |
| keeper-chip             | 70  | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.171    | 2.943   | 3.894    | 64                  |
| keeper-chip             | 100 | 64  | 0    | 0     | 0     | 64   | 0        | 0                 | 0.090    | 2.943   | 5.017    | 64                  |

Better keeper skills improve saves on identical near/far-post trajectories (1→11/64 from band10→100); reaction falls continuously and physical reach rises. Central targets saturate saves because the keeper starts in their path; 5m corner shots and12m chips against an already stranded keeper saturate goals (64/64 in the fixed85 shooter sweep). Those geometries do not establish global chip superiority. They remain a saturation weakness requiring broader future keeper depth/angle distributions, not a reason to insert a save probability. Passive/non-save contact counts are separately visible in the table.

## AI choice audit within the bounded fixtures

The raw lab now records the overall top legal canonical action, rather than only asking which shot family ranks highest. Main final rows are below; all count distributions sum64. These sterile fixtures put other teammates far behind, so ordinary sensible passing choices are poorly represented. Root's full-match matrix is required for natural shot/pass/carry frequency.

| Context             | Bundle | Overall top actions    | Top shot family                    | On  | Goals |
| ------------------- | ------ | ---------------------- | ---------------------------------- | --- | ----- |
| settled             | 10     | {"carry":64}           | {"placed":53,"driven":10,"chip":1} | 36  | 9     |
| settled             | 60     | {"carry":64}           | {"placed":61,"driven":2,"chip":1}  | 60  | 29    |
| settled             | 100    | {"carry":53,"shot":11} | {"placed":64}                      | 64  | 36    |
| pressure-strong     | 10     | {"carry":64}           | {"placed":12,"driven":52}          | 18  | 10    |
| pressure-strong     | 60     | {"carry":64}           | {"placed":20,"driven":44}          | 37  | 10    |
| pressure-strong     | 100    | {"carry":64}           | {"placed":29,"driven":35}          | 56  | 27    |
| blocked             | 10     | {"carry":64}           | {"placed":17,"driven":47}          | 0   | 0     |
| blocked             | 60     | {"carry":64}           | {"placed":25,"driven":39}          | 0   | 0     |
| blocked             | 100    | {"carry":64}           | {"placed":40,"driven":24}          | 0   | 0     |
| difficult           | 10     | {"carry":64}           | {"driven":60,"placed":4}           | 10  | 4     |
| difficult           | 60     | {"carry":64}           | {"placed":12,"driven":52}          | 24  | 7     |
| difficult           | 100    | {"carry":64}           | {"placed":16,"driven":48}          | 40  | 20    |
| chip-rushing-keeper | 10     | {"carry":64}           | {"chip":55,"driven":6,"placed":3}  | 26  | 26    |
| chip-rushing-keeper | 60     | {"shot":64}            | {"chip":52,"placed":6,"driven":6}  | 59  | 59    |
| chip-rushing-keeper | 100    | {"shot":64}            | {"placed":7,"chip":51,"driven":6}  | 64  | 64    |
| first-time          | 10     | {"shot":64}            | {"driven":14,"placed":50}          | 33  | 13    |
| first-time          | 60     | {"shot":64}            | {"driven":7,"placed":57}           | 54  | 24    |
| first-time          | 100    | {"shot":64}            | {"driven":2,"placed":62}           | 63  | 37    |
| volley              | 10     | {"shot":64}            | {"driven":14,"placed":50}          | 26  | 10    |
| volley              | 60     | {"shot":64}            | {"driven":7,"placed":57}           | 49  | 19    |
| volley              | 100    | {"shot":64}            | {"driven":2,"placed":62}           | 60  | 32    |
| header              | 10     | {"header":64}          | {"header":64}                      | 32  | 14    |
| header              | 60     | {"header":64}          | {"header":64}                      | 56  | 14    |
| header              | 100    | {"header":64}          | {"header":64}                      | 61  | 1     |

Blocked and difficult shots lose to carry in this fixture; good chips against a stranded keeper win at60/100. Incoming contact correctly permits a shot/header. Ordinary20m settled shots often lose to carry, so the shared placement approximation is conservative here. It is an action-ranking approximation, not a calibrated scoring probability. The central-header aiming inconsistency was corrected and the generated-action physical supplement confirms it; no desired shot count was forced.

Representative utility comparison uses a visible skill60 teammate6m behind and6m lateral to the shooter as a legal short pass outlet; the named opponent/shot geometry stays identical. Both revisions contain12cells/768physical attempts in this supplementary fixture. This avoids claiming pass/carry consistency from the sterile main geometry, whose ordinary pass options are absent. Utility is the best legal option per family, averaged over64 paired ranking seeds. Overall choice adds the existing ±4 deterministic decision noise; final scores including that noise are retained separately in JSON. “—” means no sampled legal option, not zero utility.

| Context             | Bundle | Before overall top     | Final overall top      | Before shot/pass/carry utility | Final shot/pass/carry utility |
| ------------------- | ------ | ---------------------- | ---------------------- | ------------------------------ | ----------------------------- |
| settled             | 10     | {"carry":64}           | {"carry":64}           | 29.066 / 19.587 / 40.648       | 12.846 / 19.587 / 40.648      |
| settled             | 60     | {"carry":45,"shot":19} | {"carry":64}           | 46.083 / 33.385 / 46.898       | 37.535 / 33.859 / 46.898      |
| settled             | 100    | {"shot":64}            | {"carry":53,"shot":11} | 60.428 / 31.674 / 51.898       | 50.276 / 35.948 / 51.898      |
| blocked             | 10     | {"carry":62,"pass":2}  | {"carry":62,"pass":2}  | 5.699 / 18.798 / 24.860        | -3.882 / 18.798 / 24.860      |
| blocked             | 60     | {"pass":64}            | {"pass":64}            | 15.103 / 40.569 / 33.544       | 0.579 / 40.569 / 33.544       |
| blocked             | 100    | {"carry":64}           | {"carry":64}           | 24.485 / 32.112 / 43.852       | 11.312 / 32.112 / 43.852      |
| difficult           | 10     | {"carry":64}           | {"carry":64}           | -15.055 / 1.149 / 24.947       | -15.914 / 1.149 / 24.947      |
| difficult           | 60     | {"carry":64}           | {"carry":64}           | -13.490 / 17.050 / 31.758      | -16.026 / 17.050 / 31.758     |
| difficult           | 100    | {"carry":64}           | {"carry":64}           | -11.668 / 19.224 / 37.207      | -15.452 / 19.224 / 37.207     |
| chip-rushing-keeper | 10     | {"shot":64}            | {"carry":64}           | 71.463 / -1.305 / 32.252       | 18.710 / 13.159 / 32.252      |
| chip-rushing-keeper | 60     | {"shot":64}            | {"shot":64}            | 121.821 / -0.470 / 37.152      | 80.000 / 15.274 / 37.152      |
| chip-rushing-keeper | 100    | {"shot":64}            | {"shot":64}            | 157.264 / -8.452 / 41.072      | 126.993 / 2.076 / 41.072      |

## Explicit answers to the12 shooting questions

1. Distance: at fixed bundle10, open-goal on-target4→32m is64→31/64 (baseline46→33/64); intermediate rows and all49cells are above/raw.
2. Pressure: bundle60 settled→measured pressure0.556 changes on-target60→37/64 and H MAE0.731→2.177m.
3. Orientation: same bundle60 turns2.2rad, on-target60→54/64 and H MAE0.731→0.892m.
4. Finishing only:10→100 gives settled38→63/64; error2.167→0.378m.
5. Technique only: volley35→53/64; Composure only: easy60→60/64, pressure20→49/64. Full five-attribute table shows the specific effects.
6. Low end: bundle10 scores64/64 into open4m goal but pressured20m corner is18on/10goals out of64; compounded25m is10on/4goals out of64. It is weak under demand, rather than unable to perform a tap-in.
7. Poor lucky successes: compound25m bundle10 scores4/64; bundle5 also scores4/64. Same physical pipeline, no special success gate.
8. Elite misses: compound25m bundle100 has40/64 on-target and20/64 goals, leaving24 off-target/frame/block results; first-time and volley rows also retain misses.
9. Contact: bundle60 settled60/64, first-time54/64, faster first-time53/64, half-volley52/64, volley49/64; separate heading control at12m56/64 and generated51/64. H MAE/contact diagnostics expose why; distances/aim differ for headers, so do not infer a universal header-vs-foot ranking.
10. Keeper ability: both near and far-post saves1→11/64 across band10→100 while release trajectory parity failures fall512→0. Actual catches/parries/reaction/reach appear above.
11. Saturation: central open elite shots, central keeper saves, close5m corner goals and stranded-keeper chips have saturated64-seed rows. Existing free-kick low targets are structurally wall-blocked. These remain measured limitations, not league-realism claims.
12. AI: sterile main blocked/difficult fixtures choose64/64 carry and high-quality stranded-keeper chips64/64 shot; generated Heading100 scores41/64 vs before18/64. In the separate legal pass outlet fixture, blocked bundle60 chooses64/64 pass (shot/pass/carry utilities0.579/40.569/33.544). Bundle10 stranded-keeper choice changes64/64 shot→64/64 carry, with shot utility71.463→18.710 (physical chip goals26/64 unchanged). The opportunity approximation responds to placement difficulty without forcing a count; natural full-match frequencies and contact/style approximations remain bounded interpretation limits.

## Confirmed fixes, weaknesses and verification

Confirmed bugs: goalkeeper Positioning/Reading contaminated shooter pressure and changed512 paired launch trajectories; an x-only post-line extension shifted every diagonal ray towards the shooter side; seven intermediate poor difficult attempts escaped the touchline without recording a shot outcome; generated headers defaulted to goal centre. Calibration weaknesses: old capped errors flattened distance and its normalized floor over-penalized easy close shots. The narrow corrections preserve the seeded shot-v3 draw count, selected human aim, contact timing and first physical event. Touchline CCD now wins when it is physically earlier than goal/frame contact; the restart fallback records one unresolved shot miss without overwriting a previously resolved same-shot save/block.

The intermediate7-flight diagnosis is retained in PR157-shooting-flight-diagnosis.json with clear pre-fix provenance. Final rejection/unresolved counts are zero. The hypothesis “high Heading always needs more goals” was disproved for centre aiming; the generated-target defect was separately fixed. Weaknesses still include sterile passing options, saturated central/easy and stranded-keeper cells, contact/style opportunity approximations, and current free-kick target choices. No league realism claim follows from a green unit test.

Focused checks passed after the final shooting ray/CCD code and already-resolved save/block recovery regressions:4testfiles/43tests (shootingDifficulty, shotResolver, shootingOptions, calibrationShotFunnel), ESLint for owned files, and strict TypeScript for benchmarkPr157Shooting with exactOptionalPropertyTypes/noUncheckedIndexedAccess. Root owns complete verify, agency/integrity, observer parity and full-match performance.

Final telemetry references use frozen source 977e70b1e12438eb6803ad9e8a114939f313f122d116f7e76577fce49fc25d3a. Both pristine PR156 hashes were independently reproduced twice before both PR157 seeds were reproduced twice for2400ticks/60canonical seconds. All80 exported fields, complete sorted all-field repeat identity, schema validation, telemetry invariants and possession/restart identity ledgers remain compared. Only test describe/comment/expected hashes changed; sorted all-field and invariant assertions were preserved. Focused reference2tests passed. PR157 hashes: pr146-flow-reference:a: 1f2c62cc5ab35f0b10e645cc44173813a669478932a64d58b728e0cae9c39387; pr146-flow-reference:b: 590c427bc9ca46ab6bf96007f6c145c252c0dfbd15e798473afc58b485c6b36a. Complete before/after outputs and changed/unchanged field lists are retained in PR157-telemetry-reference.json.

Artifacts: PR157-shooting-before.json, PR157-shooting-after.json, PR157-generated-headers-before.json, PR157-generated-headers-after.json, PR157-shot-selection-before.json, PR157-shot-selection-after.json (supplementary legal short pass outlet fixture), PR157-shooting-flight-diagnosis.json, PR157-telemetry-reference.json. Suggested package command: benchmark:shooting-difficulty → existing transform-types/registerTypescriptLoader launcher for scripts/benchmarkPr157Shooting.ts.

## Full-match pressing totals (three90-minute seeds per row)

| Fixture                 | Revision | Episodes | Static | Static% | Mean s | Attempts | Clean | Loose | Beaten | Fouls | Y/R  |
| ----------------------- | -------- | -------- | ------ | ------- | ------ | -------- | ----- | ----- | ------ | ----- | ---- |
| balanced-balanced       | before   | 2820     | 6      | 0.21    | 4.33   | 170      | 62    | 21    | 48     | 37    | 8/1  |
| balanced-balanced       | after    | 3987     | 1      | 0.03    | 3.09   | 1149     | 479   | 189   | 423    | 53    | 12/1 |
| native-433-pressing-442 | before   | 3249     | 8      | 0.25    | 3.77   | 284      | 118   | 30    | 67     | 60    | 7/0  |
| native-433-pressing-442 | after    | 4159     | 3      | 0.07    | 3.05   | 1237     | 542   | 195   | 433    | 61    | 12/1 |
| strong-weak             | before   | 3470     | 142    | 4.09    | 3.57   | 263      | 92    | 45    | 101    | 14    | 1/0  |
| strong-weak             | after    | 3760     | 4      | 0.11    | 3.39   | 579      | 263   | 96    | 193    | 25    | 1/0  |
| high-press              | before   | 3587     | 8      | 0.22    | 3.49   | 395      | 180   | 40    | 94     | 69    | 9/1  |
| high-press              | after    | 4337     | 2      | 0.05    | 2.95   | 1242     | 538   | 180   | 456    | 60    | 8/0  |

## Press release and structure totals

| Fixture                 | Revision | Releases | Reset | Handoffs | Coop/secondary | Carrier m | Other m   | Support s | Compression m | Centroid m | New options | Exposure samples |
| ----------------------- | -------- | -------- | ----- | -------- | -------------- | --------- | --------- | --------- | ------------- | ---------- | ----------- | ---------------- |
| balanced-balanced       | before   | 1707     | 558   | 408      | 553/371        | 4247.86   | 262994.26 | 1.01      | 1.97          | 2.28       | 17729       | 256              |
| balanced-balanced       | after    | 1306     | 684   | 1267     | 1822/1174      | 6891.68   | 399904.78 | 1.02      | 0.85          | 3.12       | 15596       | 588              |
| native-433-pressing-442 | before   | 1749     | 490   | 780      | 985/653        | 5197.33   | 305682.01 | 1.01      | 1.73          | 2.63       | 17367       | 311              |
| native-433-pressing-442 | after    | 1308     | 729   | 1310     | 1872/1242      | 7124.4    | 440277.52 | 1.02      | 0.86          | 3.32       | 15979       | 539              |
| strong-weak             | before   | 1425     | 636   | 1183     | 1271/858       | 7698.67   | 278695.27 | 1.02      | 0.86          | 1.95       | 6701        | 619              |
| strong-weak             | after    | 1430     | 683   | 1224     | 1693/1271      | 8341.74   | 360222.2  | 1.02      | 0.72          | 2.85       | 6286        | 1171             |
| high-press              | before   | 1536     | 645   | 1069     | 1496/992       | 6533.88   | 357234.06 | 1.01      | 1.58          | 2.84       | 16437       | 444              |
| high-press              | after    | 1296     | 761   | 1490     | 1985/1397      | 7411.92   | 461730.26 | 1.02      | 0.94          | 3.36       | 15317       | 500              |

## Carrier under pressure

| Fixture                 | Revision | High holds | Stationary s | Carry starts | Carry m | Dribble events | Shield s | Passes | First-time | Turnovers |
| ----------------------- | -------- | ---------- | ------------ | ------------ | ------- | -------------- | -------- | ------ | ---------- | --------- |
| balanced-balanced       | before   | 229        | 225.67       | 247          | 1036.63 | 257            | 526.58   | 149    | 1          | 60        |
| balanced-balanced       | after    | 841        | 828.3        | 493          | 1291.97 | 417            | 3077.35  | 589    | 0          | 322       |
| native-433-pressing-442 | before   | 386        | 320.82       | 380          | 1531.71 | 380            | 947.22   | 247    | 0          | 131       |
| native-433-pressing-442 | after    | 931        | 937.27       | 592          | 1513.49 | 515            | 3334.12  | 622    | 0          | 396       |
| strong-weak             | before   | 489        | 844.72       | 525          | 1865.3  | 534            | 1403.92  | 363    | 0          | 140       |
| strong-weak             | after    | 823        | 685.72       | 369          | 1152.5  | 342            | 3165.3   | 656    | 0          | 224       |
| high-press              | before   | 574        | 433.6        | 600          | 2381.03 | 589            | 1512.43  | 342    | 0          | 210       |
| high-press              | after    | 966        | 875.72       | 679          | 1688.99 | 576            | 3439.92  | 659    | 0          | 410       |

## Shooting and passing totals

| Fixture                 | Revision | Shots | On  | Blocks | Post/bar | Saves | Goals | First-time | Pressure | Passes/completed | Scores          |
| ----------------------- | -------- | ----- | --- | ------ | -------- | ----- | ----- | ---------- | -------- | ---------------- | --------------- |
| balanced-balanced       | before   | 28    | 15  | 3      | 0/1      | 2     | 13    | 4          | 0.62     | 2379/2273        | 1-0, 5-0, 5-2   |
| balanced-balanced       | after    | 10    | 7   | 2      | 0/0      | 2     | 5     | 0          | 0.63     | 2196/1794        | 0-0, 0-2, 1-2   |
| native-433-pressing-442 | before   | 43    | 18  | 0      | 2/2      | 6     | 12    | 12         | 0.64     | 2372/2187        | 4-1, 5-2, 0-0   |
| native-433-pressing-442 | after    | 19    | 14  | 3      | 0/1      | 5     | 9     | 0          | 0.6      | 2185/1762        | 1-3, 0-0, 2-3   |
| strong-weak             | before   | 77    | 38  | 6      | 1/1      | 7     | 31    | 18         | 0.62     | 2184/1258        | 12-0, 10-1, 7-1 |
| strong-weak             | after    | 30    | 25  | 5      | 0/0      | 1     | 24    | 4          | 0.69     | 2219/1135        | 10-0, 6-0, 7-1  |
| high-press              | before   | 66    | 45  | 2      | 3/2      | 13    | 32    | 15         | 0.67     | 2350/2107        | 8-6, 5-3, 8-2   |
| high-press              | after    | 15    | 10  | 3      | 0/1      | 2     | 8     | 1          | 0.61     | 2196/1756        | 2-1, 2-2, 1-0   |

## Per-seed duration quantiles

| Fixture                 | Revision | Seed            | Mean seconds | p50 bin | p90 bin | p95 bin |
| ----------------------- | -------- | --------------- | ------------ | ------- | ------- | ------- |
| balanced-balanced       | before   | lab-muwhj3er    | 4.75         | 5       | 5       | 5       |
| balanced-balanced       | before   | pr155-natural-b | 4.53         | 5       | 5       | 5       |
| balanced-balanced       | before   | pr155-natural-c | 3.83         | 4       | 5       | 5       |
| native-433-pressing-442 | before   | lab-muwhj3er    | 4.05         | 4       | 5       | 5       |
| native-433-pressing-442 | before   | pr155-natural-b | 3.18         | 3       | 5       | 5       |
| native-433-pressing-442 | before   | pr155-natural-c | 4.3          | 5       | 5       | 5       |
| strong-weak             | before   | lab-muwhj3er    | 3.54         | 4       | 5       | 6       |
| strong-weak             | before   | pr155-natural-b | 3.59         | 4       | 5       | 6       |
| strong-weak             | before   | pr155-natural-c | 3.59         | 4       | 5       | 6       |
| high-press              | before   | lab-muwhj3er    | 3.49         | 4       | 5       | 5       |
| high-press              | before   | pr155-natural-b | 3.54         | 4       | 5       | 5       |
| high-press              | before   | pr155-natural-c | 3.44         | 4       | 5       | 5       |
| balanced-balanced       | after    | lab-muwhj3er    | 3.14         | 3       | 5       | 5       |
| balanced-balanced       | after    | pr155-natural-b | 3.14         | 3       | 5       | 5       |
| balanced-balanced       | after    | pr155-natural-c | 3            | 3       | 5       | 5       |
| native-433-pressing-442 | after    | lab-muwhj3er    | 3            | 3       | 5       | 5       |
| native-433-pressing-442 | after    | pr155-natural-b | 3.01         | 3       | 5       | 5       |
| native-433-pressing-442 | after    | pr155-natural-c | 3.13         | 3       | 5       | 5       |
| strong-weak             | after    | lab-muwhj3er    | 3.38         | 4       | 5       | 6       |
| strong-weak             | after    | pr155-natural-b | 3.34         | 4       | 5       | 6       |
| strong-weak             | after    | pr155-natural-c | 3.43         | 4       | 5       | 6       |
| high-press              | after    | lab-muwhj3er    | 2.87         | 2       | 5       | 5       |
| high-press              | after    | pr155-natural-b | 2.99         | 2       | 5       | 5       |
| high-press              | after    | pr155-natural-c | 3            | 3       | 5       | 5       |

## Full-match interpretation and limits

All rows use spectator canonical autonomy with agency disabled and explicitly start
the second half; the final fields/hashes/statistics and telemetry invariants are
checked. Before/after uses the same XI, tactics and paired seeds. On-target means
actual goals/saves; blocked/frame shots remain separate. Full shot distance/angle,
family, pressure and player/role distributions are in the per-match JSON.

Pressure-carrier columns use measured pressure≥0.67. Carry starts are intents;
physical dribble events require the existing≥0.8m actual displacement. Carry distance
is actual movement while ownership is retained. Shield/hold seconds and pressure
releases are measured independently. Pressure-associated losses use the actual prior
loser or the corresponding pass's recorded release pressure; shot/foul-stoppage
endings are excluded from the displayed turnover total. This is correlation, not
a forced-pass or automatic-escape mechanism.

Support timing is the first≥1.5m support displacement; local compression is the
change in the mean distance of four nearest outfield defenders (negative permits
decompression); centroid is displacement from episode start. Other-player distance
integrates actual velocities excluding the two duel actors and goalkeepers. These
numbers show structure continues moving, not that every positional decision is ideal.

Attempts are markedly denser in some final fixtures. The original defensive episode,
separation and re-arm protections are unchanged and their regressions pass, but this
does not prove league-realistic challenge frequency. The report preserves all misses,
beaten outcomes and attempt counts. Large stronger/weaker scores, saturated shooting
cells and geometry-specific keeper failures remain calibration limitations. There is
no statistical gate forcing any particular match result.

## Integrity, performance and verification

See [integrity evidence](performance/PR157-integrity-after.json),
[full-field telemetry reference](performance/PR157-telemetry-reference.json),
[performance evidence](performance/PR157-performance.json) and
[validation manifest](performance/PR157-validation.json).

Performance: three sequential alternating pairs of the same native fixture/seed,
target600 canonical seconds (actual600.025s/24,001 fixed ticks due floating-point accumulation), minimum optional observers, no
renderer, after matrix workers stopped. Median PR157/PR156 runtime ratio:
**1.008× (0.8%)**.
Raw environment, all paired timings/hashes and challenge/shot counts are retained.
This is equivalent duration, not identical football events; higher activity can
change work per tick. Concurrent matrix wall times are not used as performance proof.

Final `npm run verify`: lint,156 main-suite files/1,215 tests,1 full-career file/5 tests and
production TypeScript/Vite build passed. Script-only strict TypeScript checks passed.
The PR146 sorted hash still compares all80 exported fields and their schemas/invariants;
both baseline and final seed references were independently repeated twice. Repaired
positive human-opportunity fixtures now use credible11m shooting geometry; they retain
read-only, source, physical-resolution and all-presentation-mode ownership assertions.

Final run completed successfully with all runtime sources unchanged. Whole-PR canonical
snapshot: `977e70b1e12438eb6803ad9e8a114939f313f122d116f7e76577fce49fc25d3a`.
Integrity additionally records SHA256 `78387ba2c180a21d53f46ec8273a5bc4fac7e5f5567f6b90999827a588033b90`
over 187 non-test TypeScript files in `src/core` and `src/app/match`, plus canonical world
fixture and loader; startup/end fingerprints match. This is a broader convention than the
whole-PR matchSimulation hash and must not be presented as an inconsistent revision.

Machine evidence:

- `docs/performance/PR157-integrity-after.json`: final detailed validated rows.
- `docs/performance/PR157-integrity-before.json`: completed pristine PR156 simulation comparisons.
- `docs/performance/PR157-integrity-summary.json`: compact final report numbers/provenance.

## Identity, agency and actual RNG parity

Three deterministic seeds (`lab-muwhj3er`, `pr155-natural-b`, `pr155-natural-c`) × all22
starting identities give66 disabled comparisons. Every identity preserves the complete canonical
football state, fixed XI, actual RNG draw count and ordered post-draw export hash. Only
`controlledFootballerId` and `playerAgencyEnabled` are excluded from the identity state comparison.

All66 enabled identities preserve complete canonical prefixes before the first genuine human
decision. Across124,345 compared prefix ticks, every canonical physical draw remains in the
same order; only draws from the controlled actor's exact independently seeded decision-ranking
generator may be additional. There are12,490 such ranking draws. This is the existing PR156
observer/ranking mechanism, not a new mutable football RNG or a gameplay divergence.
The first-opportunity distribution is20 on-ball,2 defensive-response,1 incoming-ball and43
identities with no opportunity within this bounded window. Even the first-opportunity boundary
has zero canonical-state divergences in these samples. The experiment does not claim equality
after arbitrary human selections or across an entire enabled-agency match.

| Seed            | Canonical actual draws PR156→PR157 | PR157 independent DEV probe draws | Capture probe draws | Enabled extra ranking draws | Pressing episodes DEV/capture |
| --------------- | ---------------------------------- | --------------------------------- | ------------------- | --------------------------- | ----------------------------- |
| lab-muwhj3er    | 53,722→54,216                      | 2,489                             | 45,643              | 5,580                       | 16/16                         |
| pr155-natural-b | 53,662→53,587                      | 2,414                             | 44,805              | 5,236                       | 13/13                         |
| pr155-natural-c | 53,809→53,685                      | 2,358                             | 45,675              | 1,674                       | 11/11                         |

Normal, DEV and capture modes have identical final canonical hashes AND actual canonical
draw counts/ordered export hashes for each seed. DEV/capture explicitly attach PressureSupport,
CentralConnectivity, PassingConnectivity and the new PressingTracker, plus replay history and
optional MatchDebugRecorder. Optional probe draws are counted separately. The new tracker
actually records40 episodes across the three seeds in each observer mode, retaining at most
8/6/6 evolution samples for the respective seeds; bounds remain256 episodes ×8 samples.
Baseline observer evidence predates availability of the new PressingTracker, so its independent
probe count should not be confused with an equivalent instrumentation cost comparison.

The configured window is60s at fixed0.025s. Floating-point accumulation produces2,401
fixed ticks (60.025s) per compared canonical run; every variant uses exactly the same window.
These CPU-contended micro wall times are not controlled full-match performance evidence.

## Absolute human shooting ownership

Six contexts × three seeds give18 human/NPC physical launch comparisons:
settled, first-time, header, rebound, pressure episode and actual existing direct free kick.
All18 human-selected shots release through the same physical ball resolver and consume the
same RNG sequence as equivalent NPC shots. The free-kick fixture establishes the real restart
taker through `applyRestartScenario('free_kick_close')` and enumerates the existing legal shot.

Four autonomous sources per context, each repeated, give144 blocked proposals:
autonomous NPC, autonomous routine, DEV AI selection and restart liveness watchdog.
Every block consumes zero RNG and leaves the entire football state unchanged, including
ball, statistics and action ledger. Only the permitted `shotAgencyRequest` is excluded from
that rejected-proposal comparison. The repeated proposal remains inert.

The independent regression fixtures exposed a real wrapper defect: a rejected shot previously
initialized an absent ledger or pruned stale retained events through the general emitter.
The wrapper now returns before emission on autonomous human-owned shot proposals. Four
regressions cover settled/incoming × absent/stale ledgers, each with all four sources and a
repeat. A fifth verifies conscious controlled holding under an actual approaching presser:
the carrier retains ownership without an automatic pass/shot/cross, the defender moves, and a
genuine contested-possession opportunity pauses at the human boundary.

## Validation and test integrity

After the final freeze, the5 ownership/agency regressions and6 observer lifecycle/static
regressions all pass (11 tests). Focused eslint passes for integrity and repaired agency tests.
The earlier three positive-agency fixture suites pass44 tests: playerDecision, matchMoment,
and PR143. Their full resolver equality, read-only snapshots and five-presentation-mode complete
canonical equality assertions were preserved. Only positive fixture geometry changed: an
accidentally speculative pressured20m centre-back shot became a credible11m chance, the
goalkeeper returned to103m and an actual outfield presser stands1.5m behind.

The complete repository verification and sequential paired performance check passed
independently. The bounded integrity experiment alone does not establish match realism.

## Reproduction

From the final checkout:

```powershell
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr157Integrity.ts --seconds=60 --revision=PR157 --out=docs/performance/PR157-integrity-after.json
node node_modules/vitest/vitest.mjs run src/core/matchSimulation/pr157Integrity.test.ts src/core/matchSimulation/pressingDiagnostics.test.ts --maxWorkers=1 --reporter=dot
```

PR156 baseline was collected from pristine merged main `83570049ef86622f9ebefd26e3afc6bb654ae6ba`
using the matching integrity runner with `--checks=simulation`; rejected-ledger regressions
are intentionally PR157 fixes, not falsely reported as passing before.

## Reproduction

```sh
npm ci
npm run benchmark:pressing -- --repetitions=32 --out=docs/performance/PR157-pressing-after.json
npm run benchmark:shooting-difficulty -- --repetitions=64 --out=docs/performance/PR157-shooting-after.json
npm run benchmark:dynamic-flow -- --minutes=90 --observer=normal --out=docs/performance/PR157-flow-after.json
npm run benchmark:pressing-integrity -- --seconds=60 --out=docs/performance/PR157-integrity-after.json
npm run verify
```

The before runners use `--engine-root=../baseline` pointing at the stated immutable
merged-main checkout; benchmark tools and corrected observer run from the current
checkout. Risk/header/utility supplements document their exact filters in their JSON
and sections above. The integrity experiment is60s per identity/seed, not a newly
claimed full90-minute human simulation. Full football fixtures are independently90m.
The manifest separates final evidence from the retained superseded overcommit and
touchline-flight diagnoses. No unit-test result alone establishes realism.

Performance reproduction uses `benchmark:dynamic-flow -- --minutes=10
--observer=minimum --fixtures=native-433-pressing-442 --seeds=pr157-performance`,
with the baseline engine root for PR156. Run three uncontended pairs in order
before/after, after/before, before/after; preserve all six elapsed durations and
compare paired ratios. The observed tick count is24,001 in every run, not a changed
simulation frequency.
