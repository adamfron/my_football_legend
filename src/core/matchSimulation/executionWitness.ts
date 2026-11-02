import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

/** Fixed-size, observational counters. They never feed physical or AI decisions. */
export const executionConsumerSchema = z.enum([
  'contact-interval',
  'ordinary-loose-ball',
  'pending-low-pass',
  'prepared-kick',
  'missed-kick',
  'interrupted-kick',
  'cancelled-kick',
  'physical-kick',
  'standing-challenge',
  'body-cluster',
  'ball-body-contact',
  'ground-contact',
  'controlled-reception',
  'defensive-reception',
  'receiver-anticipation',
  'receiver-recovery',
  'bounded-flight-belief',
  'policy-b',
  'height-aware-passing',
  'fallback-carry',
  'fallback-delivery',
  'fallback-keeper-aerial',
  'unresolved',
]);
export type ExecutionConsumer = z.infer<typeof executionConsumerSchema>;
export const executionWitnessesSchema = z.partialRecord(
  executionConsumerSchema,
  z.object({
    invoked: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    executed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    at: z.number().nonnegative(),
    source: z.string().max(180),
  }),
);

export const recordExecution = (
  state: TacticalMatchState,
  consumer: ExecutionConsumer,
  source: string,
  executed = 0,
): TacticalMatchState => {
  if (!state.executionWitnesses) return state;
  const prior = state.executionWitnesses[consumer];
  return {
    ...state,
    executionWitnesses: {
      ...state.executionWitnesses,
      [consumer]: {
        invoked: (prior?.invoked ?? 0) + 1,
        executed: (prior?.executed ?? 0) + executed,
        at: state.time,
        source,
      },
    },
  };
};

let invocationSink: ((consumer: ExecutionConsumer, source: string, at: number) => void) | undefined;
/** Pure consumers can publish an invocation without mutating the state they inspect.
 * The synchronous canonical entry owns this sink; UI forecasts outside it are ignored. */
export const noteExecution = (
  state: TacticalMatchState,
  consumer: ExecutionConsumer,
  source: string,
) => {
  if (state.executionWitnesses) invocationSink?.(consumer, source, state.time);
};
export const withExecutionObservation = (
  input: TacticalMatchState,
  run: () => TacticalMatchState,
) => {
  if (!input.executionWitnesses) return run();
  const previous = invocationSink;
  const calls = new Map<ExecutionConsumer, { count: number; source: string; at: number }>();
  invocationSink = (consumer, source, at) => {
    calls.set(consumer, { count: (calls.get(consumer)?.count ?? 0) + 1, source, at });
  };
  try {
    const output = run();
    if (output === input || !calls.size) return output;
    const executionWitnesses = { ...output.executionWitnesses };
    for (const [consumer, call] of calls) {
      const prior = executionWitnesses[consumer];
      executionWitnesses[consumer] = {
        invoked: (prior?.invoked ?? 0) + call.count,
        executed: prior?.executed ?? 0,
        at: call.at,
        source: call.source,
      };
    }
    return { ...output, executionWitnesses };
  } finally {
    invocationSink = previous;
  }
};
