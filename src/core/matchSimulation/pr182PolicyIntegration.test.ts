// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOffensiveScenario } from './pr163Fixtures';
import { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { DEFAULT_DECISION_POLICY, PRIMARY_DECISION_POLICIES } from './decisionPolicyConfig';

describe('PR182 promoted policy and shared human execution', () => {
  it('uses the selected B default for new matches without a policy override', () => {
    const { state } = createOffensiveScenario('npc_equivalent', 'pr182-default');
    expect(DEFAULT_DECISION_POLICY).toBe('state-value-v1');
    expect(state.decisionPolicy).toBe(DEFAULT_DECISION_POLICY);
  });

  it.each(PRIMARY_DECISION_POLICIES)(
    'preserves human authority and physical parity before NPC re-selection: %s',
    (policy) => {
      const { state, action } = createOffensiveScenario(
        'npc_equivalent',
        'pr182-authority',
        (session) =>
          createTacticalMatch({ ...session, setup: { ...session.setup, decisionPolicy: policy } }),
      );
      // The resolver shares physics. An NPC may subsequently choose a different action;
      // the human's explicit command must persist without autonomous replacement.
      const controlled = {
        ...state,
        playerAgencyEnabled: true,
        controlledFootballerId: action.actorId,
      };
      let human = resolveMatchAction(structuredClone(controlled), action, 'human_selected');
      let npc = resolveMatchAction(structuredClone(controlled), action, 'autonomous_npc');
      const decision = human.decisionIndex;
      let replanned = false;
      expect(human.ball).toEqual(npc.ball);
      expect(human.players).toEqual(npc.players);
      for (let tick = 0; tick < 12; tick++) {
        human = stepTacticalMatchAfterDecisionProbe(human, 0.025);
        if (!replanned) npc = stepTacticalMatchAfterDecisionProbe(npc, 0.025);
        const h = human.players.find((p) => p.id === action.actorId)!;
        const n = npc.players.find((p) => p.id === action.actorId)!;
        expect(human.decisionIndex).toBe(decision);
        expect(human.ballCarrierIntent?.target).toEqual(
          action.type === 'carry' ? action.target : undefined,
        );
        if (!replanned) {
          expect(h.position).toEqual(n.position);
          expect(h.velocity).toEqual(n.velocity);
          expect(h.fitness).toEqual(n.fitness);
          if (npc.decisionIndex === decision) expect(human.ball).toEqual(npc.ball);
          else replanned = true;
        }
      }
    },
  );
});
