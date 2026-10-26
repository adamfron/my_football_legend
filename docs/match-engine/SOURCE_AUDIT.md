# Source audit coverage

Base: merged PR194 `e828f5a1e41bbec2101c71f42739037702276cce`. The source-aware survey enumerates **179 source modules and 140 test files** in the entire matchSimulation tree. It records exact normalized-LF SHA256, declared symbols, import consumers and 3017 context-bearing comparison/model-call candidates. Those candidates include tests/diagnostics and are **not** 3017 confirmed football errors.

The register is the semantic triage of mechanisms and cross-system gaps, including the complete user-specified checklist. This inventory is exhaustive for the named tree at this source; it does not certify that every extracted expression has an empirically established effect. Uncovered details remain open and may add stable IDs.

## Method and exclusions

1. TypeScript AST traversal across every .ts file, including tests; inspect numeric comparisons and model/distribution calls with their enclosing owner and expression, rather than count bare literals.
2. Trace imports, actual consumers and top-level generation→ranking→readiness→release→movement/contact→outcome/measurement paths. Examine the live legacy/risk-ablation/B/role and bounded O/H/J branches separately, including opt-in controllers.
3. Review current values in context: pass lane/race/reception forecasts, shot distance/coverage/branch models, canonical movement versus ETA, finite contact/collision surfaces, acquisition, keeper/aerial, tactical/effort, restart/liveness/timekeeping and injury/referee authority. Registry references name actual symbols and current lines.
4. Reconcile PR176–194 reports and linked evidence scopes. A historical test proves its old contract, not current calibration after downstream consumers changed. No sealed confirmation results are read or generated.
5. Exclude harmless indices/array iteration, formatting/UI durations, schema cardinalities, equality tolerances and law-defined dimensions from the *suspicious coefficient* count when they serve only that purpose. Keep physics integration tolerances and engineering budgets if their consumers can change contacts, candidate availability or football timing. A law definition may still need a correctness entry. Gravity is distinct from grass friction/restitution.
6. Deduplicate shared assumptions by mechanism: one playerArrival/contact envelope entry can list several consumers, rather than duplicate its literal per import. Isolated numeric constants do not establish severity; causal reach and known negative research determine P0/P1.

The first two new research modules have Zod contracts and are imported only by tests/scripts. No pre-existing canonical source module imports them. No runtime selector, coefficient, 28-attribute schema, fixed step, default B policy or saved-state schema is edited. Static import reachability below is not a claim that every reachable optional branch was executed.

## Per-file inventory

Each file has its exact symbols, findings and consumers in [source-inventory.json](../performance/pr195/source-inventory.json). “Registry context” indicates directly named implementation references; other files still received the AST/import survey and remain discoverable for later semantic deepening. Tests are partial contract evidence, not realism validation.

| File | Lines | Role / source reachability | Registry context |
|---|---:|---|---|
| [actionAgency.ts](../../src/core/matchSimulation/actionAgency.ts) | 20 | referenced from canonical entry (optional branches may be off) | CONTACT-014 |
| [actionEvents.test.ts](../../src/core/matchSimulation/actionEvents.test.ts) | 306 | test; contract-only | AST/import survey; no separate closed claim |
| [actionEvents.ts](../../src/core/matchSimulation/actionEvents.ts) | 457 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [actionImpact.ts](../../src/core/matchSimulation/actionImpact.ts) | 78 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [actionLifecycle.ts](../../src/core/matchSimulation/actionLifecycle.ts) | 12 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [activePerception.ts](../../src/core/matchSimulation/activePerception.ts) | 156 | referenced from canonical entry (optional branches may be off) | TACT-004, TACT-009 |
| [activePerceptionState.ts](../../src/core/matchSimulation/activePerceptionState.ts) | 140 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [aerialPlay.test.ts](../../src/core/matchSimulation/aerialPlay.test.ts) | 219 | test; contract-only | AST/import survey; no separate closed claim |
| [aerialPlay.ts](../../src/core/matchSimulation/aerialPlay.ts) | 374 | referenced from canonical entry (optional branches may be off) | GK-005, GK-006, MEAS-004 |
| [aerialPositioning.ts](../../src/core/matchSimulation/aerialPositioning.ts) | 101 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [agencyCalibration.ts](../../src/core/matchSimulation/agencyCalibration.ts) | 18 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [assumptionCalibration.ts](../../src/core/matchSimulation/assumptionCalibration.ts) | 442 | lab/diagnostic/schema or other non-entry module | MEAS-011 |
| [attackingFunnel.ts](../../src/core/matchSimulation/attackingFunnel.ts) | 580 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [attackingFunnelAudit.ts](../../src/core/matchSimulation/attackingFunnelAudit.ts) | 338 | lab/diagnostic/schema or other non-entry module | TACT-012 |
| [attackingTransition.ts](../../src/core/matchSimulation/attackingTransition.ts) | 114 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [attributeCognitionLab.ts](../../src/core/matchSimulation/attributeCognitionLab.ts) | 523 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [attributeMicroLab.ts](../../src/core/matchSimulation/attributeMicroLab.ts) | 279 | lab/diagnostic/schema or other non-entry module | MEAS-001, MEAS-002 |
| [backgroundBenchmark.test.ts](../../src/core/matchSimulation/backgroundBenchmark.test.ts) | 80 | test; contract-only | AST/import survey; no separate closed claim |
| [backgroundBenchmark.ts](../../src/core/matchSimulation/backgroundBenchmark.ts) | 113 | lab/diagnostic/schema or other non-entry module | MEAS-008, MEAS-009 |
| [backgroundPerformance.test.ts](../../src/core/matchSimulation/backgroundPerformance.test.ts) | 50 | test; contract-only | AST/import survey; no separate closed claim |
| [backgroundPerformance.ts](../../src/core/matchSimulation/backgroundPerformance.ts) | 121 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [ballAcquisition.test.ts](../../src/core/matchSimulation/ballAcquisition.test.ts) | 175 | test; contract-only | AST/import survey; no separate closed claim |
| [ballAcquisition.ts](../../src/core/matchSimulation/ballAcquisition.ts) | 150 | referenced from canonical entry (optional branches may be off) | PASS-007, DEF-004, MEAS-004 |
| [ballContactGeometry.test.ts](../../src/core/matchSimulation/ballContactGeometry.test.ts) | 384 | test; contract-only | AST/import survey; no separate closed claim |
| [ballContactGeometry.ts](../../src/core/matchSimulation/ballContactGeometry.ts) | 774 | referenced from canonical entry (optional branches may be off) | SHOT-011, DEF-003, DRIB-001, DRIB-004, DRIB-005 |
| [ballContactResolution.ts](../../src/core/matchSimulation/ballContactResolution.ts) | 137 | referenced from canonical entry (optional branches may be off) | DRIB-008, PHYS-002 |
| [ballFlight.test.ts](../../src/core/matchSimulation/ballFlight.test.ts) | 185 | test; contract-only | AST/import survey; no separate closed claim |
| [ballFlight.ts](../../src/core/matchSimulation/ballFlight.ts) | 381 | referenced from canonical entry (optional branches may be off) | DRIB-006, DRIB-008, GK-010, REST-010, PHYS-001, PHYS-002 |
| [ballOrientedMovement.test.ts](../../src/core/matchSimulation/ballOrientedMovement.test.ts) | 203 | test; contract-only | AST/import survey; no separate closed claim |
| [ballOrientedMovement.ts](../../src/core/matchSimulation/ballOrientedMovement.ts) | 303 | referenced from canonical entry (optional branches may be off) | DRIB-009 |
| [ballPhysics.test.ts](../../src/core/matchSimulation/ballPhysics.test.ts) | 279 | test; contract-only | AST/import survey; no separate closed claim |
| [ballPhysics.ts](../../src/core/matchSimulation/ballPhysics.ts) | 344 | referenced from canonical entry (optional branches may be off) | MEAS-010, PHYS-001, PHYS-002 |
| [ballSurfaceContact.ts](../../src/core/matchSimulation/ballSurfaceContact.ts) | 520 | referenced from canonical entry (optional branches may be off) | DRIB-006 |
| [benchmarkFixtures.ts](../../src/core/matchSimulation/benchmarkFixtures.ts) | 150 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [bodyMechanics.ts](../../src/core/matchSimulation/bodyMechanics.ts) | 133 | referenced from canonical entry (optional branches may be off) | SHOT-010, DRIB-004, GK-005, FIT-002, CONTACT-001, CONTACT-003 |
| [boundedDecision.ts](../../src/core/matchSimulation/boundedDecision.ts) | 826 | referenced from canonical entry (optional branches may be off) | DEC-001, DEC-003, DEC-005, DEC-009, DEC-010, DEC-012, SHOT-005, SHOT-008, TACT-012, CONTACT-009, MEAS-003 |
| [boundedIntelligence.test.ts](../../src/core/matchSimulation/boundedIntelligence.test.ts) | 337 | test; contract-only | AST/import survey; no separate closed claim |
| [boundedIntelligence.ts](../../src/core/matchSimulation/boundedIntelligence.ts) | 460 | referenced from canonical entry (optional branches may be off) | DEC-002, MEAS-007 |
| [boundedIntelligenceState.ts](../../src/core/matchSimulation/boundedIntelligenceState.ts) | 104 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [boundedPerception.ts](../../src/core/matchSimulation/boundedPerception.ts) | 261 | referenced from canonical entry (optional branches may be off) | TACT-009 |
| [calibrationMetrics.ts](../../src/core/matchSimulation/calibrationMetrics.ts) | 69 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [canonicalMatchSanity.test.ts](../../src/core/matchSimulation/canonicalMatchSanity.test.ts) | 260 | test; contract-only | AST/import survey; no separate closed claim |
| [canonicalMatchSanity.ts](../../src/core/matchSimulation/canonicalMatchSanity.ts) | 456 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [canonicalMovement.ts](../../src/core/matchSimulation/canonicalMovement.ts) | 78 | referenced from canonical entry (optional branches may be off) | DEF-002, DEF-005, FIT-002 |
| [canonicalPresentation.ts](../../src/core/matchSimulation/canonicalPresentation.ts) | 562 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [carryExecution.ts](../../src/core/matchSimulation/carryExecution.ts) | 215 | referenced from canonical entry (optional branches may be off) | DRIB-002 |
| [carryOpportunity.ts](../../src/core/matchSimulation/carryOpportunity.ts) | 224 | referenced from canonical entry (optional branches may be off) | DRIB-001, DRIB-002 |
| [carryPursuit.ts](../../src/core/matchSimulation/carryPursuit.ts) | 58 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [coachIntelligence.ts](../../src/core/matchSimulation/coachIntelligence.ts) | 427 | referenced from canonical entry (optional branches may be off) | TACT-008 |
| [combinationPlay.ts](../../src/core/matchSimulation/combinationPlay.ts) | 361 | referenced from canonical entry (optional branches may be off) | DEC-009, PASS-010, TACT-003 |
| [combinationState.ts](../../src/core/matchSimulation/combinationState.ts) | 39 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [contactEvidence.ts](../../src/core/matchSimulation/contactEvidence.ts) | 235 | referenced from canonical entry (optional branches may be off) | PASS-007, DEF-011, MEAS-011 |
| [contactTacticalDiagnostics.test.ts](../../src/core/matchSimulation/contactTacticalDiagnostics.test.ts) | 184 | test; contract-only | AST/import survey; no separate closed claim |
| [contactTacticalDiagnostics.ts](../../src/core/matchSimulation/contactTacticalDiagnostics.ts) | 590 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [contextualInteractions.ts](../../src/core/matchSimulation/contextualInteractions.ts) | 747 | referenced from canonical entry (optional branches may be off) | DEF-009 |
| [cooperativePressPhysics.test.ts](../../src/core/matchSimulation/cooperativePressPhysics.test.ts) | 246 | test; contract-only | AST/import survey; no separate closed claim |
| [crossOpportunity.ts](../../src/core/matchSimulation/crossOpportunity.ts) | 144 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [deadBallEnclosure.ts](../../src/core/matchSimulation/deadBallEnclosure.ts) | 26 | referenced from canonical entry (optional branches may be off) | DRIB-010, REST-002 |
| [decisionObservation.ts](../../src/core/matchSimulation/decisionObservation.ts) | 26 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [decisionOutcome.ts](../../src/core/matchSimulation/decisionOutcome.ts) | 125 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [decisionPolicy.ts](../../src/core/matchSimulation/decisionPolicy.ts) | 166 | referenced from canonical entry (optional branches may be off) | DEC-003, DEC-012, TACT-012 |
| [decisionPolicyConfig.ts](../../src/core/matchSimulation/decisionPolicyConfig.ts) | 72 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [decisionReadiness.ts](../../src/core/matchSimulation/decisionReadiness.ts) | 89 | referenced from canonical entry (optional branches may be off) | DEC-002 |
| [decisionResearchProtocol.ts](../../src/core/matchSimulation/decisionResearchProtocol.ts) | 196 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [decisionStateValue.ts](../../src/core/matchSimulation/decisionStateValue.ts) | 441 | referenced from canonical entry (optional branches may be off) | DEC-001, DEC-005, DEC-006, DEC-007, DEC-008, DEC-013, PASS-012, SHOT-001, SHOT-007, GK-009, TACT-006 |
| [defensiveChallenges.ts](../../src/core/matchSimulation/defensiveChallenges.ts) | 1360 | referenced from canonical entry (optional branches may be off) | DEF-004, DEF-006, DEF-007, DEF-008, DEF-009, REST-008, CONTACT-001 |
| [depthThreat.ts](../../src/core/matchSimulation/depthThreat.ts) | 211 | referenced from canonical entry (optional branches may be off) | TACT-005 |
| [dynamicIntervention.ts](../../src/core/matchSimulation/dynamicIntervention.ts) | 166 | referenced from canonical entry (optional branches may be off) | DEF-012 |
| [effectivePlayingTime.ts](../../src/core/matchSimulation/effectivePlayingTime.ts) | 111 | lab/diagnostic/schema or other non-entry module | REST-014, MEAS-006 |
| [experimentalBodyReception.ts](../../src/core/matchSimulation/experimentalBodyReception.ts) | 133 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [extendedPhysicalLab.test.ts](../../src/core/matchSimulation/extendedPhysicalLab.test.ts) | 375 | test; contract-only | AST/import survey; no separate closed claim |
| [extendedPhysicalLab.ts](../../src/core/matchSimulation/extendedPhysicalLab.ts) | 1204 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [firstTimePassing.ts](../../src/core/matchSimulation/firstTimePassing.ts) | 106 | referenced from canonical entry (optional branches may be off) | PASS-008 |
| [firstTouch.test.ts](../../src/core/matchSimulation/firstTouch.test.ts) | 272 | test; contract-only | AST/import survey; no separate closed claim |
| [firstTouch.ts](../../src/core/matchSimulation/firstTouch.ts) | 182 | referenced from canonical entry (optional branches may be off) | DRIB-003, FIT-006 |
| [firstTouchLabCatalog.ts](../../src/core/matchSimulation/firstTouchLabCatalog.ts) | 300 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [firstTouchLaboratory.test.ts](../../src/core/matchSimulation/firstTouchLaboratory.test.ts) | 297 | test; contract-only | AST/import survey; no separate closed claim |
| [firstTouchLaboratory.ts](../../src/core/matchSimulation/firstTouchLaboratory.ts) | 763 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [fitnessMicroLab.ts](../../src/core/matchSimulation/fitnessMicroLab.ts) | 183 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [footContact.ts](../../src/core/matchSimulation/footContact.ts) | 404 | referenced from canonical entry (optional branches may be off) | SHOT-010, DEF-003, DRIB-005, DRIB-007 |
| [footballContactResearchPlan.test.ts](../../src/core/matchSimulation/footballContactResearchPlan.test.ts) | 39 | test; contract-only | AST/import survey; no separate closed claim |
| [footballContactResearchPlan.ts](../../src/core/matchSimulation/footballContactResearchPlan.ts) | 152 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [footballIntelligenceDiagnostics.ts](../../src/core/matchSimulation/footballIntelligenceDiagnostics.ts) | 530 | lab/diagnostic/schema or other non-entry module | MEAS-009 |
| [footballLabAnalysis.ts](../../src/core/matchSimulation/footballLabAnalysis.ts) | 114 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [footballLabCatalog.ts](../../src/core/matchSimulation/footballLabCatalog.ts) | 253 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [footballLabObjects.ts](../../src/core/matchSimulation/footballLabObjects.ts) | 427 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [footballPerformanceLab.test.ts](../../src/core/matchSimulation/footballPerformanceLab.test.ts) | 561 | test; contract-only | AST/import survey; no separate closed claim |
| [footballPerformanceLab.ts](../../src/core/matchSimulation/footballPerformanceLab.ts) | 1456 | lab/diagnostic/schema or other non-entry module | MEAS-001 |
| [goalCoordinates.ts](../../src/core/matchSimulation/goalCoordinates.ts) | 20 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [goalkeeperClaim.ts](../../src/core/matchSimulation/goalkeeperClaim.ts) | 80 | referenced from canonical entry (optional branches may be off) | GK-003, GK-004 |
| [goalkeeperDistribution.ts](../../src/core/matchSimulation/goalkeeperDistribution.ts) | 89 | referenced from canonical entry (optional branches may be off) | GK-007 |
| [goalkeeperIntervention.test.ts](../../src/core/matchSimulation/goalkeeperIntervention.test.ts) | 225 | test; contract-only | AST/import survey; no separate closed claim |
| [goalkeeperIntervention.ts](../../src/core/matchSimulation/goalkeeperIntervention.ts) | 178 | referenced from canonical entry (optional branches may be off) | SHOT-006, DEF-012, GK-002, GK-003, GK-010 |
| [goalkeeperPositioning.test.ts](../../src/core/matchSimulation/goalkeeperPositioning.test.ts) | 26 | test; contract-only | AST/import survey; no separate closed claim |
| [goalkeeperPositioning.ts](../../src/core/matchSimulation/goalkeeperPositioning.ts) | 105 | referenced from canonical entry (optional branches may be off) | GK-001, GK-004, GK-009 |
| [identityHistory.test.ts](../../src/core/matchSimulation/identityHistory.test.ts) | 31 | test; contract-only | AST/import survey; no separate closed claim |
| [identityHistory.ts](../../src/core/matchSimulation/identityHistory.ts) | 37 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [incidentalGoalState.ts](../../src/core/matchSimulation/incidentalGoalState.ts) | 12 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [incidentalGoals.ts](../../src/core/matchSimulation/incidentalGoals.ts) | 101 | referenced from canonical entry (optional branches may be off) | MEAS-005 |
| [index.ts](../../src/core/matchSimulation/index.ts) | 73 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [injuryStoppage.ts](../../src/core/matchSimulation/injuryStoppage.ts) | 288 | referenced from canonical entry (optional branches may be off) | REST-013, CONTACT-005, CONTACT-006, CONTACT-008, CONTACT-011, CONTACT-012, CONTACT-013, CONTACT-015 |
| [locomotion.test.ts](../../src/core/matchSimulation/locomotion.test.ts) | 75 | test; contract-only | AST/import survey; no separate closed claim |
| [locomotion.ts](../../src/core/matchSimulation/locomotion.ts) | 307 | referenced from canonical entry (optional branches may be off) | DEF-001, FIT-001, FIT-003 |
| [looseBallLiveness.ts](../../src/core/matchSimulation/looseBallLiveness.ts) | 150 | referenced from canonical entry (optional branches may be off) | REST-003 |
| [looseBallPhysics.test.ts](../../src/core/matchSimulation/looseBallPhysics.test.ts) | 186 | test; contract-only | AST/import survey; no separate closed claim |
| [looseBallPhysics.ts](../../src/core/matchSimulation/looseBallPhysics.ts) | 219 | referenced from canonical entry (optional branches may be off) | DRIB-009 |
| [lowerBodyGeometry.ts](../../src/core/matchSimulation/lowerBodyGeometry.ts) | 216 | referenced from canonical entry (optional branches may be off) | DRIB-006 |
| [matchActions.ts](../../src/core/matchSimulation/matchActions.ts) | 1877 | referenced from canonical entry (optional branches may be off) | DEC-002, DEC-004, DEC-005, CONTACT-009 |
| [matchCentreStatistics.ts](../../src/core/matchSimulation/matchCentreStatistics.ts) | 114 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [matchComparison.ts](../../src/core/matchSimulation/matchComparison.ts) | 86 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [matchEventFeed.test.ts](../../src/core/matchSimulation/matchEventFeed.test.ts) | 317 | test; contract-only | AST/import survey; no separate closed claim |
| [matchEventFeed.ts](../../src/core/matchSimulation/matchEventFeed.ts) | 177 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [matchFitness.ts](../../src/core/matchSimulation/matchFitness.ts) | 352 | referenced from canonical entry (optional branches may be off) | TACT-011, FIT-003, FIT-004, FIT-005, FIT-006, FIT-007, FIT-009, FIT-010, CONTACT-004, MEAS-002 |
| [matchFlowCalibration.ts](../../src/core/matchSimulation/matchFlowCalibration.ts) | 95 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [matchFlowTelemetry.test.ts](../../src/core/matchSimulation/matchFlowTelemetry.test.ts) | 381 | test; contract-only | AST/import survey; no separate closed claim |
| [matchFlowTelemetry.ts](../../src/core/matchSimulation/matchFlowTelemetry.ts) | 1300 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [matchGoalkeeper.ts](../../src/core/matchSimulation/matchGoalkeeper.ts) | 52 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [matchInjuries.ts](../../src/core/matchSimulation/matchInjuries.ts) | 152 | referenced from canonical entry (optional branches may be off) | CONTACT-002, CONTACT-003, CONTACT-004, CONTACT-005, CONTACT-007, CONTACT-012, CONTACT-013 |
| [matchMoment.test.ts](../../src/core/matchSimulation/matchMoment.test.ts) | 138 | test; contract-only | AST/import survey; no separate closed claim |
| [matchMoment.ts](../../src/core/matchSimulation/matchMoment.ts) | 241 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [matchParticipants.ts](../../src/core/matchSimulation/matchParticipants.ts) | 12 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [matchPresentation.test.ts](../../src/core/matchSimulation/matchPresentation.test.ts) | 96 | test; contract-only | AST/import survey; no separate closed claim |
| [matchPresentation.ts](../../src/core/matchSimulation/matchPresentation.ts) | 221 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [matchReplay.ts](../../src/core/matchSimulation/matchReplay.ts) | 473 | lab/diagnostic/schema or other non-entry module | MEAS-007 |
| [matchRules.ts](../../src/core/matchSimulation/matchRules.ts) | 552 | referenced from canonical entry (optional branches may be off) | DEF-007, CONTACT-006, CONTACT-014 |
| [matchSimulation.test.ts](../../src/core/matchSimulation/matchSimulation.test.ts) | 586 | test; contract-only | AST/import survey; no separate closed claim |
| [matchSimulation.ts](../../src/core/matchSimulation/matchSimulation.ts) | 3330 | referenced from canonical entry (optional branches may be off) | SHOT-006, CONTACT-007, MEAS-010 |
| [matchSituationEvaluator.test.ts](../../src/core/matchSimulation/matchSituationEvaluator.test.ts) | 156 | test; contract-only | AST/import survey; no separate closed claim |
| [matchSituationEvaluator.ts](../../src/core/matchSimulation/matchSituationEvaluator.ts) | 154 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [matchSpace.test.ts](../../src/core/matchSimulation/matchSpace.test.ts) | 12 | test; contract-only | AST/import survey; no separate closed claim |
| [matchSpace.ts](../../src/core/matchSimulation/matchSpace.ts) | 103 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [matchState.ts](../../src/core/matchSimulation/matchState.ts) | 1284 | referenced from canonical entry (optional branches may be off) | GK-008, TACT-010 |
| [matchTimekeeping.ts](../../src/core/matchSimulation/matchTimekeeping.ts) | 193 | referenced from canonical entry (optional branches may be off) | REST-011 |
| [movementAuthority.ts](../../src/core/matchSimulation/movementAuthority.ts) | 96 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [naturalMatchFlowDiagnostics.test.ts](../../src/core/matchSimulation/naturalMatchFlowDiagnostics.test.ts) | 79 | test; contract-only | AST/import survey; no separate closed claim |
| [naturalMatchFlowDiagnostics.ts](../../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts) | 160 | lab/diagnostic/schema or other non-entry module | REST-014 |
| [observedPassDelivery.ts](../../src/core/matchSimulation/observedPassDelivery.ts) | 68 | referenced from canonical entry (optional branches may be off) | PASS-009 |
| [offensiveContinuationFunnel.ts](../../src/core/matchSimulation/offensiveContinuationFunnel.ts) | 372 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [offside.ts](../../src/core/matchSimulation/offside.ts) | 170 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [onBallPreparation.ts](../../src/core/matchSimulation/onBallPreparation.ts) | 432 | referenced from canonical entry (optional branches may be off) | PASS-009 |
| [opponentKnowledge.ts](../../src/core/matchSimulation/opponentKnowledge.ts) | 137 | referenced from canonical entry (optional branches may be off) | DEC-007, DEC-010, TACT-009 |
| [opportunityWindows.ts](../../src/core/matchSimulation/opportunityWindows.ts) | 233 | referenced from canonical entry (optional branches may be off) | DEC-011, PASS-004, PASS-011, DEF-001, TACT-004 |
| [passClaimResolver.ts](../../src/core/matchSimulation/passClaimResolver.ts) | 127 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [passClassification.ts](../../src/core/matchSimulation/passClassification.ts) | 43 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [passDecision.ts](../../src/core/matchSimulation/passDecision.ts) | 241 | referenced from canonical entry (optional branches may be off) | PASS-001, PASS-003, PASS-006, DEF-012 |
| [passExecution.ts](../../src/core/matchSimulation/passExecution.ts) | 214 | referenced from canonical entry (optional branches may be off) | PASS-002, PASS-005, MEAS-003 |
| [passLaunchPlan.ts](../../src/core/matchSimulation/passLaunchPlan.ts) | 220 | referenced from canonical entry (optional branches may be off) | PASS-002, PASS-008, GK-007 |
| [passLifecycleDiagnostics.ts](../../src/core/matchSimulation/passLifecycleDiagnostics.ts) | 339 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [passReception.ts](../../src/core/matchSimulation/passReception.ts) | 525 | referenced from canonical entry (optional branches may be off) | PASS-001, PASS-004, PASS-006 |
| [passReceptionSpin.test.ts](../../src/core/matchSimulation/passReceptionSpin.test.ts) | 56 | test; contract-only | AST/import survey; no separate closed claim |
| [passingConnectivityDiagnostics.ts](../../src/core/matchSimulation/passingConnectivityDiagnostics.ts) | 281 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [pathologicalReplay.ts](../../src/core/matchSimulation/pathologicalReplay.ts) | 84 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [perceptionDiagnostics.ts](../../src/core/matchSimulation/perceptionDiagnostics.ts) | 165 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [perceptionLaboratory.ts](../../src/core/matchSimulation/perceptionLaboratory.ts) | 327 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [performanceProfiling.ts](../../src/core/matchSimulation/performanceProfiling.ts) | 138 | referenced from canonical entry (optional branches may be off) | MEAS-008 |
| [pitchBoundary.test.ts](../../src/core/matchSimulation/pitchBoundary.test.ts) | 61 | test; contract-only | AST/import survey; no separate closed claim |
| [pitchBoundary.ts](../../src/core/matchSimulation/pitchBoundary.ts) | 73 | referenced from canonical entry (optional branches may be off) | PASS-012, DRIB-010, REST-010 |
| [playerActiveMinutes.ts](../../src/core/matchSimulation/playerActiveMinutes.ts) | 33 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [playerAgency.test.ts](../../src/core/matchSimulation/playerAgency.test.ts) | 94 | test; contract-only | AST/import survey; no separate closed claim |
| [playerAgency.ts](../../src/core/matchSimulation/playerAgency.ts) | 127 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [playerArrival.test.ts](../../src/core/matchSimulation/playerArrival.test.ts) | 61 | test; contract-only | AST/import survey; no separate closed claim |
| [playerArrival.ts](../../src/core/matchSimulation/playerArrival.ts) | 118 | referenced from canonical entry (optional branches may be off) | PASS-003, DEF-002, GK-002 |
| [playerDecision.test.ts](../../src/core/matchSimulation/playerDecision.test.ts) | 750 | test; contract-only | AST/import survey; no separate closed claim |
| [playerDecision.ts](../../src/core/matchSimulation/playerDecision.ts) | 1834 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [playerMatchStats.test.ts](../../src/core/matchSimulation/playerMatchStats.test.ts) | 476 | test; contract-only | AST/import survey; no separate closed claim |
| [playerMatchStats.ts](../../src/core/matchSimulation/playerMatchStats.ts) | 915 | referenced from canonical entry (optional branches may be off) | DEF-011, MEAS-005 |
| [playerMatchStatsPhysicalContacts.test.ts](../../src/core/matchSimulation/playerMatchStatsPhysicalContacts.test.ts) | 148 | test; contract-only | AST/import survey; no separate closed claim |
| [playerOrientation.test.ts](../../src/core/matchSimulation/playerOrientation.test.ts) | 33 | test; contract-only | AST/import survey; no separate closed claim |
| [playerOrientation.ts](../../src/core/matchSimulation/playerOrientation.ts) | 128 | referenced from canonical entry (optional branches may be off) | DEF-005 |
| [positioningReference.ts](../../src/core/matchSimulation/positioningReference.ts) | 21 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [possessionAgency.ts](../../src/core/matchSimulation/possessionAgency.ts) | 300 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [possessionEvents.ts](../../src/core/matchSimulation/possessionEvents.ts) | 137 | referenced from canonical entry (optional branches may be off) | CONTACT-010 |
| [postGoalReactions.ts](../../src/core/matchSimulation/postGoalReactions.ts) | 183 | referenced from canonical entry (optional branches may be off) | REST-013 |
| [pr120.test.ts](../../src/core/matchSimulation/pr120.test.ts) | 92 | test; contract-only | AST/import survey; no separate closed claim |
| [pr121.test.ts](../../src/core/matchSimulation/pr121.test.ts) | 65 | test; contract-only | AST/import survey; no separate closed claim |
| [pr123.test.ts](../../src/core/matchSimulation/pr123.test.ts) | 211 | test; contract-only | AST/import survey; no separate closed claim |
| [pr130.test.ts](../../src/core/matchSimulation/pr130.test.ts) | 118 | test; contract-only | AST/import survey; no separate closed claim |
| [pr131.test.ts](../../src/core/matchSimulation/pr131.test.ts) | 86 | test; contract-only | AST/import survey; no separate closed claim |
| [pr132.test.ts](../../src/core/matchSimulation/pr132.test.ts) | 59 | test; contract-only | AST/import survey; no separate closed claim |
| [pr134.test.ts](../../src/core/matchSimulation/pr134.test.ts) | 99 | test; contract-only | AST/import survey; no separate closed claim |
| [pr136.test.ts](../../src/core/matchSimulation/pr136.test.ts) | 82 | test; contract-only | AST/import survey; no separate closed claim |
| [pr138.test.ts](../../src/core/matchSimulation/pr138.test.ts) | 116 | test; contract-only | AST/import survey; no separate closed claim |
| [pr139.test.ts](../../src/core/matchSimulation/pr139.test.ts) | 54 | test; contract-only | AST/import survey; no separate closed claim |
| [pr140.test.ts](../../src/core/matchSimulation/pr140.test.ts) | 59 | test; contract-only | AST/import survey; no separate closed claim |
| [pr143.test.ts](../../src/core/matchSimulation/pr143.test.ts) | 269 | test; contract-only | AST/import survey; no separate closed claim |
| [pr144Agency.test.ts](../../src/core/matchSimulation/pr144Agency.test.ts) | 465 | test; contract-only | AST/import survey; no separate closed claim |
| [pr145Agency.test.ts](../../src/core/matchSimulation/pr145Agency.test.ts) | 226 | test; contract-only | AST/import survey; no separate closed claim |
| [pr145Passing.test.ts](../../src/core/matchSimulation/pr145Passing.test.ts) | 603 | test; contract-only | AST/import survey; no separate closed claim |
| [pr147Agency.test.ts](../../src/core/matchSimulation/pr147Agency.test.ts) | 366 | test; contract-only | AST/import survey; no separate closed claim |
| [pr147Rules.test.ts](../../src/core/matchSimulation/pr147Rules.test.ts) | 970 | test; contract-only | AST/import survey; no separate closed claim |
| [pr148Agency.test.ts](../../src/core/matchSimulation/pr148Agency.test.ts) | 394 | test; contract-only | AST/import survey; no separate closed claim |
| [pr148Cadence.test.ts](../../src/core/matchSimulation/pr148Cadence.test.ts) | 462 | test; contract-only | AST/import survey; no separate closed claim |
| [pr148Rules.test.ts](../../src/core/matchSimulation/pr148Rules.test.ts) | 852 | test; contract-only | AST/import survey; no separate closed claim |
| [pr149Possession.test.ts](../../src/core/matchSimulation/pr149Possession.test.ts) | 454 | test; contract-only | AST/import survey; no separate closed claim |
| [pr149Statistics.test.ts](../../src/core/matchSimulation/pr149Statistics.test.ts) | 395 | test; contract-only | AST/import survey; no separate closed claim |
| [pr150Intent.test.ts](../../src/core/matchSimulation/pr150Intent.test.ts) | 568 | test; contract-only | AST/import survey; no separate closed claim |
| [pr150Interactions.test.ts](../../src/core/matchSimulation/pr150Interactions.test.ts) | 75 | test; contract-only | AST/import survey; no separate closed claim |
| [pr150SetPieces.test.ts](../../src/core/matchSimulation/pr150SetPieces.test.ts) | 71 | test; contract-only | AST/import survey; no separate closed claim |
| [pr150SpacePassing.test.ts](../../src/core/matchSimulation/pr150SpacePassing.test.ts) | 988 | test; contract-only | AST/import survey; no separate closed claim |
| [pr150Statistics.test.ts](../../src/core/matchSimulation/pr150Statistics.test.ts) | 42 | test; contract-only | AST/import survey; no separate closed claim |
| [pr151Cadence.test.ts](../../src/core/matchSimulation/pr151Cadence.test.ts) | 188 | test; contract-only | AST/import survey; no separate closed claim |
| [pr151Physics.test.ts](../../src/core/matchSimulation/pr151Physics.test.ts) | 251 | test; contract-only | AST/import survey; no separate closed claim |
| [pr152DisciplineCalibration.test.ts](../../src/core/matchSimulation/pr152DisciplineCalibration.test.ts) | 248 | test; contract-only | AST/import survey; no separate closed claim |
| [pr152Participation.test.ts](../../src/core/matchSimulation/pr152Participation.test.ts) | 362 | test; contract-only | AST/import survey; no separate closed claim |
| [pr152Statistics.test.ts](../../src/core/matchSimulation/pr152Statistics.test.ts) | 486 | test; contract-only | AST/import survey; no separate closed claim |
| [pr152Turnovers.test.ts](../../src/core/matchSimulation/pr152Turnovers.test.ts) | 598 | test; contract-only | AST/import survey; no separate closed claim |
| [pr154Intelligence.test.ts](../../src/core/matchSimulation/pr154Intelligence.test.ts) | 452 | test; contract-only | AST/import survey; no separate closed claim |
| [pr155Stability.test.ts](../../src/core/matchSimulation/pr155Stability.test.ts) | 397 | test; contract-only | AST/import survey; no separate closed claim |
| [pr156Integrity.test.ts](../../src/core/matchSimulation/pr156Integrity.test.ts) | 525 | test; contract-only | AST/import survey; no separate closed claim |
| [pr157Integrity.test.ts](../../src/core/matchSimulation/pr157Integrity.test.ts) | 172 | test; contract-only | AST/import survey; no separate closed claim |
| [pr157Pressing.test.ts](../../src/core/matchSimulation/pr157Pressing.test.ts) | 311 | test; contract-only | AST/import survey; no separate closed claim |
| [pr158CrossContracts.test.ts](../../src/core/matchSimulation/pr158CrossContracts.test.ts) | 291 | test; contract-only | AST/import survey; no separate closed claim |
| [pr158RestartAccounting.test.ts](../../src/core/matchSimulation/pr158RestartAccounting.test.ts) | 157 | test; contract-only | AST/import survey; no separate closed claim |
| [pr159Integrity.test.ts](../../src/core/matchSimulation/pr159Integrity.test.ts) | 303 | test; contract-only | AST/import survey; no separate closed claim |
| [pr159ReboundIntegration.test.ts](../../src/core/matchSimulation/pr159ReboundIntegration.test.ts) | 176 | test; contract-only | AST/import survey; no separate closed claim |
| [pr159RestartContinuity.test.ts](../../src/core/matchSimulation/pr159RestartContinuity.test.ts) | 568 | test; contract-only | AST/import survey; no separate closed claim |
| [pr159RestartGeometry.test.ts](../../src/core/matchSimulation/pr159RestartGeometry.test.ts) | 281 | test; contract-only | AST/import survey; no separate closed claim |
| [pr159RestartLaws.test.ts](../../src/core/matchSimulation/pr159RestartLaws.test.ts) | 298 | test; contract-only | AST/import survey; no separate closed claim |
| [pr159RestartOptions.test.ts](../../src/core/matchSimulation/pr159RestartOptions.test.ts) | 132 | test; contract-only | AST/import survey; no separate closed claim |
| [pr160FitnessInjuries.test.ts](../../src/core/matchSimulation/pr160FitnessInjuries.test.ts) | 438 | test; contract-only | AST/import survey; no separate closed claim |
| [pr160FitnessIntegration.test.ts](../../src/core/matchSimulation/pr160FitnessIntegration.test.ts) | 346 | test; contract-only | AST/import survey; no separate closed claim |
| [pr160PenaltyLiveness.test.ts](../../src/core/matchSimulation/pr160PenaltyLiveness.test.ts) | 509 | test; contract-only | AST/import survey; no separate closed claim |
| [pr160Substitutions.test.ts](../../src/core/matchSimulation/pr160Substitutions.test.ts) | 1044 | test; contract-only | AST/import survey; no separate closed claim |
| [pr160Timekeeping.test.ts](../../src/core/matchSimulation/pr160Timekeeping.test.ts) | 349 | test; contract-only | AST/import survey; no separate closed claim |
| [pr161BoundaryLiveness.test.ts](../../src/core/matchSimulation/pr161BoundaryLiveness.test.ts) | 237 | test; contract-only | AST/import survey; no separate closed claim |
| [pr162Audit.test.ts](../../src/core/matchSimulation/pr162Audit.test.ts) | 198 | test; contract-only | AST/import survey; no separate closed claim |
| [pr162Behaviour.test.ts](../../src/core/matchSimulation/pr162Behaviour.test.ts) | 272 | test; contract-only | AST/import survey; no separate closed claim |
| [pr163Fixtures.ts](../../src/core/matchSimulation/pr163Fixtures.ts) | 257 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [pr163Momentum.test.ts](../../src/core/matchSimulation/pr163Momentum.test.ts) | 345 | test; contract-only | AST/import survey; no separate closed claim |
| [pr164OffsideReplay.test.ts](../../src/core/matchSimulation/pr164OffsideReplay.test.ts) | 83 | test; contract-only | AST/import survey; no separate closed claim |
| [pr164RestartIntegrity.test.ts](../../src/core/matchSimulation/pr164RestartIntegrity.test.ts) | 229 | test; contract-only | AST/import survey; no separate closed claim |
| [pr165GoalLogistics.test.ts](../../src/core/matchSimulation/pr165GoalLogistics.test.ts) | 200 | test; contract-only | AST/import survey; no separate closed claim |
| [pr165RestartIntegrity.test.ts](../../src/core/matchSimulation/pr165RestartIntegrity.test.ts) | 178 | test; contract-only | AST/import survey; no separate closed claim |
| [pr166OrientationMenus.test.ts](../../src/core/matchSimulation/pr166OrientationMenus.test.ts) | 209 | test; contract-only | AST/import survey; no separate closed claim |
| [pr168Intelligence.test.ts](../../src/core/matchSimulation/pr168Intelligence.test.ts) | 208 | test; contract-only | AST/import survey; no separate closed claim |
| [pr171DiagnosticAudit.test.ts](../../src/core/matchSimulation/pr171DiagnosticAudit.test.ts) | 152 | test; contract-only | AST/import survey; no separate closed claim |
| [pr172HumanCarry.test.ts](../../src/core/matchSimulation/pr172HumanCarry.test.ts) | 73 | test; contract-only | AST/import survey; no separate closed claim |
| [pr172Mechanical.test.ts](../../src/core/matchSimulation/pr172Mechanical.test.ts) | 135 | test; contract-only | AST/import survey; no separate closed claim |
| [pr172Rebounds.test.ts](../../src/core/matchSimulation/pr172Rebounds.test.ts) | 134 | test; contract-only | AST/import survey; no separate closed claim |
| [pr172ShotContact.test.ts](../../src/core/matchSimulation/pr172ShotContact.test.ts) | 71 | test; contract-only | AST/import survey; no separate closed claim |
| [pr173Dynamic.test.ts](../../src/core/matchSimulation/pr173Dynamic.test.ts) | 323 | test; contract-only | AST/import survey; no separate closed claim |
| [pr173Fixtures.ts](../../src/core/matchSimulation/pr173Fixtures.ts) | 246 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [pr174Combination.test.ts](../../src/core/matchSimulation/pr174Combination.test.ts) | 362 | test; contract-only | AST/import survey; no separate closed claim |
| [pr174Restart.test.ts](../../src/core/matchSimulation/pr174Restart.test.ts) | 64 | test; contract-only | AST/import survey; no separate closed claim |
| [pr177Reform.test.ts](../../src/core/matchSimulation/pr177Reform.test.ts) | 116 | test; contract-only | AST/import survey; no separate closed claim |
| [pr178AerialContinuous.test.ts](../../src/core/matchSimulation/pr178AerialContinuous.test.ts) | 81 | test; contract-only | AST/import survey; no separate closed claim |
| [pr178ContactLaws.test.ts](../../src/core/matchSimulation/pr178ContactLaws.test.ts) | 81 | test; contract-only | AST/import survey; no separate closed claim |
| [pr178ContactResolution.test.ts](../../src/core/matchSimulation/pr178ContactResolution.test.ts) | 205 | test; contract-only | AST/import survey; no separate closed claim |
| [pr178KeeperTraffic.test.ts](../../src/core/matchSimulation/pr178KeeperTraffic.test.ts) | 121 | test; contract-only | AST/import survey; no separate closed claim |
| [pr179Roles.test.ts](../../src/core/matchSimulation/pr179Roles.test.ts) | 299 | test; contract-only | AST/import survey; no separate closed claim |
| [pr180RestartContinuity.test.ts](../../src/core/matchSimulation/pr180RestartContinuity.test.ts) | 48 | test; contract-only | AST/import survey; no separate closed claim |
| [pr181SpatialFootball.test.ts](../../src/core/matchSimulation/pr181SpatialFootball.test.ts) | 212 | test; contract-only | AST/import survey; no separate closed claim |
| [pr182Coach.test.ts](../../src/core/matchSimulation/pr182Coach.test.ts) | 320 | test; contract-only | AST/import survey; no separate closed claim |
| [pr182Comparison.test.ts](../../src/core/matchSimulation/pr182Comparison.test.ts) | 87 | test; contract-only | AST/import survey; no separate closed claim |
| [pr182PolicyIntegration.test.ts](../../src/core/matchSimulation/pr182PolicyIntegration.test.ts) | 57 | test; contract-only | AST/import survey; no separate closed claim |
| [pr183CarryRecovery.test.ts](../../src/core/matchSimulation/pr183CarryRecovery.test.ts) | 61 | test; contract-only | AST/import survey; no separate closed claim |
| [pr183Closure.test.ts](../../src/core/matchSimulation/pr183Closure.test.ts) | 122 | test; contract-only | AST/import survey; no separate closed claim |
| [pr183Contact.test.ts](../../src/core/matchSimulation/pr183Contact.test.ts) | 111 | test; contract-only | AST/import survey; no separate closed claim |
| [pr183Realism.test.ts](../../src/core/matchSimulation/pr183Realism.test.ts) | 274 | test; contract-only | AST/import survey; no separate closed claim |
| [pr188RelativeDecision.test.ts](../../src/core/matchSimulation/pr188RelativeDecision.test.ts) | 331 | test; contract-only | AST/import survey; no separate closed claim |
| [pr189Deadlock.test.ts](../../src/core/matchSimulation/pr189Deadlock.test.ts) | 368 | test; contract-only | AST/import survey; no separate closed claim |
| [pr190Body.test.ts](../../src/core/matchSimulation/pr190Body.test.ts) | 132 | test; contract-only | AST/import survey; no separate closed claim |
| [pr190Reception.test.ts](../../src/core/matchSimulation/pr190Reception.test.ts) | 152 | test; contract-only | AST/import survey; no separate closed claim |
| [pr193IncidentalGoals.test.ts](../../src/core/matchSimulation/pr193IncidentalGoals.test.ts) | 94 | test; contract-only | AST/import survey; no separate closed claim |
| [pr193Transition.test.ts](../../src/core/matchSimulation/pr193Transition.test.ts) | 310 | test; contract-only | AST/import survey; no separate closed claim |
| [pr194Perception.test.ts](../../src/core/matchSimulation/pr194Perception.test.ts) | 346 | test; contract-only | AST/import survey; no separate closed claim |
| [pr195Calibration.test.ts](../../src/core/matchSimulation/pr195Calibration.test.ts) | 72 | test; contract-only | AST/import survey; no separate closed claim |
| [preReceptionPlanning.ts](../../src/core/matchSimulation/preReceptionPlanning.ts) | 197 | referenced from canonical entry (optional branches may be off) | DEC-011 |
| [presentationWindows.ts](../../src/core/matchSimulation/presentationWindows.ts) | 179 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [pressingDiagnostics.test.ts](../../src/core/matchSimulation/pressingDiagnostics.test.ts) | 140 | test; contract-only | AST/import survey; no separate closed claim |
| [pressingDiagnostics.ts](../../src/core/matchSimulation/pressingDiagnostics.ts) | 500 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [reachableSpace.ts](../../src/core/matchSimulation/reachableSpace.ts) | 115 | referenced from canonical entry (optional branches may be off) | TACT-002 |
| [receiverReadiness.ts](../../src/core/matchSimulation/receiverReadiness.ts) | 62 | referenced from canonical entry (optional branches may be off) | PASS-004 |
| [receivingPositions.ts](../../src/core/matchSimulation/receivingPositions.ts) | 136 | referenced from canonical entry (optional branches may be off) | TACT-001 |
| [receptionContinuation.ts](../../src/core/matchSimulation/receptionContinuation.ts) | 213 | referenced from canonical entry (optional branches may be off) | DRIB-003 |
| [receptionContinuationSchema.ts](../../src/core/matchSimulation/receptionContinuationSchema.ts) | 15 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [relativeDecisionLab.ts](../../src/core/matchSimulation/relativeDecisionLab.ts) | 115 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [restartGeometry.ts](../../src/core/matchSimulation/restartGeometry.ts) | 989 | referenced from canonical entry (optional branches may be off) | GK-008, REST-004, REST-006, REST-007 |
| [restartLaws.ts](../../src/core/matchSimulation/restartLaws.ts) | 485 | referenced from canonical entry (optional branches may be off) | REST-005, REST-012, CONTACT-011 |
| [restartLifecycle.ts](../../src/core/matchSimulation/restartLifecycle.ts) | 700 | referenced from canonical entry (optional branches may be off) | FIT-008, REST-001, REST-002, REST-004, REST-005, REST-009, REST-012, CONTACT-008 |
| [restartLiveness.ts](../../src/core/matchSimulation/restartLiveness.ts) | 222 | referenced from canonical entry (optional branches may be off) | REST-003 |
| [restartOptions.ts](../../src/core/matchSimulation/restartOptions.ts) | 224 | referenced from canonical entry (optional branches may be off) | REST-009, CONTACT-010 |
| [restartPhase.ts](../../src/core/matchSimulation/restartPhase.ts) | 14 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [restartScenarios.ts](../../src/core/matchSimulation/restartScenarios.ts) | 256 | referenced from canonical entry (optional branches may be off) | REST-001 |
| [roleExperiment.ts](../../src/core/matchSimulation/roleExperiment.ts) | 563 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [roleTactics.ts](../../src/core/matchSimulation/roleTactics.ts) | 341 | referenced from canonical entry (optional branches may be off) | DEC-006, PASS-011, SHOT-007 |
| [shootingDifficulty.test.ts](../../src/core/matchSimulation/shootingDifficulty.test.ts) | 290 | test; contract-only | AST/import survey; no separate closed claim |
| [shootingDifficulty.ts](../../src/core/matchSimulation/shootingDifficulty.ts) | 160 | referenced from canonical entry (optional branches may be off) | SHOT-012 |
| [shootingOpportunity.ts](../../src/core/matchSimulation/shootingOpportunity.ts) | 175 | referenced from canonical entry (optional branches may be off) | SHOT-001, SHOT-002, SHOT-004, GK-001 |
| [shootingOptions.test.ts](../../src/core/matchSimulation/shootingOptions.test.ts) | 565 | test; contract-only | AST/import survey; no separate closed claim |
| [shootingOptions.ts](../../src/core/matchSimulation/shootingOptions.ts) | 516 | referenced from canonical entry (optional branches may be off) | DEC-013, SHOT-004, SHOT-005, SHOT-008, SHOT-009, SHOT-010, SHOT-011 |
| [shotIntent.ts](../../src/core/matchSimulation/shotIntent.ts) | 64 | referenced from canonical entry (optional branches may be off) | SHOT-009 |
| [shotParityBenchmark.ts](../../src/core/matchSimulation/shotParityBenchmark.ts) | 349 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [shotResolver.test.ts](../../src/core/matchSimulation/shotResolver.test.ts) | 300 | test; contract-only | AST/import survey; no separate closed claim |
| [shotResolver.ts](../../src/core/matchSimulation/shotResolver.ts) | 350 | referenced from canonical entry (optional branches may be off) | SHOT-003, SHOT-006, SHOT-012 |
| [spacePassing.ts](../../src/core/matchSimulation/spacePassing.ts) | 232 | referenced from canonical entry (optional branches may be off) | DEC-003, DEC-009, PASS-008, PASS-010 |
| [spatialHardening.test.ts](../../src/core/matchSimulation/spatialHardening.test.ts) | 110 | test; contract-only | AST/import survey; no separate closed claim |
| [stoppageLedger.ts](../../src/core/matchSimulation/stoppageLedger.ts) | 221 | referenced from canonical entry (optional branches may be off) | REST-011, MEAS-006 |
| [strategicClearance.ts](../../src/core/matchSimulation/strategicClearance.ts) | 125 | referenced from canonical entry (optional branches may be off) | DEC-008, DEF-010 |
| [substitutions.ts](../../src/core/matchSimulation/substitutions.ts) | 1065 | referenced from canonical entry (optional branches may be off) | FIT-008, REST-013 |
| [tacticalActionEvaluator.ts](../../src/core/matchSimulation/tacticalActionEvaluator.ts) | 225 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [tacticalCognition.test.ts](../../src/core/matchSimulation/tacticalCognition.test.ts) | 382 | test; contract-only | AST/import survey; no separate closed claim |
| [tacticalCognition.ts](../../src/core/matchSimulation/tacticalCognition.ts) | 448 | referenced from canonical entry (optional branches may be off) | TACT-008 |
| [tacticalCognitionLab.ts](../../src/core/matchSimulation/tacticalCognitionLab.ts) | 344 | lab/diagnostic/schema or other non-entry module | DEC-004 |
| [tacticalPositioning.ts](../../src/core/matchSimulation/tacticalPositioning.ts) | 1119 | referenced from canonical entry (optional branches may be off) | DEF-008, TACT-001, TACT-002, TACT-005, REST-007 |
| [tacticalPreferences.test.ts](../../src/core/matchSimulation/tacticalPreferences.test.ts) | 275 | test; contract-only | AST/import survey; no separate closed claim |
| [tacticalPreferences.ts](../../src/core/matchSimulation/tacticalPreferences.ts) | 373 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [tacticalRoles.ts](../../src/core/matchSimulation/tacticalRoles.ts) | 515 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [tacticalSituations.test.ts](../../src/core/matchSimulation/tacticalSituations.test.ts) | 136 | test; contract-only | AST/import survey; no separate closed claim |
| [tacticalSituations.ts](../../src/core/matchSimulation/tacticalSituations.ts) | 223 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [teamShapeMetrics.ts](../../src/core/matchSimulation/teamShapeMetrics.ts) | 245 | lab/diagnostic/schema or other non-entry module | TACT-006 |
| [teamTempo.ts](../../src/core/matchSimulation/teamTempo.ts) | 95 | referenced from canonical entry (optional branches may be off) | TACT-007, TACT-010, TACT-011, FIT-009 |
| [teamThreatMemory.test.ts](../../src/core/matchSimulation/teamThreatMemory.test.ts) | 498 | test; contract-only | AST/import survey; no separate closed claim |
| [teamThreatMemory.ts](../../src/core/matchSimulation/teamThreatMemory.ts) | 721 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [tempoEffort.ts](../../src/core/matchSimulation/tempoEffort.ts) | 32 | referenced from canonical entry (optional branches may be off) | TACT-007 |
| [throwIn.ts](../../src/core/matchSimulation/throwIn.ts) | 63 | referenced from canonical entry (optional branches may be off) | AST/import survey; no separate closed claim |
| [transitionDiagnostics.ts](../../src/core/matchSimulation/transitionDiagnostics.ts) | 106 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [transitionLaboratory.ts](../../src/core/matchSimulation/transitionLaboratory.ts) | 512 | lab/diagnostic/schema or other non-entry module | AST/import survey; no separate closed claim |
| [transitionMovement.ts](../../src/core/matchSimulation/transitionMovement.ts) | 285 | referenced from canonical entry (optional branches may be off) | TACT-003, REST-008 |

## Relevant external inputs

The runtime fingerprint additionally hashes all non-test core files, domain schemas/types, the lockfile and exact pilot methods. Direct imports outside the subtree include the following. These are dependency inputs, not a claim that unrelated career/UI modules were fully semantically audited here.

- `src/core/coachProfiles`
- `src/core/coachTactics`
- `src/core/footballerWorld`
- `src/core/playStyles`
- `src/core/playerOverall`
- `src/core/random/RandomGenerator`
- `src/core/singleMatch`
- `src/schemas/domainSchemas`
- `src/types/domain`

## Known coverage limits

Full embodied head/leg/goalkeeper contact, statistical real-football datasets, fully bounded defensive/restart/goalkeeper controllers, detailed competition advancement, temporary prone recovery and optional sporting-return objectives are not validated capabilities. Source names or passing old tests do not make them implemented. Every associated registry entry stays open. No global event-rate target is introduced.
