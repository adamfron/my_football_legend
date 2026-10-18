import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { load as decisionLoad } from './pr172DecisionLoader.mjs';
export { resolve } from './typescriptLoader.mjs';

// Offline timing only. Ordinary builds and full-match plain replays do not load
// these wrappers. Preserve the implementation and throw if its export contract moves.
export const load = async (url, context, nextLoad) => {
  if (!url.endsWith('/src/core/matchSimulation/combinationPlay.ts'))
    return decisionLoad(url, context, nextLoad);
  let source = (await readFile(new URL(url), 'utf8')).replaceAll('\r\n', '\n');
  for (const name of ['reconcileCombination', 'observeCombinationRelease', 'enumerateCombinationPasses']) {
    const marker = `export const ${name} = (`;
    if (!source.includes(marker)) throw new Error(`PR175 timing export changed: ${name}`);
    source = source.replace(marker, `const ${name}Implementation = (`);
    source += `\nexport const ${name} = (...args) => {
      const observer = globalThis[Symbol.for('mfl.pr175.combinationProfile')];
      if (!observer) return ${name}Implementation(...args);
      const started = performance.now();
      try { return ${name}Implementation(...args); }
      finally { observer('${name}', performance.now() - started, Boolean(args[0]?.combinationIntent)); }
    };\n`;
  }
  return { format: 'module-typescript', source, shortCircuit: true };
};
