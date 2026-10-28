import { describe, expect, it } from 'vitest';
import { filesBySlot, planSlotWrite, projectFolders } from '../src/core/slotWrite';

describe('planSlotWrite', () => {
  const card = ['03-LYSER.SND', '03-OTHER.SND', 'p003.snd', '03-LYSER.PAT', '04-KICK.SND', 'prj.nfo'];

  it('overwrites a case-insensitive match and removes other files for the slot', () => {
    expect(planSlotWrite(card, 3, 'Lyserg', 'snd')).toEqual({
      fileName: '03-LYSER.SND',
      overwrite: '03-LYSER.SND',
      remove: ['03-OTHER.SND', 'p003.snd'],
    });
  });

  it('creates a new file when nothing matches', () => {
    expect(planSlotWrite(card, 5, 'Snare 2', 'snd')).toEqual({ fileName: '05-Snare.snd', overwrite: null, remove: [] });
    expect(planSlotWrite(card, 4, 'Bass', 'snd')).toEqual({ fileName: '04-Bass.snd', overwrite: null, remove: ['04-KICK.SND'] });
  });
});

describe('filesBySlot', () => {
  it('groups by slot with new-style names first', () => {
    const m = filesBySlot(['p003.snd', '03-B.SND', '01-A.SND', '01-A.PAT'], 'snd');
    expect([...m.entries()]).toEqual([
      [1, ['01-A.SND']],
      [3, ['03-B.SND', 'p003.snd']],
    ]);
  });
});

describe('projectFolders', () => {
  it('finds /projNN/ folders', () => {
    expect(projectFolders(['proj01', 'PROJ00', 'samples', 'proj1'])).toEqual([
      { name: 'PROJ00', number: 0 },
      { name: 'proj01', number: 1 },
    ]);
  });
});
