import { z } from 'zod';
import { createPr213Scene, pr213Frame, normalizedPr213State } from './pr213Scenarios';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

export const pr214SceneSchema = z.enum([
  'pair-reference',
  'line-three',
  'third-absent',
  'third-approaching',
  'third-away',
  'third-late',
  'simultaneous-three',
  'line-four',
  'glancing-three',
  'resting-three',
  'within-tick-rearm',
  'over-bound-five',
  'shallow-overlap',
  'deep-overlap',
  'near-tangent',
  'player-edge',
  'edge-blocked',
  'ball-touchline',
  'edge-body-foot',
  'body-pass-third',
  'pass-body-third',
  'body-pass-challenge',
  'stationary-duel',
  'stationary-close',
  'clinch-third',
]);
export const pr214Cases = pr214SceneSchema.options;
export const createPr214Scene = (name: z.infer<typeof pr214SceneSchema>) => {
  const pass = [
    'body-pass-third',
    'pass-body-third',
    'body-pass-challenge',
    'edge-body-foot',
  ].includes(name);
  const fixture = createPr213Scene({
    name,
    separation: name === 'pass-body-third' ? 0.7 : 0.5,
    lateral: name === 'pass-body-third' ? 0.5 : 0.3,
    defenderSpeed: name === 'pass-body-third' ? -9 : -6,
    pass: true,
    ballSpeed: name.startsWith('stationary') || name === 'clinch-third' ? 0 : 0.5,
    ticks: name.startsWith('stationary') || name === 'clinch-third' ? 80 : 12,
  });
  const s = fixture.initial;
  s.experimentalPlayerBodyImpulse = 'upright-cluster-dev-v1';
  const a = s.players.find((p) => p.id === s.defensiveChallenge!.actorId)!;
  const b = s.players.find((p) => p.id === s.defensiveChallenge!.opponentId)!;
  const extras = s.players
    .filter((p) => p.id !== a.id && p.id !== b.id && p.slot.position !== 'goalkeeper')
    .slice(0, 3);
  const place = (p: typeof a, x: number, y: number, vx: number, vy = 0) => {
    p.position = { x, y };
    p.velocity = { x: vx, y: vy };
    p.target = p.anchor = p.neutralAnchor = { ...p.position };
    p.profile = { ...p.profile, weightKg: 75 };
  };
  if (!pass && !name.startsWith('stationary') && name !== 'clinch-third') {
    // An already prepared, deliberately unreachable pass owns the canonical
    // interval without nominating a defensive offence in the neutral apparatus.
    // Separate body-pass scenes below retain the genuine challenge/referee path.
    delete s.defensiveChallenge;
    s.ball = {
      x: 60,
      y: 50,
      height: 0.11,
      velocity: { x: 0, y: 0, z: 0 },
      lastTouchPlayerId: s.pendingStrike!.initialLastTouch!,
    };
    place(a, 30, 32, 6);
    place(b, 30.74, 32, 0);
    if (!['pair-reference', 'third-absent'].includes(name)) place(extras[0]!, 31.44, 32, 0);
    if (name === 'third-approaching') extras[0]!.velocity.x = -2;
    if (name === 'third-away') extras[0]!.velocity.x = 4;
    if (name === 'third-late') extras[0]!.position.x += 1;
    if (name === 'simultaneous-three') {
      place(a, 30, 32, 3);
      place(b, 30.74, 32, 0);
      place(extras[0]!, 31.48, 32, -3);
    }
    if (name === 'line-four' || name === 'over-bound-five') {
      place(b, 30.68, 32, 0);
      place(extras[0]!, 31.36, 32, 0);
      place(extras[1]!, 32.04, 32, 0);
      if (name === 'over-bound-five') place(extras[2]!, 32.72, 32, 0);
    }
    if (name === 'glancing-three') {
      extras[0]!.position.y += 0.3;
      a.velocity.y = 0.5;
    }
    if (name === 'resting-three') {
      place(a, 30, 32, 0);
      place(b, 30.68, 32, 0);
      place(extras[0]!, 31.36, 32, 0);
    }
    if (name === 'within-tick-rearm') {
      place(b, 30, 32, 0);
      place(a, 30.68, 32, 6);
      place(extras[0]!, 31.384, 32, -6);
      a.profile.weightKg = 55;
      extras[0]!.profile.weightKg = 110;
      s.continuousPlayerContacts = [{ participants: [a.id, b.id], beganAt: 9 }];
    }
    if (name === 'shallow-overlap' || name === 'deep-overlap') {
      place(b, 30.68 - (name === 'shallow-overlap' ? 0.001 : 0.05), 32, 0);
      extras[0]!.position.x += 3;
    }
    if (name === 'near-tangent') {
      place(b, 30.06, 32.68, 0);
      extras[0]!.position.x += 3;
    }
    if (['player-edge', 'edge-blocked', 'ball-touchline'].includes(name)) {
      place(a, 30, 1.1, 0, -6);
      place(b, 30, 0.405, 0);
      place(extras[0]!, 30.68, 0.405, 0);
      if (name === 'player-edge') extras[0]!.position.x += 3;
      if (name === 'ball-touchline')
        s.ball = {
          x: 30,
          y: 0.12,
          height: 0.11,
          velocity: { x: 0, y: -20, z: 0 },
          lastTouchPlayerId: b.id,
        };
    }
  } else if (pass && name !== 'body-pass-challenge') {
    // Third body lies beyond the passer, along the measured first pair normal.
    const dx = b.position.x - a.position.x,
      dy = b.position.y - a.position.y,
      d = Math.hypot(dx, dy);
    place(extras[0]!, b.position.x + (dx / d) * 0.7, b.position.y + (dy / d) * 0.7, 0);
    if (name === 'edge-body-foot') {
      const shift = b.position.y - 0.405;
      for (const p of [a, b, extras[0]!]) p.position.y -= shift;
      s.ball.y -= shift;
      place(extras[0]!, 25, 10, 0);
    }
  } else if (name.startsWith('stationary')) {
    delete s.pendingStrike;
    place(a, s.ball.x + (name === 'stationary-close' ? 0.34 : 0.5), s.ball.y - 0.17, 0);
    b.velocity = { x: 0, y: 0 };
  } else if (name === 'clinch-third') {
    delete s.pendingStrike;
    delete s.ball.ownerId;
    const x = s.ball.x,
      y = s.ball.y;
    place(a, x - 0.25, y, 0);
    place(b, x + 0.25, y, 0);
    place(extras[0]!, x + 0.35, y + 0.8, 0, -3);
    s.ball.continuousBodyContacts = [a.id, b.id];
  }
  // Diagnostic identity survives when the neutral apparatus removes the attempt.
  return {
    config: fixture.config,
    initial: normalizedPr213State(s),
    pairIds: [a.id, b.id] as [string, string],
  };
};
export const pr214Frame = (s: TacticalMatchState) => ({
  ...pr213Frame(s),
  clusters: s.multiBodyResolutions ?? [],
});
export const tracePr214 = (initial: TacticalMatchState, ticks: number) => {
  let state = initial;
  const frames = [pr214Frame(state)];
  for (let i = 0; i < ticks; i++) {
    state = stepTacticalMatch(state, 0.025);
    frames.push(pr214Frame(state));
  }
  return { state, frames };
};
