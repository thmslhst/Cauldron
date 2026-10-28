// Planning a write of a kit/pattern/song into a slot of a project folder.
// The machine loads "NN-*.ext" (first match) and falls back to "pNNN.ext", so a slot
// must hold exactly one file of each type: every other file for that slot is removed.
import { fileNameFor, parseFileName, type FileType } from './naming';

export interface SlotWritePlan {
  fileName: string;
  /** Existing file whose name matches fileName case-insensitively (FAT): it is overwritten in place. */
  overwrite: string | null;
  /** Other files for the same slot and type, to delete after writing. */
  remove: string[];
}

export function planSlotWrite(existing: string[], slot: number, name: string | Uint8Array, type: FileType): SlotWritePlan {
  const fileName = fileNameFor(slot, name, type);
  const sameSlot = existing.filter((f) => {
    const p = parseFileName(f);
    return p !== null && p.slot === slot && p.type === type;
  });
  const overwrite = sameSlot.find((f) => f.toLowerCase() === fileName.toLowerCase()) ?? null;
  return { fileName: overwrite ?? fileName, overwrite, remove: sameSlot.filter((f) => f !== overwrite) };
}

/** Lists the files of one type by slot. When a slot has several, the machine's choice is unknown (first match). */
export function filesBySlot(existing: string[], type: FileType): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const f of [...existing].sort()) {
    const p = parseFileName(f);
    if (!p || p.type !== type) continue;
    // new-style names first: the machine only falls back to pNNN when no NN-* file exists
    const list = out.get(p.slot) ?? [];
    if (p.old) list.push(f);
    else list.unshift(f);
    out.set(p.slot, list);
  }
  return out;
}

/** Project folders on a card root: /projNN/ (presetManager.c preset_loadProject). */
export function projectFolders(names: string[]): { name: string; number: number }[] {
  return names
    .map((name) => ({ name, m: /^proj(\d\d)$/i.exec(name) }))
    .filter((x) => x.m)
    .map((x) => ({ name: x.name, number: Number(x.m![1]) }))
    .sort((a, b) => a.number - b.number);
}
