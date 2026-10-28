import { useRef } from 'react';
import { kitNameText, parseKit, serializeKit, KitFormatError } from '../core/kit';
import { fileNameFor } from '../core/naming';
import { NAME_CHARACTERS } from '../core/schema';
import { download } from '../sd/folder';
import { useKitModel, useKitState } from './store';
import { initKit } from '../core/kitModel';

export function confirmDiscard(model: ReturnType<typeof useKitModel>): boolean {
  const dirty = model.modifiedParams().length > 0 || model.isNameModified();
  return !dirty || window.confirm('The current kit has unsaved changes. Discard them?');
}

export function Header({ onError }: { onError: (msg: string) => void }) {
  const model = useKitModel();
  const state = useKitState();
  const fileInput = useRef<HTMLInputElement>(null);
  const name = kitNameText(state.current);
  const modified = model.modifiedParams().length;
  const nameModified = model.isNameModified();

  const onName = (text: string) => {
    // Only characters the machine's name editor can show (menu.c characterOrder)
    const clean = [...text].filter((c) => NAME_CHARACTERS.includes(c)).join('').slice(0, 8);
    model.setName(clean);
  };

  const openFile = async (file: File) => {
    try {
      const kit = parseKit(new Uint8Array(await file.arrayBuffer()));
      model.load(kit, file.name, null);
    } catch (e) {
      onError(e instanceof KitFormatError ? e.message : `Could not read ${file.name}`);
    }
  };

  return (
    <header className="header">
      <div className="brand">
        Apothek <span>kit editor for the LXR-02</span>
      </div>
      <label className="kitname">
        <span>Kit name</span>
        <input
          value={name}
          maxLength={8}
          spellCheck={false}
          onChange={(e) => onName(e.target.value)}
          className={nameModified ? 'modified' : ''}
          title={`Up to 8 characters: ${NAME_CHARACTERS.trim()}`}
        />
      </label>
      <div className="origin" title="Where the kit was loaded from">
        {state.origin}
        {state.slot !== null && ` · slot ${String(state.slot).padStart(2, '0')}`}
      </div>
      <div className="actions">
        <button onClick={() => confirmDiscard(model) && model.load(initKit(), 'init kit')}>New</button>
        <button onClick={() => fileInput.current?.click()}>Open .snd…</button>
        <button
          onClick={() => download(serializeKit(state.current), fileNameFor(state.slot ?? 0, state.current.name, 'snd'))}
          title="Download the kit as a .snd file"
        >
          Download .snd
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".snd,.SND"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && confirmDiscard(model)) void openFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className={`changes${modified || nameModified ? ' changes--on' : ''}`}>
        {modified || nameModified ? `${modified} parameter${modified === 1 ? '' : 's'} changed${nameModified ? ', name changed' : ''}` : 'No changes'}
        <button disabled={!modified && !nameModified} onClick={() => model.revert()}>
          Revert all
        </button>
      </div>
    </header>
  );
}
