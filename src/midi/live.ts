// Live link from the kit model to a MIDI output (stock firmware, one-way).
import type { KitModel } from '../core/kitModel';
import { DEFAULT_MIDI_SETTINGS, kitToMidiMessages, paramToMidi, playVoiceMessages, type MidiBytes, type MidiSettings } from '../core/midiMap';
import { Emitter } from '../core/events';
import { Coalescer, SendQueue } from './queue';

export const LXR_PORT_NAME = 'Sonic Potions USB MIDI';

export type AccessState = 'unsupported' | 'idle' | 'requesting' | 'granted' | 'denied';

export interface MidiState {
  access: AccessState;
  /** The LXR-02's output port, when it is plugged in. */
  lxrPortId: string | null;
  /** Connected to the LXR-02: edits are sent. */
  connected: boolean;
  /** The machine disappeared while connected (unplugged, switched off). */
  lost: boolean;
  settings: MidiSettings;
  intervalMs: number;
  /** Last parameter that could not be sent, with the reason. */
  warning: string | null;
  /** Parameters of the last sent kit that could not be sent, with the reason. */
  skipped: { index: number; reason: string }[];
  /** Last voice played (1..7) and when, for button feedback. */
  played: { voice: number; at: number } | null;
}

const STORAGE_KEY = 'apothek.midi';

interface Stored {
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
      lxrPortId: null,
      connected: false,
      lost: false,
      settings: { ...DEFAULT_MIDI_SETTINGS, ...this.stored.settings },
      intervalMs: this.stored.intervalMs ?? 3,
      warning: null,
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
      this.set({ skipped: [] });
      if (this.output()) this.sendKit();
    });
  }

  getState = (): MidiState => this.state;
  subscribe = (l: () => void) => this.changes.subscribe(l);

  /** If MIDI access was already granted to this site, gets it without a prompt. */
  async init(): Promise<void> {
    if (this.state.access !== 'idle') return;
    try {
      const p = await navigator.permissions.query({ name: 'midi' as PermissionName });
      if (p.state === 'granted') await this.requestAccess();
    } catch {
      // permissions API without "midi": wait for the user to click
    }
  }

  /** Asks the browser for MIDI access (a permission prompt the first time). No SysEx: the stock firmware ignores it. */
  async requestAccess(): Promise<void> {
    if (this.state.access === 'unsupported' || this.access) return;
    this.set({ access: 'requesting' });
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.refreshPorts();
      this.set({ access: 'granted' });
      this.refreshPorts();
    } catch {
      this.set({ access: 'denied' });
    }
  }

  /** Connects to the LXR-02. Only its port can be used. Nothing is sent until you edit or load a kit. */
  connect(): void {
    if (!this.state.lxrPortId) return;
    this.queue.reset();
    this.set({ connected: true, lost: false });
  }

  disconnect(): void {
    this.coalescer.clear();
    this.output()?.clear?.();
    this.queue.reset();
    this.set({ connected: false, lost: false });
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
    if (this.output()) this.set({ skipped: burst.skipped });
    return burst.skipped;
  }

  /** Plays a voice (1..7) with a MIDI note on its channel. */
  play(voice: number, velocity = 110): void {
    this.enqueue(playVoiceMessages(voice, velocity, this.state.settings));
    this.set({ played: { voice, at: performance.now() } });
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
    this.queue.enqueue(messages);
  }

  private output(): MIDIOutput | null {
    if (!this.access || !this.state.connected || !this.state.lxrPortId) return null;
    const o = this.access.outputs.get(this.state.lxrPortId);
    return o && o.state === 'connected' ? o : null;
  }

  private refreshPorts(): void {
    if (!this.access) return;
    const lxr = [...this.access.outputs.values()].find(
      (o) => o.state === 'connected' && (o.name ?? '').toLowerCase().includes(LXR_PORT_NAME.toLowerCase()),
    );
    const lxrPortId = lxr?.id ?? null;
    if (this.state.connected && !lxrPortId) {
      // unplugged or switched off: back to the connect screen
      this.coalescer.clear();
      this.queue.reset();
      this.set({ lxrPortId, connected: false, lost: true });
    } else {
      this.set({ lxrPortId });
    }
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
