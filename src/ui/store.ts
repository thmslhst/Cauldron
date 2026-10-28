import { createContext, useContext, useSyncExternalStore } from 'react';
import { KitModel, type KitState } from '../core/kitModel';

export const KitContext = createContext<KitModel | null>(null);

export function useKitModel(): KitModel {
  const m = useContext(KitContext);
  if (!m) throw new Error('KitContext missing');
  return m;
}

export function useKitState(): KitState {
  const m = useKitModel();
  return useSyncExternalStore(m.subscribe, m.getState);
}
