import { paramDef } from '../core/schema';
import { LXR_PORT_NAME } from '../midi/live';
import { VOICE_NAMES } from './labels';
import { targetLabel } from './ParamControl';
import { useKitState, useMidi, useMidiState } from './store';

const channelSelect = (v: number, onChange: (n: number) => void, label: string) => (
  <select value={v} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
    {Array.from({ length: 16 }, (_, i) => (
      <option key={i} value={i + 1}>
        {i + 1}
      </option>
    ))}
  </select>
);

/** The MIDI tab: connection, channel, timing. */
export function MidiPage() {
  const midi = useMidi();
  const s = useMidiState();
  const set = midi.setSettings.bind(midi);

  return (
    <div className="midi-page">
      <section className="card">
        <h3>Connection</h3>
        <div className="device">
          <span className="device__dot" aria-hidden="true" />
          {LXR_PORT_NAME} · live
          <button onClick={() => midi.disconnect()}>Disconnect</button>
        </div>
        {s.warning && <p className="error-text">Not sent: {s.warning}</p>}
      </section>

      <section className="card">
        <h3>Global channel</h3>
        <label className="inline-field">
          Channel {channelSelect(s.settings.globalChannel, (n) => set({ ...s.settings, globalChannel: n }), 'Global MIDI channel')}
        </label>
        <p className="muted small">Must match the machine's global MIDI channel (global settings). Parameters are sent on it, which the machine always accepts.</p>
      </section>

      <section className="card">
        <h3>Advanced</h3>
        <label className="inline-field">
          Gap between messages
          <input type="number" min={0} max={50} value={s.intervalMs} onChange={(e) => midi.setInterval(Math.min(50, Math.max(0, Number(e.target.value))))} /> ms
        </label>
        <p className="muted small">Raise it if values go missing when a kit is sent.</p>
      </section>

      <section className="card">
        <h3>Good to know</h3>
        <ul className="notes small">
          <li>
            The machine's MIDI RX filter must include <b>C</b> (control changes). The default, “all”, does.
          </li>
          <li>One-way: the machine sends nothing back. Turning its knobs doesn't update the app, and the app can't read the machine's kit.</li>
          <li>Until you load a kit here, the app shows its init kit, not what the machine plays.</li>
          <li>Sent values land in the machine's edit buffer. Save the kit on the machine to keep them; name it there, the name can't be sent over MIDI.</li>
        </ul>
      </section>
    </div>
  );
}

/** Parameters of the loaded kit the machine could not receive (LFO/velocity targets above parameter 127). */
export function SkippedWarning() {
  const s = useMidiState();
  const { current } = useKitState();
  if (!s.skipped.length) return null;
  return (
    <div className="warning">
      <b>Not sent to the machine:</b>
      <ul>
        {s.skipped.map(({ index }) => (
          <li key={index}>{`${skippedLabel(paramDef(index).name)}: ${targetLabel(current.params[index]!, true)}`}</li>
        ))}
      </ul>
      <span className="small">MIDI can't set these targets. The machine keeps what it had; set them on the machine if you need them.</span>
    </div>
  );
}

function skippedLabel(name: string): string {
  const lfo = /^PAR_TARGET_LFO(\d)$/.exec(name);
  if (lfo) return `${VOICE_NAMES[Number(lfo[1]) - 1]} LFO destination`;
  const vel = /^PAR_VEL_DEST_(\d)$/.exec(name);
  if (vel) return `${VOICE_NAMES[Number(vel[1]) - 1]} velocity destination`;
  return name;
}
