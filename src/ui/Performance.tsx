import { paramIndex } from '../core/schema';
import { Knob } from './Knob';
import { TARGET_VOICE_NAMES } from './labels';

// The most-played controls per voice. The open hi-hat (voice 7) shares voice 6's sound except its
// decay, so both hi-hats share one card with the two decays side by side.
const DRIVE = ['PAR_DRIVE1', 'PAR_DRIVE2', 'PAR_DRIVE3', 'PAR_SNARE_DISTORTION', 'PAR_CYMBAL_DISTORTION', 'PAR_HAT_DISTORTION'];
const DECAY = ['PAR_VELOD1', 'PAR_VELOD2', 'PAR_VELOD3', 'PAR_VELOD4', 'PAR_VELOD5'];

type Control = [label: string, param: string];

function controls(v: number): (Control | Control[])[] {
  const decay: Control | Control[] =
    v === 6
      ? [
          ['Closed', 'PAR_VELOD6_CLOSED'],
          ['Open', 'PAR_VELOD6_OPEN'],
        ]
      : ['Decay', DECAY[v - 1]!];
  return [
    ['Volume', `PAR_VOL${v}`],
    ['Pan', `PAR_PAN${v}`],
    ['Tune', `PAR_COARSE${v}`],
    decay,
    ['Cutoff', `PAR_FILTER_FREQ_${v}`],
    ['Resonance', `PAR_RESO_${v}`],
    ['Drive', DRIVE[v - 1]!],
  ];
}

const knob = ([label, name]: Control) => <Knob key={name} index={paramIndex(name)} label={label} />;

export function PerformancePage() {
  return (
    <div className="perf">
      <div className="strips">
        {TARGET_VOICE_NAMES.map((name, i) => (
          <section key={name} className="strip">
            <h3>
              <span className="strip__nr">{i === 5 ? '6/7' : i + 1}</span> {name}
            </h3>
            <div className="strip__knobs">
              {controls(i + 1).map((c) =>
                Array.isArray(c[0]) ? (
                  <div key={(c as Control[])[0]![1]} className="strip__pair">
                    {(c as Control[]).map(knob)}
                  </div>
                ) : (
                  knob(c as Control)
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
