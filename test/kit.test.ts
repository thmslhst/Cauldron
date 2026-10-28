import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KIT_FILE_SIZE,
  KitFormatError,
  diffParams,
  kitNameText,
  parseKit,
  serializeKit,
  withName,
  withParam,
} from '../src/core/kit';
import { NUM_MOD_TARGETS, paramIndex } from '../src/core/schema';

const fixture = new Uint8Array(readFileSync(new URL('./fixtures/03-LYSER.SND', import.meta.url)));

describe('kit fixture 03-LYSER.SND', () => {
  it('is 255 bytes with name "Lyserg  "', () => {
    expect(fixture.length).toBe(255);
    expect(KIT_FILE_SIZE).toBe(255);
    const kit = parseKit(fixture);
    expect(String.fromCharCode(...kit.name)).toBe('Lyserg  ');
    expect(kitNameText(kit)).toBe('Lyserg');
  });

  it('has LFO4-6 targets 184, 153, 197 at parameter indices 170-172', () => {
    const kit = parseKit(fixture);
    expect(paramIndex('PAR_TARGET_LFO4')).toBe(170);
    expect([...kit.params.subarray(170, 173)]).toEqual([184, 153, 197]);
  });

  it('round-trips byte for byte', () => {
    expect(serializeKit(parseKit(fixture))).toEqual(fixture);
  });
});

describe('parseKit', () => {
  it('rejects files shorter than the name', () => {
    expect(() => parseKit(new Uint8Array(7))).toThrow(KitFormatError);
  });

  it('sets missing parameters to 0', () => {
    const kit = parseKit(fixture.slice(0, 100));
    expect([...kit.params.subarray(0, 92)]).toEqual([...fixture.subarray(8, 100)]);
    expect(kit.params.subarray(92).every((b) => b === 0)).toBe(true);
    expect(serializeKit(kit).length).toBe(255);
  });

  it('resets out-of-range LFO and velocity mod targets to 0', () => {
    const bytes = fixture.slice();
    const lfo2 = paramIndex('PAR_TARGET_LFO2');
    const vel6 = paramIndex('PAR_VEL_DEST_6');
    bytes[8 + lfo2] = NUM_MOD_TARGETS; // first invalid index
    bytes[8 + vel6] = 255;
    bytes[8 + paramIndex('PAR_TARGET_LFO3')] = NUM_MOD_TARGETS - 1; // still valid
    const kit = parseKit(bytes);
    expect(kit.params[lfo2]).toBe(0);
    expect(kit.params[vel6]).toBe(0);
    expect(kit.params[paramIndex('PAR_TARGET_LFO3')]).toBe(NUM_MOD_TARGETS - 1);
  });

  it('keeps bytes past offset 255 so the file still round-trips', () => {
    const longer = new Uint8Array([...fixture, 1, 2, 3]);
    expect(serializeKit(parseKit(longer))).toEqual(longer);
  });
});

describe('editing', () => {
  it('withParam changes one byte and leaves the original alone', () => {
    const kit = parseKit(fixture);
    const edited = withParam(kit, 10, 99);
    expect(edited.params[10]).toBe(99);
    expect(kit.params[10]).toBe(fixture[18]);
    expect(diffParams(kit, edited)).toEqual(fixture[18] === 99 ? [] : [10]);
  });

  it('withName pads with spaces and replaces non-ASCII', () => {
    const kit = withName(parseKit(fixture), 'Kickö');
    expect(String.fromCharCode(...kit.name)).toBe('Kick_   ');
    expect(kitNameText(withName(kit, 'ABCDEFGHIJ'))).toBe('ABCDEFGH');
  });

  it('reads NUL-padded names like "Empty\\0\\0\\0"', () => {
    const bytes = fixture.slice();
    bytes.set([69, 109, 112, 116, 121, 0, 0, 0], 0);
    const kit = parseKit(bytes);
    expect(kitNameText(kit)).toBe('Empty');
    expect(serializeKit(kit)).toEqual(bytes);
  });
});
