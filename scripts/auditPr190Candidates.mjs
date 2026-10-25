import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { constructBoundedCandidates } from '../src/core/matchSimulation/boundedDecision.ts';
import { distance, distanceToSegment } from '../src/core/matchSimulation/matchSpace.ts';
const root = 'docs/performance/pr190',
  currentVersion = process.argv.find((v) => v.startsWith('--version='))?.slice(10) ?? 'spin-final',
  baselineRoot =
    process.argv.find((v) => v.startsWith('--baseline-root='))?.slice(16) ?? '../pr189-baseline';
const { constructBoundedCandidates: baselineCandidates } = await import(
  pathToFileURL(resolve(baselineRoot, 'src/core/matchSimulation/boundedDecision.ts'))
);
const rows = [],
  mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const hash = (v) => createHash('sha256').update(v).digest('hex');
const sceneOpportunity = (r, id) => {
  const actor = r.players.find((p) => p.id === id);
  if (!actor) return null;
  const foes = r.players.filter((p) => p.team !== actor.team),
    mates = r.players.filter((p) => p.team === actor.team && p.id !== actor.id);
  return {
    clearance: Math.min(14, ...foes.map((p) => distance(p.position, actor.position))),
    clearLanes: mates.filter((p) =>
      foes.every((d) => distanceToSegment(d.position, actor.position, p.position) > 2),
    ).length,
    facing: actor.facing,
  };
};
for (const version of ['baseline-full', currentVersion]) {
  const files = readdirSync(root).filter(
    (p) => /^(ww|ss|sw)-/.test(p) && p.endsWith(`-${version}.json`),
  );
  if (files.length !== 15) throw Error(`Incomplete ${version} cohort`);
  for (const file of files) {
    const receipt = JSON.parse(readFileSync(`${root}/${file}`)),
      records = JSON.parse(gunzipSync(readFileSync(receipt.archive))).sort(
        (a, b) => a.diagnostic.releasedAt - b.diagnostic.releasedAt,
      ),
      samples = [],
      travelErrors = [],
      targetChanges = [],
      preparations = [];
    let mapped = 0,
      late = 0,
      reciprocal = 0,
      unchanged = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i],
        trace = r.decision,
        p = r.diagnostic;
      if (trace?.scene && trace.decision) {
        const builder =
          version === 'baseline-full' ? baselineCandidates : constructBoundedCandidates;
        const candidate = builder(trace.scene).find(
          (c) => c.id === trace.decision.selectedCandidateId,
        );
        if (
          candidate?.action.type === 'pass' &&
          candidate.action.receiverId === p.intendedReceiverId
        ) {
          mapped++;
          const visible = trace.scene.visible.find((v) => v.id === p.intendedReceiverId),
            travel =
              candidate.passTravelSeconds ??
              distance(trace.scene.position, visible?.position ?? candidate.action.target) / 18;
          const targetChange = distance(
              candidate.action.target,
              p.intendedTarget ?? p.predictedReceptionPoint,
            ),
            preparationAge = r.preparation ? p.releasedAt - r.preparation.at : null;
          targetChanges.push(targetChange);
          if (preparationAge !== null) preparations.push(preparationAge);
          late += Number(p.releasedAt > candidate.closesAt);
          if (p.finalResult === 'completed')
            travelErrors.push(Math.abs(p.resolvedAt - p.releasedAt - travel));
          samples.push({
            passId: p.passId,
            decisionAt: trace.at,
            lastPreparationTraceAt: r.preparation?.at ?? null,
            releasedAt: p.releasedAt,
            forecastTarget: candidate.action.target,
            releaseTarget: p.intendedTarget,
            forecastTravelSeconds: travel,
            actualContactAfter: p.resolvedAt === undefined ? null : p.resolvedAt - p.releasedAt,
            windowClosesAt: candidate.closesAt,
            canonicalOutcome: p.finalResult ?? 'unresolved',
            targetChangeMetres: targetChange,
          });
        }
      }
      const previous = records[i - 1];
      if (
        !previous ||
        previous.diagnostic.finalResult !== 'completed' ||
        p.finalResult !== 'completed' ||
        previous.diagnostic.actualReceiverId !== p.passerId ||
        previous.diagnostic.passerId !== p.actualReceiverId ||
        p.releasedAt - previous.diagnostic.resolvedAt > 12
      )
        continue;
      reciprocal++;
      const a = sceneOpportunity(previous, previous.diagnostic.passerId),
        b = sceneOpportunity(r, p.passerId);
      const backAt = p.actualContactPoint ?? p.predictedReceptionPoint;
      if (
        a &&
        b &&
        distance(previous.release.ball, backAt) < 3 &&
        b.clearance - a.clearance < 0.5 &&
        b.clearLanes <= a.clearLanes
      )
        unchanged++;
    }
    samples.sort((a, b) =>
      hash(`pr190-candidate-audit:${a.passId}`).localeCompare(
        hash(`pr190-candidate-audit:${b.passId}`),
      ),
    );
    rows.push({
      version,
      design: receipt.design,
      policy: receipt.policy,
      sourceSha256: receipt.sourceSha256,
      mappedCandidates: mapped,
      meanCompletedTravelAbsoluteErrorSeconds: mean(travelErrors),
      completedTravelSamples: travelErrors.length,
      meanDecisionToReleaseTargetChangeMetres: mean(targetChanges),
      meanAgeOfLastRecordedPreparationTraceSeconds: mean(preparations),
      releasesAfterEstimatedWindow: late,
      reciprocalCompletedPairs: reciprocal,
      nearReturnWithoutMeasuredClearanceOrLaneGain: unchanged,
      samples: samples.slice(0, 16),
    });
  }
}
writeFileSync(
  `${root}/selection-and-circulation.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      classification:
        'post-hoc reconstruction from recorded bounded scenes; no match mutation or hidden future input; late/changed estimates are observations, not proven causes',
      preparationLimit:
        'The observer retains the last preparation decision per actor. It may belong to an older possession; its age is not a measured continuous preparation duration for this pass.',
      circulationDefinition:
        'adjacent completed reciprocal pairs within 12s; net return <3m; next-release clearance gain <0.5m and no extra geometrically clear teammate lane; this is not an action penalty or proof that every exchange is useless',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ audited: rows.length }));
