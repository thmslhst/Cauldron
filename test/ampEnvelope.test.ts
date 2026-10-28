import { describe, expect, it } from 'vitest';
import {
  ATTACK_SHARE,
  attackEndX,
  attackSeconds,
  decayEndX,
  decaySeconds,
  egIncrement,
  egShape,
  egSlope,
  EG_STEP_SECONDS,
  envelopePoints,
  formatSeconds,
} from '../src/core/ampEnvelope';

// Literal port of slopeEg2_trigger + slopeEg2_calc (SlopeEg2.c), one call per step.
function firmwareSteps(p: { attack: number; decay: number; slope: number; repeat: number }, n: number): number[] {
  const attack = egIncrement(p.attack, (2 * 0.99) / 0.01);
  const decay = egIncrement(p.decay, (2 * 0.999) / 0.001);
  const { slope, invSlope } = egSlope(p.slope);
  const f = (v: number, k: number) => ((1 + k) * v) / (1 + k * Math.abs(v));
  let value = 0;
  let state: 'A' | 'D' | 'R' | 'S' = p.repeat ? 'R' : 'A';
  if (p.repeat) value = 1;
  let repeatCnt = p.repeat;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let r = 0;
    if (state === 'R') {
      if (value > 0) value -= attack;
      else if (--repeatCnt > 0) value = 1;
      else {
        state = 'D';
        value = 1;
      }
      r = f(value, slope);
    } else if (state === 'A') {
      value += attack;
      if (value >= 1) {
        value = 1;
        state = 'D';
      }
      r = f(value, invSlope);
    } else if (state === 'D') {
      if (value > 0) {
        value -= decay;
        r = f(value, slope);
      } else value = 0;
    }
    out.push(Math.max(0, r));
  }
  return out;
}

/** Steps the firmware spends before the level first reaches 1 (attack), and from there to 0 (decay). */
function firmwarePhases(attack: number, decay: number): { attack: number; decay: number } {
  const steps = firmwareSteps({ attack, decay, slope: 64, repeat: 0 }, 200000);
  const peak = steps.indexOf(1) + 1;
  const end = steps.findIndex((v, i) => i >= peak && v <= 0) + 1;
  return { attack: peak, decay: end - peak };
}

describe('segment times', () => {
  it.each([0, 1, 16, 40, 64, 90, 110])('match the firmware step count at %i', (v) => {
    const f = firmwarePhases(v, v);
    expect(attackSeconds(v)).toBeCloseTo(f.attack * EG_STEP_SECONDS, 9);
    expect(decaySeconds(v)).toBeCloseTo(f.decay * EG_STEP_SECONDS, 9);
  });

  it('never end at 127', () => {
    expect(attackSeconds(127)).toBe(Infinity);
    expect(decaySeconds(127)).toBe(Infinity);
  });

  it('grow with the value', () => {
    const a = [0, 32, 64, 96, 126].map(attackSeconds);
    const d = [0, 32, 64, 96, 126].map(decaySeconds);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    expect([...d].sort((x, y) => x - y)).toEqual(d);
  });
});

describe('envelopePoints', () => {
  const at = (pts: [number, number][], x: number) => pts.find(([px]) => px >= x - 1e-9)![1];

  it('places segment ends in proportion to the raw values', () => {
    expect(attackEndX(0)).toBe(0);
    expect(attackEndX(127)).toBe(ATTACK_SHARE);
    expect(decayEndX(127, 127)).toBe(1);
    expect(decayEndX(0, 127 / 2)).toBeCloseTo((1 - ATTACK_SHARE) / 2);
  });

  it('rises over the attack, falls over the decay, with the firmware shape', () => {
    const p = { attack: 64, decay: 64, slope: 30, repeat: 0 };
    const pts = envelopePoints(p, 1000);
    const { slope, invSlope } = egSlope(30);
    const ax = attackEndX(64);
    const dx = decayEndX(64, 64);
    expect(pts[0]).toEqual([0, 0]);
    expect(at(pts, ax / 2)).toBeCloseTo(egShape(0.5, invSlope), 2);
    expect(at(pts, ax)).toBeCloseTo(1);
    expect(at(pts, (ax + dx) / 2)).toBeCloseTo(egShape(0.5, slope), 2);
    expect(at(pts, dx)).toBeCloseTo(0);
    expect(pts[pts.length - 1]).toEqual([1, 0]);
  });

  it('draws one fall per repeat, then the decay', () => {
    const pts = envelopePoints({ attack: 60, decay: 40, slope: 64, repeat: 3 }, 1000);
    const tops = pts.filter(([, y]) => y === 1).length;
    expect(pts[0]![1]).toBe(1);
    expect(tops).toBe(4); // three repeats plus the decay start
  });

  it('draws 127 as the slowest segment, filling its whole width', () => {
    const pts = envelopePoints({ attack: 127, decay: 127, slope: 64, repeat: 0 }, 1000);
    expect(at(pts, ATTACK_SHARE)).toBeCloseTo(1);
    expect(at(pts, ATTACK_SHARE / 2)).toBeGreaterThan(0);
    expect(at(pts, (1 + ATTACK_SHARE) / 2)).toBeLessThan(1);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0);
  });
});

describe('formatSeconds', () => {
  it('formats seconds', () => {
    expect(formatSeconds(0.05)).toBe('50 ms');
    expect(formatSeconds(2)).toBe('2 s');
    expect(formatSeconds(1.5)).toBe('1.5 s');
    expect(formatSeconds(20)).toBe('20 s');
    expect(formatSeconds(Infinity)).toBe('∞');
  });
});
