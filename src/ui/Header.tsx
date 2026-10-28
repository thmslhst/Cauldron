import { useKitModel, useKitState, useMidi, useMidiState } from './store';

export function confirmDiscard(model: ReturnType<typeof useKitModel>): boolean {
  const dirty = model.modifiedParams().length > 0 || model.isNameModified();
  return !dirty || window.confirm('The current kit has unsaved changes. Discard them?');
}

/** App bar: title, Load kits, Save kit, MIDI and play/stop. */
export function Header({ onLoad, onSave, onMidi }: { onLoad: () => void; onSave: () => void; onMidi: () => void }) {
  const s = useMidiState();
  return (
    <header className="header">
      <div className="brand">
        Apothek-02 <span>Sound editor for the LXR-02</span>
      </div>
      <nav className="appbar-buttons">
        <button onClick={onLoad}>Load kits</button>
        <button onClick={onSave}>Save kit</button>
        <button onClick={onMidi} title={s.connected ? 'Connected to the LXR-02. One-way: the app sends, the machine sends nothing back.' : 'Not connected'}>
          MIDI
        </button>
        <Transport />
      </nav>
    </header>
  );
}

/** Changed-parameter count and Revert all, shown at the end of the tab row. */
export function ChangesBar() {
  const model = useKitModel();
  useKitState(); // re-render on change
  const modified = model.modifiedParams().length;
  return (
    <div className={`changes${modified ? ' changes--on' : ''}`}>
      {modified ? `${modified} parameter${modified === 1 ? '' : 's'} changed` : 'No changes'}
      <button disabled={!modified} onClick={() => model.revert()}>
        Revert all
      </button>
    </div>
  );
}

/**
 * Play/stop for the machine's sequencer (MIDI time code, see LiveMidi.start). Space toggles it.
 * If the sequencer was started on the machine, MIDI can't stop it: stop it there.
 */
function Transport() {
  const midi = useMidi();
  const { transport } = useMidiState();
  const fromMachine = transport.running && transport.by === 'machine';
  const label = transport.running ? 'Stop' : 'Play';
  return (
    <button
      className={`transport transport--${transport.running ? 'stop' : 'play'}`}
      aria-label={label}
      onClick={() => (transport.running ? midi.stop() : midi.start())}
      disabled={fromMachine}
      aria-pressed={transport.running}
      title={
        fromMachine
          ? 'Playing, started on the machine: stop it there (MIDI cannot stop it).'
          : `${label} the machine's sequencer (Space). Needs the machine's internal tempo and R in its MIDI RX filter.`
      }
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        {transport.running ? <rect x="3" y="3" width="10" height="10" rx="1.5" /> : <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7z" />}
      </svg>
    </button>
  );
}
