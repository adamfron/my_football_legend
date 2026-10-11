import { createVisualIdentity, type VisualIdentitySource } from '../../core/visualIdentity';

export const initialAppearanceFor = (source: VisualIdentitySource) =>
  source.visualIdentity ?? createVisualIdentity(source.id);
