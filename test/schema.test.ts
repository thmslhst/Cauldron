import { describe, expect, it } from 'vitest';
import { END_OF_SOUND_PARAMETERS, NUM_MOD_TARGETS, NUM_PARAMS, PAR_BEGINNING_OF_GLOBALS, paramIndex, params } from '../src/core/schema';

describe('schema', () => {
  it('has the expected firmware constants', () => {
    expect(END_OF_SOUND_PARAMETERS).toBe(247);
    expect(PAR_BEGINNING_OF_GLOBALS).toBe(272);
    expect(NUM_PARAMS).toBe(302);
    expect(params).toHaveLength(302);
    expect(NUM_PARAMS - PAR_BEGINNING_OF_GLOBALS).toBe(30);
    expect(NUM_MOD_TARGETS).toBe(229);
  });

  it('indexes match the enum', () => {
    params.forEach((p, i) => expect(p.index).toBe(i));
    expect(paramIndex('PAR_NONE')).toBe(0);
    expect(paramIndex('PAR_MORPH_KIT_DEST')).toBe(246);
    expect(paramIndex('PAR_MOD_WHEEL')).toBe(1); // alias of PAR_OSC_WAVE_DRUM1
  });

  it('maps CC n to parameter n-1 and NRPN n to parameter n+128', () => {
    expect(params[8]!.midi).toEqual({ kind: 'cc', cc: 9, voice: 1 });
    expect(params[127]!.midi.kind).toBe('none');
    expect(params[128]!.midi).toEqual({ kind: 'nrpn', nrpn: 0 });
    expect(params[246]!.midi).toEqual({ kind: 'nrpn', nrpn: 118 });
    for (const reserved of [0, 5, 97, 98]) expect(params[reserved]!.midi.kind).toBe('none');
  });
});
