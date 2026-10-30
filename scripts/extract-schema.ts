/**
 * Generates src/schema/params.json and src/schema/modTargets.json from the
 * LXR-02 firmware source in vendor/lxr-firmware.
 *
 * Nothing here parses C semantics by hand where the compiler can do it:
 * a probe program is generated that #includes the real firmware headers and
 * tables (Parameters.h, menu.h, MenuText.h, menuPages.h, Cc2Text.c and the
 * parameter_dtypes / valueNames arrays copied verbatim from menu.c), compiled
 * with the host gcc against a stub HAL header, and run. It prints JSON.
 *
 * A few facts live only in function bodies (which CC belongs to which voice,
 * which menu list a menu id uses, which PM63 parameters use offset 60). Those
 * are read from the C text with narrow regexes and checked for sanity.
 *
 * Usage: npm run extract-schema
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fw = join(root, 'vendor/lxr-firmware');
const read = (p: string) => readFileSync(join(fw, p), 'utf8');

const parametersH = read('Core/Inc/Parameters.h');
const menuC = read('Core/Src/menu/menu.c');
const midiParserC = read('Core/Src/Soundengine/MIDI/MidiParser.c');

// ---------------------------------------------------------------------------
// Text helpers

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}

/** Returns the C text from the line matching `start` to the next "};". */
function cBlock(src: string, start: RegExp, label: string): string {
  const m = start.exec(src);
  if (!m) throw new Error(`could not find ${label}`);
  const end = src.indexOf('\n};', m.index);
  if (end < 0) throw new Error(`could not find end of ${label}`);
  return src.slice(m.index, end + 3);
}

/** Returns the body of a C function (brace matched). */
function cFunction(src: string, signature: RegExp, label: string): string {
  const m = signature.exec(src);
  if (!m) throw new Error(`could not find function ${label}`);
  const open = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${label}`);
}

// ---------------------------------------------------------------------------
// 1. Enumerator names of ParamEnums (values come from the compiler)

const enumBody = stripComments(cBlock(parametersH, /enum ParamEnums\s*\{/, 'enum ParamEnums'));
const paramEnumNames = [...enumBody.slice(enumBody.indexOf('{') + 1).matchAll(/([A-Za-z_]\w*)\s*(?:=[^,}]*)?\s*[,}]/g)]
  .map((m) => m[1]!)
  .filter((n) => n !== 'ParamEnums');

// ---------------------------------------------------------------------------
// 2. Facts that live in function bodies

// menu id -> name array, from getMenuItemNameForValue()
const menuItemFn = stripComments(
  cFunction(menuC, /static void getMenuItemNameForValue\(const uint8_t menuId, const uint8_t curParmVal, char \*buf\)\s*\{/, 'getMenuItemNameForValue'),
);
const menuArrays = [...menuItemFn.matchAll(/case\s+(MENU_\w+)\s*:[^;]*?(\w+)\s*\[\s*curParmVal/g)].map((m) => ({
  menuId: m[1]!,
  array: m[2]!,
}));
if (menuArrays.length < 20) throw new Error(`only found ${menuArrays.length} menu lists`);

// PM63 parameters displayed as raw-60 rather than raw-63 (menu.c display code)
const pm63Case = /case DTYPE_PM63:[\s\S]*?if\(([^{]*)\)\s*\{\s*numtostrps\([^,]*,\s*\(int8_t\)\(curParmVal - 60\)\)/.exec(menuC);
if (!pm63Case) throw new Error('could not find PM63 offset-60 condition');
const offset60Params = [...pm63Case[1]!.matchAll(/parNr == (PAR_\w+)/g)].map((m) => m[1]!);

// CC -> voice number, from midiParser_cc2voiceNr()
const cc2voiceFn = stripComments(cFunction(midiParserC, /uint8_t midiParser_cc2voiceNr\(uint8_t cc\)\s*\{/, 'midiParser_cc2voiceNr'));
const ccVoice = new Map<number, number>();
{
  let pending: number[] = [];
  const tokens = cc2voiceFn.matchAll(/case\s+(\d+)\s*:|return\s+(\d+)\s*;|default\s*:/g);
  for (const t of tokens) {
    if (t[1] !== undefined) pending.push(Number(t[1]));
    else if (t[2] !== undefined) {
      for (const cc of pending) ccVoice.set(cc, Number(t[2]));
      pending = [];
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The probe program

const valueNamesBlock = cBlock(menuC, /^const Name valueNames\[NUM_NAMES\]\s*=/m, 'valueNames');
const charsBlock = cBlock(menuC, /^#define NUM_CHARS \d+/m, 'characterOrder');
const dtypesBlock = cBlock(menuC, /^const enum Datatypes PROGMEM parameter_dtypes\[NUM_PARAMS\]\s*=/m, 'parameter_dtypes');

const work = mkdtempSync(join(tmpdir(), 'cauldron-schema-'));
mkdirSync(join(work, 'stub'));
// Stub HAL: only the standard types the menu headers need.
const stubHal = '#pragma once\n#include <stdint.h>\n#include <stddef.h>\n#include <string.h>\n';
writeFileSync(join(work, 'stub/stm32f7xx_hal.h'), stubHal);
writeFileSync(join(work, 'stub/main.h'), stubHal);

const menuPrint = menuArrays
  .map(
    ({ menuId, array }) =>
      `  if (nm++) printf(","); printf("\\"%d\\":{\\"id\\":\\"${menuId}\\",\\"array\\":\\"${array}\\",\\"items\\":[", ${menuId});\n` +
      `  for (int i = 1; i <= (uint8_t)${array}[0][0]; i++) { if (i > 1) printf(","); jstr(${array}[i]); }\n` +
      `  printf("]}");\n`,
  )
  .join('');

const probe = `
#include <stdio.h>
#include "menu/menu.h"
#include "menu/MenuText.h"
#include "menu/menuPages.h"
${valueNamesBlock}
${dtypesBlock}
${charsBlock}
#include "${join(fw, 'Core/Src/menu/Cc2Text.c')}"
#include "${join(fw, 'Core/Src/Preset/initKit.c')}"
#include "${join(fw, 'Core/Src/Parameters.c')}"

static void jstr(const char *s) {
  putchar('"');
  for (; *s; s++) {
    if (*s == '"' || *s == '\\\\') printf("\\\\%c", *s);
    else if ((unsigned char)*s < 32 || (unsigned char)*s > 126) printf("\\\\u%04x", (unsigned char)*s);
    else putchar(*s);
  }
  putchar('"');
}

int main(void) {
  printf("{\\"constants\\":{");
  printf("\\"END_OF_SOUND_PARAMETERS\\":%d,", END_OF_SOUND_PARAMETERS);
  printf("\\"PAR_BEGINNING_OF_GLOBALS\\":%d,", PAR_BEGINNING_OF_GLOBALS);
  printf("\\"NUM_PARAMS\\":%d,", NUM_PARAMS);
  printf("\\"NUM_PAGES\\":%d,", NUM_PAGES);
  printf("\\"NUM_SUB_PAGES\\":%d,", NUM_SUB_PAGES);
  printf("\\"NUM_NAMES\\":%d,", NUM_NAMES);
  printf("\\"numModTargets\\":%d,", getNumModTargets());
  printf("\\"DTYPE\\":{\\"0B255\\":%d,\\"0B127\\":%d,\\"PM100\\":%d,\\"MENU\\":%d,\\"PM63\\":%d,\\"1B16\\":%d,\\"ON_OFF\\":%d,"
         "\\"TARGET_SELECTION_LFO\\":%d,\\"TARGET_SELECTION_VELO\\":%d,\\"VOICE_LFO\\":%d,\\"AUTOM_TARGET\\":%d,\\"0b1\\":%d,"
         "\\"NOTE_NAME\\":%d,\\"0B15\\":%d,\\"1B64\\":%d,\\"0B100\\":%d},",
         DTYPE_0B255, DTYPE_0B127, DTYPE_PM100, DTYPE_MENU, DTYPE_PM63, DTYPE_1B16, DTYPE_ON_OFF,
         DTYPE_TARGET_SELECTION_LFO, DTYPE_TARGET_SELECTION_VELO, DTYPE_VOICE_LFO, DTYPE_AUTOM_TARGET, DTYPE_0b1,
         DTYPE_NOTE_NAME, DTYPE_0B15, DTYPE_1B64, DTYPE_0B100);
  printf("\\"PAGE\\":{\\"VOICE1_PAGE\\":%d,\\"MENU_MIDI_PAGE\\":%d,\\"PERF_PAGE\\":%d,\\"SEQ_PAGE\\":%d,\\"EUKLID_PAGE\\":%d,"
         "\\"PATTERN_SETTINGS_PAGE\\":%d,\\"RECORDING_PAGE\\":%d,\\"FX_MODE_PAGE\\":%d}",
         VOICE1_PAGE, MENU_MIDI_PAGE, PERF_PAGE, SEQ_PAGE, EUKLID_PAGE, PATTERN_SETTINGS_PAGE, RECORDING_PAGE, FX_MODE_PAGE);
  printf("},");

  printf("\\"enum\\":[");
${paramEnumNames.map((n, i) => `  printf("${i ? ',' : ''}[\\"${n}\\",%d]", (int)${n});`).join('\n')}
  printf("],");

  printf("\\"dtypes\\":[");
  for (int i = 0; i < NUM_PARAMS; i++) printf("%s%d", i ? "," : "", (int)parameter_dtypes[i]);
  printf("],");

  printf("\\"offset60\\":[");
${offset60Params.map((n, i) => `  printf("${i ? ',' : ''}%d", (int)${n});`).join('\n')}
  printf("],");

  printf("\\"menus\\":{");
  int nm = 0;
${menuPrint}
  printf("},");

  printf("\\"names\\":[");
  for (int i = 0; i < NUM_NAMES; i++) {
    if (i) printf(",");
    printf("{\\"short\\":"); jstr(shortNames[valueNames[i].shortName]);
    printf(",\\"category\\":"); jstr(catNames[valueNames[i].category]);
    printf(",\\"long\\":"); jstr(longNames[valueNames[i].longName]);
    printf("}");
  }
  printf("],");

  printf("\\"pages\\":[");
  for (int p = 0; p < NUM_PAGES; p++) {
    if (p) printf(",");
    printf("[");
    for (int s = 0; s < NUM_SUB_PAGES; s++) {
      const Page *pg = &menuPages[p][s];
      const uint8_t *top = &pg->top1;
      const uint16_t *bot = &pg->bot1;
      if (s) printf(",");
      printf("[");
      for (int k = 0; k < 8; k++) printf("%s[%d,%d]", k ? "," : "", top[k], bot[k]);
      printf("]");
    }
    printf("]");
  }
  printf("],");

  printf("\\"modTargets\\":[");
  for (int i = 0; i < getNumModTargets(); i++)
    printf("%s[%d,%d]", i ? "," : "", modTargets[i].nameIdx, modTargets[i].param);
  printf("],");

  printf("\\"modTargetGapMap\\":[");
  for (unsigned i = 0; i < sizeof(modTargetGapMap); i++) printf("%s%d", i ? "," : "", modTargetGapMap[i]);
  printf("],");

  printf("\\"parameterOrder\\":[");
  for (int i = 0; i < END_OF_SOUND_PARAMETERS; i++) printf("%s%d", i ? "," : "", parameterOrder[i]);
  printf("],");

  printf("\\"initKit\\":[");
  for (int i = 0; i < INIT_KIT_SIZE; i++) printf("%s%d", i ? "," : "", initKit[i]);
  printf("],");

  printf("\\"characterOrder\\":[");
  for (int i = 0; i < NUM_CHARS; i++) printf("%s%d", i ? "," : "", characterOrder[i]);
  printf("],");

  printf("\\"modTargetVoiceOffsets\\":[");
  for (int i = 0; i < 6; i++)
    printf("%s[%d,%d]", i ? "," : "", modTargetVoiceOffsets[i].start, modTargetVoiceOffsets[i].end);
  printf("]");

  printf("}\\n");
  return 0;
}
`;

writeFileSync(join(work, 'probe.c'), probe);
execFileSync(
  'gcc',
  [
    '-std=gnu11',
    '-w',
    `-I${join(work, 'stub')}`,
    `-I${join(fw, 'Core/Inc')}`,
    `-I${join(fw, 'Core/Inc/menu')}`,
    '-o',
    join(work, 'probe'),
    join(work, 'probe.c'),
  ],
  { stdio: 'inherit' },
);
const raw = JSON.parse(execFileSync(join(work, 'probe'), { encoding: 'utf8' })) as Probe;

interface Probe {
  constants: {
    END_OF_SOUND_PARAMETERS: number;
    PAR_BEGINNING_OF_GLOBALS: number;
    NUM_PARAMS: number;
    NUM_PAGES: number;
    NUM_SUB_PAGES: number;
    NUM_NAMES: number;
    numModTargets: number;
    DTYPE: Record<string, number>;
    PAGE: Record<string, number>;
  };
  enum: [string, number][];
  dtypes: number[];
  offset60: number[];
  menus: Record<string, { id: string; array: string; items: string[] }>;
  names: { short: string; category: string; long: string }[];
  pages: [number, number][][][];
  modTargets: [number, number][];
  modTargetGapMap: number[];
  characterOrder: number[];
  initKit: number[];
  parameterOrder: number[];
  modTargetVoiceOffsets: [number, number][];
}

// ---------------------------------------------------------------------------
// 4. Sanity checks against the values CLAUDE.md expects

const C = raw.constants;
const expect = (what: string, got: number, want: number) => {
  if (got !== want) throw new Error(`${what} is ${got}, expected ${want}`);
};
expect('END_OF_SOUND_PARAMETERS', C.END_OF_SOUND_PARAMETERS, 247);
expect('PAR_BEGINNING_OF_GLOBALS', C.PAR_BEGINNING_OF_GLOBALS, 272);
expect('NUM_PARAMS', C.NUM_PARAMS, 302);
expect('dtype count', raw.dtypes.length, C.NUM_PARAMS);

// ---------------------------------------------------------------------------
// 5. Build the schema

const MARKERS = new Set(['END_OF_SOUND_PARAMETERS', 'PAR_BEGINNING_OF_GLOBALS', 'NUM_PARAMS']);
const namesByIndex = new Map<number, string[]>();
for (const [name, value] of raw.enum) {
  if (MARKERS.has(name)) continue;
  namesByIndex.set(value, [...(namesByIndex.get(value) ?? []), name]);
}

// parameterOrder (Parameters.c): the order the machine sends a kit to its sound engine,
// "to prevent clicks". Used for the MIDI kit burst. Check it covers every sound parameter once.
{
  const seen = new Set(raw.parameterOrder);
  const missing = [];
  for (let i = 0; i < C.END_OF_SOUND_PARAMETERS; i++) if (!seen.has(i)) missing.push(i);
  if (missing.length) console.warn(`parameterOrder misses ${missing.length} parameters: ${missing.join(',')}`);
}

const dtypeName = new Map(Object.entries(C.DTYPE).map(([k, v]) => [v, k]));
const menuById = new Map(Object.entries(raw.menus).map(([k, v]) => [Number(k), v]));
const offset60 = new Set(raw.offset60);

// Page references for each parameter
const pageLabel = (p: number): string => {
  const P = C.PAGE;
  if (p >= P.VOICE1_PAGE! && p < P.VOICE1_PAGE! + 7) return `voice${p - P.VOICE1_PAGE! + 1}`;
  const found = Object.entries(P).find(([, v]) => v === p);
  return found ? found[0] : `page${p}`;
};
interface PageRef {
  page: string;
  subPage: number;
  slot: number;
  short: string;
  category: string;
  long: string;
}
const pageRefs = new Map<number, PageRef[]>();
raw.pages.forEach((subPages, p) =>
  subPages.forEach((slots, s) =>
    slots.forEach(([nameIdx, param], k) => {
      if (param === 0) return; // PAR_NONE
      const n = raw.names[nameIdx]!;
      const refs = pageRefs.get(param) ?? [];
      refs.push({ page: pageLabel(p), subPage: s, slot: k, short: n.short, category: n.category, long: n.long });
      pageRefs.set(param, refs);
    }),
  ),
);

type Display =
  | { kind: 'number' }
  | { kind: 'signed'; offset: number }
  | { kind: 'menu'; menu: number }
  | { kind: 'onOff' }
  | { kind: 'modTarget'; scope: 'lfo' | 'velocity' | 'automation' }
  | { kind: 'lfoVoice' }
  | { kind: 'note'; zeroIsAny: boolean }
  | { kind: 'oneBased' }
  | { kind: 'bpm' };

const idx = (name: string): number => {
  const e = raw.enum.find(([n]) => n === name);
  if (!e) throw new Error(`no enumerator ${name}`);
  return e[1];
};
const PAR_BPM = idx('PAR_BPM');
const PAR_MIDI_NOTE1 = idx('PAR_MIDI_NOTE1');
const PAR_MIDI_NOTE7 = idx('PAR_MIDI_NOTE7');
const PAR_BANK_CHANGE = idx('PAR_BANK_CHANGE');

// CCs the parser handles itself rather than as a parameter (midiParser_cc2voiceNr "No voice"
// group: bank change, mod wheel, data entry, NRPN LSB/MSB).
const RESERVED_CCS = new Set([...ccVoice.entries()].filter(([, v]) => v === 0).map(([cc]) => cc).concat(0));

function rangeAndDisplay(i: number, dt: number): { type: string; min: number; max: number; display: Display; menuItems?: string[]; notes?: string[] } {
  const type = dtypeName.get(dt & 0xff);
  if (!type) throw new Error(`param ${i}: unknown dtype ${dt}`);
  const notes: string[] = [];
  const nmt = C.numModTargets;
  // Ranges follow the encoder/knob clamping in menu.c (menu_encoderChangeParameter and the pot handler).
  switch (type) {
    case '0B255':
      return { type, min: 0, max: 255, display: i === PAR_BPM ? { kind: 'bpm' } : { kind: 'number' } };
    case '0B127':
      return { type, min: 0, max: 127, display: { kind: 'number' } };
    case 'PM63':
      return { type, min: 0, max: 127, display: { kind: 'signed', offset: offset60.has(i) ? 60 : 63 } };
    case 'PM100':
      notes.push('DTYPE_PM100 is not handled by the display code; shown as unsigned');
      return { type, min: 0, max: 100, display: { kind: 'number' }, notes };
    case '1B16':
      return { type, min: 1, max: 16, display: { kind: 'number' } };
    case '1B64':
      return { type, min: 1, max: 64, display: { kind: 'number' } };
    case '0B15':
      return { type, min: 0, max: 15, display: { kind: 'number' } };
    case '0B100':
      return { type, min: 0, max: 100, display: { kind: 'number' } };
    case 'ON_OFF':
      return { type, min: 0, max: 1, display: { kind: 'onOff' } };
    case '0b1':
      return { type, min: 0, max: 1, display: { kind: 'oneBased' } };
    case 'VOICE_LFO':
      return { type, min: 1, max: 6, display: { kind: 'lfoVoice' } };
    case 'TARGET_SELECTION_LFO':
      return { type, min: 0, max: nmt - 1, display: { kind: 'modTarget', scope: 'lfo' } };
    case 'TARGET_SELECTION_VELO':
      return { type, min: 0, max: nmt - 1, display: { kind: 'modTarget', scope: 'velocity' } };
    case 'AUTOM_TARGET':
      return { type, min: 0, max: nmt - 1, display: { kind: 'modTarget', scope: 'automation' } };
    case 'NOTE_NAME':
      notes.push('knob clamps to 127, encoder clamps to 100 (menu.c default case)');
      return { type, min: 0, max: 127, display: { kind: 'note', zeroIsAny: i >= PAR_MIDI_NOTE1 && i <= PAR_MIDI_NOTE7 }, notes };
    case 'MENU': {
      const menuId = dt >> 8;
      const menu = menuById.get(menuId);
      if (!menu) throw new Error(`param ${i}: menu ${menuId} has no name list`);
      if (menu.id === 'MENU_WAVEFORM') notes.push('values past the named waveforms select user samples (s0, s1, ...); count depends on the SD card');
      return {
        type,
        min: 0,
        max: menu.items.length - 1,
        display: { kind: 'menu', menu: menuId },
        ...(notes.length ? { notes } : {}),
      };
    }
    default:
      throw new Error(`param ${i}: unhandled dtype ${type}`);
  }
}

function midiAddress(i: number): { kind: 'cc'; cc: number; voice: number | null } | { kind: 'nrpn'; nrpn: number } | { kind: 'none'; reason: string } {
  // MidiParser.c midiParser_ccHandler / frontPanelParser.c frontPanel_ccHandler: CC n -> parameter n-1.
  // frontParser_parseNrpn: NRPN n -> parameter n+128.
  if (i < 127) {
    const cc = i + 1;
    if (RESERVED_CCS.has(cc)) return { kind: 'none', reason: `CC ${cc} is reserved by the MIDI parser` };
    const v = ccVoice.get(cc) ?? 0;
    return { kind: 'cc', cc, voice: v >= 1 && v <= 6 ? v : null };
  }
  if (i === PAR_BANK_CHANGE) return { kind: 'none', reason: 'would be CC 128; CC 0 is bank change instead' };
  if (i < C.END_OF_SOUND_PARAMETERS) return { kind: 'nrpn', nrpn: i - 128 };
  return { kind: 'none', reason: 'not a sound parameter; NRPN writes the front edit buffer only. TODO verify on hardware' };
}

const params = [];
for (let i = 0; i < C.NUM_PARAMS; i++) {
  const names = namesByIndex.get(i);
  if (!names) throw new Error(`no enumerator for index ${i}`);
  // Prefer the last non-alias name declared for an index (e.g. PAR_OSC_WAVE_DRUM1 over PAR_MOD_WHEEL).
  const name = names[names.length - 1]!;
  const refs = pageRefs.get(i) ?? [];
  const voicePages = [...new Set(refs.map((r) => r.page).filter((p) => p.startsWith('voice')))].map((p) => Number(p.slice(5)));
  const rd = rangeAndDisplay(i, raw.dtypes[i]!);
  const label = refs[0];
  params.push({
    index: i,
    name,
    ...(names.length > 1 ? { aliases: names.slice(0, -1) } : {}),
    type: rd.type,
    min: rd.min,
    max: rd.max,
    display: rd.display,
    // voices whose menu pages show this parameter (7 = open hi-hat, which shares voice 6's sound)
    voices: voicePages,
    short: label?.short ?? null,
    category: label?.category ?? null,
    long: label?.long ?? null,
    // every menu slot that shows this parameter, with the LCD label used there
    pages: refs,
    midi: midiAddress(i),
    inKit: i < C.END_OF_SOUND_PARAMETERS,
    isGlobal: i >= C.PAR_BEGINNING_OF_GLOBALS,
    ...(rd.notes ? { notes: rd.notes } : {}),
  });
}

const menus = Object.fromEntries([...menuById.entries()].map(([id, m]) => [id, { id: m.id, items: m.items }]));

const schema = {
  generatedFrom: 'vendor/lxr-firmware (see scripts/extract-schema.ts)',
  constants: {
    END_OF_SOUND_PARAMETERS: C.END_OF_SOUND_PARAMETERS,
    PAR_BEGINNING_OF_GLOBALS: C.PAR_BEGINNING_OF_GLOBALS,
    NUM_PARAMS: C.NUM_PARAMS,
  },
  // send order for a whole kit (Parameters.c parameterOrder)
  parameterOrder: raw.parameterOrder,
  // characters the machine's name editor offers (menu.c characterOrder), in its order
  nameCharacters: String.fromCharCode(...raw.characterOrder),
  menus,
  params,
};

const modTargetsJson = {
  generatedFrom: 'vendor/lxr-firmware Core/Src/menu/Cc2Text.c',
  count: C.numModTargets,
  // modTargetGapMap: one byte per logical target slot, bit (6 - voice) set when that voice has it.
  // Used to keep the same kind of target when an LFO's destination voice changes.
  gapMap: raw.modTargetGapMap,
  voiceRanges: raw.modTargetVoiceOffsets.map(([start, end], v) => ({ voice: v + 1, start, end })),
  targets: raw.modTargets.map(([nameIdx, param], index) => {
    const n = raw.names[nameIdx]!;
    const offsets = raw.modTargetVoiceOffsets;
    const v = offsets.findIndex(([s, e]) => index >= s && index <= e);
    return {
      index,
      param,
      paramName: namesByIndex.get(param)!.at(-1)!,
      voice: v >= 0 ? v + 1 : null,
      short: n.short,
      category: n.category,
      long: n.long,
    };
  }),
};

mkdirSync(join(root, 'src/schema'), { recursive: true });
writeFileSync(join(root, 'src/schema/params.json'), JSON.stringify(schema, null, 1) + '\n');
writeFileSync(
  join(root, 'src/schema/initKit.json'),
  JSON.stringify({
    generatedFrom: 'vendor/lxr-firmware Core/Src/Preset/initKit.c (used by preset_init)',
    // 8 name bytes, then parameter bytes. preset_init copies bytes 8..END_OF_SOUND_PARAMETERS-1 only.
    bytes: raw.initKit,
  }) + '\n',
);
writeFileSync(join(root, 'src/schema/modTargets.json'), JSON.stringify(modTargetsJson, null, 1) + '\n');
console.log(
  `wrote ${params.length} params, ${modTargetsJson.count} mod targets, ${menuById.size} menus ` +
    `(END_OF_SOUND_PARAMETERS=${C.END_OF_SOUND_PARAMETERS}, PAR_BEGINNING_OF_GLOBALS=${C.PAR_BEGINNING_OF_GLOBALS}, NUM_PARAMS=${C.NUM_PARAMS})`,
);
