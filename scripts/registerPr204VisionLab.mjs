/** Development-only sensory deprivation hook. It removes observations; it
 * never supplies ball coordinates, future actions, ownership or motion. */
import { registerHooks } from 'node:module';
import './registerTypescriptLoader.mjs';
const wrapped = {
  'boundedPerception.ts': 'observeBoundedScene',
  'liveBallFlight.ts': 'advanceLiveBallFlight',
  'canonicalMovement.ts': 'integrateCanonicalMovement',
};
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context), name = wrapped[url.split('/').at(-1)];
    if (!name || !url.includes('/src/core/matchSimulation/')) return result;
    let source = typeof result.source === 'string' ? result.source : new globalThis.TextDecoder().decode(result.source);
    const needle = `export const ${name} = `;
    if (source.split(needle).length !== 2) throw Error('PR204 sensory hook source drift: ' + name);
    source = source.replace(needle, `const originalPr204_${name} = `);
    if (name === 'observeBoundedScene')
      source += `\nexport const ${name} = (state, actor, ...rest) => { const scene = originalPr204_${name}(state, actor, ...rest); const g = globalThis.__pr204VisionGate; return g && actor.id === g.actorId && state.time < g.until ? { ...scene, ball: null } : scene; };\n`;
    else if (name === 'advanceLiveBallFlight')
      source += `\nexport const ${name} = (state) => { const next = originalPr204_${name}(state); const g = globalThis.__pr204VisionGate; if (!g || state.time >= g.until || !next.liveBallFlightRuntime?.sensors[g.actorId]) return next; const sensors = { ...next.liveBallFlightRuntime.sensors, [g.actorId]: { sampledAt: state.time, nextAcquisitionAt: state.time, optical: null } }; return { ...next, liveBallFlightRuntime: { ...next.liveBallFlightRuntime, sensors } }; };\n`;
    else
      source += `\nexport const ${name} = (player, input) => { const result = originalPr204_${name}(player, input); const t = globalThis.__pr204MovementTrace; if (t && player.id === t.actorId) t.records.push({ position: player.position, velocityBefore: player.velocity, facingBefore: player.facingAngle, input, velocityAfter: result.velocity, facingAfter: result.facingAngle, balance: result.plantBalance }); return result; };\n`;
    return { ...result, source };
  },
});
