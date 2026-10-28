// Parameter changes are plain events. The kit model emits them; the UI and the
// MIDI output subscribe. Later, incoming MIDI/SysEx will produce the same events.

export interface ParamChange {
  readonly paramIndex: number;
  readonly value: number;
  /** Where the change came from, so a subscriber can ignore its own echoes. */
  readonly source: string;
}

export type Listener<T> = (event: T) => void;

export class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: T): void {
    for (const l of this.listeners) l(event);
  }
}
