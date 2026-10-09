// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { applyRestartScenario } from './restartScenarios';
import { deriveRestartGeometry, deriveRestartMovementTargets } from './restartGeometry';
import {
  groupContextualInteractions,
  projectContextualInteractions,
  projectRestartDecisionInteractions,
} from './contextualInteractions';
import {
  countSemanticPlayerChoices,
  projectPlayerDecisionOpportunity,
  projectSelectableInteractionTargets,
  type PlayerDecisionOpportunity,
} from './playerDecision';
import { evaluateMatchSituation } from './matchSituationEvaluator';
import type { MatchAction } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr159-geometry',
      control: { mode: 'spectator' },
    }),
  );

describe('PR159 delivery-dependent restart responsibilities', () => {
  it('assigns distinct receiver zones and preserves cover, without moving players or drawing canonical RNG', () => {
    const state = fixture();
    const before = structuredClone(state);
    const geometry = deriveRestartGeometry(state, 'corner');
    const receivers = Object.values(geometry.roles).filter((role) =>
      ['attack_near_post', 'attack_central', 'attack_far_post'].includes(role.intent),
    );
    expect(new Set(receivers.map((role) => JSON.stringify(role.zone.centre))).size).toBe(3);
    expect(
      Object.values(geometry.roles).filter((role) => role.intent === 'rest_defence').length,
    ).toBeGreaterThanOrEqual(2);
    expect(Object.values(geometry.roles).some((role) => role.intent === 'short_option')).toBe(true);
    expect(deriveRestartGeometry(state, 'corner')).toEqual(geometry);
    expect(state).toEqual(before);
  });

  it('changes receiving plans for far-post, driven near-post and direct-shot selections', () => {
    const state = fixture();
    const basic = deriveRestartGeometry(state, 'free_kick_wide');
    const actorId = basic.taker.id;
    const far = deriveRestartGeometry(state, 'free_kick_wide', 'home', basic.ball, {
      takerId: actorId,
      selectedAction: { type: 'cross', actorId, intent: 'floated', target: { x: 97, y: 42 } },
    });
    const near = deriveRestartGeometry(state, 'free_kick_wide', 'home', basic.ball, {
      takerId: actorId,
      selectedAction: { type: 'cross', actorId, intent: 'driven', target: { x: 99, y: 27 } },
    });
    const shot = deriveRestartGeometry(state, 'free_kick_wide', 'home', basic.ball, {
      takerId: actorId,
      selectedAction: { type: 'shot', actorId, intent: 'driven', target: { x: 105, y: 34 } },
    });
    expect(far.landingZone).toEqual({ x: 97, y: 42 });
    expect(near.landingZone).toEqual({ x: 99, y: 27 });
    expect(far.roles).not.toEqual(near.roles);
    expect(Object.values(shot.roles).some((role) => role.key === 'rebound_attacker')).toBe(true);
    for (const geometry of [far, near, shot])
      expect(
        Object.values(geometry.roles).filter((role) => role.intent === 'rest_defence').length,
      ).toBeGreaterThanOrEqual(2);
  });

  it('keeps the explicitly selected receiver while retaining other cover and mirrors away deliveries', () => {
    const state = fixture();
    const geometry = deriveRestartGeometry(state, 'corner', 'away');
    const intended = state.players.find(
      (p) =>
        p.team === 'away' &&
        p.id !== geometry.taker.id &&
        p.profile.primaryPosition !== 'goalkeeper',
    )!;
    const selected = deriveRestartGeometry(state, 'corner', 'away', geometry.ball, {
      takerId: geometry.taker.id,
      selectedAction: {
        type: 'cross',
        actorId: geometry.taker.id,
        intendedTargetId: intended.id,
        intent: 'floated',
        target: { x: 8, y: 26 },
      },
    });
    expect(selected.taker.id).toBe(geometry.taker.id);
    expect(selected.landingZone).toEqual({ x: 8, y: 26 });
    expect(selected.roles[intended.id]?.zone.centre).toEqual({ x: 8, y: 26 });
    expect(selected.roles[intended.id]?.intent).not.toBe('rest_defence');
  });

  it('omits dismissed players and projects live marking from current positions without mutation', () => {
    let state = applyRestartScenario(fixture(), 'corner');
    const removed = state.players.find(
      (p) => p.team === 'home' && p.id !== state.restart!.takerId,
    )!;
    state = {
      ...state,
      discipline: {
        ...state.discipline,
        [removed.id]: { yellowCards: 0, sentOff: true, team: removed.team },
      },
    };
    const geometry = deriveRestartGeometry(state, 'corner');
    expect(geometry.targets[removed.id]).toBeUndefined();
    state = {
      ...state,
      restart: {
        ...state.restart!,
        origin: 'live_event',
        phase: 'preparing',
        targets: geometry.targets,
        roles: geometry.roles,
      },
    };
    const [markerId, role] = Object.entries(geometry.roles).find(
      ([, candidate]) => candidate.markerId,
    )!;
    const marked = state.players.find((p) => p.id === role.markerId)!;
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === marked.id ? { ...p, position: { x: 89, y: 38 } } : p,
      ),
    };
    const before = structuredClone(state);
    const targets = deriveRestartMovementTargets(state);
    expect(targets[markerId]!.x).toBeGreaterThan(89);
    expect(targets[markerId]!.x).toBeLessThan(91);
    expect(targets[removed.id]).toBeUndefined();
    expect(state).toEqual(before);
  });

  it('does not demand a perfect point inside a live zone or move frozen DEV targets', () => {
    let state = applyRestartScenario(fixture(), 'free_kick_wide');
    const receiverId = Object.entries(state.restart!.roles).find(
      ([, role]) => role.key === 'edge_support',
    )![0];
    const centre = state.restart!.roles[receiverId]!.zone.centre;
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === receiverId ? { ...p, position: { x: centre.x + 1, y: centre.y } } : p,
      ),
    };
    expect(deriveRestartMovementTargets(state)).toEqual(state.restart!.targets);
    state = { ...state, restart: { ...state.restart!, origin: 'live_event', phase: 'preparing' } };
    expect(deriveRestartMovementTargets(state)[receiverId]).toEqual({
      x: centre.x + 1,
      y: centre.y,
    });
  });
});

describe('PR159 canonical restart presentation', () => {
  it('preserves every legal cross, pass-to-space, target and shot profile in grouped menus', () => {
    let state = applyRestartScenario(fixture(), 'free_kick_wide');
    const actorId = state.restart!.takerId;
    const receiver = state.players.find((p) => p.team === 'home' && p.id !== actorId)!;
    state = { ...state, controlledFootballerId: actorId, playerAgencyEnabled: true };
    const actions: MatchAction[] = [
      { type: 'shot', actorId, intent: 'placed', target: { x: 105, y: 34 } },
      {
        type: 'shot',
        actorId,
        intent: 'placed',
        target: { x: 105, y: 34 },
        freeKickProfile: 'controlled_curl',
      },
      {
        type: 'shot',
        actorId,
        intent: 'placed',
        target: { x: 105, y: 34 },
        freeKickProfile: 'dipping',
      },
      ...[27, 34, 41].map(
        (y): MatchAction => ({
          type: 'cross',
          actorId,
          target: { x: 97, y },
          intent: 'floated',
          intendedTargetId: receiver.id,
        }),
      ),
      {
        type: 'pass',
        actorId,
        receiverId: receiver.id,
        intent: 'support',
        target: receiver.position,
      },
      { type: 'space_pass', actorId, target: { x: 84, y: 12 } },
    ];
    const opportunity: PlayerDecisionOpportunity = {
      id: 'pr159-menu',
      actorId,
      openedAt: state.time,
      kind: 'restart',
      signature: 'pr159-menu',
      triggerReason: 'restart_free_kick_wide',
      situation: evaluateMatchSituation(state, actorId),
      options: actions.map((action, i) => ({
        id: `choice-${i}`,
        kind: 'action',
        labelKey: action.type,
        action,
      })),
    };
    expect(
      projectContextualInteractions(state, opportunity, { kind: 'goal', side: 'away' }),
    ).toHaveLength(3);
    for (const action of actions.filter(
      (candidate) => candidate.type === 'cross' || candidate.type === 'space_pass',
    )) {
      if (action.type !== 'cross' && action.type !== 'space_pass') continue;
      expect(
        projectContextualInteractions(state, opportunity, {
          kind: 'space',
          point: action.target,
        }).map((interaction) => interaction.resolution),
      ).toContainEqual({ kind: 'action', action });
    }
    const targets = projectSelectableInteractionTargets(state, opportunity);
    expect(targets).toContainEqual({ kind: 'space', point: { x: 84, y: 12 } });
    expect(targets).toContainEqual({ kind: 'player', playerId: receiver.id });
    const choices = projectRestartDecisionInteractions(state, opportunity);
    expect(choices).toHaveLength(actions.length);
    expect(
      groupContextualInteractions(choices, true).flatMap((group) => group.interactions),
    ).toHaveLength(actions.length);
    expect(countSemanticPlayerChoices(opportunity.options, 'restart')).toBe(actions.length);
  });

  it('shows a controlled decision only after legal preparation and never repeats a selected choice', () => {
    let state = applyRestartScenario(fixture(), 'free_kick_wide');
    state = {
      ...state,
      controlledFootballerId: state.restart!.takerId,
      playerAgencyEnabled: true,
      restart: { ...state.restart!, origin: 'live_event', phase: 'preparing' },
    };
    expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
    state = { ...state, restart: { ...state.restart!, phase: 'awaiting_decision' } };
    const opportunity = projectPlayerDecisionOpportunity(state);
    expect(opportunity?.kind).toBe('restart');
    const chosen = opportunity!.options.find((option) => option.kind === 'action')!;
    if (chosen.kind !== 'action') throw new Error('Expected action');
    state = {
      ...state,
      restart: { ...state.restart!, phase: 'kick_preparation', selectedAction: chosen.action },
    };
    expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
  });
});
