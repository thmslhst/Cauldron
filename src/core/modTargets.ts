// Modulation target rules. Mirrors Cc2Text.c (getModTargetGapIndex, getModTargetIdxFromGapIdx,
// voiceFromModTargValue) and the range limits in menu.c menu_encoderChangeParameter.
import { modTargetGapMap, modTargetVoiceRanges, paramIndex } from './schema';

export const PAR_VOICE_LFO1 = paramIndex('PAR_VOICE_LFO1');
export const PAR_TARGET_LFO1 = paramIndex('PAR_TARGET_LFO1');
export const PAR_VEL_DEST_1 = paramIndex('PAR_VEL_DEST_1');

/** The modTargets indices a voice (1..6) can target, plus 0 ("off"). */
export function targetsForVoice(voice: number): number[] {
  const r = modTargetVoiceRanges[voice - 1];
  if (!r) throw new RangeError(`voice must be 1..6, got ${voice}`);
  const out = [0];
  for (let i = r.start; i <= r.end; i++) out.push(i);
  return out;
}

/** voiceFromModTargValue: 1-based voice owning a modTargets index, or 0. */
export function voiceOfTarget(index: number): number {
  const r = modTargetVoiceRanges.find((v) => index >= v.start && index <= v.end);
  return r ? r.voice : 0;
}

/** getModTargetGapIndex: the logical slot of a target, shared across voices. null = off/invalid. */
export function gapIndex(index: number): number | null {
  const voice = voiceOfTarget(index);
  if (!voice) return null;
  const offset = index - modTargetVoiceRanges[voice - 1]!.start;
  const bit = 6 - voice;
  let ctr = 0;
  for (let i = 0; i < modTargetGapMap.length; i++) {
    if ((modTargetGapMap[i]! >> bit) & 1) {
      if (ctr === offset) return i;
      ctr++;
    }
  }
  return null;
}

/** getModTargetIdxFromGapIdx: the same logical target on another voice (1..6), or 0 if it has none. */
export function targetFromGapIndex(voice: number, gap: number | null): number {
  if (gap === null) return 0;
  const bit = 6 - voice;
  if (!((modTargetGapMap[gap]! >> bit) & 1)) return 0;
  let ctr = 0;
  for (let i = 0; i < gap; i++) if ((modTargetGapMap[i]! >> bit) & 1) ctr++;
  return modTargetVoiceRanges[voice - 1]!.start + ctr;
}

/**
 * When an LFO's destination voice changes, the machine keeps the same kind of target on the
 * new voice (menu.c DTYPE_VOICE_LFO, "LFOTARGFIX"). Returns the new target index.
 */
export function retargetForVoice(currentTarget: number, newVoice: number): number {
  return targetFromGapIndex(newVoice, gapIndex(currentTarget));
}
