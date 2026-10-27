/** Explicit laboratory entry point. No application or historical replay imports this loader.
 * Hooks alter sensory/motor inputs and declared planning ablations; physical integrators
 * and contact response functions remain original.
 * The null-hook path must reproduce exact historical outcomes and hashes. */
import { registerHooks } from 'node:module';
import './registerTypescriptLoader.mjs';
const wrapped = {
  'ballOrientedMovement.ts': ['observeReceptionBall'],
  'receiverSynchronisation.ts': ['planSynchronizedReception', 'receptionPlanFacing'],
  'locomotion.ts': ['projectLocomotion'],
  'movementAuthority.ts': ['authoritativeMovementTarget'],
  'goalkeeperIntervention.ts': ['projectGoalkeeperIntervention'],
  'preReceptionPlanning.ts': ['preparedContinuation'],
  'passReception.ts': ['receptionMovementContactTarget'],
  'canonicalMovement.ts': ['integrateCanonicalMovement'],
};
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    const names = wrapped[url.split('/').at(-1)];
    if (!names || !url.includes('/src/core/matchSimulation/')) return result;
    let source =
      typeof result.source === 'string'
        ? result.source
        : new globalThis.TextDecoder().decode(result.source);
    if (url.endsWith('/receiverSynchronisation.ts')) {
      const uncertainty = 'uncertaintyMetres: 0.15 + (age ?? 0) * (1 + speed * 0.1),';
      if (source.split(uncertainty).length !== 2) throw Error('PR199 uncertainty hook drift');
      source = source.replace(
        uncertainty,
        'uncertaintyMetres: (0.15 + (age ?? 0) * (1 + speed * 0.1)) * (globalThis.__mflPr199Lab?.uncertaintyScale ?? 1),',
      );
    }
    for (const name of names) {
      const needle = `export const ${name} = `;
      if (source.split(needle).length !== 2) throw Error('PR199 hook source drift: ' + name);
      source = source.replace(needle, `const pr199Original_${name} = `);
      source += `\nexport const ${name} = (...args) => { const hook = globalThis.__mflPr199Lab?.${name}; return hook ? hook(args, (...input) => pr199Original_${name}(...input)) : pr199Original_${name}(...args); };\n`;
    }
    return { ...result, source };
  },
});
