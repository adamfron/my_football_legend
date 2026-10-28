import console from 'node:console';
import process from 'node:process';
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { files } from './pr199Evidence.mjs';
import { INTEGRATION_MECHANISMS } from '../src/core/matchSimulation/integrationMechanisms.ts';
import { resolveIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import { ROOT, hash, write, identity } from './pr200Evidence.mjs';
const paths = files('src/core/matchSimulation')
  .filter((p) => p.endsWith('.ts') && !p.includes('.test.'))
  .sort();
const source = Object.fromEntries(
  paths.map((p) => [p, readFileSync(p, 'utf8').replaceAll('\r\n', '\n')]),
);
const flags = [
  ...source['src/core/matchSimulation/matchState.ts'].matchAll(/(experimental\w+)\?:/g),
].map((m) => m[1]);
if (flags.some((f) => !INTEGRATION_MECHANISMS.some((m) => m.flag === f)))
  throw Error('Uninventoried experimental flag');
const records = INTEGRATION_MECHANISMS.map((m) => ({
  ...m,
  defaultActive: false,
  optionalSchema: 'matchState.tacticalMatchStateSchema',
  selectedBy: resolveIntegrationProfile('realism-candidate-v0').features[m.flag],
  sourceLocations: Object.entries(source).flatMap(([path, text]) =>
    text
      .split('\n')
      .flatMap((line, i) =>
        line.includes(m.flag) ? [{ path, line: i + 1, text: line.trim() }] : [],
      ),
  ),
  sourceFingerprint: hash(
    Object.fromEntries(
      Object.entries(source)
        .filter(([, text]) => text.includes(m.flag))
        .map(([p, t]) => [p, hash(t)]),
    ),
  ),
}));
const declarations = ts.createSourceFile(
  'matchState.ts',
  source['src/core/matchSimulation/matchState.ts'],
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const optionalStateContracts = declarations.statements
  .filter(
    (n) =>
      ts.isInterfaceDeclaration(n) &&
      ['TacticalMatchState', 'MatchPlayerState', 'MatchBallState'].includes(n.name.text),
  )
  .flatMap((owner) =>
    owner.members
      .filter((m) => m.questionToken && m.name && ts.isIdentifier(m.name))
      .map((m) => ({
        owner: owner.name.text,
        field: m.name.text,
        type: m.type?.getText(declarations) ?? 'unknown',
        line: declarations.getLineAndCharacterOfPosition(m.getStart(declarations)).line + 1,
        referencePaths: Object.entries(source)
          .filter(
            ([p, text]) =>
              !p.endsWith('/matchState.ts') && new RegExp('\\.' + m.name.text + '\\b').test(text),
          )
          .map(([p]) => p),
        qualification:
          'Optional persisted state declaration and property-reference candidates; references alone are not proof of an acting live consumer. See per-mechanism acting entry points.',
      })),
  );
const result = {
  optionalStateContracts,
  source: identity(),
  schema: 'pr200-source-inventory-v1',
  flags,
  records,
  policies: [
    'legacy-pr176',
    'risk-ablation-v1',
    'state-value-v1',
    'role-value-v1',
    'role-intent-v1',
    'phase-role-hybrid-v1',
    'opportunity-driven-v1',
    'hierarchical-intent-v1',
    'contextual-judgment-v1',
  ],
  canonical: [
    'matchSimulation.stepTacticalMatchAfterDecisionProbe: one fixed 0.025s executor',
    'canonicalMovement.integrateCanonicalMovement: physical movement',
    'ballPhysics.integrateBallFlight + ballFlight.findFirstBallContact',
    'footContact + firstTouch + goalkeeperIntervention.resolveGoalkeeperContact',
    'DEFAULT_DECISION_POLICY: state-value-v1',
  ],
  researchOnly: [
    'assumptionCalibration',
    'canonicalOutcome observers',
    'disruptionLedger',
    'attributeMicroLab/footballPerformanceLab/firstTouchLaboratory',
  ],
  compatibility: [
    'absent optional experiment fields use historical paths',
    'old source archives retain rejected and failed controllers',
    'continuousBodyContacts is physical contact memory, not an experimental enable switch',
    'lowerBodyPose/verticalJump/plantBalance are optional physical state and can select geometry/preparation branches; profiles retain real body state, bound by the initial hash',
    'boundedExperiment/activePerceptionConfig/decisionAblation are additional per-match optional configuration dimensions',
    'experimentalBodyReception is a module name; body-v1 is enabled by experimentalBodyContacts',
  ],
  readiness: 'NOT READY',
  independentConfirmation: 'sealed',
};
const json = JSON.stringify(result, null, 2) + '\n',
  path = `${ROOT}/inventory.json`;
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== json)
    throw Error('Inventory source drift');
} else {
  try {
    write(path, result);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    writeFileSync(path, json);
  }
}
console.log(
  'PR200 inventoried',
  flags.length,
  'live optional fields;',
  records.length,
  'mechanisms',
);
