import { useKitModel, useKitState, useMidi, useMidiState } from './store';

export function confirmDiscard(model: ReturnType<typeof useKitModel>): boolean {
  const dirty = model.modifiedParams().length > 0 || model.isNameModified();
  return !dirty || window.confirm('The current kit has unsaved changes. Discard them?');
}

/** App bar: title, Kits and MIDI. */
export function Header({ onKits, onMidi }: { onKits: () => void; onMidi: () => void }) {
  const s = useMidiState();
  return (
    <header className="header">
      <div className="brand">
        Apothek <span>live companion for the LXR-02</span>
      </div>
      <nav className="appbar-buttons">
        <Transport />
        <button onClick={onKits}>Kits</button>
        <button onClick={onMidi} title="One-way: the app sends to the machine, the machine sends nothing back.">
          <span className={`status-dot${s.connected ? ' status-dot--on' : ''}`} aria-hidden="true" />
          MIDI{s.connected ? ' · live' : ''}
        </button>
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
  return (
    <button
      className={`transport${transport.running ? ' transport--on' : ''}`}
      onClick={() => (transport.running ? midi.stop() : midi.start())}
      disabled={fromMachine}
      aria-pressed={transport.running}
      title={
        fromMachine
          ? 'Playing, started on the machine: stop it there (MIDI cannot stop it).'
          : `${transport.running ? 'Stop' : 'Play'} the machine's sequencer (Space). Needs the machine's internal tempo and R in its MIDI RX filter.`
      }
    >
      <span aria-hidden="true">{transport.running ? '■' : '▶'}</span>
      {transport.running ? 'Stop' : 'Play'}
    </button>
  );
}
