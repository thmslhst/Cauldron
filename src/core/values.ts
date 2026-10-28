// Raw byte <-> displayed value. Mirrors the display code in menu.c (menu_repaintGeneric,
// getMenuItemNameForValue, setNoteName, menu_displayModTargetShort/Full).
import { menus, modTargets, paramDef, type ParamDef } from './schema';

/** Note name as the LCD shows it (setNoteName): "C 0", "C#0", ... octave 0 starts at value 0. */
export function noteName(value: number): string {
  const n = value % 12;
  const letter = String.fromCharCode((n > 8 ? 60 : 67) + Math.floor((n + (n > 4 ? 1 : 0)) / 2));
  const sharp = (n < 5 && n & 1) || (n > 5 && !(n & 1)) ? '#' : ' ';
  const octave = String.fromCharCode(48 + Math.floor(value / 12));
  return `${letter}${sharp}${octave}`;
}

export function modTargetLabel(index: number): { short: string; full: string; voice: number | null; off: boolean } {
  const t = modTargets[index];
  if (!t || t.param === 0) return { short: 'off', full: 'off', voice: null, off: true };
  return { short: t.short, full: `${t.category} ${t.long}`, voice: t.voice, off: false };
}

export function menuItems(menuId: number): string[] {
  return menus[String(menuId)]?.items ?? [];
}

/** Signed offset for DTYPE_PM63 parameters (63, or 60 for coarse tune and FM/mod osc frequencies). */
export function signedOffset(def: ParamDef): number | null {
  return def.display.kind === 'signed' ? def.display.offset : null;
}

/** The value as the machine displays it, e.g. "-3", "Saw", "off", "C#2", "EXT". */
export function formatValue(index: number, raw: number): string {
  const def = paramDef(index);
  const d = def.display;
  switch (d.kind) {
    case 'signed': {
      const v = raw - d.offset;
      return v > 0 ? `+${v}` : String(v);
    }
    case 'menu': {
      const items = menuItems(d.menu);
      if (raw < items.length) return items[raw]!;
      // Waveforms past the named ones are user samples (getMenuItemNameForValue)
      if (menus[String(d.menu)]?.id === 'MENU_WAVEFORM') return `s${raw - items.length}`;
      return '---';
    }
    case 'onOff':
      return raw === 1 ? 'on' : 'off';
    case 'oneBased':
      return String(raw + 1);
    case 'note':
      return d.zeroIsAny && raw === 0 ? 'any' : noteName(raw);
    case 'bpm':
      return raw === 0 ? 'EXT' : raw === 1 ? 'MID' : String(raw);
    case 'modTarget':
      return modTargetLabel(raw).full;
    case 'lfoVoice':
    case 'number':
      return String(raw);
  }
}

/** Converts a displayed number back to the raw byte, for numeric and signed parameters. */
export function parseNumericValue(index: number, shown: number): number {
  const def = paramDef(index);
  const off = signedOffset(def) ?? (def.display.kind === 'oneBased' ? -1 : 0);
  return clamp(index, Math.round(shown + off));
}

/** Clamps a raw value to the parameter's range (as the encoder/knob code in menu.c does). */
export function clamp(index: number, raw: number): number {
  const def = paramDef(index);
  return Math.min(def.max, Math.max(def.min, raw));
}

/** The displayed number for numeric and signed parameters (raw - offset). */
export function numericValue(index: number, raw: number): number {
  const def = paramDef(index);
  const off = signedOffset(def) ?? (def.display.kind === 'oneBased' ? -1 : 0);
  return raw - off;
}
