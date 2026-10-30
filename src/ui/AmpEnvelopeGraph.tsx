import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ATTACK_SHARE, attackEndX, attackSeconds, decayEndX, decaySeconds, envelopePoints, formatSeconds } from '../core/ampEnvelope';
import { paramIndex } from '../core/schema';
import { useKitModel, useKitState } from './store';

const DEFAULT_HEIGHT = 112;
const PAD = { top: 10, bottom: 18, x: 6 };
const SLOPE_DRAG_PX = 200; // vertical drag for the full slope range
const AXIS_LOCK_PX = 4;

interface Curve {
  label: string;
  decay: number; // parameter index
}

function voiceParams(voice: number) {
  const curves: Curve[] =
    voice === 6
      ? [
          { label: 'Closed', decay: paramIndex('PAR_VELOD6_CLOSED') },
          { label: 'Open', decay: paramIndex('PAR_VELOD6_OPEN') },
        ]
      : [{ label: 'Decay', decay: paramIndex(`PAR_VELOD${voice}`) }];
  return {
    attack: paramIndex(`PAR_VELOA${voice}`),
    slope: paramIndex(`PAR_VOL_SLOPE${voice}`),
    // only the snare and the clap/cymbal repeat
    repeat: voice === 4 || voice === 5 ? paramIndex(`PAR_REPEAT${voice}`) : null,
    curves,
  };
}

type Target = { kind: 'attack' } | { kind: 'decay'; curve: number };

interface Drag {
  target: Target;
  x: number;
  y: number;
  start: { value: number; slope: number };
  axis: 'x' | 'y' | null;
}

/**
 * The voice's amp envelope as the firmware shapes it. The width of each segment follows its 0..127
 * value, like the sliders, so the handles follow the pointer over the whole range; the real times are
 * printed below. Drag a handle sideways for its time, up and down for the slope (Shift: fine).
 * Mouse wheel changes the nearest handle. Double-click goes back to the loaded values.
 */
export function AmpEnvelopeGraph({ voice, height: HEIGHT = DEFAULT_HEIGHT }: { voice: number; height?: number }) {
  const model = useKitModel();
  const { current, original } = useKitState();
  const p = voiceParams(voice);
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState<Target | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Target | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 300));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const get = (i: number) => current.params[i]!;
  const attack = get(p.attack);
  const slope = get(p.slope);
  const repeat = p.repeat === null ? 0 : get(p.repeat);

  const plotW = width - PAD.x * 2;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xOf = (f: number) => PAD.x + f * plotW;
  const yOf = (v: number) => PAD.top + (1 - v) * plotH;
  const ax = xOf(attackEndX(attack));
  const decayXs = p.curves.map((c) => xOf(decayEndX(attack, get(c.decay))));

  const path = (decay: number) =>
    envelopePoints({ attack, decay, slope, repeat }, plotW)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${xOf(x).toFixed(1)},${yOf(y).toFixed(1)}`)
      .join('');

  const indices = [p.attack, p.slope, ...p.curves.map((c) => c.decay), ...(p.repeat === null ? [] : [p.repeat])];
  const changed = (i: number) => current.params[i] !== original.params[i];
  const curveModified = (c: Curve) => changed(p.attack) || changed(p.slope) || changed(c.decay) || (p.repeat !== null && changed(p.repeat));

  const set = (i: number, v: number) => {
    const clamped = Math.min(127, Math.max(0, Math.round(v)));
    if (clamped !== model.getState().current.params[i]) model.setParam(i, clamped);
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The handle nearest the pointer (horizontally): the attack end or one of the decay ends. */
  const targetAt = (x: number): Target => {
    let best: Target = { kind: 'attack' };
    let dist = Math.abs(x - ax);
    decayXs.forEach((dx, i) => {
      const d = Math.abs(x - dx);
      // on a tie (equal decays, or both at 0) prefer the decay: dragging right from there makes sense for both
      if (d <= dist && !(x < ax && d === dist)) {
        best = { kind: 'decay', curve: i };
        dist = d;
      }
    });
    return best;
  };

  const paramOf = (t: Target) => (t.kind === 'attack' ? p.attack : p.curves[t.curve]!.decay);
  /** Pixels per value step for a handle: its segment's width at 127, divided by 127. */
  const pxPerStep = (t: Target) => ((t.kind === 'attack' ? ATTACK_SHARE : 1 - ATTACK_SHARE) * plotW) / 127;

  // wheel needs a non-passive listener to prevent page scroll
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const i = paramOf(targetAt(local(e).x));
      set(i, model.getState().current.params[i]! + Math.sign(-e.deltaY) * (e.shiftKey ? 1 : 2));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const end = () => {
    drag.current = null;
    setDragging(null);
  };

  const active = dragging ?? hover;
  const readout = (() => {
    if (!active) return null;
    const s = `Slope ${slope}`;
    if (active.kind === 'attack') return `${repeat ? 'Repeat time' : 'Attack'} ${attack} · ${s}`;
    const c = p.curves[active.curve]!;
    return `${c.label} ${get(c.decay)} · ${s}`;
  })();

  const times = [
    repeat ? `${repeat} × ${formatSeconds(attackSeconds(attack))}` : `A ${formatSeconds(attackSeconds(attack))}`,
    // narrow graphs (All page strips) abbreviate Closed/Open to C/O
    ...p.curves.map((c) => `${p.curves.length > 1 ? (width < 260 ? c.label[0] : c.label) : 'D'} ${formatSeconds(decaySeconds(get(c.decay)))}`),
  ].join(' · ');

  return (
    <div className={`envgraph${p.curves.some(curveModified) ? ' envgraph--modified' : ''}`}>
      <svg
        ref={ref}
        height={HEIGHT}
        role="img"
        aria-label={`Amp envelope: ${times}`}
        style={{ cursor: active ? 'ew-resize' : 'default' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const { x, y } = local(e);
          const target = targetAt(x);
          drag.current = { target, x, y, axis: null, start: { value: get(paramOf(target)), slope } };
          setDragging(target);
        }}
        onPointerMove={(e) => {
          const { x, y } = local(e);
          const g = drag.current;
          if (!g) {
            setHover(targetAt(x));
            return;
          }
          // button released somewhere we didn't hear about
          if ((e.buttons & 1) === 0) return end();
          const dx = x - g.x;
          const dy = g.y - y;
          // lock to the first direction moved, so a sideways drag doesn't nudge the slope
          if (!g.axis && Math.hypot(dx, dy) >= AXIS_LOCK_PX) g.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
          const fine = e.shiftKey ? 0.2 : 1;
          if (g.axis === 'x') set(paramOf(g.target), g.start.value + (dx / pxPerStep(g.target)) * fine);
          if (g.axis === 'y') set(p.slope, g.start.slope + dy * (127 / SLOPE_DRAG_PX) * fine);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => indices.forEach((i) => changed(i) && model.revertParam(i))}
      >
        <line x1={PAD.x} x2={width - PAD.x} y1={yOf(0)} y2={yOf(0)} className="envgraph__axis" />
        <line x1={xOf(ATTACK_SHARE)} x2={xOf(ATTACK_SHARE)} y1={PAD.top} y2={yOf(0)} className="envgraph__grid" />
        <line x1={ax} x2={ax} y1={PAD.top} y2={yOf(0)} className="envgraph__marker" />
        {p.curves.map((c, i) => {
          const d = path(get(c.decay));
          const faint = p.curves.length > 1 && active?.kind === 'decay' && active.curve !== i;
          return (
            <g key={c.label} className={`envgraph__curve${curveModified(c) ? ' envgraph__curve--modified' : ''}${faint ? ' envgraph__curve--faint' : ''}`}>
              {i === p.curves.length - 1 && <path d={`${d}L${xOf(1)},${yOf(0)}L${xOf(0)},${yOf(0)}Z`} className="envgraph__fill" />}
              <path d={d} className="envgraph__line" />
            </g>
          );
        })}
        <circle cx={ax} cy={yOf(1)} r={active?.kind === 'attack' ? 4 : 3} className="envgraph__dot" />
        {decayXs.map((dx, i) => (
          <circle key={i} cx={dx} cy={yOf(0)} r={active?.kind === 'decay' && active.curve === i ? 4 : 3} className="envgraph__dot" />
        ))}
        <text x={PAD.x} y={HEIGHT - 4} className="envgraph__label">
          {times}
        </text>
        {readout && (
          <text x={width - PAD.x} y={PAD.top + 2} textAnchor="end" className="envgraph__readout">
            {readout}
          </text>
        )}
      </svg>
    </div>
  );
}
