// .snd kit files. Mirrors presetManager.c: preset_saveDrumsetSD / preset_writeDrumsetData
// (write) and preset_loadDrumsetSD / preset_readDrumsetData (read).
//
//   offset 0..7     name, 8 bytes, not NUL-terminated
//   offset 8..254   activeParameters[0 .. END_OF_SOUND_PARAMETERS-1], one byte each
import { END_OF_SOUND_PARAMETERS, NUM_MOD_TARGETS, paramIndex } from './schema';

export const KIT_NAME_LENGTH = 8;
export const KIT_FILE_SIZE = KIT_NAME_LENGTH + END_OF_SOUND_PARAMETERS;

const PAR_VEL_DEST_1 = paramIndex('PAR_VEL_DEST_1');
const PAR_TARGET_LFO1 = paramIndex('PAR_TARGET_LFO1');

export interface Kit {
  /** The 8 name bytes exactly as stored (may contain NULs, e.g. "Empty\0\0\0"). */
  readonly name: Uint8Array;
  /** One byte per sound parameter, indexed by parameter number. */
  readonly params: Uint8Array;
  /**
   * Bytes after offset 255. The machine never writes them and ignores them on load;
   * kept only so that an unedited file round-trips byte for byte.
   */
  readonly trailing: Uint8Array;
}

export class KitFormatError extends Error {}

/**
 * Parses a .snd file the way the machine loads it:
 * - fewer than 8 bytes is an error (the firmware fails with FR_DISK_ERR);
 * - missing parameter bytes are set to 0;
 * - LFO and velocity modulation targets that are not valid indices into modTargets are reset to 0.
 */
export function parseKit(bytes: Uint8Array): Kit {
  if (bytes.length < KIT_NAME_LENGTH) {
    throw new KitFormatError(`kit file is ${bytes.length} bytes; the name alone needs ${KIT_NAME_LENGTH}`);
  }
  const name = bytes.slice(0, KIT_NAME_LENGTH);
  const params = new Uint8Array(END_OF_SOUND_PARAMETERS);
  params.set(bytes.subarray(KIT_NAME_LENGTH, KIT_FILE_SIZE));
  normalizeModTargets(params);
  const trailing = bytes.slice(KIT_FILE_SIZE);
  return { name, params, trailing };
}

/** Same normalisation as preset_readDrumsetData: invalid mod target indices become 0 ("off"). */
export function normalizeModTargets(params: Uint8Array): void {
  for (let i = 0; i < 6; i++) {
    if (params[PAR_VEL_DEST_1 + i]! >= NUM_MOD_TARGETS) params[PAR_VEL_DEST_1 + i] = 0;
    if (params[PAR_TARGET_LFO1 + i]! >= NUM_MOD_TARGETS) params[PAR_TARGET_LFO1 + i] = 0;
  }
}

export function serializeKit(kit: Kit): Uint8Array {
  const out = new Uint8Array(KIT_FILE_SIZE + kit.trailing.length);
  out.set(kit.name.subarray(0, KIT_NAME_LENGTH), 0);
  out.set(kit.params.subarray(0, END_OF_SOUND_PARAMETERS), KIT_NAME_LENGTH);
  out.set(kit.trailing, KIT_FILE_SIZE);
  return out;
}

/** The name as text: stops at the first NUL, trailing spaces removed. */
export function kitNameText(kit: Kit): string {
  return decodeName(kit.name);
}

export function decodeName(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s.replace(/ +$/, '');
}

/** Encodes a name as 8 bytes, space padded. Characters outside printable ASCII become '_'. */
export function encodeName(text: string): Uint8Array {
  const out = new Uint8Array(KIT_NAME_LENGTH).fill(0x20);
  for (let i = 0; i < Math.min(text.length, KIT_NAME_LENGTH); i++) {
    const c = text.charCodeAt(i);
    out[i] = c >= 0x20 && c <= 0x7e ? c : 0x5f;
  }
  return out;
}

export function withName(kit: Kit, text: string): Kit {
  return { ...kit, name: encodeName(text) };
}

export function withParam(kit: Kit, index: number, value: number): Kit {
  if (index < 0 || index >= END_OF_SOUND_PARAMETERS) throw new RangeError(`not a kit parameter: ${index}`);
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError(`not a byte: ${value}`);
  const params = kit.params.slice();
  params[index] = value;
  return { ...kit, params };
}

/** Indices of parameters whose value differs between two kits. */
export function diffParams(a: Kit, b: Kit): number[] {
  const out: number[] = [];
  for (let i = 0; i < END_OF_SOUND_PARAMETERS; i++) if (a.params[i] !== b.params[i]) out.push(i);
  return out;
}
