import { describe, expect, it } from 'vitest';
import { formatValue, noteName, numericValue, parseNumericValue } from '../src/core/values';
import { paramIndex } from '../src/core/schema';

describe('formatValue', () => {
  it('shows PM63 values as raw-63, coarse tune and FM freq as raw-60', () => {
    expect(formatValue(paramIndex('PAR_PAN1'), 63)).toBe('0');
    expect(formatValue(paramIndex('PAR_PAN1'), 0)).toBe('-63');
    expect(formatValue(paramIndex('PAR_PAN1'), 127)).toBe('+64');
    expect(formatValue(paramIndex('PAR_COARSE1'), 60)).toBe('0');
    expect(formatValue(paramIndex('PAR_FM_FREQ2'), 72)).toBe('+12');
    expect(formatValue(paramIndex('PAR_FINE3'), 60)).toBe('-3');
  });

  it('shows menu values by name, user samples as sN', () => {
    expect(formatValue(paramIndex('PAR_OSC_WAVE_DRUM1'), 2)).toBe('Saw');
    expect(formatValue(paramIndex('PAR_OSC_WAVE_DRUM1'), 6)).toBe('s0');
    expect(formatValue(paramIndex('PAR_FILTER_TYPE_1'), 7)).toBe('off');
    expect(formatValue(paramIndex('PAR_WAVE_LFO1'), 0)).toBe('sin');
  });

  it('shows modulation targets by name', () => {
    expect(formatValue(paramIndex('PAR_TARGET_LFO4'), 184)).toBe('Voice Panning');
    expect(formatValue(paramIndex('PAR_TARGET_LFO4'), 0)).toBe('off');
  });

  it('handles on/off, BPM, notes and the 1-based automation track', () => {
    expect(formatValue(paramIndex('PAR_VOLUME_MOD_ON_OFF1'), 1)).toBe('on');
    expect(formatValue(paramIndex('PAR_BPM'), 0)).toBe('EXT');
    expect(formatValue(paramIndex('PAR_BPM'), 1)).toBe('MID');
    expect(formatValue(paramIndex('PAR_BPM'), 120)).toBe('120');
    expect(formatValue(paramIndex('PAR_MIDI_NOTE1'), 0)).toBe('any');
    expect(formatValue(paramIndex('PAR_STEP_NOTE'), 0)).toBe('C 0');
    expect(formatValue(paramIndex('PAR_AUTOM_TRACK'), 0)).toBe('1');
  });
});

describe('noteName', () => {
  it('matches setNoteName', () => {
    const names = Array.from({ length: 12 }, (_, i) => noteName(i));
    expect(names).toEqual(['C 0', 'C#0', 'D 0', 'D#0', 'E 0', 'F 0', 'F#0', 'G 0', 'G#0', 'A 0', 'A#0', 'B 0']);
    expect(noteName(60)).toBe('C 5');
  });
});

describe('numeric conversion', () => {
  it('converts between raw and displayed numbers and clamps', () => {
    const pan = paramIndex('PAR_PAN1');
    expect(numericValue(pan, 70)).toBe(7);
    expect(parseNumericValue(pan, 7)).toBe(70);
    expect(parseNumericValue(pan, 200)).toBe(127);
    expect(parseNumericValue(paramIndex('PAR_MIDI_CHAN_1'), 0)).toBe(1);
  });
});
