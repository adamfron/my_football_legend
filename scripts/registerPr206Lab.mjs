/** Read-only command witness plus explicit sensory/target deprivation controls.
 * No hook supplies evidence, future actions, ball physics or contact advantages. */
import { registerHooks } from 'node:module';
import './registerPr204VisionLab.mjs';

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.includes('/src/core/matchSimulation/')) return result;
    let source =
      typeof result.source === 'string'
        ? result.source
        : new globalThis.TextDecoder().decode(result.source);
    source = source.replaceAll('\r\n', '\n');
    if (url.endsWith('/matchSimulation.ts')) {
      const needle = '    const {\n      facingAngle,\n      movementMode,';
      if (source.split(needle).length !== 2) throw Error('PR206 command witness drift');
      source = source.replace(
        needle,
        `    globalThis.__pr206Command?.(structuredClone({ at: state.time, actorId: player.id, prospectiveMotor, boundedMotor, patternTarget, selectedTarget: movementTarget, localReception: Boolean(localReception), localRecovery: Boolean(localRecovery), job: state.activePerceptionRuntime?.positions[player.id] }));\n${needle}`,
      );
      const contact = 'const changePossession = (';
      if (source.split(contact).length !== 2) throw Error('PR206 physical checkpoint drift');
      source = source.replace(contact, 'const originalPr206_changePossession = (');
      source +=
        '\nconst changePossession = (...args) => { globalThis.__pr206ContactCheckpoint?.(structuredClone(args)); return originalPr206_changePossession(...args); };\n';
    }
    if (url.endsWith('/receiverReadiness.ts')) {
      const needle = 'export const projectReceiverReadiness = ';
      if (source.split(needle).length !== 2) throw Error('PR206 readiness intervention drift');
      source = source.replace(needle, 'const originalPr206_projectReceiverReadiness = ');
      source +=
        '\nexport const projectReceiverReadiness = (state,receiver,...args) => originalPr206_projectReceiverReadiness(state,globalThis.__pr206NeutralReadiness ? {...receiver,profile:{...receiver.profile,attributes:{...receiver.profile.attributes,gameReading:55}}}:receiver,...args);\n';
    }
    for (const [file, name, body] of [
      [
        'receivingPositions.ts',
        'receivingPositionTarget',
        `const g=globalThis.__pr206Deprivation; return g?.noSupportId===p.id ? undefined : originalPr206_${'receivingPositionTarget'}(s,p);`,
      ],
      [
        'boundedPerception.ts',
        'observeBoundedScene',
        `const scene=originalPr206_observeBoundedScene(...args), g=globalThis.__pr206Deprivation; if (!g || scene.observerId!==g.observerId || !g.unseenId) return scene; return {...scene, visible:scene.visible.filter(p=>p.id!==g.unseenId), remembered:scene.remembered?.filter(p=>p.id!==g.unseenId), knowledge:scene.knowledge?.filter(p=>p.id!==g.unseenId)};`,
      ],
    ]) {
      if (!url.endsWith('/' + file)) continue;
      const needle = `export const ${name} = `;
      if (source.split(needle).length !== 2) throw Error('PR206 deprivation source drift: ' + name);
      source = source.replace(needle, `const originalPr206_${name} = `);
      source +=
        name === 'receivingPositionTarget'
          ? `\nexport const ${name} = (s,p) => {${body}};\n`
          : `\nexport const ${name} = (...args) => {${body}};\n`;
    }
    return { ...result, source };
  },
});
