import { z } from 'zod';
import type {
  MatchFlowTelemetry,
  PositioningSample,
  TacticalMatchState,
} from '../../core/matchSimulation';
import type { SingleMatchSession } from '../../core/singleMatch';
import { FIXED_MATCH_DT } from '../../core/matchSimulation';
import { MatchDebugRecorder, type MatchDebugExport } from './matchDebugCapture';
import type { RendererLifecycle } from './tacticalRenderer/TacticalPitchRenderer';

export const matchLabRuntimeErrorSchema = z.object({
  atCanonicalTime: z.number().finite(),
  kind: z.enum([
    'window_error',
    'unhandled_rejection',
    'react_error',
    'renderer_error',
    'observer_error',
    'canonical_error',
  ]),
  message: z.string(),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  module: z.string().optional(),
  values: z.unknown().optional(),
});
export type MatchLabRuntimeError = z.infer<typeof matchLabRuntimeErrorSchema>;

export const matchLabCrashPackageSchema = z.object({
  schema: z.literal('mfl-match-crash-v1'),
  error: matchLabRuntimeErrorSchema,
  rendererLifecycle: z.enum(['waiting_for_layout', 'ready', 'context_lost', 'failed']),
  latestCanonicalState: z.unknown(),
  trace: z.unknown(),
  sessionTelemetry: z.unknown(),
  positioningSamples: z.array(z.unknown()),
});
export type MatchLabCrashPackage = z.infer<typeof matchLabCrashPackageSchema>;

const errorDetails = (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  return { message: error.message, stack: error.stack };
};

export const findNonFiniteDiagnosticValue = (
  value: unknown,
  path = 'sample',
): { path: string; value: number } | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : { path, value };
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const invalid = findNonFiniteDiagnosticValue(value[index], `${path}[${index}]`);
      if (invalid) return invalid;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const invalid = findNonFiniteDiagnosticValue(child, `${path}.${key}`);
      if (invalid) return invalid;
    }
  }
  return undefined;
};

/** DEV-only observation owner. It deliberately has no path back into canonical simulation. */
export class MatchLabDiagnosticsController {
  readonly recorder = new MatchDebugRecorder();
  runtimeDiagnostics: MatchLabRuntimeError[] = [];
  positioningSamples: PositioningSample[] = [];
  latestState: TacticalMatchState;
  telemetry: MatchFlowTelemetry;
  rendererLifecycle: RendererLifecycle = 'waiting_for_layout';
  crashPackage?: MatchLabCrashPackage;
  private listeners = new Set<() => void>();

  constructor(
    readonly session: SingleMatchSession,
    initial: TacticalMatchState,
    telemetry: MatchFlowTelemetry,
  ) {
    this.latestState = initial;
    this.telemetry = telemetry;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setRendererLifecycle(lifecycle: RendererLifecycle) {
    this.rendererLifecycle = lifecycle;
    this.listeners.forEach((listener) => listener());
  }

  report(
    kind: MatchLabRuntimeError['kind'],
    reason: unknown,
    extra: Partial<MatchLabRuntimeError> = {},
  ) {
    const diagnostic = matchLabRuntimeErrorSchema.parse({
      atCanonicalTime: this.latestState.time,
      kind,
      ...errorDetails(reason),
      ...extra,
    });
    this.runtimeDiagnostics.push(diagnostic);
    try {
      this.recorder.ui(this.latestState.time, 'runtime_diagnostic', diagnostic);
    } catch {
      // The diagnostic is already retained above; a broken recorder must not recurse here.
    }
    this.listeners.forEach((listener) => listener());
    return diagnostic;
  }

  freezeFatal(
    kind: MatchLabRuntimeError['kind'],
    reason: unknown,
    extra: Partial<MatchLabRuntimeError> = {},
  ) {
    if (this.crashPackage) return this.crashPackage;
    const error = this.report(kind, reason, extra);
    this.recorder.freezePast(this.latestState.time);
    let trace: MatchDebugExport | undefined;
    try {
      trace = this.recorder.export(
        this.session,
        FIXED_MATCH_DT,
        { width: globalThis.innerWidth ?? 0, height: globalThis.innerHeight ?? 0 },
        false,
        0,
      );
    } catch (exportError) {
      this.report('observer_error', exportError, { module: 'MatchDebugRecorder.export' });
    }
    this.crashPackage = matchLabCrashPackageSchema.parse({
      schema: 'mfl-match-crash-v1',
      error,
      rendererLifecycle: this.rendererLifecycle,
      latestCanonicalState: this.latestState,
      trace,
      sessionTelemetry: this.telemetry,
      positioningSamples: this.positioningSamples.filter(
        (sample) =>
          sample.time >= this.latestState.time - 10 && sample.time <= this.latestState.time,
      ),
    });
    this.listeners.forEach((listener) => listener());
    return this.crashPackage;
  }
}

export const runtimeErrorFromEvent = (event: ErrorEvent) =>
  event.error ?? new Error(event.message || 'Nieznany błąd window.error');

export const runtimeErrorFromRejection = (event: PromiseRejectionEvent) => event.reason;
