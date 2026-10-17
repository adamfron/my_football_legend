import { z } from 'zod';
import { createDynamicFixture } from '../src/core/matchSimulation/pr173Fixtures';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { enumerateFirstTimePasses } from '../src/core/matchSimulation/firstTimePassing';
import { incomingBallIntentKey } from '../src/core/matchSimulation/playerDecision';
import { normalizeAngle } from '../src/core/matchSimulation/playerOrientation';

export const pr173ExtensionSchema = z.object({
  opening: z.enum(['layoff', 'layoff_run', 'overlap', 'revalidation']),
  cover: z.boolean(),
  mirrored: z.boolean(),
});
/** Supplementary prescribed alternatives share the frozen 1a geometry. The opening is
 * queued for a genuine contact; a teammate's next decision is never prescribed. */
export const createPr173ResearchFixture = (
  input: z.infer<typeof pr173ExtensionSchema>,
  create = createTacticalMatch,
) => {
  const options = pr173ExtensionSchema.parse(input);
  const f = createDynamicFixture(
    { scenario: 'pr173-reception-pressure-1a', cover: options.cover, mirrored: options.mirrored },
    create,
  );
  const { state } = f;
  const point = (x: number, y: number) => (options.mirrored ? { x: 105 - x, y: 68 - y } : { x, y });
  const vector = (x: number, y: number) => (options.mirrored ? { x: -x, y: -y } : { x, y });
  const angle = (a: number) => normalizeAngle(a + (options.mirrored ? Math.PI : 0));
  if (options.opening === 'revalidation') {
    const defender = state.players.find((p) => p.id === f.defenderId)!;
    defender.position = point(68, 12.5);
    defender.velocity = vector(-6, 0);
    defender.facingAngle = angle(-Math.PI / 2);
    state.receptionPreparation!.continuation = {
      target: point(88, 10),
      mode: 'carry',
      createdAt: state.time - 0.1,
      expiresAt: state.time + 1.4,
      incomingVelocity: vector(8, 0),
    };
  } else {
    let receiverId = f.supportId;
    if (options.opening === 'overlap') {
      const runner = state.players.find(
        (p) => p.team === 'home' && p.slot.position === 'left_back',
      )!;
      runner.position = point(70, 5);
      runner.velocity = vector(5, 0);
      runner.target = point(88, 5);
      runner.facingAngle = angle(Math.PI / 2);
      receiverId = runner.id;
    }
    const choices = enumerateFirstTimePasses(state, f.actorId).filter(
      (a) => a.receiverId === receiverId,
    );
    const action = choices.find((a) => a.intent === 'lead') ?? choices[0];
    if (!action) throw new Error(`No physical first-time ${options.opening}`);
    state.pendingReceptionIntent = {
      actorId: f.actorId,
      action,
      actionSource: 'autonomous_npc',
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: incomingBallIntentKey(state),
    };
    if (options.opening === 'layoff_run')
      state.playerMovementIntent = {
        actorId: f.actorId,
        type: 'attack_space',
        target: point(80, 17),
        startedAt: state.time,
        expiresAt: state.time + 2.5,
      };
  }
  return { ...f, extension: options };
};
