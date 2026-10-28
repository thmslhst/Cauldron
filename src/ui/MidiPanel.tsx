import { useEffect, useState } from 'react';
import { paramDef } from '../core/schema';
import { readableName, VOICE_NAMES } from './labels';
import { useMidi, useMidiState } from './store';

/** Compact status for the header: always visible. */
export function MidiPill() {
  const s = useMidiState();
  const port = s.outputs.find((o) => o.id === s.outputId);
  let text = 'MIDI off';
  let cls = 'pill';
  if (s.access === 'unsupported') text = 'MIDI not supported in this browser';
  else if (s.access === 'denied') text = 'MIDI access denied';
  else if (port) {
    text = `${port.name} · ${s.live ? 'live' : 'not sending'}`;
    cls += s.live ? ' pill--on' : ' pill--idle';
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

export function MidiPanel({ onError, onInfo }: { onError: (m: string) => void; onInfo: (m: string) => void }) {
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
    const skipped = midi.sendKit();
    if (skipped.length)
      onError(
        `Sent the kit except: ${skipped.map((x) => `${readableName(paramDef(x.index))} (${x.reason})`).join('; ')}.`,
      );
    else onInfo('Kit sent. To keep it, save the kit on the machine: the received values are in its edit buffer.');
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

          <label className="toggle">
            <input type="checkbox" checked={s.live} onChange={(e) => midi.setLive(e.target.checked)} />
            <span>Send every edit live</span>
          </label>

          <div className="row">
            <button className="primary" disabled={!connected} onClick={sendKit}>
              Send whole kit
            </button>
            {sending && (
              <button onClick={() => midi.cancel()} title="Drop the messages not sent yet">
                Stop ({(remaining / 1000).toFixed(1)} s)
              </button>
            )}
          </div>
          {s.kitNotSent && connected && <p className="hint">The kit loaded in the app hasn't been sent to the machine yet.</p>}
          {s.warning && <p className="error-text">Not sent: {s.warning}</p>}

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
            <summary>Channels and timing</summary>
            <label className="field">
              Global channel {ch(s.settings.globalChannel, (n) => midi.setSettings({ ...s.settings, globalChannel: n }))}
            </label>
            <p className="muted small">Must match the machine's global MIDI channel. Everything is sent on it by default, which the machine always accepts.</p>
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.settings.useVoiceChannels}
                onChange={(e) => midi.setSettings({ ...s.settings, useVoiceChannels: e.target.checked })}
              />
              <span>Send voice parameters on voice channels</span>
            </label>
            {s.settings.useVoiceChannels && (
              <>
                <div className="channels">
                  {VOICE_NAMES.map((n, i) => (
                    <label key={n} className="field">
                      {i + 1} {n} {ch(s.settings.voiceChannels[i]!, (v) => midi.setSettings({ ...s.settings, voiceChannels: s.settings.voiceChannels.map((x, j) => (j === i ? v : x)) }))}
                    </label>
                  ))}
                </div>
                <p className="hint small">
                  The firmware checks a voice's CCs against the <i>next</i> voice's channel (drum 1 against drum 2's, and so on; the hi-hat against the open
                  hi-hat's). The app reproduces that. Not verified on hardware yet.
                </p>
              </>
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
      </ul>
    </section>
  );
}
