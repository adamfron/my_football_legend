import { createPr214Scene } from './pr214Scenarios';
import { createPr211Scene } from './pr211Scenarios';
import {
  initializeArticulatedPlayer,
  withArticulatedBody,
} from '../src/core/matchSimulation/articulatedGait';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody';
import { deriveLowerBodyGeometry } from '../src/core/matchSimulation/lowerBodyGeometry';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

export const selectPr224Body = (state: TacticalMatchState): TacticalMatchState => ({
  ...state,
  experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
  experimentalComposedLegContact: 'composed-leg-contact-dev-v1',
});

export const createPr224LimbScene = (
  foot: 'left' | 'right',
  mode: 'stationary' | 'recovering' | 'miss' = 'stationary',
) => {
  const state = withArticulatedBody(createPr214Scene('pair-reference').initial);
  delete state.pendingStrike;
  const p = state.players.find((player) => player.slot.position !== 'goalkeeper')!;
  const position = { x: 55, y: 42 };
  const body = initializeArticulatedPlayer(
    {
      ...p,
      articulatedStance: undefined,
      position,
      target: position,
      anchor: position,
      neutralAnchor: position,
      facingAngle: 0,
      velocity: { x: 0, y: 0 },
      profile: { ...p.profile, heightCm: foot === 'left' ? 165 : 195 },
    },
    foot === 'left' ? 'reduced-grip-dev-v1' : 'firm-grass-dev-v1',
  );
  state.players = state.players.map((player) => (player.id === p.id ? body : player));
  const side = foot === 'left' ? -1 : 1;
  if (mode === 'recovering') {
    body.articulatedStance!.support = foot === 'left' ? 'right' : 'left';
    state.recoveringFeet = [
      {
        actorId: p.id,
        foot,
        facingAngle: 0,
        beganAt: state.time - 0.025,
        seconds: 0.1,
        displacement: { x: 0.13 * side, y: 0, z: 0.025 },
      },
    ];
  }
  state.playerMovementIntent = {
    actorId: p.id,
    type: 'hold_shape',
    target: body.position,
    startedAt: state.time,
    expiresAt: state.time + 1,
  };
  const geometry = projectArticulatedBody(state, body)?.geometry ?? deriveLowerBodyGeometry(body);
  const { knee, ankle } = geometry[foot];
  state.ball = {
    x: (knee.x + ankle.x) / 2 + side * 0.29,
    y: (knee.y + ankle.y) / 2 + (mode === 'miss' ? 0.3 : 0),
    height: (knee.z + ankle.z) / 2,
    velocity: { x: -side * 12, y: 0, z: 0 },
    airborne: true,
  };
  return { ...state, experimentalPostImpactStance: 'parked-stance-remainder-dev-v1' as const };
};

export const createPr224PassScene = (
  name: 'ordinary' | 'weak-foot' | 'miss' | 'advance' | 'turn',
) => {
  const { initial, selected, actor } = createPr211Scene(name);
  const withStance = (s: TacticalMatchState) =>
    withArticulatedBody({
      ...s,
      experimentalContactTimeline: 'standing-contact-dev-v1',
      experimentalPlayerBodyImpulse: 'upright-cluster-dev-v1',
      experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
    });
  return { before: withStance(initial), selected: withStance(selected), actorId: actor.id };
};
