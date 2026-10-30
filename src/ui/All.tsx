import { useId } from 'react';
import { paramDef, paramIndex } from '../core/schema';
import { AmpEnvelopeGraph } from './AmpEnvelopeGraph';
import { Knob } from './Knob';
import { VOICE_TAB_LABELS, readableName, subPageTitle } from './labels';
import { Control } from './ParamControl';
import { useKitModel, useKitState } from './store';

// All voices side by side, one strip each, grouped like the machine's menu pages. The open hi-hat
// (voice 7) shares voice 6's sound except its decay, so both hi-hats share one strip; the envelope
// graph shows both decays.

/** A knob ("label", enum name) or a named list (enum name alone, for menu-type parameters). */
type Item = { knob: string; label: string } | { list: string; label?: string };

interface Section {
  title: string;
  items: Item[];
  envelope?: boolean;
}

const k = (label: string, name: string): Item => ({ knob: name, label });
const list = (name: string, label?: string): Item => ({ list: name, label });

const WAVE = ['PAR_OSC_WAVE_DRUM1', 'PAR_OSC_WAVE_DRUM2', 'PAR_OSC_WAVE_DRUM3', 'PAR_OSC_WAVE_SNARE', 'PAR_WAVE1_CYM', 'PAR_WAVE1_HH'];
const DRIVE = ['PAR_DRIVE1', 'PAR_DRIVE2', 'PAR_DRIVE3', 'PAR_SNARE_DISTORTION', 'PAR_CYMBAL_DISTORTION', 'PAR_HAT_DISTORTION'];

function oscillator(v: number): Item[] {
  const base = [list(WAVE[v - 1]!), k('Tune', `PAR_COARSE${v}`), k('Fine', `PAR_FINE${v}`), k('PW', `PAR_PWM_${v}`)];
  const pitch = [k('Pitch', `PAR_MODAMNT${v}`), k('P decay', `PAR_MOD_EG${v}`)];
  if (v <= 3) return [...base, ...pitch, k('FM amt', `PAR_FMAMNT${v}`), k('FM freq', `PAR_FM_FREQ${v}`)];
  if (v === 4) return [...base, k('Noise', 'PAR_NOISE_FREQ1'), k('Mix', 'PAR_MIX1'), ...pitch];
  const cym = v === 5 ? '_CYM' : '';
  return [
    ...base,
    k('Mod 1', `PAR_MOD_OSC_F1${cym}`),
    k('Gain 1', `PAR_MOD_OSC_GAIN1${cym}`),
    k('Mod 2', `PAR_MOD_OSC_F2${cym}`),
    k('Gain 2', `PAR_MOD_OSC_GAIN2${cym}`),
  ];
}

function sections(v: number): Section[] {
  return [
    // titles are the machine's sub-page labels, as on the voice cards
    { title: subPageTitle(0), items: oscillator(v) },
    {
      title: subPageTitle(1),
      envelope: true,
      items: [
        k('Attack', `PAR_VELOA${v}`),
        ...(v === 6 ? [k('Closed', 'PAR_VELOD6_CLOSED'), k('Open', 'PAR_VELOD6_OPEN')] : [k('Decay', `PAR_VELOD${v}`)]),
        k('Slope', `PAR_VOL_SLOPE${v}`),
        // only the snare and the clap/cymbal repeat
        ...(v === 4 || v === 5 ? [k('Repeat', `PAR_REPEAT${v}`)] : []),
      ],
    },
    {
      title: subPageTitle(5),
      items: [list(`PAR_FILTER_TYPE_${v}`), k('Cutoff', `PAR_FILTER_FREQ_${v}`), k('Reso', `PAR_RESO_${v}`), k('Drive', `PAR_FILTER_DRIVE_${v}`)],
    },
    {
      title: subPageTitle(6),
      items: [
        list(`PAR_WAVE_LFO${v}`),
        list(`PAR_SYNC_LFO${v}`),
        k('Rate', `PAR_FREQ_LFO${v}`),
        k('Amount', `PAR_AMOUNT_LFO${v}`),
        list(`PAR_VOICE_LFO${v}`, 'To voice'),
        list(`PAR_TARGET_LFO${v}`, 'To'),
      ],
    },
    {
      title: subPageTitle(7),
      items: [
        k('Volume', `PAR_VOL${v}`),
        k('Pan', `PAR_PAN${v}`),
        k('Drive', DRIVE[v - 1]!),
        k('S rate', `PAR_VOICE_DECIMATION${v}`),
        list(`PAR_AUDIO_OUT${v}`, 'Output'),
      ],
    },
  ];
}

/** A compact named list (waveform, filter type, LFO destination...), red when changed. */
function ListField({ name, label }: { name: string; label?: string }) {
  const model = useKitModel();
  const { current, original } = useKitState();
  const id = useId();
  const index = paramIndex(name);
  const value = current.params[index]!;
  const modified = value !== original.params[index];
  return (
    <div className={`field${modified ? ' field--modified' : ''}`} onDoubleClick={(e) => e.target === e.currentTarget && model.revertParam(index)}>
      <label className="field__label" htmlFor={id}>
        {label ?? readableName(paramDef(index))}
      </label>
      <Control index={index} value={value} set={(x) => model.setParam(index, x)} id={id} />
    </div>
  );
}

function StripSection({ voice, section }: { voice: number; section: Section }) {
  const { current, original } = useKitState();
  const lists = section.items.filter((i): i is Extract<Item, { list: string }> => 'list' in i);
  const knobs = section.items.filter((i): i is Extract<Item, { knob: string }> => 'knob' in i);
  // lists before the knobs, except the LFO destination and the audio output, which read best last
  const isTarget = (i: { list: string }) => /^PAR_((VOICE|TARGET)_LFO|AUDIO_OUT)/.test(i.list);
  const params = section.items.map((i) => paramIndex('knob' in i ? i.knob : i.list));
  const modified = params.some((i) => current.params[i] !== original.params[i]);
  return (
    <div className="strip__section">
      <h4>
        {section.title}
        {modified && <span className="dot" title="Modified" />}
      </h4>
      {section.envelope && <AmpEnvelopeGraph voice={voice} height={84} />}
      {lists.filter((i) => !isTarget(i)).map((i) => <ListField key={i.list} name={i.list} label={i.label} />)}
      {knobs.length > 0 && (
        <div className="strip__knobs">
          {knobs.map((i) => (
            <Knob key={i.knob} index={paramIndex(i.knob)} label={i.label} />
          ))}
        </div>
      )}
      {lists.filter(isTarget).map((i) => <ListField key={i.list} name={i.list} label={i.label} />)}
    </div>
  );
}

export function AllPage() {
  return (
    <div className="all">
      <div className="strips">
        {VOICE_TAB_LABELS.map((name, i) => (
          <section key={name} className="strip">
            <h3>
              {name}
            </h3>
            {sections(i + 1).map((s) => (
              <StripSection key={s.title} voice={i + 1} section={s} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
