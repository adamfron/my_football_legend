import { registerHooks } from 'node:module';
import './registerTypescriptLoader.mjs';

const insert = (source, needle, code) => {
  if (source.split(needle).length !== 2) throw Error(`PR220 instrumentation drift: ${needle}`);
  return source.replace(needle, code + needle);
};

// Use the same synchronous loader approach as PR206. The archived prefix uses
// only the read-only selection probe. The laboratory arms may replace a movement
// command and postpone routine decisions by the probed actor.
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/matchSimulation.ts') && !url.endsWith('/matchActions.ts')) return result;
    let source =
      typeof result.source === 'string'
        ? result.source
        : new globalThis.TextDecoder().decode(result.source);
    source = source.replaceAll('\r\n', '\n');
    if (url.endsWith('/matchActions.ts')) {
      source = insert(
        source,
        '  let next = resolveMatchActionCanonical(state, action, source);',
        '  globalThis.__pr220?.selection?.(state, action, source);\n',
      );
    } else {
      source = insert(
        source,
        '  if (state.pendingStrike) return state;\n  const ownerId',
        '  if (globalThis.__pr220?.waitingActor === state.ball.ownerId && state.ball.ownerId) return state;\n',
      );
      source = source.replace(
        '    } = integrateCanonicalMovement(player, {\n      target: movementTarget,',
        '    } = integrateCanonicalMovement(player, globalThis.__pr220?.command?.(movementState, player) ?? {\n      target: movementTarget,',
      );
      if (!source.includes('globalThis.__pr220?.command'))
        throw Error('PR220 movement boundary drift');
    }
    return { ...result, source };
  },
});
