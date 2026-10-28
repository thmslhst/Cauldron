// The amp envelope of a voice, as the firmware computes it (SlopeEg2.c), so the UI can draw it.
// Pure: raw parameter bytes in, envelope values out.

/**
 * The envelope advances one step per audio block: mixer_calcNextSampleBlock runs the voices'
 * calcAsync (which calls slopeEg2_calc) once per OUTPUT_DMA_SIZE (64) frames at REAL_FS (44140 Hz).
 * TODO verify on hardware: times derived from the code, not measured.
 */
export const EG_STEP_SECONDS = 64 / 44140;

const TIME_K_ATTACK = (2 * 0.99) / (1 - 0.99);
const TIME_K_DECAY = (2 * 0.999) / (1 - 0.999);

/** slopeEg2_calcTime with USE_BIG_SAMPLE_BUFFER: the increment per step for a 0..127 time value. */
export function egIncrement(data2: number, k: number): number {
  const val = data2 / 127;
  const ret = (1 - ((1 + k) * val) / (1 + k * Math.abs(val))) * 2;
  return ret > 1 ? 1 : ret;
}

/** slopeEg2_setSlope: the curve factor for a 0..127 slope value (and its inverse, used by the attack). */
export function egSlope(data2: number): { slope: number; invSlope: number } {
  const amount = Math.fround((Math.fround(data2 / 127) - 0.5) * Math.fround(1.999));
  return { slope: (2 * amount) / (1 - amount), invSlope: (2 * -amount) / (1 + amount) };
}

/** slopeEg2_calcSlopeValue: the output level for a linear phase value v (0..1) and a slope factor. */
export function egShape(v: number, k: number): number {
  return ((1 + k) * v) / (1 + k * Math.abs(v));
}

export interface AmpEnvelopeParams {
  /** PAR_VELOAn. With repeat on, the firmware uses it as the decay time of each repeat. */
  attack: number;
  /** PAR_VELODn (or the hi-hat's closed/open decay). */
  decay: number;
  /** PAR_VOL_SLOPEn */
  slope: number;
  /** PAR_REPEATn (snare and clap only), else 0. */
  repeat: number;
}

/** Share of the graph's width the attack (or the repeats) takes at value 127; the decay gets the rest. */
export const ATTACK_SHARE = 0.3;

/** x (0..1) where the attack (or the repeats) ends: proportional to its 0..127 value, like the slider. */
export function attackEndX(attack: number): number {
  return (attack / 127) * ATTACK_SHARE;
}

/** x (0..1) where the decay ends, after the attack. */
export function decayEndX(attack: number, decay: number): number {
  return attackEndX(attack) + (decay / 127) * (1 - ATTACK_SHARE);
}

/**
 * Points [x, level] (both 0..1) of the envelope for drawing. Each segment's width follows its 0..127
 * value, not its time (times run from 1 ms to never-ending, see attackSeconds/decaySeconds); within a
 * segment the shape is the firmware's (slopeEg2_calc: the phase moves linearly, the slope bends it).
 * At 127 the firmware's segment never ends (its step is 0); it is still drawn as the slowest one,
 * filling its whole width, and the times label says so.
 */
export function envelopePoints(p: AmpEnvelopeParams, samples = 300): [number, number][] {
  const { slope, invSlope } = egSlope(p.slope);
  const ax = attackEndX(p.attack);
  const dx = decayEndX(p.attack, p.decay);
  const pts: [number, number][] = [];
  const segment = (x0: number, x1: number, level: (u: number) => number) => {
    const n = Math.max(1, Math.ceil((x1 - x0) * samples));
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, level(i / n)]);
  };

  if (!p.repeat) segment(0, ax, (u) => egShape(u, invSlope));
  else {
    const w = ax / p.repeat;
    for (let r = 0; r < p.repeat; r++) segment(r * w, (r + 1) * w, (u) => egShape(1 - u, slope));
  }
  segment(ax, dx, (u) => egShape(1 - u, slope));
  if (dx < 1) pts.push([1, 0]);
  return pts;
}

export function formatSeconds(s: number): string {
  if (!Number.isFinite(s)) return '∞';
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  return `${s < 10 ? s.toFixed(2).replace(/\.?0+$/, '') : Math.round(s)} s`;
}

/** Seconds the attack takes to reach full level (PAR_VELOAn); Infinity at 127, where it never rises. */
export function attackSeconds(raw: number): number {
  const a = egIncrement(raw, TIME_K_ATTACK);
  return a > 0 ? Math.ceil(1 / a) * EG_STEP_SECONDS : Infinity;
}

/** Seconds a decay (PAR_VELODn) takes from full level to 0; Infinity at 127, where it holds. */
export function decaySeconds(raw: number): number {
  const d = egIncrement(raw, TIME_K_DECAY);
  return d > 0 ? Math.ceil(1 / d) * EG_STEP_SECONDS : Infinity;
}
