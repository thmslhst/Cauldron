// SD card file names. Mirrors presetManager.c: preset_makeFileNameSave,
// preset_makeFileNameLoad, preset_makeFileNameOld and clearIllegalCharacters.

export type FileType = 'snd' | 'pat' | 'sng';
export const NUM_SLOTS = 64;

const ALLOWED_PUNCTUATION = new Set('!#$%&()-@^_`{}~');

/** clearIllegalCharacters: keeps A-Z a-z 0-9 and !#$%&()-@^_`{}~, space and anything else become '_', NUL is kept. */
export function clearIllegalCharacters(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length);
  input.forEach((b, i) => {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9]/.test(c) || ALLOWED_PUNCTUATION.has(c) || b === 0) out[i] = b;
    else out[i] = 0x5f; // '_' (space included)
  });
  return out;
}

function toNameBytes(name: string | Uint8Array): Uint8Array {
  if (typeof name !== 'string') return name.subarray(0, 8);
  const out = new Uint8Array(8); // unused bytes are NUL, like a C string buffer
  for (let i = 0; i < Math.min(8, name.length); i++) out[i] = name.charCodeAt(i) & 0xff;
  return out;
}

/** "NN-XXXXX.ext": slot, then up to 5 cleaned name characters (stops at the first NUL). */
export function fileNameFor(slot: number, name: string | Uint8Array, type: FileType): string {
  if (!Number.isInteger(slot) || slot < 0 || slot >= NUM_SLOTS) throw new RangeError(`slot must be 0..${NUM_SLOTS - 1}`);
  const cleared = clearIllegalCharacters(toNameBytes(name));
  let stem = '';
  for (let i = 0; i < 5 && i < cleared.length; i++) {
    if (cleared[i] === 0) break;
    stem += String.fromCharCode(cleared[i]!);
  }
  return `${String(slot).padStart(2, '0')}-${stem}.${type}`;
}

export interface ParsedFileName {
  slot: number;
  type: FileType;
  /** true for the old "pNNN.ext" scheme, which is read but never written. */
  old: boolean;
}

/**
 * Recognises a kit/pattern/song file name, case-insensitively (FAT shows "03-LYSER.SND").
 * The machine loads "NN-*.ext" first and falls back to "pNNN.ext".
 */
export function parseFileName(fileName: string): ParsedFileName | null {
  const m = /^(\d\d)-.*\.(snd|pat|sng)$/i.exec(fileName);
  if (m) {
    const slot = Number(m[1]);
    return slot < NUM_SLOTS ? { slot, type: m[2]!.toLowerCase() as FileType, old: false } : null;
  }
  const o = /^p(\d\d\d)\.(snd|pat|sng)$/i.exec(fileName);
  if (o) {
    const slot = Number(o[1]);
    return slot < NUM_SLOTS ? { slot, type: o[2]!.toLowerCase() as FileType, old: true } : null;
  }
  return null;
}

/** Old naming scheme (preset_makeFileNameOld): 'p' + 3-digit zero-padded slot. Read-only. */
export function oldFileNameFor(slot: number, type: FileType): string {
  return `p${String(slot).padStart(3, '0')}.${type}`;
}
