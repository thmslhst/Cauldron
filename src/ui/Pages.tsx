import type React from 'react';
import { params, paramIndex, type PageRef, type ParamDef } from '../core/schema';
import { AmpEnvelopeGraph } from './AmpEnvelopeGraph';
import { ParamRow } from './ParamControl';
import { FX_PAGE_TITLES, subPageTitle, TARGET_VOICE_NAMES } from './labels';
import { useKitState } from './store';

interface Slot {
  def: ParamDef;
  ref: PageRef;
}

/** Sub-pages of a firmware menu page, in machine order. */
function subPages(page: string): Slot[][] {
  const out: Slot[][] = [];
  for (const def of params) {
    for (const ref of def.pages) {
      if (ref.page !== page) continue;
      (out[ref.subPage] ??= [])[ref.slot] = { def, ref };
    }
  }
  return out.map((s) => (s ?? []).filter(Boolean));
}

function Card({ title, slots, note, children }: { title: string; slots: Slot[]; note?: string; children?: React.ReactNode }) {
  const { current, original } = useKitState();
  const modified = slots.some(({ def }) => def.inKit && current.params[def.index] !== original.params[def.index]);
  return (
    <section className="card">
      <h3>
        {title}
        {modified && <span className="dot" title="Modified" />}
      </h3>
      {note && <p className="card__note">{note}</p>}
      {children}
      {slots.map(({ def, ref }) => (
        <ParamRow key={`${def.index}-${ref.slot}`} index={def.index} pageRef={ref} />
      ))}
    </section>
  );
}

/**
 * The open hi-hat (voice 7) shares the closed hi-hat's sound (voice 6), so both are one tab:
 * voice 6's pages plus voice 7's own slots (decay, MIDI channel, note) next to their closed twins.
 */
function hihatPages(): Slot[][] {
  const closed = subPages('voice6');
  const open = subPages('voice7');
  return closed.map((slots, s) => {
    const own = (open[s] ?? []).filter((o) => !slots.some((c) => c.def.index === o.def.index));
    return [...slots, ...own].sort((a, b) => a.ref.slot - b.ref.slot || a.def.voices[0]! - b.def.voices[0]!);
  });
}

/** Sub-page 1 of every voice menu is the amp envelope. */
const AMP_ENVELOPE_PAGE = 1;

export function VoicePage({ voice }: { voice: number }) {
  const pages = voice === 6 ? hihatPages() : subPages(`voice${voice}`);
  return (
    <div>
      {voice === 6 && (
        <p className="banner">
          The closed (6) and open (7) hi-hats share one sound. Only the decay, MIDI channel and MIDI note are separate.
        </p>
      )}
      <div className="cards">
        {pages.map((slots, s) =>
          slots.length ? (
            <Card key={s} title={subPageTitle(s, slots.map((x) => x.def))} slots={slots}>
              {s === AMP_ENVELOPE_PAGE && <AmpEnvelopeGraph voice={voice} />}
            </Card>
          ) : null,
        )}
      </div>
    </div>
  );
}

const PAR_FX_TYPE = paramIndex('PAR_FX_TYPE');

export function FxPage() {
  const { current } = useKitState();
  const pages = subPages('FX_MODE_PAGE');
  const type = current.params[PAR_FX_TYPE]!;
  // The machine shows the sub-page whose number equals the effect type (MidiParser.c CC2_FX_TYPE).
  const active = pages[type] ?? pages[0]!;
  return (
    <div className="cards">
      <Card title={`Effect · ${FX_PAGE_TITLES[type] ?? type}`} slots={active} note="The parameters below change with the effect type, as on the machine." />
    </div>
  );
}

const SAMPLE_RATE_ALL = paramIndex('PAR_VOICE_DECIMATION_ALL');
const MORPH_KIT_DEST = paramIndex('PAR_MORPH_KIT_DEST');

export function KitPage() {
  return (
    <div className="cards">
      <section className="card">
        <h3>Kit</h3>
        <ParamRow index={SAMPLE_RATE_ALL} />
        <p className="card__note">On the machine this is on the performance page.</p>
      </section>
      <section className="card">
        <h3>Morph</h3>
        <ParamRow index={MORPH_KIT_DEST} />
        <p className="card__note">
          Slot number of the kit last loaded as the morph target. The machine sets it when you load a morph kit; it isn't on any menu page.
        </p>
      </section>
    </div>
  );
}

export const TABS = [
  { id: 'perf', label: 'Performance' },
  ...TARGET_VOICE_NAMES.map((n, i) => ({ id: `v${i + 1}`, label: `${i === 5 ? '6/7' : i + 1} ${n}` })),
  { id: 'fx', label: 'FX' },
  { id: 'kit', label: 'Kit' },
];
