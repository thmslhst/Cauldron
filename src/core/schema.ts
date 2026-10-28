// Typed access to the generated schema (src/schema/*.json, made by scripts/extract-schema.ts).
import paramsJson from '../schema/params.json';
import modTargetsJson from '../schema/modTargets.json';

export type Display =
  | { kind: 'number' }
  | { kind: 'signed'; offset: number }
  | { kind: 'menu'; menu: number }
  | { kind: 'onOff' }
  | { kind: 'modTarget'; scope: 'lfo' | 'velocity' | 'automation' }
  | { kind: 'lfoVoice' }
  | { kind: 'note'; zeroIsAny: boolean }
  | { kind: 'oneBased' }
  | { kind: 'bpm' };

export type MidiAddress =
  | { kind: 'cc'; cc: number; voice: number | null }
  | { kind: 'nrpn'; nrpn: number }
  | { kind: 'none'; reason: string };

export interface PageRef {
  /** "voice1".."voice7", or a firmware page name such as "FX_MODE_PAGE". */
  page: string;
  subPage: number;
  slot: number;
  short: string;
  category: string;
  long: string;
}

export interface ParamDef {
  index: number;
  name: string;
  aliases?: string[];
  type: string;
  min: number;
  max: number;
  display: Display;
  /** Voices whose menu pages show this parameter. 7 is the open hi-hat, which shares voice 6's sound. */
  voices: number[];
  short: string | null;
  category: string | null;
  long: string | null;
  pages: PageRef[];
  midi: MidiAddress;
  inKit: boolean;
  isGlobal: boolean;
  notes?: string[];
}

export interface ModTargetDef {
  index: number;
  param: number;
  paramName: string;
  voice: number | null;
  short: string;
  category: string;
  long: string;
}

export const constants = paramsJson.constants;
export const END_OF_SOUND_PARAMETERS: number = constants.END_OF_SOUND_PARAMETERS;
export const PAR_BEGINNING_OF_GLOBALS: number = constants.PAR_BEGINNING_OF_GLOBALS;
export const NUM_PARAMS: number = constants.NUM_PARAMS;

export const params = paramsJson.params as ParamDef[];
/** Characters the machine's name editor offers (menu.c characterOrder). */
export const NAME_CHARACTERS: string = paramsJson.nameCharacters;
export const menus = paramsJson.menus as Record<string, { id: string; items: string[] }>;
export const modTargets = modTargetsJson.targets as ModTargetDef[];
export const modTargetVoiceRanges: { voice: number; start: number; end: number }[] = modTargetsJson.voiceRanges;
export const modTargetGapMap: number[] = modTargetsJson.gapMap;
export const NUM_MOD_TARGETS: number = modTargetsJson.count;

const byName = new Map<string, ParamDef>();
for (const p of params) {
  byName.set(p.name, p);
  for (const a of p.aliases ?? []) byName.set(a, p);
}

/** Looks up a parameter index by its firmware enum name (e.g. "PAR_TARGET_LFO1"). */
export function paramIndex(name: string): number {
  const p = byName.get(name);
  if (!p) throw new Error(`unknown parameter ${name}`);
  return p.index;
}

export function paramDef(index: number): ParamDef {
  const p = params[index];
  if (!p) throw new Error(`parameter index out of range: ${index}`);
  return p;
}
