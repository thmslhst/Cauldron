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

import type { LiveMidi, MidiState } from '../midi/live';

export const MidiContext = createContext<LiveMidi | null>(null);

export function useMidi(): LiveMidi {
  const m = useContext(MidiContext);
  if (!m) throw new Error('MidiContext missing');
  return m;
}

export function useMidiState(): MidiState {
  const m = useMidi();
  return useSyncExternalStore(m.subscribe, m.getState);
}
