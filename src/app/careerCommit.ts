import type { CareerState } from '../types/domain';

/** Resolves only after the state has been persisted and exposed to React. */
export type CareerCommit = (next: CareerState) => Promise<boolean>;
