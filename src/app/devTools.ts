export const isDevToolsEnabled = (search = globalThis.location?.search ?? '') =>
  new URLSearchParams(search).get('devtools') === '1';

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
