import { describe, expect, it } from 'vitest';
import { gapIndex, retargetForVoice, targetsForVoice, voiceOfTarget } from '../src/core/modTargets';
import { modTargets } from '../src/core/schema';

const idxOf = (paramName: string) => modTargets.findIndex((t) => t.paramName === paramName);

describe('mod targets', () => {
  it('lists off plus the voice range', () => {
    const v1 = targetsForVoice(1);
    expect(v1[0]).toBe(0);
    expect(v1[1]).toBe(2);
    expect(v1.at(-1)).toBe(39);
    expect(targetsForVoice(6).at(-1)).toBe(228);
  });

  it('knows which voice owns a target', () => {
    expect(voiceOfTarget(0)).toBe(0);
    expect(voiceOfTarget(1)).toBe(0); // sample rate (all voices) is automation-only
    expect(voiceOfTarget(184)).toBe(5);
  });

  it('keeps the same kind of target when the voice changes', () => {
    expect(retargetForVoice(idxOf('PAR_COARSE1'), 5)).toBe(idxOf('PAR_COARSE5'));
    expect(retargetForVoice(idxOf('PAR_PAN5'), 1)).toBe(idxOf('PAR_PAN1'));
    expect(retargetForVoice(idxOf('PAR_FILTER_FREQ_2'), 6)).toBe(idxOf('PAR_FILTER_FREQ_6'));
    expect(retargetForVoice(0, 3)).toBe(0);
  });

  it('turns the target off when the new voice has no equivalent', () => {
    // FM amount exists on drums 1-3 only
    expect(retargetForVoice(idxOf('PAR_FMAMNT1'), 4)).toBe(0);
    expect(retargetForVoice(idxOf('PAR_NOISE_FREQ1'), 1)).toBe(0);
  });

  it('maps every target to a gap index and back on its own voice', () => {
    for (let i = 2; i < modTargets.length; i++) {
      const v = voiceOfTarget(i);
      expect(gapIndex(i)).not.toBeNull();
      expect(retargetForVoice(i, v)).toBe(i);
    }
  });
});
