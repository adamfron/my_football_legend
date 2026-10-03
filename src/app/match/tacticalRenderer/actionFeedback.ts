import type { CanonicalActionEvent } from '../../../core/matchSimulation/actionEvents';
import type { TacticalMatchState } from '../../../core/matchSimulation/matchState';
import type { TacticalFrame } from './model';

export const FEEDBACK_MAX_LABELS = 3;
export const FEEDBACK_MAX_LIFETIME_MS = 1600;

/** Declarative Polish feedback. Routine contacts/movement do not produce floating text. */
const feedback = {
  pass: { text: 'PODANIE', priority: 1, lifetimeMs: 700 },
  through_pass: { text: 'PODANIE PROSTOPADŁE', priority: 2, lifetimeMs: 850 },
  cross: { text: 'DOŚRODKOWANIE', priority: 3, lifetimeMs: 850 },
  reception: { text: 'PRZYJĘCIE', priority: 0, lifetimeMs: 400 },
  dribble: { text: 'PROWADZENIE', priority: 0, lifetimeMs: 400 },
  heavy_touch: { text: 'CIĘŻKIE PRZYJĘCIE', priority: 7, lifetimeMs: 1100 },
  interception: { text: 'PRZECHWYT', priority: 7, lifetimeMs: 1050 },
  challenge: { text: 'ODBIÓR', priority: 2, lifetimeMs: 650 },
  tackle: { text: 'ODBIÓR', priority: 5, lifetimeMs: 900 },
  slide_tackle: { text: 'WŚLIZG', priority: 5, lifetimeMs: 950 },
  block: { text: 'BLOK', priority: 6, lifetimeMs: 1000 },
  clearance: { text: 'WYBICIE', priority: 3, lifetimeMs: 850 },
  shot: { text: 'STRZAŁ', priority: 8, lifetimeMs: 1200 },
  save: { text: 'OBRONA', priority: 9, lifetimeMs: 1250 },
  foul: { text: 'FAUL', priority: 10, lifetimeMs: 1450 },
  card: { text: 'ŻÓŁTA KARTKA', priority: 11, lifetimeMs: 1600 },
  advantage: { text: 'KORZYŚĆ', priority: 8, lifetimeMs: 1000 },
  offside: { text: 'SPALONY', priority: 9, lifetimeMs: 1450 },
} satisfies Record<
  CanonicalActionEvent['kind'],
  { text: string; priority: number; lifetimeMs: number }
>;

export const actionFeedbackText = (event: CanonicalActionEvent) =>
  (event.kind === 'pass' || event.kind === 'through_pass') && event.executionType === 'backheel'
    ? 'PODANIE PIĘTĄ'
    : (event.kind === 'pass' || event.kind === 'through_pass') &&
        event.executionType === 'lofted_through'
      ? 'PROSTOPADŁE GÓRĄ'
      : event.kind === 'pass' && event.executionType === 'first_time'
        ? 'Z PIERWSZEJ PIŁKI'
        : event.kind === 'heavy_touch' && event.outcome === 'failed_control'
          ? 'NIEUDANE PRZYJĘCIE'
          : event.kind === 'dribble' && event.cause === 'evade'
            ? 'ZWÓD'
            : event.kind === 'card' && event.outcome !== 'yellow'
              ? 'CZERWONA KARTKA'
              : event.kind === 'advantage' && event.outcome === 'recalled'
                ? 'WRACAMY DO FAULU'
                : feedback[event.kind].text;

/** Pure projection at canonical time, shared by live, lead-in and replay.
 * One per actor and one repeated kind/team within 450ms; important outcomes win the three slots.
 * Ordinary successful reception and unproductive routine duels stay quiet. */
export const selectActionFeedback = (
  events: readonly CanonicalActionEvent[],
  atMs: number,
): CanonicalActionEvent[] => {
  const candidates = events
    .filter((event) => {
      const age = atMs - event.at * 1000;
      return (
        age >= -0.001 &&
        age < feedback[event.kind].lifetimeMs &&
        event.kind !== 'reception' &&
        !(event.kind === 'dribble' && !['evade', 'burst', 'tight_dribble'].includes(event.cause)) &&
        !(
          event.kind === 'challenge' && ['missed', 'beaten', 'loose_ball'].includes(event.outcome)
        ) &&
        !(event.kind === 'advantage' && event.outcome === 'realized')
      );
    })
    .sort(
      (a, b) =>
        feedback[b.kind].priority - feedback[a.kind].priority ||
        b.at - a.at ||
        b.sequence - a.sequence ||
        a.id.localeCompare(b.id),
    );
  const labels: CanonicalActionEvent[] = [];
  const ids = new Set<string>();
  for (const event of candidates) {
    if (
      ids.has(event.id) ||
      labels.some(
        (label) =>
          label.actorId === event.actorId ||
          (label.kind === event.kind &&
            label.team === event.team &&
            Math.abs(label.at - event.at) < 0.45),
      )
    )
      continue;
    ids.add(event.id);
    labels.push(event);
    if (labels.length === FEEDBACK_MAX_LABELS) break;
  }
  return labels;
};

/** Compact frame evidence covers every visible lifetime and never retains the whole ledger. */
export const frameActionEvents = (events: readonly CanonicalActionEvent[], atMs: number) =>
  events.filter(
    (event) => event.at * 1000 <= atMs + 0.001 && atMs - event.at * 1000 < FEEDBACK_MAX_LIFETIME_MS,
  );

/** One timestamp per dismissed match identity; replay roster facts outlive label evidence. */
export const frameDismissals = (state: Pick<TacticalMatchState, 'discipline'>) =>
  Object.fromEntries(
    Object.entries(state.discipline ?? {}).flatMap(([id, discipline]) =>
      discipline.sentOff && discipline.sentOffAt !== undefined
        ? [[id, discipline.sentOffAt * 1000]]
        : [],
    ),
  );

export const actionFeedbackAnchor = (event: CanonicalActionEvent, frame: TacticalFrame) => {
  const actor = frame.players.find((player) => player.id === event.actorId);
  return actor ? { x: actor.x, y: actor.y } : event.position;
};

export const actionFeedbackOpacity = (event: CanonicalActionEvent, atMs: number) => {
  const remaining = feedback[event.kind].lifetimeMs - (atMs - event.at * 1000);
  return Math.max(0, Math.min(1, remaining / 180));
};

export const onPitchFeedbackSchema = z.object({
  id: z.string(),
  kind: z.string(),
  actorId: z.string(),
  team: z.enum(['home', 'away']),
  position: z.object({ x: z.number(), y: z.number() }),
  text: z.string(),
  opacity: z.number().min(0).max(1),
});
export type OnPitchFeedback = z.infer<typeof onPitchFeedbackSchema>;

const preparationFeedback = {
  controlling: { text: 'PRZYJĘCIE', lifetimeMs: 650 },
  directional_touch: { text: 'PRZYJĘCIE W RUCHU', lifetimeMs: 750 },
  shielding: { text: 'OSŁONA', lifetimeMs: 1000 },
  turning: { text: 'ZWROT', lifetimeMs: 700 },
  recovering: { text: 'POWRÓT DO PIŁKI', lifetimeMs: 950 },
} as const;

/** Major recorded outcomes win; one stable label per canonical preparation phase fills
 * remaining slots. Scanning and ordinary adjustments remain readable through body poses.
 * No synthetic action event, resolver, RNG or per-render-frame timer is created. */
export const selectFrameFeedback = (frame: TacticalFrame): OnPitchFeedback[] => {
  const labels: OnPitchFeedback[] = selectActionFeedback(
    frame.actionEvents ?? [],
    frame.timestampMs,
  ).map((event) => ({
    id: event.id,
    kind: event.kind,
    actorId: event.actorId,
    team: event.team,
    position: actionFeedbackAnchor(event, frame),
    text: actionFeedbackText(event),
    opacity: actionFeedbackOpacity(event, frame.timestampMs),
  }));
  for (const player of frame.players) {
    if (labels.length === FEEDBACK_MAX_LABELS) break;
    const kind = player.preparation;
    if (
      !kind ||
      !(kind in preparationFeedback) ||
      player.preparationSinceMs === undefined ||
      labels.some((label) => label.actorId === player.id)
    )
      continue;
    const spec = preparationFeedback[kind as keyof typeof preparationFeedback];
    const age = frame.timestampMs - player.preparationSinceMs;
    if (age < 0 || age >= spec.lifetimeMs) continue;
    labels.push({
      id: `preparation:${player.id}:${kind}:${player.preparationSinceMs}`,
      actorId: player.id,
      team: player.team,
      kind,
      position: { x: player.x, y: player.y },
      text: spec.text,
      opacity: Math.min(1, (spec.lifetimeMs - age) / 180),
    });
  }
  return labels;
};
import { z } from 'zod';
