// Live link from the kit model to a MIDI output (stock firmware, one-way).
import type { KitModel } from '../core/kitModel';
import { DEFAULT_MIDI_SETTINGS, kitToMidiMessages, MIDI_START, MIDI_STOP, MTC_KEEP_ALIVE, mtcStartMessages, paramToMidi, type MidiBytes, type MidiSettings } from '../core/midiMap';
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
  /** Sequencer state. `by` says who started it: the app (time code) or the machine's own play button. */
  transport: { running: boolean; by: 'app' | 'machine' | null };
}

// Time-code keep-alive: one frame every 40 ms, scheduled ahead with Web MIDI timestamps so a
// throttled background tab doesn't stop the machine. Stopping clears what is scheduled (Chromium);
// where MIDIOutput.clear() is missing, a shorter horizon keeps the stop delay small.
const KEEP_ALIVE_MS = 40;
const HORIZON_MS = 1500;
const HORIZON_NO_CLEAR_MS = 300;

const STORAGE_KEY = 'cauldron.midi';

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
      settings: { globalChannel: this.stored.settings?.globalChannel ?? DEFAULT_MIDI_SETTINGS.globalChannel },
      intervalMs: this.stored.intervalMs ?? 3,
      warning: null,
      skipped: [],
      transport: { running: false, by: null },
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

  /**
   * Connects to the LXR-02 (only its port can be used) and sends the app's whole kit, so the machine
   * plays exactly what the app shows. The machine can't be read, so this is the only way to match them.
   */
  connect(): void {
    if (!this.state.lxrPortId) return;
    this.queue.reset();
    this.set({ connected: true, lost: false });
    this.sendKit();
  }

  disconnect(): void {
    this.stopKeepAlive();
    this.set({ transport: { running: false, by: null } });
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

  /** Sends the whole current kit in the machine's own order (on connect and on every kit load). */
  private sendKit(): void {
    const burst = kitToMidiMessages(this.model.getState().current, this.state.settings);
    this.coalescer.clear();
    this.enqueue(burst.messages);
    if (this.output()) this.set({ skipped: burst.skipped });
  }

  /**
   * Starts the machine's sequencer with MIDI time code (works with its internal tempo).
   * Needs "R" (realtime) in the machine's RX filter.
   */
  start(): void {
    const out = this.output();
    if (!out || this.keepAlive) return;
    const now = performance.now();
    mtcStartMessages().forEach((m, i) => out.send(m as number[], now + i * 2));
    this.scheduledUntil = now + 16;
    this.scheduleKeepAlive();
    this.keepAlive = setInterval(() => this.scheduleKeepAlive(), 100);
    this.set({ transport: { running: true, by: 'app' } });
  }

  /** Stops time code; the machine stops when it notices (about 100 ms). */
  stop(): void {
    this.stopKeepAlive();
    // drop already scheduled frames; this also drops queued edits, which are only ms ahead
    this.output()?.clear?.();
    this.queue.reset();
    this.set({ transport: { running: false, by: null } });
  }

  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private scheduledUntil = 0;

  private scheduleKeepAlive(): void {
    const out = this.output();
    if (!out) return this.stopKeepAlive();
    const horizon = typeof out.clear === 'function' ? HORIZON_MS : HORIZON_NO_CLEAR_MS;
    const until = performance.now() + horizon;
    let t = Math.max(this.scheduledUntil + KEEP_ALIVE_MS, performance.now());
    for (; t <= until; t += KEEP_ALIVE_MS) out.send(MTC_KEEP_ALIVE as number[], t);
    this.scheduledUntil = t - KEEP_ALIVE_MS;
  }

  private stopKeepAlive(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  /** MIDI Start/Stop from the machine (sent when its sequencer starts or stops, "R" in its TX filter). */
  private onInput = (e: MIDIMessageEvent): void => {
    const status = e.data?.[0];
    if (status === MIDI_START) {
      this.set({ transport: { running: true, by: this.keepAlive ? 'app' : 'machine' } });
    } else if (status === MIDI_STOP) {
      // stopped on the machine (or our time code ran out): stop sending time code too
      this.stopKeepAlive();
      this.set({ transport: { running: false, by: null } });
    }
  };

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
    // listen to the machine's input port for its play state
    const input = [...this.access.inputs.values()].find(
      (i) => i.state === 'connected' && (i.name ?? '').toLowerCase().includes(LXR_PORT_NAME.toLowerCase()),
    );
    if (input && input.onmidimessage !== this.onInput) input.onmidimessage = this.onInput;
    if (this.state.connected && !lxrPortId) {
      // unplugged or switched off: back to the connect screen
      this.stopKeepAlive();
      this.state = { ...this.state, transport: { running: false, by: null } };
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
