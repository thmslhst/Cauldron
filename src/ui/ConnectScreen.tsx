import { useRef, useState } from 'react';
import { KitFormatError, parseKit } from '../core/kit';
import { groupKits } from '../core/kitLibrary';
import { initKit } from '../core/kitModel';
import { readBytes } from '../files/files';
import { LXR_PORT_NAME } from '../midi/live';
import { confirmDiscard } from './Header';
import { useKitModel, useKitState, useMidi, useMidiState } from './store';

/** Shown until the app is connected to the LXR-02, like a login page. */
export function ConnectScreen() {
  const midi = useMidi();
  const s = useMidiState();

  let body: React.ReactNode;
  if (s.access === 'unsupported') {
    body = <p>This browser has no Web MIDI. Use Chrome, Edge or Firefox (not Safari).</p>;
  } else if (s.access === 'idle' || s.access === 'requesting') {
    body = (
      <>
        <p>Cauldron talks to the machine over USB MIDI. Allow MIDI access to look for it.</p>
        <button className="primary big" onClick={() => void midi.requestAccess()} disabled={s.access === 'requesting'}>
          {s.access === 'requesting' ? 'Waiting for permission…' : 'Allow MIDI access'}
        </button>
      </>
    );
  } else if (s.access === 'denied') {
    body = <p className="error-text">The browser refused MIDI access. Allow MIDI for this site in the browser's site settings, then reload the page.</p>;
  } else if (!s.lxrPortId) {
    body = (
      <>
        <p className="waiting">
          <span className="pulse" aria-hidden="true" /> Waiting for the LXR-02…
        </p>
        <p className="muted">Connect it by USB and switch it on. It shows up as “{LXR_PORT_NAME}”.</p>
      </>
    );
  } else {
    body = (
      <>
        <div className="device">
          <span className="device__dot" aria-hidden="true" />
          {LXR_PORT_NAME}
        </div>
        <StartingKit />
      </>
    );
  }

  return (
    <div className="connect">
      <div className="connect__card">
        <h1>
          Cauldron <span>Sound editor for the LXR-02</span>
        </h1>
        {s.lost && <p className="hint">The connection to the machine was lost.</p>}
        {body}
      </div>
    </div>
  );
}

/**
 * Connect = pick the kit to start from, then send it whole. The machine can't be read, so this is
 * what makes it play exactly what the app shows (and what a save then keeps).
 */
function StartingKit() {
  const midi = useMidi();
  const model = useKitModel();
  const { origin } = useKitState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const changes = model.modifiedParams().length;
  const isInit = origin === 'init kit' && changes === 0;

  const startFrom = (load: () => void) => {
    if (!confirmDiscard(model)) return;
    load();
    midi.connect();
  };

  const openFile = async (file: File) => {
    try {
      const kit = parseKit(await readBytes(file));
      startFrom(() => model.load(kit, file.name, groupKits([file.name])[0]?.kits[0]?.slot ?? null));
    } catch (e) {
      setError(e instanceof KitFormatError ? `${file.name}: ${e.message}` : `Could not read ${file.name}`);
    }
  };

  return (
    <>
      <div className="start-kits">
        <button className="primary big" onClick={() => midi.connect()}>
          {isInit ? 'New kit' : 'Open last kit'}
        </button>
        {!isInit && (
          <button className="big" onClick={() => startFrom(() => model.load(initKit(), 'init kit'))}>
            New kit
          </button>
        )}
        <button className="big" onClick={() => fileInput.current?.click()}>
          Open a kit file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".snd,.SND"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void openFile(f);
          }}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <p className="hint">This replaces the sound on the machine. Save it there first if you want to keep it.</p>
      <p className="muted small">The machine's MIDI RX filter must include C (control changes).</p>
    </>
  );
}
