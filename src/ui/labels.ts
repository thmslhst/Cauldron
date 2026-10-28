// Human-readable names for the UI. The firmware only has abbreviated LCD labels
// ("Oscilltr", "Overdriv"), so these are written by hand. They only affect display.
import type { ParamDef, PageRef } from '../core/schema';

export const VOICE_NAMES = ['Drum 1', 'Drum 2', 'Drum 3', 'Snare', 'Clap / Cymbal', 'Hi-hat closed', 'Hi-hat open'];
/** LFO destination voices are 1..6; voice 6 is the hi-hat as a whole. */
export const TARGET_VOICE_NAMES = ['Drum 1', 'Drum 2', 'Drum 3', 'Snare', 'Clap / Cymbal', 'Hi-hat'];

const SUB_PAGE_TITLES = ['Oscillator', 'Amp envelope', 'Modulation', 'FM', 'Transient', 'Filter', 'LFO', 'Mix'];

export function subPageTitle(subPage: number, refs: ParamDef[]): string {
  if (subPage === 3 && refs.some((p) => p.name.startsWith('PAR_MOD_OSC'))) return 'Mod oscillators';
  if (subPage === 2 && !refs.some((p) => p.name.startsWith('PAR_MOD_EG'))) return 'Velocity';
  return SUB_PAGE_TITLES[subPage] ?? `Page ${subPage + 1}`;
}

export const FX_PAGE_TITLES = ['Off', 'Distortion', 'Ring mod', 'Compressor', 'Delay', 'Reverb'];

// Patterns over the firmware enum names (voice digits stripped).
const BY_NAME: [RegExp, string][] = [
  [/^PAR_(OSC_WAVE_(DRUM\d|SNARE)|WAVE1_(CYM|HH))$/, 'Waveform'],
  [/^PAR_COARSE\d$/, 'Coarse tune'],
  [/^PAR_FINE\d$/, 'Fine tune'],
  [/^PAR_PWM_\d$/, 'Pulse width'],
  [/^PAR_NOISE_FREQ1$/, 'Noise frequency'],
  [/^PAR_MIX1$/, 'Noise / osc mix'],
  [/^PAR_MOD_WAVE_DRUM\d$/, 'FM waveform'],
  [/^PAR_WAVE2_(CYM|HH)$/, 'Waveform 2'],
  [/^PAR_WAVE3_(CYM|HH)$/, 'Waveform 3'],
  [/^PAR_MOD_OSC_F1(_CYM)?$/, 'Mod osc 1 frequency'],
  [/^PAR_MOD_OSC_F2(_CYM)?$/, 'Mod osc 2 frequency'],
  [/^PAR_MOD_OSC_GAIN1(_CYM)?$/, 'Mod osc 1 gain'],
  [/^PAR_MOD_OSC_GAIN2(_CYM)?$/, 'Mod osc 2 gain'],
  [/^PAR_FILTER_FREQ_\d$/, 'Cutoff'],
  [/^PAR_RESO_\d$/, 'Resonance'],
  [/^PAR_FILTER_TYPE_\d$/, 'Filter type'],
  [/^PAR_FILTER_DRIVE_\d$/, 'Filter drive'],
  [/^PAR_VELOA\d$/, 'Attack'],
  [/^PAR_VELOD\d$/, 'Decay'],
  [/^PAR_VELOD6_CLOSED$/, 'Decay (closed)'],
  [/^PAR_VELOD6_OPEN$/, 'Decay (open)'],
  [/^PAR_VOL_SLOPE\d$/, 'Envelope slope'],
  [/^PAR_REPEAT\d$/, 'Repeat count'],
  [/^PAR_MOD_EG\d$/, 'Pitch envelope decay'],
  [/^PAR_PITCH_SLOPE\d$/, 'Pitch envelope slope'],
  [/^PAR_MODAMNT\d$/, 'Pitch modulation'],
  [/^PAR_FMAMNT\d$/, 'FM amount'],
  [/^PAR_FM_FREQ\d$/, 'FM frequency'],
  [/^PAR_MIX_MOD_\d$/, 'FM mode'],
  [/^PAR_VOL\d$/, 'Volume'],
  [/^PAR_PAN\d$/, 'Pan'],
  [/^PAR_(DRIVE\d|SNARE_DISTORTION|CYMBAL_DISTORTION|HAT_DISTORTION)$/, 'Drive'],
  [/^PAR_VOICE_DECIMATION\d$/, 'Sample rate'],
  [/^PAR_VOICE_DECIMATION_ALL$/, 'Sample rate (all voices)'],
  [/^PAR_AUDIO_OUT\d$/, 'Audio output'],
  [/^PAR_FREQ_LFO\d$/, 'Rate'],
  [/^PAR_SYNC_LFO\d$/, 'Clock sync'],
  [/^PAR_AMOUNT_LFO\d$/, 'Amount'],
  [/^PAR_WAVE_LFO\d$/, 'Waveform'],
  [/^PAR_RETRIGGER_LFO\d$/, 'Retrigger'],
  [/^PAR_OFFSET_LFO\d$/, 'Phase offset'],
  [/^PAR_VOICE_LFO\d$/, 'Destination voice'],
  [/^PAR_TARGET_LFO\d$/, 'Destination'],
  [/^PAR_VEL_DEST_\d$/, 'Velocity destination'],
  [/^PAR_VELO_MOD_AMT_\d$/, 'Velocity amount'],
  [/^PAR_VOLUME_MOD_ON_OFF\d$/, 'Velocity controls volume'],
  [/^PAR_TRANS\d_WAVE$/, 'Transient sample'],
  [/^PAR_TRANS\d_VOL$/, 'Transient volume'],
  [/^PAR_TRANS\d_FREQ$/, 'Transient pitch'],
  [/^PAR_FX_TYPE$/, 'Effect'],
  [/^PAR_FX_ROUTING$/, 'Effect output'],
  [/^PAR_FX_DRY_WET$/, 'Dry / wet'],
  [/^PAR_FX_DIST_TYPE$/, 'Distortion type'],
  [/^PAR_FX_RATIO$/, 'Ratio'],
  [/^PAR_FX_WAVE$/, 'Waveform'],
  [/^PAR_FX_REVERB_TYPE$/, 'Reverb type'],
  [/^PAR_FX_DELAY_TYPE$/, 'Delay type'],
  [/^PAR_MORPH_KIT_DEST$/, 'Morph kit slot'],
  [/^PAR_TRACK_LENGTH$/, 'Track length'],
  [/^PAR_MIDI_CHAN_6$/, 'MIDI channel (closed)'],
  [/^PAR_MIDI_CHAN_7$/, 'MIDI channel (open)'],
  [/^PAR_MIDI_NOTE6$/, 'MIDI note (closed)'],
  [/^PAR_MIDI_NOTE7$/, 'MIDI note (open)'],
  [/^PAR_MIDI_CHAN_\d$/, 'MIDI channel'],
  [/^PAR_MIDI_NOTE\d$/, 'MIDI note'],
];

// Expansions of the LCD long names, for parameters whose meaning depends on the page (FX P1-P4).
const LCD_LONG: Record<string, string> = {
  Overdriv: 'Drive',
  Frequncy: 'Frequency',
  Resnance: 'Resonance',
  PulsWdth: 'Pulse width',
  PreDelay: 'Pre-delay',
  Reflxion: 'Reflection',
  Feedback: 'Feedback',
  Threshld: 'Threshold',
};

export function lcdLongReadable(long: string): string {
  return LCD_LONG[long] ?? long;
}

/** Readable name of a parameter. A page slot can override it (FX P1-P4 change meaning per effect). */
export function readableName(def: ParamDef, ref?: PageRef): string {
  if (ref && /^PAR_FX_P\d$/.test(def.name)) return lcdLongReadable(ref.long);
  for (const [re, label] of BY_NAME) if (re.test(def.name)) return label;
  return def.long ? lcdLongReadable(def.long) : def.name;
}
