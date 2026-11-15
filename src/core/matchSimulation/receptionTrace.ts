/** Synchronous, opt-in observer for native development replays. The trace is
 * outside match state and cannot change action selection or solver inputs. */
let events: { source: string; at: number; actorId: string; detail: object }[] | undefined;
let mechanics = false;

export const receptionTraceEnabled = () => events !== undefined;
export const receptionMechanicsTraceEnabled = () => mechanics;

export const traceReception = (source: string, at: number, actorId: string, detail: object) => {
  events?.push({ source, at, actorId, detail: structuredClone(detail) });
};

export const captureReceptionStep = <T>(step: () => T, options?: { mechanics: boolean }) => {
  if (events) throw new Error('Reception trace already active');
  events = [];
  mechanics = options?.mechanics ?? false;
  try {
    return { state: step(), events };
  } finally {
    events = undefined;
    mechanics = false;
  }
};

/** Forecast rollouts are not evidence of events in the observed match. */
export const withoutReceptionTrace = <T>(step: () => T): T => {
  if (!events) return step();
  const previous = events;
  const previousMechanics = mechanics;
  events = undefined;
  mechanics = false;
  try {
    return step();
  } finally {
    events = previous;
    mechanics = previousMechanics;
  }
};
