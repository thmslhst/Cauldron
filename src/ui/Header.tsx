import { kitNameText, serializeKit } from '../core/kit';
import { fileNameFor } from '../core/naming';
import { NAME_CHARACTERS } from '../core/schema';
import { download } from '../files/files';
import { useKitModel, useKitState, useMidi, useMidiState } from './store';
import { initKit } from '../core/kitModel';
import { MidiPill } from './MidiPanel';

export function confirmDiscard(model: ReturnType<typeof useKitModel>): boolean {
  const dirty = model.modifiedParams().length > 0 || model.isNameModified();
  return !dirty || window.confirm('The current kit has unsaved changes. Discard them?');
}

export function Header() {
  const model = useKitModel();
  const state = useKitState();
  const name = kitNameText(state.current);
  const modified = model.modifiedParams().length;
  const nameModified = model.isNameModified();

  const onName = (text: string) => {
    // Only characters the machine's name editor can show (menu.c characterOrder)
    const clean = [...text].filter((c) => NAME_CHARACTERS.includes(c)).join('').slice(0, 8);
    model.setName(clean);
  };

  return (
    <header className="header">
      <div className="brand">
        Apothek <span>live companion for the LXR-02</span>
      </div>
      <label className="kitname">
        <span>Kit name</span>
        <input
          value={name}
          maxLength={8}
          spellCheck={false}
          onChange={(e) => onName(e.target.value)}
          className={nameModified ? 'modified' : ''}
          title={`Only used for the downloaded .snd file (the name can't be sent over MIDI). Up to 8 characters: ${NAME_CHARACTERS.trim()}`}
        />
      </label>
      <div className="origin" title="Where the kit was loaded from">
        {state.origin}
        {state.slot !== null && ` · slot ${String(state.slot).padStart(2, '0')}`}
      </div>
      <div className="actions">
        <button onClick={() => confirmDiscard(model) && model.load(initKit(), 'init kit')}>New</button>
        <button
          onClick={() => download(serializeKit(state.current), fileNameFor(state.slot ?? 0, state.current.name, 'snd'))}
          title="Download the kit as a .snd file"
        >
          Download .snd
        </button>
      </div>
      <MidiPill />
      <AbSwitch enabled={modified > 0} />
      <div className={`changes${modified || nameModified ? ' changes--on' : ''}`}>
        {modified || nameModified ? `${modified} parameter${modified === 1 ? '' : 's'} changed${nameModified ? ', name changed' : ''}` : 'No changes'}
        <button disabled={!modified && !nameModified} onClick={() => model.revert()}>
          Revert all
        </button>
      </div>
    </header>
  );
}

/** A/B: hear the loaded kit or the edits on the machine. Only the differing parameters are sent. */
function AbSwitch({ enabled }: { enabled: boolean }) {
  const midi = useMidi();
  const s = useMidiState();
  if (!s.outputId) return null;
  return (
    <div className="ab" role="group" aria-label="Compare loaded and edited kit" title="Compare on the machine: the loaded kit (A) or your edits (B)">
      {(['loaded', 'edited'] as const).map((w) => (
        <button key={w} className={s.listening === w ? 'active' : ''} disabled={!enabled} aria-pressed={s.listening === w} onClick={() => midi.listen(w)}>
          {w === 'loaded' ? 'A loaded' : 'B edited'}
        </button>
      ))}
    </div>
  );
}
