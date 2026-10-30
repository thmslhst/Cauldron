import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseKit, serializeKit, withName } from '../src/core/kit';
import { initKit } from '../src/core/kitModel';
import {
  addSavedKit,
  decodeSavedKits,
  findSavedKitByName,
  kitOf,
  removeSavedKit,
  replaceSavedKit,
  savedIdOf,
  savedKit,
  savedOrigin,
  stepSavedKit,
  type SavedKit,
} from '../src/core/savedKits';

const lyser = new Uint8Array(readFileSync(new URL('./fixtures/03-LYSER.SND', import.meta.url)));
const entry = (id: string): SavedKit => savedKit(withName(initKit(), id.toUpperCase()), id, 0);

describe('saved kits', () => {
  it('keeps a kit byte for byte', () => {
    const e = savedKit(parseKit(lyser), 'a', 1);
    expect(e.name).toBe('Lyserg');
    expect(serializeKit(kitOf(e))).toEqual(lyser);
  });

  it('adds at the end and removes by id', () => {
    const list = addSavedKit(addSavedKit([], entry('a')), entry('b'));
    expect(list.map((k) => k.id)).toEqual(['a', 'b']);
    expect(removeSavedKit(list, 'a').map((k) => k.id)).toEqual(['b']);
  });

  it('finds a kit by name, ignoring case and trailing spaces', () => {
    const list = ['a', 'b'].map(entry);
    expect(findSavedKitByName(list, 'b  ')?.id).toBe('b');
    expect(findSavedKitByName(list, 'B')?.id).toBe('b');
    expect(findSavedKitByName(list, 'c')).toBeNull();
  });

  it('replaces a kit in place', () => {
    const list = ['a', 'b', 'c'].map(entry);
    const next = replaceSavedKit(list, 'b', { ...entry('x'), id: 'b' });
    expect(next.map((k) => k.name)).toEqual(['A', 'X', 'C']);
  });

  it('steps through the list, wrapping around', () => {
    const list = ['a', 'b', 'c'].map(entry);
    expect(stepSavedKit(list, 'a', 1)?.id).toBe('b');
    expect(stepSavedKit(list, 'c', 1)?.id).toBe('a');
    expect(stepSavedKit(list, 'a', -1)?.id).toBe('c');
    expect(stepSavedKit(list, null, 1)?.id).toBe('a');
    expect(stepSavedKit(list, 'gone', -1)?.id).toBe('c');
    expect(stepSavedKit([], null, 1)).toBeNull();
  });

  it('maps origins to ids', () => {
    expect(savedIdOf(savedOrigin('x1'))).toBe('x1');
    expect(savedIdOf('03-LYSER.SND')).toBeNull();
  });

  it('drops malformed stored entries', () => {
    const good = entry('a');
    expect(decodeSavedKits([good, { id: 'b' }, { ...good, id: 'c', bytes: [300] }, null])).toEqual([good]);
    expect(decodeSavedKits({})).toEqual([]);
  });
});
