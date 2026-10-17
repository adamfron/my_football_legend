import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
export { resolve } from './typescriptLoader.mjs';

// Opt-in research instrumentation of the existing pure ranker. Normal builds never load
// this hook. No production telemetry, save fields, decision inputs or RNG calls are added.
export const load = async (url, context, nextLoad) => {
  if (!url.endsWith('/src/core/matchSimulation/matchActions.ts')) return nextLoad(url, context);
  let source = (await readFile(new URL(url), 'utf8')).replaceAll('\r\n', '\n');
  const choice =
    '): MatchAction | undefined => rankAvailableActionsForAI(state, actorId)[0]?.action;';
  if (!source.includes(choice)) throw new Error('PR172 decision instrumentation contract changed');
  source = source.replace(
    choice,
    `): MatchAction | undefined => {
    const ranking = rankAvailableActionsForAI(state, actorId);
    globalThis[Symbol.for('mfl.pr172.decision')]?.(state, actorId, ranking);
    return ranking[0]?.action;
  };`,
  );
  const incoming = '  return rankAvailableActionsForAI(state, actorId).find(';
  const incomingEnd = '  )?.action;\n};\n\n/** Stale choices';
  if (!source.includes(incoming) || !source.includes(incomingEnd))
    throw new Error('PR172 incoming decision contract changed');
  source = source
    .replace(
      incoming,
      '  const ranking = rankAvailableActionsForAI(state, actorId);\n  const chosen = ranking.find(',
    )
    .replace(
      incomingEnd,
      `  )?.action;
  globalThis[Symbol.for('mfl.pr172.incoming')]?.(state, actorId, ranking, chosen);
  return chosen;
};

/** Stale choices`,
    );
  const pass = '  return (\n    28 +\n    decision.utilityAdjustment +';
  if (!source.includes(pass)) throw new Error('PR172 pass decomposition contract changed');
  source = source.replace(
    pass,
    `
  globalThis[Symbol.for('mfl.pr172.components')]?.(action, {
    forecast: decision,
    terms: {
      base: 28, reception: decision.utilityAdjustment,
      urgency: urgency * decision.expectedCompletion * 24,
      solution: -deriveSolutionPenalty(state, actor, action.intent, action.target, receiver.id, decision.expectedCompletion),
      adaptation: adaptationValue,
      progression: progression * (state.teams[actor.team].phase === 'attacking_transition' ? 1.5 : 1.05),
      distance: -length * 0.3, receiverPressure: -receiverPressure * 17,
      laneRisk: -laneRisk * 10, separation: markerSeparation * 0.7,
      width: Math.max(0, widthGained) * 0.35 * switchOpportunity,
      switch: switchValue, recycle: recycleValue, staleReturn: -staleReturnPenalty,
      technical, style: styleIntent, through: throughContext, threat: -threatLoss,
      offside: offsideRisk && !isDirectOffsideExemptRestart(state) ? -80 : 0,
      preparation: -preparationPenalty,
      lead: action.intent === 'lead' ? Math.min(12, Math.max(0, decision.defenderEta-decision.receiverEta)*8)*decision.expectedCompletion : 0,
      space: space ? Math.max(-35, Math.min(25, space.utility)) : 0,
    }
  });
` + pass,
  );
  return { format: 'module-typescript', source, shortCircuit: true };
};
