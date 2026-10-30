// The saved kits list, kept in browser storage. Load and Save in the app bar work on it.
import { useSyncExternalStore } from 'react';
import { addSavedKit, decodeSavedKits, removeSavedKit, replaceSavedKit, type SavedKit } from '../core/savedKits';

const STORAGE_KEY = 'cauldron.savedKits';

function read(): SavedKit[] {
  try {
    return decodeSavedKits(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

let list: SavedKit[] = read();
const listeners = new Set<() => void>();

function set(next: SavedKit[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false; // storage full or unavailable: the list stays as it was
  }
  list = next;
  listeners.forEach((l) => l());
  return true;
}

export const savedKits = {
  get: (): SavedKit[] => list,
  add: (entry: SavedKit): boolean => set(addSavedKit(list, entry)),
  replace: (id: string, entry: SavedKit): boolean => set(replaceSavedKit(list, id, entry)),
  remove: (id: string): boolean => set(removeSavedKit(list, id)),
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

// another tab saved or deleted a kit
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  list = read();
  listeners.forEach((l) => l());
});

export function useSavedKits(): SavedKit[] {
  return useSyncExternalStore(savedKits.subscribe, savedKits.get);
}

export function newKitId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
