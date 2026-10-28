import { useEffect, useState } from 'react';
import { sharedPlayChannels } from '../core/midiMap';
import { paramIndex } from '../core/schema';
import { Knob } from './Knob';
import { VOICE_NAMES } from './labels';
import { ParamRow } from './ParamControl';
import { useMidi, useMidiState } from './store';

// The most-played controls per voice. Voice 7 (open hi-hat) shares voice 6's sound except its decay.
const DRIVE = ['PAR_DRIVE1', 'PAR_DRIVE2', 'PAR_DRIVE3', 'PAR_SNARE_DISTORTION', 'PAR_CYMBAL_DISTORTION', 'PAR_HAT_DISTORTION'];
const DECAY = ['PAR_VELOD1', 'PAR_VELOD2', 'PAR_VELOD3', 'PAR_VELOD4', 'PAR_VELOD5', 'PAR_VELOD6_CLOSED', 'PAR_VELOD6_OPEN'];

function controls(voice: number): [string, string][] {
  if (voice === 7) return [['Decay (open)', 'PAR_VELOD6_OPEN']];
  const v = voice;
  return [
    ['Volume', `PAR_VOL${v}`],
    ['Pan', `PAR_PAN${v}`],
    ['Tune', `PAR_COARSE${v}`],
    [voice === 6 ? 'Decay (closed)' : 'Decay', DECAY[v - 1]!],
    ['Cutoff', `PAR_FILTER_FREQ_${v}`],
    ['Resonance', `PAR_RESO_${v}`],
    ['Drive', DRIVE[v - 1]!],
  ];
}

/** Play pad: a MIDI note on the voice's channel. Keys 1-7 do the same. */
function PlayPad({ voice }: { voice: number }) {
  const midi = useMidi();
  const s = useMidiState();
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (s.played?.voice !== voice) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 120);
    return () => clearTimeout(t);
  }, [s.played, voice]);
  return (
    <button
      className={`pad${flash ? ' pad--hit' : ''}`}
      disabled={!s.connected}
      onPointerDown={(e) => {
        // velocity from where the pad is hit: top is loudest
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const vel = 127 - Math.round(((e.clientY - r.top) / r.height) * 80);
        midi.play(voice, vel);
      }}
      title={`Play ${VOICE_NAMES[voice - 1]} (key ${voice}). Hit higher for louder.`}
      aria-label={`Play ${VOICE_NAMES[voice - 1]}`}
    >
      {voice}
    </button>
  );
}

export function PerformancePage() {
  const s = useMidiState();
  const shared = sharedPlayChannels(s.settings);
  return (
    <div className="perf">
      {shared.length > 0 && (
        <p className="banner">
          Voices {shared.map((g) => g.join(', ')).join(' and ')} share a MIDI channel, so a play pad triggers all of them. Give each voice its own channel on
          the machine (voice → Mix → <span className="lcd">ch</span>) and enter the same channels under <b>MIDI</b> (top right).
        </p>
      )}
      <div className="strips">
        {VOICE_NAMES.map((name, i) => (
          <section key={name} className={`strip${i === 6 ? ' strip--narrow' : ''}`}>
            <h3>
              <span className="strip__nr">{i + 1}</span> {name}
            </h3>
            <PlayPad voice={i + 1} />
            <div className="strip__knobs">
              {controls(i + 1).map(([label, name]) => (
                <Knob key={name} index={paramIndex(name)} label={label} />
              ))}
            </div>
            {i === 6 && <p className="muted small">Shares the closed hi-hat's sound.</p>}
          </section>
        ))}
      </div>
      <section className="card fx-strip">
        <h3>Master</h3>
        <div className="fx-strip__row">
          <ParamRow index={paramIndex('PAR_FX_TYPE')} />
          <ParamRow index={paramIndex('PAR_VOICE_DECIMATION_ALL')} />
        </div>
        <div className="strip__knobs strip__knobs--row">
          <Knob index={paramIndex('PAR_FX_DRY_WET')} label="FX dry / wet" />
        </div>
      </section>
    </div>
  );
}
