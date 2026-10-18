import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { URL } from 'node:url';
export { resolve } from './typescriptLoader.mjs';

// Research only: wrap the original additive operands, evaluate each exactly once,
// and preserve the original arithmetic tree. There is no parallel scoring formula.
export const load = async (url, context, nextLoad) => {
  if (!url.endsWith('/src/core/matchSimulation/matchActions.ts')) return nextLoad(url, context);
  let source = (await readFile(new URL(url), 'utf8')).replaceAll('\r\n', '\n');
  const file = ts.createSourceFile(url, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const name = declaration.name.getText(file);
      if (!['scoreActionForAI', 'shotUtility'].includes(name)) continue;
      const visit = (node) => {
        if (
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node) ||
          ts.isFunctionDeclaration(node)
        )
          return;
        if (ts.isReturnStatement(node) && node.expression) {
          const returnLine = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
          const operand = (expression, sign = 1) => {
            if (ts.isParenthesizedExpression(expression))
              return operand(expression.expression, sign);
            if (
              ts.isBinaryExpression(expression) &&
              [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(
                expression.operatorToken.kind,
              )
            ) {
              operand(expression.left, sign);
              operand(
                expression.right,
                sign * (expression.operatorToken.kind === ts.SyntaxKind.MinusToken ? -1 : 1),
              );
            } else {
              const start = expression.getStart(file),
                end = expression.end;
              const label = source.slice(start, end);
              const actor = name === 'scoreActionForAI' ? 'action' : 'undefined';
              edits.push({
                start,
                end,
                text: `__pr176Term(${actor}, ${JSON.stringify(name)}, ${returnLine}, ${sign}, ${JSON.stringify(label)}, (${label}))`,
              });
            }
          };
          operand(node.expression);
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(declaration.initializer.body);
    }
  }
  if (edits.length < 50) throw new Error('PR176 original scorer instrumentation contract changed');
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  source += `\nconst __pr176Term = (action, fn, line, sign, expression, value) => { globalThis[Symbol.for('mfl.pr176.term')]?.({action, fn, line, expression, value: sign * value}); return value; };\n`;
  return { format: 'module-typescript', source, shortCircuit: true };
};
