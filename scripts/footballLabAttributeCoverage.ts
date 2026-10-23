import ts from 'typescript';
import path from 'node:path';
import { playerAttributesSchema } from '../src/schemas/domainSchemas';
import { attributeCoverageSchema } from '../src/core/matchSimulation/footballLabAnalysis';

/** Type-aware attribute-property reads, including aliases such as `const a = profile.attributes`.
 * Whole-vector consumers are retained separately: static indexing cannot prove their semantics. */
export const inventoryFootballAttributes = (
  measured: Record<string, { drills: string[]; intended: boolean; effect: boolean }>,
) => {
  const keys = Object.keys(playerAttributesSchema.shape);
  const file = ts.readConfigFile('tsconfig.app.json', ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(file.config, ts.sys, '.');
  const program = ts.createProgram(parsed.fileNames, parsed.options),
    checker = program.getTypeChecker();
  const reads = Object.fromEntries(
    keys.map((k) => [k, [] as { path: string; line: number; expression: string }[]]),
  );
  const tests = Object.fromEntries(keys.map((k) => [k, new Set<string>()]));
  const dynamicReads: { path: string; line: number; expression: string }[] = [];
  const declarative = Object.fromEntries(
    keys.map((k) => [k, [] as { path: string; line: number }[]]),
  );
  const whole = new Set<string>(),
    typeCache = new Map<ts.Type, boolean>();
  const isAttributes = (type: ts.Type) => {
    const cached = typeCache.get(type);
    if (cached !== undefined) return cached;
    const names = new Set(checker.getPropertiesOfType(type).map((s) => s.name));
    const matches = keys.every((k) => names.has(k));
    typeCache.set(type, matches);
    return matches;
  };
  for (const source of program.getSourceFiles()) {
    const filePath = path.relative(process.cwd(), source.fileName).replaceAll('\\', '/');
    if (
      !filePath.startsWith('src/') ||
      source.isDeclarationFile ||
      /footballLab|footballPerformanceLab/.test(filePath)
    )
      continue;
    const test = /\.test\./.test(filePath);
    const visit = (node: ts.Node) => {
      if (
        !test &&
        ts.isStringLiteral(node) &&
        keys.includes(node.text) &&
        !filePath.startsWith('src/schemas/') &&
        !filePath.startsWith('src/types/')
      )
        declarative[node.text]!.push({
          path: filePath,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      if (
        !test &&
        ts.isElementAccessExpression(node) &&
        !ts.isStringLiteral(node.argumentExpression) &&
        isAttributes(checker.getTypeAtLocation(node.expression))
      )
        dynamicReads.push({
          path: filePath,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          expression: node.getText(source),
        });
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const key = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression && ts.isStringLiteral(node.argumentExpression)
            ? node.argumentExpression.text
            : undefined;
        if (key && keys.includes(key) && isAttributes(checker.getTypeAtLocation(node.expression))) {
          const parent = node.parent;
          const write =
            ts.isBinaryExpression(parent) &&
            parent.left === node &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
          if (!write) {
            if (test) tests[key]!.add(filePath);
            else
              reads[key]!.push({
                path: filePath,
                line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                expression: node.getText(source),
              });
          }
        }
        if (
          !test &&
          ts.isPropertyAccessExpression(node) &&
          node.name.text === 'attributes' &&
          isAttributes(checker.getTypeAtLocation(node))
        )
          whole.add(filePath);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return attributeCoverageSchema.parse({
    schema: 'mfl-attribute-coverage-v1',
    method:
      'TypeScript checker property/constant-index reads on PlayerAttributes-shaped values; direct writes excluded. Whole-vector consumers are separate, not proof of attribute-specific effects. New lab modules excluded.',
    attributes: keys.map((attribute) => {
      const productionReads = reads[attribute]!,
        paths = productionReads.map((r) => r.path),
        some = (r: RegExp) => paths.some((p) => r.test(p));
      const m = measured[attribute];
      return {
        attribute,
        productionReads,
        wholeVectorConsumers: [...whole].sort(),
        dynamicReads,
        declarativeReferences: declarative[attribute],
        existingTests: [...tests[attribute]!].sort(),
        roles: {
          physical: some(
            /canonicalMovement|locomotion|ballContactGeometry|firstTouch|passExecution|passReception|shotResolver|shootingDifficulty|aerialPlay|defensiveChallenges/,
          ),
          candidateGeneration: some(
            /Options|Opportunity|reachableSpace|carryExecution|firstTimePassing|goalkeeperClaim/,
          ),
          decisions: some(
            /decision|Decision|matchActions|tacticalRoles|coachIntelligence|tacticalPreferences/,
          ),
          fitnessRecovery: some(/Fitness|fitness|Recovery|Injuries|Availability/),
          goalkeeper:
            some(/goalkeeper|Goalkeeper/) ||
            (attribute.startsWith('goalkeeper') &&
              Boolean(productionReads.length || declarative[attribute]!.length)),
          career: some(
            /development|Development|training|Training|transfer|Transfer|playerOverall|playerCreator|footballerWorld|economy|Economy/,
          ),
        },
        measuredDrills: m?.drills ?? [],
        intendedContextExercised: m?.intended ?? false,
        finding:
          !productionReads.length && !dynamicReads.length && !declarative[attribute]!.length
            ? 'no_static_reads_detected'
            : !m?.intended
              ? 'not_exercised_in_intended_context'
              : m.effect
                ? 'measured_effect'
                : 'no_detectable_effect_in_sample',
      };
    }),
  });
};
