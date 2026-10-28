// Parameter changes -> MIDI messages for the stock firmware. Pure functions.
//
// From the firmware (MidiParser.c, frontPanelParser.c):
// - CC n (2..126) sets parameter n-1, in the sound engine and in the edit buffer.
//   CC 0 is bank change (loads a kit from RAM), CC 1 is the mod wheel, CC 6/98/99 are NRPN.
// - Parameters 128..246 are NRPN n = parameter-128: CC 99 (MSB), CC 98 (LSB), CC 6 (value).
// - Parameter 127 has no address.
// - LFO and velocity targets are stored as indices into modTargets, but over MIDI the value is a
//   parameter number, converted back by the front panel with paramToModTarget. The value is a
//   7-bit data byte, so targets on parameters >= 128 cannot be set over MIDI.
// - LFO destination voice (NRPN) only updates the edit buffer; the target carries the voice.
// - Voice CCs are accepted on midi_MidiChannels[voiceNr] or the global channel; NRPN CCs and
//   non-voice CCs on any configured channel. The global channel is therefore always safe.
import { modTargets, paramDef, PARAMETER_ORDER, END_OF_SOUND_PARAMETERS } from './schema';
import type { Kit } from './kit';

export type MidiBytes = readonly number[];

export interface MidiSettings {
  /** Global channel, 1..16 (PAR_MIDI_CHAN_GLOBAL). */
  globalChannel: number;
  /** Channels of voices 1..7 (PAR_MIDI_CHAN_1..7), 1..16. */
  voiceChannels: number[];
  /** Send voice CCs on voice channels instead of the global channel. */
  useVoiceChannels: boolean;
  /** MIDI note setting of voices 1..7 on the machine (PAR_MIDI_NOTE1..7). 0 = "any". */
  voiceNotes: number[];
}

/** Machine defaults: preset_loadDefaultGlobals sets every voice to channel 1. The global channel
 *  default is stored as 0 there, which the channel array reads as MIDI channel 1.
 *  TODO verify on hardware. */
export const DEFAULT_MIDI_SETTINGS: MidiSettings = {
  globalChannel: 1,
  voiceChannels: [1, 1, 1, 1, 1, 1, 1],
  useVoiceChannels: false,
  voiceNotes: [48, 48, 48, 48, 48, 48, 48], // preset_loadDefaultGlobals
};

/** SEQ_DEFAULT_NOTE (sequencer.h): the note a voice plays at its own pitch. */
export const DEFAULT_NOTE = 60;

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CC = 0xb0;
const NRPN_MSB = 99;
const NRPN_LSB = 98;
const DATA_ENTRY = 6;

export type ParamMessages = { ok: true; messages: MidiBytes[] } | { ok: false; reason: string };

function channelByte(ch: number): number {
  if (!Number.isInteger(ch) || ch < 1 || ch > 16) throw new RangeError(`MIDI channel must be 1..16, got ${ch}`);
  return ch - 1;
}

/**
 * Channel for a voice CC. midiParser_parseMidiMessage checks midi_MidiChannels[voiceNr] where
 * voiceNr is 1..6 from midiParser_cc2voiceNr, and that array is 0-based (index 0 = voice 1).
 * So a drum 1 CC is checked against voice 2's channel. Reproduced as-is. TODO verify on hardware.
 */
export function voiceCcChannel(ccVoice: number, s: MidiSettings): number {
  return s.voiceChannels[ccVoice] ?? s.globalChannel;
}

/** The value byte to send: the raw value, or a parameter number for modulation targets. */
export function midiValue(index: number, raw: number): { ok: true; value: number } | { ok: false; reason: string } {
  const def = paramDef(index);
  if (def.display.kind === 'modTarget') {
    const t = modTargets[raw];
    if (!t) return { ok: false, reason: `invalid modulation target ${raw}` };
    if (t.param > 127) return { ok: false, reason: 'targets on parameters above 127 cannot be set over MIDI (7-bit value)' };
    return { ok: true, value: t.param };
  }
  if (raw > 127) return { ok: false, reason: `value ${raw} does not fit in a MIDI data byte` };
  return { ok: true, value: raw };
}

export function paramToMidi(index: number, raw: number, s: MidiSettings): ParamMessages {
  const def = paramDef(index);
  if (!def.inKit) return { ok: false, reason: 'not a kit parameter' };
  const v = midiValue(index, raw);
  if (!v.ok) return v;
  const g = channelByte(s.globalChannel);
  switch (def.midi.kind) {
    case 'cc': {
      const ch = s.useVoiceChannels && def.midi.voice ? channelByte(voiceCcChannel(def.midi.voice, s)) : g;
      return { ok: true, messages: [[CC | ch, def.midi.cc, v.value]] };
    }
    case 'nrpn': {
      const n = def.midi.nrpn;
      return {
        ok: true,
        messages: [
          [CC | g, NRPN_MSB, n >> 7],
          [CC | g, NRPN_LSB, n & 0x7f],
          [CC | g, DATA_ENTRY, v.value],
        ],
      };
    }
    case 'none':
      return { ok: false, reason: def.midi.reason };
  }
}

export interface KitBurst {
  messages: MidiBytes[];
  /** Parameters that could not be sent, with the reason. */
  skipped: { index: number; reason: string }[];
}

/** All kit parameters, in the machine's own send order (parameterOrder). Placeholders without an address are skipped silently. */
export function kitToMidiMessages(kit: Kit, s: MidiSettings): KitBurst {
  const messages: MidiBytes[] = [];
  const skipped: KitBurst['skipped'] = [];
  for (const index of PARAMETER_ORDER) {
    if (index >= END_OF_SOUND_PARAMETERS) continue;
    const def = paramDef(index);
    if (def.midi.kind === 'none') continue; // PAR_NONE, NRPN placeholders, PAR_BANK_CHANGE, unused
    const r = paramToMidi(index, kit.params[index]!, s);
    if (r.ok) messages.push(...r.messages);
    else skipped.push({ index, reason: r.reason });
  }
  return { messages, skipped };
}

/**
 * Plays voice 1..7 (midiParser_noteOn). The note goes on the voice's channel. If the voice's MIDI
 * note setting is a note, only that note triggers it (at its own pitch); with "any" the note is the
 * pitch, so the default note is used. The firmware ignores note-off, it is sent for tidiness.
 */
export function playVoiceMessages(voice: number, velocity: number, s: MidiSettings): MidiBytes[] {
  if (!Number.isInteger(voice) || voice < 1 || voice > 7) throw new RangeError('voice must be 1..7');
  const ch = channelByte(s.voiceChannels[voice - 1] ?? 1);
  const setting = s.voiceNotes[voice - 1] ?? 0;
  const note = setting === 0 ? DEFAULT_NOTE : setting;
  const vel = Math.min(127, Math.max(1, Math.round(velocity)));
  return [
    [NOTE_ON | ch, note, vel],
    [NOTE_OFF | ch, note, 0],
  ];
}

/** Voices that share a channel, so one note triggers all of them. */
export function sharedPlayChannels(s: MidiSettings): number[][] {
  const by = new Map<number, number[]>();
  s.voiceChannels.forEach((ch, i) => by.set(ch, [...(by.get(ch) ?? []), i + 1]));
  return [...by.values()].filter((v) => v.length > 1);
}

// ---------------------------------------------------------------------------
// Transport. With the internal tempo the stock firmware ignores MIDI Start/Stop
// (MidiParser.c handles them only in external sync). It does follow MIDI Time Code:
// a full set of 8 quarter frames at 00:00:00:00 starts the sequencer, and if quarter
// frames stop arriving it stops again (midiParser_checkMtc, ~100 ms). Needs "R" in the RX filter.

const MTC_QUARTER_FRAME = 0xf1;
export const MIDI_START = 0xfa;
export const MIDI_STOP = 0xfc;

/** Quarter frames 0..7, all values zero: "the song has just started". */
export function mtcStartMessages(): MidiBytes[] {
  return Array.from({ length: 8 }, (_, piece) => [MTC_QUARTER_FRAME, piece << 4]);
}

/** Keeps a time-code start alive: only frame 0 is checked for the timeout. */
export const MTC_KEEP_ALIVE: MidiBytes = [MTC_QUARTER_FRAME, 0x00];
