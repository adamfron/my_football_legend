export const isDevToolsEnabled = (search = globalThis.location?.search ?? '') =>
  new URLSearchParams(search).get('devtools') === '1';

export const isMatchSandboxEnabled = (search = globalThis.location?.search ?? '') => {
  const params = new URLSearchParams(search);
  return (
    import.meta.env.DEV && params.get('devtools') === '1' && params.get('matchSandbox') === '1'
  );
};

export const isMatchLabEntryVisible = (
  search = globalThis.location?.search ?? '',
  isDevelopment = import.meta.env.DEV,
) => isDevelopment && isDevToolsEnabled(search);

export const buildMatchLabUrl = (href: string) => {
  const url = new URL(href);
  url.searchParams.set('devtools', '1');
  url.searchParams.set('matchSandbox', '1');
  return url;
};

export const buildStartMenuUrl = (href: string) => {
  const url = new URL(href);
  url.searchParams.delete('matchSandbox');
  return url;
};

export interface MatchTransitionLog {
  action: string;
  before?: unknown;
  after?: unknown;
  validTransition: boolean;
  warning?: string;
}
const transitions: MatchTransitionLog[] = [];
export const recordMatchTransition = (entry: MatchTransitionLog) => {
  if (!isDevToolsEnabled()) return;
  transitions.push(entry);
  if (transitions.length > 5) transitions.shift();
};
export const getMatchTransitionHistory = () => [...transitions];

/** Compact diagnostics for the opt-in DEV surface; no production settings UI is exposed. */
export const getCareerStorageDiagnostics = async () => {
  if (!isDevToolsEnabled()) return undefined;
  const { careerStorage } = await import('../persistence/careerStorage');
  return careerStorage.getDiagnostics();
};
