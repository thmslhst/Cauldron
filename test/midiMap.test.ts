import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseKit } from '../src/core/kit';
import {
  DEFAULT_MIDI_SETTINGS as S,
  kitToMidiMessages,
  paramToMidi,
} from '../src/core/midiMap';
import { modTargets, paramIndex, PARAMETER_ORDER } from '../src/core/schema';

const fixture = parseKit(new Uint8Array(readFileSync(new URL('./fixtures/03-LYSER.SND', import.meta.url))));
const tIdx = (name: string) => modTargets.findIndex((t) => t.paramName === name);

describe('paramToMidi', () => {
  it('sends parameters below 127 as CC n+1', () => {
    expect(paramToMidi(paramIndex('PAR_COARSE1'), 60, S)).toEqual({ ok: true, messages: [[0xb0, 9, 60]] });
    expect(paramToMidi(paramIndex('PAR_AMOUNT_LFO6'), 5, S)).toEqual({ ok: true, messages: [[0xb0, 127, 5]] });
  });

  it('sends parameters from 128 as NRPN n-128 on the global channel', () => {
    expect(paramToMidi(paramIndex('PAR_FILTER_DRIVE_1'), 10, { ...S, globalChannel: 10 })).toEqual({
      ok: true,
      messages: [
        [0xb9, 99, 0],
        [0xb9, 98, 0],
        [0xb9, 6, 10],
      ],
    });
    expect(paramToMidi(paramIndex('PAR_MORPH_KIT_DEST'), 3, S)).toMatchObject({ ok: true, messages: [[0xb0, 99, 0], [0xb0, 98, 118], [0xb0, 6, 3]] });
  });

  it('has no message for parameter 127 or placeholders', () => {
    for (const i of [0, 5, 97, 98, 127]) expect(paramToMidi(i, 0, S).ok).toBe(false);
  });

  it('sends modulation targets as the target parameter number', () => {
    const r = paramToMidi(paramIndex('PAR_TARGET_LFO4'), tIdx('PAR_PAN5'), S);
    expect(r).toEqual({ ok: true, messages: [[0xb0, 99, 0], [0xb0, 98, 42], [0xb0, 6, paramIndex('PAR_PAN5')]] });
    expect(paramToMidi(paramIndex('PAR_VEL_DEST_1'), 0, S)).toMatchObject({ ok: true, messages: [[0xb0, 99, 0], [0xb0, 98, 21], [0xb0, 6, 0]] });
  });

  it('refuses targets on parameters above 127', () => {
    const r = paramToMidi(paramIndex('PAR_TARGET_LFO1'), tIdx('PAR_FILTER_DRIVE_1'), S);
    expect(r.ok).toBe(false);
  });

});

describe('kitToMidiMessages', () => {
  it('follows the machine send order and matches the snapshot', () => {
    const burst = kitToMidiMessages(fixture, S);
    expect(burst.skipped).toEqual([]);
    // first parameter in parameterOrder is PAR_FX_DIST_TYPE (NRPN)
    expect(PARAMETER_ORDER[0]).toBe(paramIndex('PAR_FX_DIST_TYPE'));
    expect(burst.messages.slice(0, 3)).toEqual([
      [0xb0, 99, 0],
      [0xb0, 98, paramIndex('PAR_FX_DIST_TYPE') - 128],
      [0xb0, 6, fixture.params[paramIndex('PAR_FX_DIST_TYPE')]],
    ]);
    expect(burst.messages).toMatchSnapshot();
  });

  it('reports unsendable targets instead of inventing a message', () => {
    const params = fixture.params.slice();
    params[paramIndex('PAR_TARGET_LFO1')] = tIdx('PAR_TRANS1_VOL');
    const burst = kitToMidiMessages({ ...fixture, params }, S);
    expect(burst.skipped).toEqual([{ index: paramIndex('PAR_TARGET_LFO1'), reason: expect.stringContaining('above 127') }]);
  });
});


import { MTC_KEEP_ALIVE, mtcStartMessages } from '../src/core/midiMap';

describe('transport (MIDI time code)', () => {
  it('starts with 8 zero quarter frames', () => {
    expect(mtcStartMessages()).toEqual([
      [0xf1, 0x00],
      [0xf1, 0x10],
      [0xf1, 0x20],
      [0xf1, 0x30],
      [0xf1, 0x40],
      [0xf1, 0x50],
      [0xf1, 0x60],
      [0xf1, 0x70],
    ]);
    expect(MTC_KEEP_ALIVE).toEqual([0xf1, 0x00]);
  });
});
