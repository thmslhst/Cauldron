// The editable kit. Pure state plus events: every parameter change goes out as a
// ParamChange, which the UI and (later) the MIDI output subscribe to.
import { Emitter, type ParamChange } from './events';
import { diffParams, parseKit, withName, withParam, type Kit } from './kit';
import { isSendableTarget, PAR_TARGET_LFO1, PAR_VOICE_LFO1, retargetForVoice } from './modTargets';
import initKitJson from '../schema/initKit.json';

export interface KitState {
  /** The kit as loaded (the "Revert" target). */
  readonly original: Kit;
  readonly current: Kit;
  /** Where it came from, for display: a file name, "init kit", ... */
  readonly origin: string;
  /** SD slot it was loaded from, if any. */
  readonly slot: number | null;
}

/** The firmware's init kit (initKit.c), as a 255-byte kit. Parameters missing from the 254-byte table are 0. */
export function initKit(): Kit {
  return parseKit(new Uint8Array(initKitJson.bytes));
}

export class KitModel {
  private state: KitState;
  readonly paramChanges = new Emitter<ParamChange>();
  /** Fires after any state change (for UI re-rendering). */
  readonly stateChanges = new Emitter<KitState>();
  /** Fires when a whole kit is loaded or reverted (MIDI will push it as a burst). */
  readonly kitLoaded = new Emitter<Kit>();

  constructor(kit: Kit = initKit(), origin = 'init kit') {
    this.state = { original: kit, current: kit, origin, slot: null };
  }

  getState = (): KitState => this.state;

  subscribe = (listener: () => void): (() => void) => this.stateChanges.subscribe(listener);

  load(kit: Kit, origin: string, slot: number | null = null): void {
    this.state = { original: kit, current: kit, origin, slot };
    this.stateChanges.emit(this.state);
    this.kitLoaded.emit(kit);
  }

  /**
   * Sets one parameter. Changing an LFO's destination voice also moves its target to the same kind
   * on the new voice, as the machine does. The app is live-first, so if that target can't be sent
   * over MIDI the target is turned off instead.
   */
  setParam(paramIndex: number, value: number, source = 'ui'): void {
    const changes: [number, number][] = [[paramIndex, value]];
    const lfo = paramIndex - PAR_VOICE_LFO1;
    if (lfo >= 0 && lfo < 6) {
      const targetIdx = PAR_TARGET_LFO1 + lfo;
      const t = retargetForVoice(this.state.current.params[targetIdx]!, value);
      changes.push([targetIdx, isSendableTarget(t) ? t : 0]);
    }
    this.apply(changes, source);
  }

  setName(name: string): void {
    this.state = { ...this.state, current: withName(this.state.current, name) };
    this.stateChanges.emit(this.state);
  }

  revertParam(paramIndex: number, source = 'ui'): void {
    this.apply([[paramIndex, this.state.original.params[paramIndex]!]], source);
  }

  /** Back to the loaded kit. Emits a ParamChange per reverted parameter, so a live MIDI link follows. */
  revert(source = 'ui'): void {
    const { original, current } = this.state;
    const changes = diffParams(current, original).map((i): [number, number] => [i, original.params[i]!]);
    this.state = { ...this.state, current: { ...current, name: original.name } };
    this.apply(changes, source);
    this.stateChanges.emit(this.state);
  }

  /** Marks the current kit as saved: it becomes the new revert point. */
  markSaved(origin: string, slot: number | null = this.state.slot): void {
    this.state = { ...this.state, original: this.state.current, origin, slot };
    this.stateChanges.emit(this.state);
  }

  modifiedParams(): number[] {
    return diffParams(this.state.original, this.state.current);
  }

  isNameModified(): boolean {
    const a = this.state.original.name;
    const b = this.state.current.name;
    return a.some((v, i) => v !== b[i]);
  }

  private apply(changes: [number, number][], source: string): void {
    let kit = this.state.current;
    const emitted: ParamChange[] = [];
    for (const [i, v] of changes) {
      if (kit.params[i] === v) continue;
      kit = withParam(kit, i, v);
      emitted.push({ paramIndex: i, value: v, source });
    }
    if (!emitted.length) return;
    this.state = { ...this.state, current: kit };
    for (const e of emitted) this.paramChanges.emit(e);
    this.stateChanges.emit(this.state);
  }
}
