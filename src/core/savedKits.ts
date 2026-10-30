// The app's own list of saved kits (kept in browser storage by the UI). Pure: list operations only.
import { kitNameText, parseKit, serializeKit, type Kit } from './kit';

export interface SavedKit {
  id: string;
  /** The kit's name when saved, for the list. */
  name: string;
  /** The .snd bytes. */
  bytes: number[];
  savedAt: number;
}

/** A kit loaded from or saved to the list carries this origin, so the app knows which entry it is. */
export const SAVED_ORIGIN = 'saved:';
export const savedOrigin = (id: string): string => SAVED_ORIGIN + id;
export const savedIdOf = (origin: string): string | null => (origin.startsWith(SAVED_ORIGIN) ? origin.slice(SAVED_ORIGIN.length) : null);

export function savedKit(kit: Kit, id: string, savedAt: number): SavedKit {
  return { id, name: kitNameText(kit), bytes: [...serializeKit(kit)], savedAt };
}

export const kitOf = (entry: SavedKit): Kit => parseKit(new Uint8Array(entry.bytes));

/** Saving adds a new entry at the end of the list. */
export function addSavedKit(list: readonly SavedKit[], entry: SavedKit): SavedKit[] {
  return [...list, entry];
}

/** Puts `entry` in place of the kit with `id`, keeping its position in the list. */
export function replaceSavedKit(list: readonly SavedKit[], id: string, entry: SavedKit): SavedKit[] {
  return list.map((k) => (k.id === id ? entry : k));
}

/** The saved kit with this name, if any. Case is ignored, as kit file names on the card ignore it (FAT32). */
export function findSavedKitByName(list: readonly SavedKit[], name: string): SavedKit | null {
  const n = name.replace(/ +$/, '').toLowerCase();
  return list.find((k) => k.name.toLowerCase() === n) ?? null;
}

export function removeSavedKit(list: readonly SavedKit[], id: string): SavedKit[] {
  return list.filter((k) => k.id !== id);
}

/**
 * The entry `delta` steps from `id`, wrapping around. With no current entry, forward starts at the
 * first kit and backward at the last.
 */
export function stepSavedKit(list: readonly SavedKit[], id: string | null, delta: number): SavedKit | null {
  if (!list.length) return null;
  const at = id === null ? -1 : list.findIndex((k) => k.id === id);
  if (at < 0) return list[delta > 0 ? 0 : list.length - 1]!;
  return list[(((at + delta) % list.length) + list.length) % list.length]!;
}

/** Reads a stored list, keeping only well-formed entries that parse as kits. */
export function decodeSavedKits(json: unknown): SavedKit[] {
  if (!Array.isArray(json)) return [];
  return json.filter((e): e is SavedKit => {
    if (!e || typeof e.id !== 'string' || typeof e.name !== 'string' || typeof e.savedAt !== 'number') return false;
    if (!Array.isArray(e.bytes) || !e.bytes.every((b: unknown) => Number.isInteger(b) && (b as number) >= 0 && (b as number) <= 255)) return false;
    try {
      parseKit(new Uint8Array(e.bytes));
      return true;
    } catch {
      return false;
    }
  });
}
