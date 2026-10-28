import { useId } from 'react';
import { paramDef, modTargets, type PageRef } from '../core/schema';
import { formatValue, menuItems, numericValue, parseNumericValue } from '../core/values';
import { isSendableTarget, PAR_TARGET_LFO1, PAR_VEL_DEST_1, PAR_VOICE_LFO1, sendableTargetsForVoice, voiceOfTarget } from '../core/modTargets';
import { menus } from '../core/schema';
import { readableName, TARGET_VOICE_NAMES } from './labels';
import { useKitModel, useKitState } from './store';

/** Readable label of a modulation target, e.g. "Cymbal · Pan". */
export function targetLabel(index: number, withVoice = false): string {
  const t = modTargets[index];
  if (!t || t.param === 0) return 'Off';
  // FX P1-P4 change meaning with the effect type; the target list calls them P1..P4 (TEXT_FX_P*)
  const fx = /^PAR_FX_P(\d)$/.exec(t.paramName);
  const name = fx ? `FX parameter ${fx[1]}` : readableName(paramDef(t.param));
  return withVoice && t.voice ? `${TARGET_VOICE_NAMES[t.voice - 1]} · ${name}` : name;
}

export function ParamRow({ index, pageRef }: { index: number; pageRef?: PageRef }) {
  const model = useKitModel();
  const { current, original } = useKitState();
  const def = paramDef(index);
  const id = useId();
  const label = readableName(def, pageRef);
  const lcd = pageRef?.short ?? def.short ?? '';

  if (!def.inKit) {
    return (
      <div className="param param--outside" title="Not stored in the kit file">
        <span className="param__label">
          {label} <span className="lcd">{lcd}</span>
        </span>
        <span className="param__note">{def.isGlobal ? 'global setting' : 'pattern setting'}</span>
      </div>
    );
  }

  const value = current.params[index]!;
  const modified = value !== original.params[index];
  const set = (v: number) => model.setParam(index, v);

  return (
    <div className={`param${modified ? ' param--modified' : ''}`}>
      <label className="param__label" htmlFor={id}>
        {label}{' '}
        <span className="lcd" title={def.name}>
          {lcd}
        </span>
      </label>
      <div className="param__control">
        <Control index={index} value={value} set={set} id={id} />
      </div>
      <button
        className="param__revert"
        disabled={!modified}
        onClick={() => model.revertParam(index)}
        title={modified ? `Revert to ${formatValue(index, original.params[index]!)}` : 'Unchanged'}
        aria-label="Revert parameter"
      >
        ↺
      </button>
    </div>
  );
}

export function Control({ index, value, set, id }: { index: number; value: number; set: (v: number) => void; id: string }) {
  const { current } = useKitState();
  const def = paramDef(index);
  const d = def.display;

  switch (d.kind) {
    case 'menu': {
      const items = menuItems(d.menu);
      const isWave = menus[String(d.menu)]?.id === 'MENU_WAVEFORM';
      const isSample = value >= items.length;
      return (
        <span className="menu-control">
          <select id={id} value={isSample ? 'sample' : value} onChange={(e) => set(e.target.value === 'sample' ? items.length : Number(e.target.value))}>
            {items.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
            {isWave && <option value="sample">User sample…</option>}
            {!isWave && isSample && <option value="sample">{`unknown (${value})`}</option>}
          </select>
          {isWave && isSample && (
            <input
              className="num"
              type="number"
              min={0}
              max={127 - items.length}
              value={value - items.length}
              title="User sample number on the SD card. How many exist depends on the card."
              onChange={(e) => set(Math.min(127, Math.max(items.length, items.length + Number(e.target.value))))}
            />
          )}
        </span>
      );
    }
    case 'onOff':
      return (
        <label className="toggle">
          <input id={id} type="checkbox" checked={value === 1} onChange={(e) => set(e.target.checked ? 1 : 0)} />
          <span>{value === 1 ? 'on' : 'off'}</span>
        </label>
      );
    case 'lfoVoice':
      return (
        <select id={id} value={value} onChange={(e) => set(Number(e.target.value))}>
          {TARGET_VOICE_NAMES.map((n, i) => (
            <option key={i} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
      );
    case 'modTarget': {
      // LFO targets are limited to the destination voice's range, velocity targets to the
      // voice's own range (menu.c menu_encoderChangeParameter).
      const voice =
        d.scope === 'lfo'
          ? current.params[PAR_VOICE_LFO1 + (index - PAR_TARGET_LFO1)]!
          : index - PAR_VEL_DEST_1 + 1;
      const valid = voice >= 1 && voice <= 6;
      // Live-first: only targets the machine can receive over MIDI (parameters 0..127).
      const options = valid ? sendableTargetsForVoice(voice) : [0];
      const outside = !options.includes(value);
      const outsideLabel = !isSendableTarget(value)
        ? `${targetLabel(value, true)} (from the file, can't be sent over MIDI)`
        : `${targetLabel(value, true)} (other voice ${voiceOfTarget(value) || '?'})`;
      return (
        <select id={id} value={value} onChange={(e) => set(Number(e.target.value))} className={outside && !isSendableTarget(value) ? 'unsendable' : ''}>
          {options.map((t) => (
            <option key={t} value={t}>
              {targetLabel(t)}
            </option>
          ))}
          {outside && <option value={value}>{outsideLabel}</option>}
        </select>
      );
    }
    default: {
      // number, signed, note, bpm, oneBased
      const shown = numericValue(index, value);
      const text = formatValue(index, value);
      const numeric = d.kind === 'number' || d.kind === 'signed' || d.kind === 'oneBased';
      return (
        <span className="num-control">
          <input
            id={id}
            type="range"
            min={def.min}
            max={def.max}
            value={value}
            onChange={(e) => set(Number(e.target.value))}
            onDoubleClick={() => d.kind === 'signed' && set(d.offset)}
            title={d.kind === 'signed' ? 'Double-click to centre' : undefined}
          />
          {numeric ? (
            <input
              className="num"
              type="number"
              min={numericValue(index, def.min)}
              max={numericValue(index, def.max)}
              value={shown}
              onChange={(e) => e.target.value !== '' && set(parseNumericValue(index, Number(e.target.value)))}
            />
          ) : (
            <output className="num">{text}</output>
          )}
        </span>
      );
    }
  }
}
