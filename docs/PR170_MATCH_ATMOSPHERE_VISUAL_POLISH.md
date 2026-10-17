# PR170 — Match Atmosphere, Stylized Visual Polish & Career UI Refinement

Base: merged PR169, `77fd3a33946b7f0a14733a76d9820d29b15366f4`.

Work in progress: implementation and production browser evidence are being verified.
This draft is not declared ready until the complete, unchanged `npm run verify` passes.

## Audited architecture and execution order

Read PROJECT_STATE, the authoritative ROADMAP and reports PR161, PR165, PR168 and
PR169. Inspect stadium/model/face/animation/frame/replay/camera/kit boundaries,
CareerApp/CareerView/SeasonView, transfer generation and acceptance, calendar,
timeline, finances and persistence. Reuse these owners; no second engine/calendar.

1. Freeze the merged source, production build, UI screenshots and CPU baseline.
2. Limit generated/selectable external offers to six; preserve renewals and safety net.
3. Project the real ledger into finance details; mount a read-only calendar under the table.
4. Remove redundant HUD and move accessible target selection into the decision panel.
5. Refine three PR161 stadiums, batch static geometry, add bounded crowd/bench detail,
   camera roof cutaways, modest articulation and optional material comparison.
6. Use actual canonical transitions for short dismissible captions and final summary.
7. Run focused regressions, real production Edge checks, paired rendering/CPU/loading
   measurements, then full verify; record limitations and all acceptance answers.

The canonical football simulation sources and outcome parameters remain unchanged.
PR171 diagnostics → PR172 supported calibration → PR173 generations/world strength →
PR174 summary/PlayStyles → PR175+ world expansion remain reserved.
