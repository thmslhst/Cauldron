import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ParamChange } from '../src/core/events';
import { kitNameText, parseKit, serializeKit } from '../src/core/kit';
import { KitModel, initKit } from '../src/core/kitModel';
import { modTargets, paramIndex } from '../src/core/schema';

const fixture = parseKit(new Uint8Array(readFileSync(new URL('./fixtures/03-LYSER.SND', import.meta.url))));

describe('initKit', () => {
  it('is the firmware init kit, named "Initkit"', () => {
    const kit = initKit();
    expect(kitNameText(kit)).toBe('Initkit');
    expect(serializeKit(kit)).toHaveLength(255);
  });
});

describe('KitModel', () => {
  it('emits one event per changed parameter and tracks modifications', () => {
    const m = new KitModel(fixture, '03-LYSER.SND');
    const events: ParamChange[] = [];
    m.paramChanges.subscribe((e) => events.push(e));
    const vol1 = paramIndex('PAR_VOL1');
    const before = fixture.params[vol1]!;
    m.setParam(vol1, before === 10 ? 11 : 10);
    m.setParam(vol1, m.getState().current.params[vol1]!); // no-op
    expect(events).toHaveLength(1);
    expect(events[0]!.paramIndex).toBe(vol1);
    expect(m.modifiedParams()).toEqual([vol1]);
    m.revertParam(vol1);
    expect(m.modifiedParams()).toEqual([]);
    expect(events).toHaveLength(2);
  });

  it('moves the LFO target when its destination voice changes', () => {
    const m = new KitModel(fixture, 'x');
    const target = paramIndex('PAR_TARGET_LFO4');
    expect(modTargets[m.getState().current.params[target]!]!.paramName).toBe('PAR_PAN5');
    const events: ParamChange[] = [];
    m.paramChanges.subscribe((e) => events.push(e));
    m.setParam(paramIndex('PAR_VOICE_LFO4'), 2);
    expect(modTargets[m.getState().current.params[target]!]!.paramName).toBe('PAR_PAN2');
    expect(events.map((e) => e.paramIndex)).toEqual([paramIndex('PAR_VOICE_LFO4'), target]);
  });

  it('reverts everything and makes saved state the new baseline', () => {
    const m = new KitModel(fixture, 'x');
    let reverted = 0;
    m.setParam(10, 1);
    m.paramChanges.subscribe(() => reverted++);
    m.setName('New');
    expect(m.isNameModified()).toBe(true);
    m.revert();
    expect(m.modifiedParams()).toEqual([]);
    expect(m.isNameModified()).toBe(false);
    expect(reverted).toBe(1); // one ParamChange back to the original value
    m.setParam(10, 1);
    m.markSaved('03-x.snd', 3);
    expect(m.modifiedParams()).toEqual([]);
    expect(m.getState().slot).toBe(3);
  });
});

describe('KitModel LFO voice change, live-first', () => {
  it('turns the target off when the equivalent target cannot be sent over MIDI', () => {
    const m = new KitModel(fixture, 'x');
    const target = paramIndex('PAR_TARGET_LFO1');
    m.setParam(paramIndex('PAR_VOICE_LFO1'), 1);
    m.setParam(target, modTargets.findIndex((t) => t.paramName === 'PAR_FILTER_FREQ_1'));
    m.setParam(paramIndex('PAR_VOICE_LFO1'), 2); // filter freq exists on drum 2 and is sendable
    expect(modTargets[m.getState().current.params[target]!]!.paramName).toBe('PAR_FILTER_FREQ_2');
    // force an unsendable target (as a loaded file could have), then move voices
    m.setParam(target, modTargets.findIndex((t) => t.paramName === 'PAR_FILTER_DRIVE_2'));
    m.setParam(paramIndex('PAR_VOICE_LFO1'), 3);
    expect(m.getState().current.params[target]).toBe(0);
  });
});
