import { useEffect, useRef } from 'react';
import { paramDef } from '../core/schema';
import { formatValue } from '../core/values';
import { useKitModel, useKitState } from './store';

const SWEEP = 270; // degrees
const DRAG_RANGE_PX = 180; // vertical drag for the full range

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

/**
 * A knob for one kit parameter. Drag up/down (Shift: fine), mouse wheel, arrow keys.
 * Double-click goes back to the value of the loaded kit.
 */
export function Knob({ index, label }: { index: number; label: string }) {
  const model = useKitModel();
  const { current, original } = useKitState();
  const def = paramDef(index);
  const value = current.params[index]!;
  const loaded = original.params[index]!;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; start: number } | null>(null);
  const span = def.max - def.min;

  const set = (v: number) => {
    const clamped = Math.min(def.max, Math.max(def.min, Math.round(v)));
    if (clamped !== model.getState().current.params[index]) model.setParam(index, clamped);
  };

  // wheel needs a non-passive listener to prevent page scroll
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const steps = Math.sign(-e.deltaY) * (e.shiftKey ? 1 : Math.max(1, Math.round(span / 64)));
      set(model.getState().current.params[index]! + steps);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const frac = span ? (value - def.min) / span : 0;
  const start = -SWEEP / 2;
  const signed = def.display.kind === 'signed';
  // signed parameters draw from their zero point
  const zeroFrac = signed && def.display.kind === 'signed' ? (def.display.offset - def.min) / span : 0;
  const from = start + SWEEP * Math.min(zeroFrac, frac);
  const to = start + SWEEP * Math.max(zeroFrac, frac);
  const modified = value !== loaded;

  return (
    <div
      ref={ref}
      className={`knob${modified ? ' knob--modified' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      aria-valuetext={formatValue(index, value)}
      title={`${label}: ${formatValue(index, value)}${modified ? ` (loaded: ${formatValue(index, loaded)}, double-click to go back)` : ''}`}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, start: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dy = drag.current.y - e.clientY;
        const scale = (span / DRAG_RANGE_PX) * (e.shiftKey ? 0.2 : 1);
        set(drag.current.start + dy * scale);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => model.revertParam(index)}
      onKeyDown={(e) => {
        const big = Math.max(1, Math.round(span / 10));
        const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: big, PageDown: -big }[e.key];
        if (d) {
          e.preventDefault();
          set(value + d);
        } else if (e.key === 'Home') set(def.min);
        else if (e.key === 'End') set(def.max);
      }}
    >
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <path d={arc(28, 28, 20, start, start + SWEEP)} className="knob__track" />
        {to - from > 0.5 && <path d={arc(28, 28, 20, from, to)} className="knob__value" />}
        <circle cx={polar(28, 28, 13, start + SWEEP * frac).x} cy={polar(28, 28, 13, start + SWEEP * frac).y} r={2.6} className="knob__dot" />
      </svg>
      <span className="knob__value-text">{formatValue(index, value)}</span>
      <span className="knob__label">{label}</span>
    </div>
  );
}
