// Sending discipline, kept free of Web MIDI so it can be tested:
// - Coalescer: UI value changes are merged per animation frame, last value wins per parameter.
// - SendQueue: messages leave at least `intervalMs` apart (Web MIDI timestamps), so the
//   machine's input buffer is not overrun during a kit burst.
import type { MidiBytes } from '../core/midiMap';

export class SendQueue {
  private lastAt = -Infinity;

  constructor(
    private send: (bytes: MidiBytes, at: number) => void,
    private now: () => number,
    public intervalMs = 3,
  ) {}

  /** Schedules messages in order. Returns the time the last one goes out. */
  enqueue(messages: readonly MidiBytes[]): number {
    for (const m of messages) {
      const at = Math.max(this.now(), this.lastAt + this.intervalMs);
      this.send(m, at);
      this.lastAt = at;
    }
    return this.lastAt;
  }

  /** Forget the schedule (after the port's pending messages were cleared). */
  reset(): void {
    this.lastAt = -Infinity;
  }

  busyUntil(): number {
    return this.lastAt;
  }
}

export class Coalescer {
  private pending = new Map<number, number>();
  private scheduled = false;

  constructor(
    private flush: (changes: [number, number][]) => void,
    private requestFrame: (cb: () => void) => void,
  ) {}

  add(paramIndex: number, value: number): void {
    // re-insert so the flush order follows the latest edits
    this.pending.delete(paramIndex);
    this.pending.set(paramIndex, value);
    if (!this.scheduled) {
      this.scheduled = true;
      this.requestFrame(() => this.run());
    }
  }

  clear(): void {
    this.pending.clear();
  }

  private run(): void {
    this.scheduled = false;
    const changes = [...this.pending.entries()];
    this.pending.clear();
    if (changes.length) this.flush(changes);
  }
}
