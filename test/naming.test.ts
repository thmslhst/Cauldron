import { describe, expect, it } from 'vitest';
import { clearIllegalCharacters, fileNameFor, oldFileNameFor, parseFileName } from '../src/core/naming';

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('fileNameFor', () => {
  it('uses the slot and the first 5 name characters', () => {
    expect(fileNameFor(3, 'Lyserg  ', 'snd')).toBe('03-Lyser.snd');
    expect(fileNameFor(0, 'Kit', 'pat')).toBe('00-Kit.pat');
    expect(fileNameFor(63, 'Song One', 'sng')).toBe('63-Song_.sng');
  });

  it('replaces illegal characters and spaces with _', () => {
    expect(fileNameFor(12, 'a b.c', 'snd')).toBe('12-a_b_c.snd');
    expect(fileNameFor(1, '{~}@^', 'snd')).toBe('01-{~}@^.snd');
    expect(fileNameFor(1, "it's", 'snd')).toBe('01-it_s.snd');
  });

  it('stops at a NUL byte', () => {
    expect(fileNameFor(5, bytes('Em\0pty  '), 'snd')).toBe('05-Em.snd');
    expect(fileNameFor(5, bytes('\0\0\0\0\0\0\0\0'), 'snd')).toBe('05-.snd');
  });

  it('rejects slots outside 0..63', () => {
    expect(() => fileNameFor(64, 'x', 'snd')).toThrow(RangeError);
    expect(() => fileNameFor(-1, 'x', 'snd')).toThrow(RangeError);
  });
});

describe('clearIllegalCharacters', () => {
  it('matches the firmware character set', () => {
    const allowed = 'AZaz09!#$%&()-@^_`{}~';
    expect(String.fromCharCode(...clearIllegalCharacters(bytes(allowed)))).toBe(allowed);
    const bad = " '*+,./:;<=>?[\\]|\"";
    expect(String.fromCharCode(...clearIllegalCharacters(bytes(bad)))).toBe('_'.repeat(bad.length));
  });
});

describe('parseFileName', () => {
  it('reads slot and type case-insensitively', () => {
    expect(parseFileName('03-LYSER.SND')).toEqual({ slot: 3, type: 'snd', old: false });
    expect(parseFileName('63-x.pat')).toEqual({ slot: 63, type: 'pat', old: false });
    expect(parseFileName('07-.Sng')).toEqual({ slot: 7, type: 'sng', old: false });
  });

  it('reads the old pNNN scheme', () => {
    expect(parseFileName('p012.snd')).toEqual({ slot: 12, type: 'snd', old: true });
    expect(oldFileNameFor(5, 'pat')).toBe('p005.pat');
  });

  it('ignores other files', () => {
    expect(parseFileName('glo.cfg')).toBeNull();
    expect(parseFileName('64-x.snd')).toBeNull();
    expect(parseFileName('3-x.snd')).toBeNull();
  });
});
