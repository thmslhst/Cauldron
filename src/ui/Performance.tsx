import { paramIndex } from '../core/schema';
import { Knob } from './Knob';
import { VOICE_NAMES } from './labels';

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

export function PerformancePage() {
  return (
    <div className="perf">
      <div className="strips">
        {VOICE_NAMES.map((name, i) => (
          <section key={name} className={`strip${i === 6 ? ' strip--narrow' : ''}`}>
            <h3>
              <span className="strip__nr">{i + 1}</span> {name}
            </h3>
            <div className="strip__knobs">
              {controls(i + 1).map(([label, name]) => (
                <Knob key={name} index={paramIndex(name)} label={label} />
              ))}
            </div>
            {i === 6 && <p className="muted small">Shares the closed hi-hat's sound.</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
