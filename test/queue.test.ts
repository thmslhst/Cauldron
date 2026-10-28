import { describe, expect, it } from 'vitest';
import { Coalescer, SendQueue } from '../src/midi/queue';

describe('SendQueue', () => {
  it('spaces messages by the interval and keeps order', () => {
    const sent: [number[], number][] = [];
    let now = 100;
    const q = new SendQueue((m, at) => sent.push([[...m], at]), () => now, 3);
    q.enqueue([[1], [2], [3]]);
    expect(sent.map((s) => s[1])).toEqual([100, 103, 106]);
    now = 101; // still busy: continues after the last one
    q.enqueue([[4]]);
    expect(sent.at(-1)).toEqual([[4], 109]);
    now = 500; // idle: sends immediately
    expect(q.enqueue([[5]])).toBe(500);
  });
});

describe('Coalescer', () => {
  it('keeps the last value per parameter within a frame', () => {
    const frames: (() => void)[] = [];
    const flushed: [number, number][][] = [];
    const c = new Coalescer((ch) => flushed.push(ch), (cb) => frames.push(cb));
    c.add(10, 1);
    c.add(11, 5);
    c.add(10, 2);
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(flushed).toEqual([[[11, 5], [10, 2]]]);
    c.add(10, 3);
    expect(frames).toHaveLength(2);
  });
});
