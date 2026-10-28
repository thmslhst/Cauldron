// A read-only list of kit files, grouped by folder. Pure: works on paths only.
import { parseFileName } from './naming';

export interface KitEntry {
  /** Unique key: the relative path. */
  path: string;
  folder: string;
  fileName: string;
  /** Slot from the file name (NN-*.snd or pNNN.snd), if it follows the machine's naming. */
  slot: number | null;
}

export interface KitFolder {
  folder: string;
  /** Project number when the folder is /projNN/ on the card. */
  project: number | null;
  kits: KitEntry[];
}

export const isKitFile = (name: string): boolean => /\.snd$/i.test(name) && !name.startsWith('._');

export function kitEntry(path: string): KitEntry {
  const parts = path.split('/');
  const fileName = parts.pop()!;
  return { path, folder: parts.join('/'), fileName, slot: parseFileName(fileName)?.slot ?? null };
}

/** Groups kit paths by folder: folders sorted by path, kits by slot then name. */
export function groupKits(paths: string[]): KitFolder[] {
  const byFolder = new Map<string, KitEntry[]>();
  for (const p of paths) {
    const e = kitEntry(p);
    if (!isKitFile(e.fileName)) continue;
    byFolder.set(e.folder, [...(byFolder.get(e.folder) ?? []), e]);
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([folder, kits]) => ({
      folder,
      project: projectNumber(folder),
      kits: kits.sort((a, b) => (a.slot ?? 999) - (b.slot ?? 999) || a.fileName.localeCompare(b.fileName)),
    }));
}

/** "/projNN/" folders on the card (presetManager.c, sprintf "/proj%02d"). */
export function projectNumber(folder: string): number | null {
  const m = /(?:^|\/)proj(\d\d)$/i.exec(folder);
  return m ? Number(m[1]) : null;
}
