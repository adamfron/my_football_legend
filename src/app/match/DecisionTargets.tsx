import { useState } from 'react';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import {
  projectContextualInteractions,
  projectSelectableInteractionTargets,
  type PlayerInteractionTarget,
  type PlayerDecisionOpportunity,
} from '../../core/matchSimulation';

/** The same contextual enumerator as pitch picking; decorative people cannot enter this list. */
export const DecisionTargets = ({
  state,
  opportunity,
  onTarget,
}: {
  state: TacticalMatchState;
  opportunity: PlayerDecisionOpportunity;
  onTarget: (target: PlayerInteractionTarget) => void;
}) => {
  const [x, setX] = useState('52.5'),
    [y, setY] = useState('34');
  const actor = state.players.find((player) => player.id === opportunity.actorId);
  const targets = [
    ...new Map(
      [
        ...projectSelectableInteractionTargets(state, opportunity),
        { kind: 'ball' as const, point: { x: state.ball.x, y: state.ball.y } },
        ...(actor
          ? [
              {
                kind: 'goal' as const,
                side: actor.team === 'home' ? ('away' as const) : ('home' as const),
              },
            ]
          : []),
        ...state.players.map((player) => ({ kind: 'player' as const, playerId: player.id })),
      ]
        .filter((target) => projectContextualInteractions(state, opportunity, target).length)
        .map((target) => [JSON.stringify(target), target]),
    ).entries(),
  ];
  const point = { x: Number(x), y: Number(y) };
  const valid =
    x.trim() !== '' &&
    y.trim() !== '' &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 105 &&
    point.y >= 0 &&
    point.y <= 68;
  return (
    <fieldset className="decision-targets">
      <legend>Cel zagrania</legend>
      <label>
        Piłkarz, piłka lub bramka
        <select
          aria-label="Cel decyzji piłkarskiej"
          value=""
          onChange={(event) => {
            if (event.target.value)
              onTarget(JSON.parse(event.target.value) as PlayerInteractionTarget);
          }}
        >
          <option value="">Wybierz cel…</option>
          {targets.map(([key, target]) => (
            <option key={key} value={key}>
              {target.kind === 'player'
                ? `${state.players.find((player) => player.id === target.playerId)?.profile.lastName} · ${state.players.find((player) => player.id === target.playerId)?.team === state.players.find((player) => player.id === opportunity.actorId)?.team ? 'kolega' : 'rywal'}`
                : target.kind === 'ball'
                  ? 'Piłka'
                  : target.kind === 'goal'
                    ? 'Bramka rywala'
                    : `Przestrzeń ${Math.round(target.point.x)}, ${Math.round(target.point.y)} m`}
            </option>
          ))}
        </select>
      </label>
      <div className="decision-point">
        <label>
          X [m]
          <input
            aria-label="Cel na boisku X"
            type="number"
            min="0"
            max="105"
            step="0.5"
            value={x}
            onChange={(event) => setX(event.target.value)}
          />
        </label>
        <label>
          Y [m]
          <input
            aria-label="Cel na boisku Y"
            type="number"
            min="0"
            max="68"
            step="0.5"
            value={y}
            onChange={(event) => setY(event.target.value)}
          />
        </label>
        <button type="button" disabled={!valid} onClick={() => onTarget({ kind: 'space', point })}>
          Wskaż punkt
        </button>
      </div>
    </fieldset>
  );
};
