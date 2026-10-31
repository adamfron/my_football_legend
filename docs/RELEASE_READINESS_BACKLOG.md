# Career playtest — release readiness backlog

Source: the user's PR210 career playtest feedback. This is a scoped work register, not a promise to finish every item before PR211. P1 = player-facing correctness; P2 = usability or further diagnosis. Stored career facts remain authoritative.

| Item | Priority / scope | Observable acceptance criterion | Dependency / status |
| --- | --- | --- | --- |
| Premature on-ball menu during sprint carry | P1; human agency/contact readiness | A real 40 Hz pursuit reaches an executable contact before an ordinary menu; interception/out terminate it; meaningful movement choices survive | PR210 primary correction; paired receipts and regression tests |
| Duplicate `Podaj do nogi` choices | P2; contextual action identity and labels | Equivalent choices appear once; distinct receiver, delivery or contact intentions stay distinguishable | Separate UI/action audit; no PR210 implementation |
| Very strong players receiving unusually often | P2; teammate selection diagnosis | Frozen comparable scenes explain selection by role, availability and tactical value; attribute/identity counterfactuals expose any unexplained preference | Preserve engine information boundaries; diagnosis before tuning |
| Consistent football clock | P1; HUD, event lists, summaries | The same stoppage-time event displays `45+1` / `90+4` consistently; diagnostics retain precise canonical timestamps | Separate canonical and presentation time; no physical-clock changes |
| Goal team attribution | P1; match summary | Home/away scorers, own goals and team totals agree with canonical event identities in focused fixtures | Shared match-event facts; separate change |
| Standard match view panel/control density | P2; product UI | Representative play leaves the pitch and current meaningful choices legible without unnecessary panels dominating the view | Separate usability pass |
| Responsive match layout | P2; desktop and smaller viewports | A documented viewport set has readable pitch, decision targets and summaries without overlap or unreachable controls | Agree viewport set; follow panel-density audit |
| Development controls versus player controls | P2; match UI | Standard career play exposes relevant player actions; diagnostic tools remain accessible through an explicit development surface | Preserve diagnostic capability and agency |
| Calendar current-day synchronization | P2; local read-only calendar | Following today tracks day/month/year progression; manual browsing survives; `Dziś`, arrows and focus work | PR210 isolated correction; four React regressions |
| Natural career wording | P2; presentation text | Replace awkward `zapisany debiut` with context-appropriate wording such as `Pierwszy występ w rozgrywkach seniorskich`, without changing the recorded event | Copy audit with historical-fact fixtures |
| Match and career-history presentation | P2; read-only views | The same stored facts appear consistently in history, match details and summaries; presentation changes do not rewrite archives | Shared fact attribution and clock work |
| Long-term statistical career calibration | P2; separate long-term simulation | Distributional runs across roles/seeds explain scoring, assists, appearances, titles and development; canonical match behaviour and statistical simulation are reported separately | Later canonical engine validation; no single-career outcome quotas |

The reported right-back career had **25 seasons, 626 appearances, 171 assists, zero goals, 10 top-division titles and maximum OVR 79**. These are user-reported observations, not a newly reproduced cohort. Zero goals deserves future distributional analysis. Do not award synthetic goals, alter attributes or treat this one career as an immediate canonical MatchEngine defect. Later career-simulation calibration must remain distinct from the physical/decision executor.

PR211's immediate engine dependency remains the intentional temporal-strike lifecycle described in [PR210](PR210_HUMAN_AGENCY_PHYSICAL_BALL_READINESS.md). Other backlog items can be prioritized independently.
