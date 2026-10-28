// Live link from the kit model to a MIDI output (stock firmware, one-way).
import type { KitModel } from '../core/kitModel';
import { DEFAULT_MIDI_SETTINGS, kitToMidiMessages, loadKitSlotMessage, nextPatternMessage, paramToMidi, playVoiceMessages, type MidiBytes, type MidiSettings } from '../core/midiMap';
import { Emitter } from '../core/events';
import { Coalescer, SendQueue } from './queue';

export const LXR_PORT_NAME = 'Sonic Potions USB MIDI';

export type AccessState = 'unsupported' | 'idle' | 'requesting' | 'granted' | 'denied';

export interface MidiState {
  access: AccessState;
  outputs: { id: string; name: string }[];
  outputId: string | null;
  settings: MidiSettings;
  intervalMs: number;
  /** performance.now() time the last queued message leaves, for a progress hint. */
  busyUntil: number;
  /** Last parameter that could not be sent, with the reason. */
  warning: string | null;
  /** A kit was loaded in the app and not pushed to the machine since. */
  kitNotSent: boolean;
  /** Parameters of the last sent kit that could not be sent, with the reason. */
  skipped: { index: number; reason: string }[];
  /** Last voice played (1..7) and when, for button feedback. */
  played: { voice: number; at: number } | null;
}

const STORAGE_KEY = 'apothek.midi';

interface Stored {
  outputName?: string;
  settings?: MidiSettings;
  intervalMs?: number;
}

function loadStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

/** Next animation frame, or 50 ms if frames are paused (background tab), whichever comes first. */
function nextFrame(cb: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  requestAnimationFrame(run);
  setTimeout(run, 50);
}

export class LiveMidi {
  private access: MIDIAccess | null = null;
  private stored = loadStored();
  private state: MidiState;
  readonly changes = new Emitter<MidiState>();
  private queue: SendQueue;
  private coalescer: Coalescer;

  constructor(private model: KitModel) {
    const supported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
    this.state = {
      access: supported ? 'idle' : 'unsupported',
      outputs: [],
      outputId: null,
      settings: { ...DEFAULT_MIDI_SETTINGS, ...this.stored.settings },
      intervalMs: this.stored.intervalMs ?? 3,
      busyUntil: 0,
      warning: null,
      kitNotSent: false,
      skipped: [],
      played: null,
    };
    this.queue = new SendQueue((m, at) => this.output()?.send(m as number[], at), () => performance.now(), this.state.intervalMs);
    this.coalescer = new Coalescer((c) => this.sendChanges(c), nextFrame);
    // Edits are always live.
    model.paramChanges.subscribe((e) => {
      if (this.output() && e.source !== 'midi-in') this.coalescer.add(e.paramIndex, e.value);
    });
    // A newly loaded kit goes straight to the machine.
    model.kitLoaded.subscribe(() => {
      this.coalescer.clear();
      this.set({ kitNotSent: true, skipped: [] });
      if (this.output()) this.sendKit();
    });
  }

  getState = (): MidiState => this.state;
  subscribe = (l: () => void) => this.changes.subscribe(l);

  async connect(): Promise<void> {
    if (this.state.access === 'unsupported') return;
    this.set({ access: 'requesting' });
    try {
      // No SysEx: the stock firmware ignores it (phase 5 will ask for it).
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.refreshPorts();
      this.set({ access: 'granted' });
      this.refreshPorts();
    } catch {
      this.set({ access: 'denied' });
    }
  }

  selectOutput(id: string | null): void {
    this.output()?.clear?.();
    this.queue.reset();
    const name = this.state.outputs.find((o) => o.id === id)?.name;
    this.stored.outputName = name;
    this.set({ outputId: id });
  }

  setSettings(settings: MidiSettings): void {
    this.stored.settings = settings;
    this.set({ settings });
  }

  setInterval(ms: number): void {
    this.queue.intervalMs = ms;
    this.stored.intervalMs = ms;
    this.set({ intervalMs: ms });
  }

  /** Sends the whole current kit in the machine's own order. Returns parameters that were skipped. */
  sendKit(): { index: number; reason: string }[] {
    const burst = kitToMidiMessages(this.model.getState().current, this.state.settings);
    this.coalescer.clear();
    this.enqueue(burst.messages);
    if (this.output()) this.set({ kitNotSent: false, skipped: burst.skipped });
    return burst.skipped;
  }

  /** Plays a voice (1..7) with a MIDI note on its channel. */
  play(voice: number, velocity = 110): void {
    this.enqueue(playVoiceMessages(voice, velocity, this.state.settings));
    this.set({ played: { voice, at: performance.now() } });
  }

  /** Cancels messages not sent yet (Chrome's MIDIOutput.clear). */
  cancel(): void {
    this.output()?.clear?.();
    this.queue.reset();
    this.set({ busyUntil: 0 });
  }

  loadKitSlot(slot: number): void {
    this.enqueue([loadKitSlotMessage(slot, this.state.settings)]);
  }

  nextPattern(pattern: number): void {
    this.enqueue([nextPatternMessage(pattern, this.state.settings)]);
  }

  private sendChanges(changes: [number, number][]): void {
    let warning: string | null = null;
    for (const [i, v] of changes) {
      const r = paramToMidi(i, v, this.state.settings);
      if (r.ok) this.enqueue(r.messages);
      else warning = r.reason;
    }
    if (warning !== this.state.warning) this.set({ warning });
  }

  private enqueue(messages: readonly MidiBytes[]): void {
    if (!this.output() || !messages.length) return;
    const until = this.queue.enqueue(messages);
    this.set({ busyUntil: until });
  }

  private output(): MIDIOutput | null {
    if (!this.access || !this.state.outputId) return null;
    const o = this.access.outputs.get(this.state.outputId);
    return o && o.state === 'connected' ? o : null;
  }

  private refreshPorts(): void {
    if (!this.access) return;
    const outputs = [...this.access.outputs.values()]
      .filter((o) => o.state === 'connected')
      .map((o) => ({ id: o.id, name: o.name ?? o.id }));
    let outputId = this.state.outputId;
    if (!outputs.some((o) => o.id === outputId)) {
      const wanted = this.stored.outputName;
      outputId =
        outputs.find((o) => wanted && o.name === wanted)?.id ??
        outputs.find((o) => o.name.toLowerCase().includes(LXR_PORT_NAME.toLowerCase()))?.id ??
        null;
    }
    this.set({ outputs, outputId });
  }

  private set(patch: Partial<MidiState>): void {
    this.state = { ...this.state, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stored));
    } catch {
      // storage unavailable: settings last for this session only
    }
    this.changes.emit(this.state);
  }
}
