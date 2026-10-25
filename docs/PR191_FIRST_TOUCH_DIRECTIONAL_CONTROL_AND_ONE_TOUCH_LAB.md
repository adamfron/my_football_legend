# PR191 — First Touch, Directional Control & One-Touch Laboratory

## Work plan and frozen baseline

Baseline: merged PR190 `251ec9f88f212f7a93d26ebc7491b1176e5a25ef`,
PR190 head `a8cc1b040451399f28edf6fd55ef0a262a0b371f`.
Fixed canonical integration: 0.025 s. Default B and all 28 attributes remain.
Historical PR189/190 evidence is retained in place; it is not regenerated as PR191.

Implementation order: audit → common receipt/CCD → prescribed and autonomous
reception/continuation → first-time targets → paired attribute controls → repeated
contacts → opt-in match transfer → development regression → verify and final-head CI.
Dependent gates remain open if their physical prerequisite fails.

## Capability audit before implementation

| Capability | Baseline classification | Evidence and limitation |
| --- | --- | --- |
| Finite six-surface foot impulse, spin and cushioning | canonical, functional | `footContact.ts`, PR190 reception regressions |
| Directional foot reception | canonical, limited | `firstTouch.ts`, `passReception.ts`, movement-dependent intent |
| First-time foot passing | canonical, limited | `firstTimePassing.ts`, actual incoming execution |
| First-time shots/volley labels | canonical, limited | shooting eligibility/launch exist; no general airborne articulated foot trajectory |
| Heading | canonical, limited | `aerialPlay.ts` geometry plus seeded contest; not a new capsule/impulse head model |
| Connected hip/thigh/knee/shin/foot geometry | research-only | optional PR190 `lowerBodyPose`; not authoritative for every ball collision |
| Thigh/knee/shin/chest reception | not implemented | region names and body rebound envelopes are not controlled surface execution |
| Balance, jump, movement, motor recovery, fitness | canonical, limited | shared body mechanics/integrator; optional jump scheduling remains staged |
| Goalkeeper intervention/handling | canonical, limited | existing lawful handling/claims; full leg-gap body replacement absent |
| Launcher/flight/apparatus/three modes | research-only | existing lab schemas and canonical ball integration |
| Juggling and mixed repeated contacts | uncertain without new execution tests | no claim from schema names |
| Bicycle/overhead kick | not implemented | requires takeoff, rotation, airborne foot, landing, dangerous-play and recovery model |

All new body parameters are engineering assumptions, not physiological calibration.
Canonical readiness remains **NOT READY**: circulation, sparse attacking creation and
excessive ball-in-play time are independent blockers. Summary Simulation stays blocked.

## 1. Executive findings

**Experimental draft; not full canonical readiness.** The laboratory now executes
real foot, thigh and chest contacts, preserves imperfect outgoing motion, and
continues until another contact/control, a real goal crossing, ground contact in
juggling, a boundary or its explicit time limit. Incidental body surfaces remain
solid: a prescribed thigh attempt can first hit the chest. Intention is not renamed
after observing the collision.

There are 108 representative trials (36 configurations × three samples), 180
one-attribute contrasts and ten body/fitness/weak-foot contrasts. Every one of these
298 inputs runs twice, including a deliberately mutating detached observer. Complete
result hashes agree. Small dispersion is enabled explicitly; these are paired
development samples, not independent evidence of elite football performance.

Ground, chest-to-foot and thigh-to-foot reception, a real receiver's first-time
pass, a single-contact close shot and 2/5/10 foot juggling execute. Pressure and
90° continuation retain failures. A mixed-surface juggling plan fails rather than
receiving a scheduled future touch. Full matches demonstrate only a small passive
torso-contact transfer, not an autonomous repertoire of prepared aerial tricks.

## 2. PR190 baseline and retained evidence

`performance/pr191/baseline.json` records the immutable merged commit, normalized
PR190 runtime manifest `be9669dd4675d7813fb4c45ee3bb941e7ccba398293233b7702fd8c4691c6bad`,
ball-physics source hash, all 15 existing WW/SS/SW × five-policy receipts, seeds,
input hashes and final states. Historical archives are referenced in place.
The PR189 pathological states, failed cycles and PR190 canonical reception tests
remain unchanged. A fresh complete default WW/B run matches PR190's entire final
state, not just its score or pass total.

The historical checker must run against historical source. `replayPr190Baseline.mjs`
archives the merged baseline, checks all 250 artifacts and replays its 26 captures.
It disables host `core.autocrlf` during archive export; an initial Windows export
failed the historical Markdown byte hash before that correction. No receipt or
historical hash was rewritten. CI also retains the current-source PR190 replay
and all previous PR186–189 historical checks.

## 3. Contact-surface audit

The table above is the preimplementation audit. Postimplementation distinctions:

- Existing six-surface feet are reused, including their finite impulse, spin,
  support and preparation limits. They are not six new PR191 techniques.
- Chest uses a height-scaled finite torso capsule; thigh/knee/shin use the actual
  connected PR190 leg geometry and require its optional posture.
- Actual thigh and chest execution is demonstrated. The selected knee/shin
  launcher cases miss; their presence in the collision solver is not evidence
  that these exercises or autonomous techniques work.
- Existing standing/jumping heading, keeper intervention and legacy aerial duels
  remain limited canonical mechanisms. `head` in this new impulse apparatus returns
  `legacy_heading_only`; it does not invent a second heading implementation.
- Existing volley/half-volley recognition and shot launch eligibility do not supply
  a complete airborne articulated-foot swing. Full volleys and overhead execution
  are not newly certified by this PR.

Balance is `plantBalance` physical state, not a 29th player attribute.

## 4. Unified contact foundation and limits

`ballSurfaceContact.ts` defines validated requests and receipts. A receipt contains
player/objective, intended and actual surfaces, foot when relevant, geometric
eligibility, execution/failure, world point/time, normal, velocity/spin before and
after, actual impulse, preparation, balance, recovery and separate control/loose
flags. Legacy foot receipts cannot reconstruct an independently measured foot
surface velocity or incoming angle; those adapter fields are explicitly `null`.

The existing foot solver remains authoritative for feet. Body response uses finite
effective mass, distinct restitution/friction and bounded normal compliance.
Normal and tangential impulses act on the ball's translation; the same tangential
impulse supplies shell torque. Spin-envelope limiting scales the impulse/torque,
rather than resetting angular velocity. The body's normal comes from geometry,
not the requested target. Prepared yielding is bounded; passive unprepared bodies
can still deflect the ball.

Swept conservative advancement includes moving capsule endpoints and integrates
the real ball at candidate contact times. A horizontal broad phase rejects remote
bodies. Earliest deterministic ordering and one applied player impulse per 25 ms
tick prevent overlapping capsules from producing duplicate outcomes. The remainder
of that tick continues through normal ball physics. This bounded implementation
does not solve an arbitrary chain of several different player impacts inside one
tick; articulated rotation and physiological coefficients remain research limits.

Body contact itself never awards ownership. Laboratory control requires a later
low, slow, geometrically reachable foot opportunity after recovery and the existing
canonical control gate. There is no laboratory acquisition lottery. The reported
`nextOrdinaryAction` means a canonical carry intention was accepted; it is not a
claim that a subsequent long dribble was completed.

## 5. Launcher and modes

The existing `labLauncherSchema` supplies position/height, 3D velocity, spin, release
time and seeded dispersion. Speed and angle are derived from that velocity. Initial
placement occurs once at release, before flight. Nothing relocates a flying ball
onto the intended body surface. Canonical gravity, drag, Magnus, bounce, rolling
resistance and spin decay are shared with matches at 40 Hz.

The catalog covers ground/fast low/rising/flat aerial/descending/bouncing/spinning,
behind/weak-foot/late preparation, moving/directional/pressure, actual receivers,
canonical goal geometry, repeated feet and explicitly unavailable actions.
Sample 0 has no dispersion; samples 1/2 use ±0.025 m/s per velocity component.
Attribute pairs use the same three dispersion seeds at every level.

Prescribed mode supplies the objective/surface. Manual mode exposes that choice
in Match Lab and the same validated request. Autonomous mode uses current observed
height, pose and objective plus bounded awareness delay; physical execution still
depends on ability/preparation. It does not yet compare a rich set of future tactical
lanes, jump schedules or alternative limb motions. Its success is not attributed
to the prescribed controller. The laboratory opponent pursues current visible
ball position after its explicit reaction time, without reading a future outcome.

## 6. Reception and cushioning

Representative final results, completed trials / three samples:

| Case | Result | Physical interpretation |
| --- | ---: | --- |
| Ground / fast low | 3/3 each | finite foot cushion followed by ordinary control |
| Descending chest | 3/3 | actual chest contacts, fall and later foot control |
| Descending thigh | 3/3 | oblique descending delivery reaches the connected thigh, then foot |
| Blocked thigh intention | 3/3 reception | first actual surface is **chest**, not successful thigh technique |
| Flat aerial | 0/3 | chest/thigh contact does not yield final control within the limit |
| Knee / shin exercises | 0/3 each | no contact; kept as misses |
| Side/top/back spin | 3/3 each | spin enters contact/flight and is never cleared by a reset |
| Autonomous aerial | 2/3 | one failure remains; not equivalent to prescribed execution |

The original straight-down thigh setup was rejected as a thigh demonstration
because it crossed the chest first. The final oblique thigh launcher is an explicit
apparatus geometry change, not an edited genuine-match replay. Its failed geometry
neighbours are retained separately.

## 7. Directional control

The 45° case retains control in 2/3 samples, 90° in 0/3 and 180° in 3/3. These counts
are continuation outcomes, not an assertion that a 180° turn is intrinsically easier.
Each receipt separately measures the realised outgoing direction/speed, subsequent
contact time/distance, body displacement, balance and fatigue. The player must
physically turn and follow the resulting ball; desired direction is not its result.
`firstRequestedVelocity` preserves the actual submitted first-contact vector; speed
error compares full 3D magnitudes against it, including lifted and settling requests.

Moving-start continuation completes 3/3. Under active pressure the ordinary
directional case and lifted-thigh plan complete 0/3; real defender contacts/control
disrupt them. The lifted plan's first actual surface can be chest. No defender is
automatically declared beaten, and there is no return-possession rule.

## 8. First-time passes and shots

Inside-foot and outside-foot cases each reach a real receiver and subsequent
control in 3/3. The actor's first physical contact has the passing objective;
there is no preceding cushioning/ownership phase. The receiver moves and attempts
its own physical contact rather than serving as a target-score formula.

The close shot reaches the legal canonical goal crossing in 3/3 with one actual
actor contact. Goal posts/crossbar use canonical collision/rebound geometry; an aim
ray is never a goal. A deliberately wide target is a negative regression control.
These unopposed shot exercises do not establish performance against a goalkeeper.

The short chest-redirect case also produces legal crossings, but its trace includes
an additional incidental thigh contact. It must **not** be counted as a pure
single-contact chest goal. Driven volleys, half-volleys, jumping headers and fully
prepared high first-time shots remain dependent research work.

## 9. Juggling and repeated contacts

Foot-only 2, 5 and 10 touches, and alternating feet, each complete 3/3. The controller
keeps a reachable ball in front of the body through finite movement. Every upward
impulse, subsequent ballistic arc, descending approach and motor deadline is real.
The ball is neither attached nor reset between contacts. The unit test checks
successive contact intervals against the preceding recovery, descending incoming
velocity and nonzero incoming spin in the spinning case.

These are deliberately gentle, near-symmetric diagnostic exercises, not rankings
of match ability. The mixed sequence completes 0/3: an incidental chest collision
fails its prescribed thigh sequence explicitly as `sequence_mismatch`. An earlier
receipt continued to ground contact; it is retained. No future foot/head touch is scheduled to rescue it. Free/moving
multi-surface juggling, especially head sequences, remains incomplete.

## 10. Attributes and controls

The exact existing schema has 28 attributes. The 20/40/60/80/100 contrast changes
one rating at a time, holding the other 27, weak foot, height, mass and incoming seed
fixed. Twelve axes include firstTouch, technique, agility, composure, concentration,
gameReading, heading, jumping, dribbling, passing, finishing and leadership.
The cognitive contrast uses autonomous aerial reception; most physical contrasts
use the same fast-low prescribed task. That context limitation is explicit.

In paired sample 0, changing only firstTouch 20→100 changes first outgoing speed
from 2.860 to 0.009 m/s. Control time is **not** monotonic (0.625→0.575 s): body
approach and the later foot opportunity matter too. Technique 20/60/100 produces
5.513/1.452/0.975 m/s, likewise without a forced monotonic final score. Leadership
20–100 leaves contact/trajectory metrics unchanged; the unit regression compares
the complete trajectories, not a score computed from leadership.

Null effects for passing, finishing, heading or jumping in a ground-cushion task
do not prove those attributes are redundant. The new apparatus does not yet
separate all technical/cognitive responsibilities across C2 actions. Ten further
contrasts isolate weak-foot proficiency, player height and starting fitness.
No permanent balance rating or hidden laboratory success multiplier was added.

## 11. Physical validation and retained negatives

Fourteen new tests cover swept fast impact, impulse consistency, spin persistence,
near miss, unreachable high foot, absent thigh geometry, unsupported head/overhead,
overlap deduplication, recovery, old/optional save roundtrip, human/default isolation,
multi-contact reception, actual defender disruption, real receiver/goal crossing,
repeated flights, attribute isolation, flight-counter continuity and observer neutrality.
PR189's 21 and PR190's seven relevant regressions are retained; all 42 final focused
tests pass and are recorded with the verification receipt.

Early apparatus receipts are compressed under `rejected-apparatus-*`: direct
thigh selection initially ignored an intervening torso, and early juggling omitted
incidental contacts. Their success counts are invalid evidence for those features.
Final failures remain in the primary receipt; improving coverage did not mean
turning every exercise green. No historical PR188–190 archive was duplicated.

## 12. Transfer to genuine match situations

Five complete genuine captured states are retained: three default WW ground/aerial
states and one actual pre-impact state from each SS/SW body experiment. The latter
are reproduced from the original full-match input to the first recorded collision;
their complete contact receipt must equal the full-match receipt before saving.
No player, ball, velocity or clock coordinate is changed for the replay.

Each state runs 320 ticks, twice observed and once unobserved, with the body option
off and on. All final-state/contact/trace comparisons agree. The SS and SW pairs
execute one new chest contact each at heights 0.978 and 1.171 m. SS ends with a
different ordinary owner; SW remains loose at eight seconds, whereas its default
pair has an owner. This is physical transfer, not guaranteed useful reception.
The three WW pairs have no new body contact and preserve their outcomes.

Only the optional experiment configuration differs. The opt-in handles non-shot,
open-play deliveries, excludes keeper/human execution, respects injury, dismissal,
throw-in restrictions, offside and existing motor deadlines, and reuses aerial
separation locks. It adds no policy-scoring reward. B stays default and all five
policy IDs/interfaces remain intact. Captured genuine first-time shooting,
touchline rescue and a broad all-policy transfer matrix remain open.

## 13. Full-match development observations

Same retained B/WW/SS/SW initial inputs, unchanged 7,200 s maximum, all reach full time:

| Design | PR190 passes | Body experiment passes | Shots old → new | New body contacts | In-play min old → new |
| --- | ---: | ---: | ---: | ---: | ---: |
| WW | 321/675 | 321/675 | 12 → 12 | 0 | 79.12 → 79.12 |
| SS | 1547/2238 | 1502/2204 | 12 → 20 | 3 | 77.18 → 78.19 |
| SW | 966/1692 | 957/1729 | 23 → 27 | 4 | 79.68 → 79.83 |

All seven are chest contacts, with no preparation in the captured receipts: these
are passive body responses, not evidence of an autonomous prepared chest cushion.
More shots in these two trajectories do not establish improved attacking football;
pass accuracy falls and effective playing time does not improve. These are three
paired designs, not an independent confirmation cohort. Other policies retain
compatibility tests, but no new complete five-policy confirmation is claimed.

The `*-flow.json` follow-up adds existing complete flow observation and must preserve
the preceding whole final-state hash. Its compact fields report first-time attempts/
completions, directional/heavy/failed reception, second-ball recoveries, final-third/
box entries, carries, possession changes and pass failure causes. These observations
do not alter action scoring or enforce any quota.
Review also corrected the experimental early-return path to advance canonical
flight time/distance through the impact tick; its regression requires that continuity.
All three complete repeated final-state hashes match the earlier body series after
that correction and the added telemetry. New telemetry includes:

| Design | First-time passes attempted/completed | Directional receptions | Failed reception | Final-third/box entries | Poor-touch recoveries |
| --- | ---: | ---: | ---: | ---: | ---: |
| WW | 56/30 | 2 | 27 | 113/26 | 37 |
| SS | 310/251 | 755 | 1 | 154/33 | 41 |
| SW | 174/121 | 353 | 29 | 190/40 | 72 |

## 14. Human inspection

Start the app, open **Pojedynczy mecz [DEV]**, then **Widok diagnostyczny → PR191 ·
Pierwszy kontakt i gra z pierwszej piłki**. Select the real player card, exercise,
mode and seed. Run, scrub contact time or play the stored trajectory. The existing
pitch renderer is reused with its player-focus camera and 0–1.5 zoom. JSON export
contains the complete input, actual contacts, spin and trace.

The table shows intended/actual surface, coordinates, incoming/outgoing speed and
recovery. Animation does not yet articulate these chest/thigh techniques precisely;
the physical receipts, not the displayed limb animation, are authoritative. The
viewer currently focuses on the actor and defender; receiver contacts remain in
the table/JSON. Collision-volume graphical overlays remain open.

Fresh browser inspection executed a thigh-to-foot sequence, scrubbed its 0.125 s
thigh contact and exercised zoom 1.5. `browser-thigh.png` retains that view. A live
module-signature edit caused an earlier HMR error; after a full reload the final
player selector, controls, execution and renderer worked. That development error
is retained in the browser receipt, rather than described as a clean session.

## 15. Determinism and performance

The 298 paired laboratory inputs, five captured-state off/on replays and all
historical checks distinguish the observer from the executing controller. Observers
receive detached data and never consume RNG or choose outcomes. Full-match source
manifests and source hashes identify each measured version; the earlier default WW
run predates later apparatus/UI edits, and is not relabelled as final-head execution.

Three initial concurrent body development runs measured CPU 220.5/200.1/206.2 s,
wall 203.7/180.7/188.0 s and final RSS 437.5/521.7/489.6 MiB for WW/SS/SW. Final RSS
is not peak memory, and concurrent wall times are not an overhead estimate.
`performance.json` records the separate fresh-process ABBA observer-off 8,000-tick
probe after 400 warmup ticks, requiring identical normalised final states.
Its result is a small development cost measurement, not a confidence interval.
Mean CPU is 11.290 s default versus 11.532 s opt-in (+2.1%); mean wall time is
9.346 versus 9.482 s, and final RSS 300.3 versus 303.3 MiB. All four normalised
whole-state hashes agree. This workload has no actual new body impact, so it
measures enabling/filtering cost rather than the cost of a congested body collision.

## 16. Unimplemented actions and research specifications

Prepared lifted thighs require a bounded hip/knee controller with an explicit
support leg and connected swept foot/thigh motion; the present neutral leg capsules
must not be described as that controller. Genuine airborne volleys need a bounded
foot trajectory and impact within it, followed by balance/recovery. New physical
head juggling must adapt the existing heading mechanism, not create a labelled
foot replacement. General multiple simultaneous collisions and keeper leg gaps
remain outside this limited non-shot body experiment.

An overhead kick remains unavailable until takeoff, achievable body rotation,
airborne foot contact, lawful spatial clearance/dangerous play, fall/landing,
recovery and injury consequences have executable models and tests. A shot label
alone is insufficient. No acrobatic bonus, success probability or animation-only
substitute is introduced.

## 17. Reproduction and verification

```sh
npm run benchmark:pr191:check
npm run benchmark:pr191:replay
npm run benchmark:pr191:baseline
npm run benchmark:pr190:replay
npm run verify
```

Generators refuse to overwrite retained evidence. To run a fresh laboratory use
`benchmarkPr191.mjs --output=<new scratch receipt>`. To repeat a full fixture use
`npm run benchmark:pr191:matches -- --design=ss --mode=body --version=<new-label>`;
choose `--policy=<existing-id>` explicitly for other retained development fixtures.
`capturePr191Transfer.mjs` reproduces the first recorded SS/SW contact from kickoff.
`freezePr191.mjs` reads baseline bytes directly from its immutable Git commit.
Detailed traces are compressed only for selected informative cases. The evidence
index checks current source, runners and every PR191 artifact without rewriting it.

Initial local `npm run verify` passed lint and all 2,229 unit tests, then the legacy
native half hit its unchanged 90 s limit while browser rendering was active;
55/56 integration tests passed. After closing both preview servers and the graphical
tab, the isolated legacy/default-B halves pass in 56.643/71.359 s. The complete
rerun and final-head CI results are recorded in `verification.json` and on the PR.
No test assertion, test stage or original time budget was removed or enlarged.
The complete rerun passes 2,229 unit + 56 integration + four career-contract + five
full-career tests (2,294), lint and production build. Its unit stage preceded the
last opt-in counter/reporting refinements; the subsequent 42-test focused suite,
TypeScript check and final-head CI validate those final additions explicitly.

## 18. Gates, readiness and next steps

| Gate | Verdict |
| --- | --- |
| 1 audit | complete; unsupported and uncertain abilities explicitly separated |
| 2 common foundation | implemented subset; finite receipts, moving CCD and deduplication |
| 3 reception | ground/chest/thigh-to-foot demonstrated; knee/shin exercises fail |
| 4 directional | real direction/movement/pressure measured; 90° and lifted-pressure failures retained |
| 5 first-time | real receiver and one-contact close shot demonstrated; advanced C2 open |
| 6 attributes | isolated firstTouch/technique and negative control; broader causal calibration open |
| 7 juggling | real foot-only sequences; mixed/head/free moving exercises incomplete |
| 8 match transfer | passive chest subset demonstrated; prepared autonomous aerial actions open |
| 9 development | three B designs; no broad all-policy or independent readiness claim |
| 10 verification | final local/CI receipts report the exact completed checks separately |

Keep the PR experimental/draft. Next work should independently validate prepared
surface selection, accurate joint motion, contested/keeper ordering, useful
continuation and broader match transfer before enabling this option generally.
Circulation, chance creation and natural stoppages remain independent blockers.
The roadmap explicitly maps old PR191 generation work to **PR192**, old summary/
PlayStyles PR192 to **PR193**, career UX PR193 to **PR194** and world PR194+ to
**PR195+**. All postponed generational and career/world commitments remain intact;
Summary Simulation is still blocked by canonical readiness.
