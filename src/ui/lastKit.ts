// The last kit used, kept in the browser so the app can start from it again (edits included).
import { parseKit, serializeKit } from '../core/kit';
import type { KitModel, KitState } from '../core/kitModel';

const STORAGE_KEY = 'cauldron.lastKit';

interface Stored {
  origin: string;
  slot: number | null;
  original: number[];
  current: number[];
}

export function loadLastKit(): KitState | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Stored | null;
    if (!s) return null;
    return {
      origin: s.origin,
      slot: s.slot,
      original: parseKit(new Uint8Array(s.original)),
      current: parseKit(new Uint8Array(s.current)),
    };
  } catch {
    return null;
  }
}

/** Saves the model's state on every change (debounced). Returns the unsubscribe function. */
export function keepLastKit(model: KitModel): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const { origin, slot, original, current } = model.getState();
    const s: Stored = { origin, slot, original: [...serializeKit(original)], current: [...serializeKit(current)] };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // storage unavailable: the app starts from the init kit next time
    }
  };
  const off = model.subscribe(() => {
    if (!timer) timer = setTimeout(save, 300);
  });
  return () => {
    off();
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
}
