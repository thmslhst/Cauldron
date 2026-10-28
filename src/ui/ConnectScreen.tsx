import { LXR_PORT_NAME } from '../midi/live';
import { useMidi, useMidiState } from './store';

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
        <p>Apothek talks to the machine over USB MIDI. Allow MIDI access to look for it.</p>
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
        <button className="primary big" onClick={() => midi.connect()}>
          Connect
        </button>
      </>
    );
  }

  return (
    <div className="connect">
      <div className="connect__card">
        <h1>
          Apothek <span>live companion for the LXR-02</span>
        </h1>
        {s.lost && <p className="hint">The connection to the machine was lost.</p>}
        {body}
      </div>
    </div>
  );
}
