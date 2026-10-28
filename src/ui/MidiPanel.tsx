import { useEffect, useState } from 'react';
import { paramDef } from '../core/schema';
import { noteName } from '../core/values';
import { sharedPlayChannels } from '../core/midiMap';
import { VOICE_NAMES } from './labels';
import { targetLabel } from './ParamControl';
import { useKitState, useMidi, useMidiState } from './store';

/** Compact status for the header: always visible. */
export function MidiPill() {
  const s = useMidiState();
  const port = s.outputs.find((o) => o.id === s.outputId);
  let text = 'MIDI off';
  let cls = 'pill';
  if (s.access === 'unsupported') text = 'MIDI not supported in this browser';
  else if (s.access === 'denied') text = 'MIDI access denied';
  else if (port) {
    text = `${port.name} · live`;
    cls += ' pill--on';
  } else if (s.access === 'granted') text = 'MIDI: no port selected';
  return (
    <span className={cls} title="One-way: the app sends to the machine, the machine sends nothing back.">
      {text}
    </span>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function MidiPanel({ onInfo }: { onInfo: (m: string) => void }) {
  const midi = useMidi();
  const s = useMidiState();
  const [slot, setSlot] = useState(0);
  const [pattern, setPattern] = useState(0);
  const [showChannels, setShowChannels] = useState(false);
  const sending = s.busyUntil > performance.now();
  const now = useNow(sending);
  const remaining = Math.max(0, s.busyUntil - now);
  const connected = s.outputId !== null;

  if (s.access === 'unsupported') {
    return (
      <section className="midi">
        <h2>MIDI</h2>
        <p className="muted">Web MIDI isn't available here. Use Chrome, Edge or Firefox (not Safari) to send to the machine over USB.</p>
      </section>
    );
  }

  const sendKit = () => {
    midi.sendKit();
    onInfo('Kit sent. To keep it, save the kit on the machine: the received values are in its edit buffer.');
  };

  const ch = (v: number, onChange: (n: number) => void) => (
    <select value={v} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 16 }, (_, i) => (
        <option key={i} value={i + 1}>
          {i + 1}
        </option>
      ))}
    </select>
  );

  return (
    <section className="midi">
      <h2>MIDI</h2>
      {s.access !== 'granted' ? (
        <>
          <button onClick={() => void midi.connect()} disabled={s.access === 'requesting'}>
            {s.access === 'requesting' ? 'Waiting for permission…' : 'Connect MIDI'}
          </button>
          {s.access === 'denied' && <p className="error-text">The browser refused MIDI access. Allow it in the site settings and try again.</p>}
        </>
      ) : (
        <>
          <label className="field">
            Output
            <select value={s.outputId ?? ''} onChange={(e) => midi.selectOutput(e.target.value || null)}>
              <option value="">— none —</option>
              {s.outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {!s.outputs.length && <p className="muted">No MIDI outputs. Connect the machine by USB (it shows up as “Sonic Potions USB MIDI”).</p>}

          <div className="row">
            <button className={s.kitNotSent ? 'primary' : ''} disabled={!connected} onClick={sendKit} title="Every edit is sent as you make it. This resends the whole kit, e.g. after turning knobs on the machine.">
              Send kit again
            </button>
            {sending && (
              <button onClick={() => midi.cancel()} title="Drop the messages not sent yet">
                Stop ({(remaining / 1000).toFixed(1)} s)
              </button>
            )}
          </div>
          {s.kitNotSent && connected && <p className="hint">The kit loaded in the app hasn't been sent to the machine yet.</p>}
          {s.warning && <p className="error-text">Not sent: {s.warning}</p>}
          <SkippedWarning />

          <details className="nav">
            <summary>Navigate the machine</summary>
            <div className="row">
              <label className="field">
                Kit slot
                <input type="number" min={0} max={63} value={slot} onChange={(e) => setSlot(Math.min(63, Math.max(0, Number(e.target.value))))} />
              </label>
              <button disabled={!connected} onClick={() => midi.loadKitSlot(slot)} title="CC 0 (bank change) on the global channel">
                Load on machine
              </button>
            </div>
            <p className="muted small">Loads the kit from the machine's memory (the loaded project), replacing its edit buffer.</p>
            <div className="row">
              <label className="field">
                Pattern
                <input type="number" min={0} max={63} value={pattern} onChange={(e) => setPattern(Math.min(63, Math.max(0, Number(e.target.value))))} />
              </label>
              <button disabled={!connected} onClick={() => midi.nextPattern(pattern)} title="Program change on the global channel">
                Queue pattern
              </button>
            </div>
            <p className="muted small">Pattern numbers count from 0. Needs program change reception (“P”) in the MIDI RX filter.</p>
          </details>

          <details className="nav" open={showChannels} onToggle={(e) => setShowChannels((e.target as HTMLDetailsElement).open)}>
            <summary>Channels, notes and timing</summary>
            <label className="field">
              Global channel {ch(s.settings.globalChannel, (n) => midi.setSettings({ ...s.settings, globalChannel: n }))}
            </label>
            <p className="muted small">Must match the machine's global MIDI channel. Everything is sent on it by default, which the machine always accepts.</p>
            <h4 className="subhead">Voices (play buttons)</h4>
            <p className="muted small">
              Set these to match each voice's MIDI channel and MIDI note on the machine (voice → Mix page: <span className="lcd">ch</span>,{' '}
              <span className="lcd">nte</span>). Play buttons need <b>N</b> in the RX filter.
            </p>
            <div className="voice-settings">
              {VOICE_NAMES.map((n, i) => (
                <div key={n} className="voice-setting">
                  <span>
                    {i + 1} {n}
                  </span>
                  {ch(s.settings.voiceChannels[i]!, (v) => midi.setSettings({ ...s.settings, voiceChannels: s.settings.voiceChannels.map((x, j) => (j === i ? v : x)) }))}
                  <select
                    value={s.settings.voiceNotes[i]}
                    onChange={(e) => midi.setSettings({ ...s.settings, voiceNotes: s.settings.voiceNotes.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
                    aria-label={`${n} MIDI note`}
                  >
                    <option value={0}>any</option>
                    {Array.from({ length: 127 }, (_, k) => k + 1).map((k) => (
                      <option key={k} value={k}>
                        {noteName(k)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {sharedPlayChannels(s.settings).length > 0 && (
              <p className="hint small">
                Voices {sharedPlayChannels(s.settings).map((g) => g.join(', ')).join(' and ')} share a channel: one play button triggers all of them. Give each
                voice its own channel on the machine for separate play buttons.
              </p>
            )}
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.settings.useVoiceChannels}
                onChange={(e) => midi.setSettings({ ...s.settings, useVoiceChannels: e.target.checked })}
              />
              <span>Also send voice parameters on voice channels</span>
            </label>
            {s.settings.useVoiceChannels && (
              <p className="hint small">
                The firmware checks a voice's CCs against the <i>next</i> voice's channel (drum 1 against drum 2's, and so on). The app reproduces that. Not
                verified on hardware. Leave this off unless you have a reason.
              </p>
            )}
            <label className="field">
              Gap between messages (ms)
              <input type="number" min={0} max={50} value={s.intervalMs} onChange={(e) => midi.setInterval(Math.min(50, Math.max(0, Number(e.target.value))))} />
            </label>
          </details>
        </>
      )}
      <ul className="notes small">
        <li>
          On the machine, MIDI RX filter must include <b>C</b> (control changes). The default, “all”, does.
        </li>
        <li>
          One-way only: the machine sends nothing back. Turning its knobs doesn't update the app, and the app can't read the machine's kit.
        </li>
        <li>Sent values land in the machine's edit buffer. Save the kit on the machine to keep them.</li>
        <li>The kit name can't be sent over MIDI; name the kit when you save it on the machine.</li>
      </ul>
    </section>
  );
}

/** Parameters of the loaded kit the machine could not receive (LFO/velocity targets above parameter 127). */
function SkippedWarning() {
  const s = useMidiState();
  const { current } = useKitState();
  if (!s.skipped.length) return null;
  return (
    <div className="warning">
      <b>Not sent to the machine:</b>
      <ul>
        {s.skipped.map(({ index }) => {
          const def = paramDef(index);
          return <li key={index}>{`${skippedLabel(def.name)}: ${targetLabel(current.params[index]!, true)}`}</li>;
        })}
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
