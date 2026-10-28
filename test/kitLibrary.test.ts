import { describe, expect, it } from 'vitest';
import { groupKits, projectNumber } from '../src/core/kitLibrary';

describe('groupKits', () => {
  it('groups .snd files by folder and sorts by slot', () => {
    const g = groupKits(['CARD/proj01/10-B.SND', 'CARD/proj01/02-A.snd', 'CARD/proj01/prj.nfo', 'CARD/proj00/p003.snd', 'x.snd', 'CARD/proj01/._02-A.snd']);
    expect(g.map((f) => [f.folder, f.project, f.kits.map((k) => k.fileName)])).toEqual([
      ['', null, ['x.snd']],
      ['CARD/proj00', 0, ['p003.snd']],
      ['CARD/proj01', 1, ['02-A.snd', '10-B.SND']],
    ]);
    expect(g[2]!.kits[0]!.slot).toBe(2);
  });

  it('recognises project folders', () => {
    expect(projectNumber('SD/proj07')).toBe(7);
    expect(projectNumber('proj7')).toBeNull();
  });
});
