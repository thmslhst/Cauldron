import { useEffect, useRef, useState, type ReactNode } from 'react';
import { kitNameText, serializeKit, type Kit } from '../core/kit';
import { fileNameFor } from '../core/naming';
import { findSavedKitByName, kitOf, savedIdOf, savedKit, savedOrigin, stepSavedKit, type SavedKit } from '../core/savedKits';
import { NAME_CHARACTERS } from '../core/schema';
import { download } from '../files/files';
import { Modal } from './Modal';
import { newKitId, savedKits, useSavedKits } from './savedKitsStore';
import { useKitModel, useKitState, useMidi, useMidiState } from './store';

type Menu = 'load' | 'save' | null;

/**
 * App bar: title; the kit name with arrows through the saved kits; Load and Save (the saved kits
 * list in this browser) next to Import and Export (.snd files); MIDI; play/stop.
 */
export function Header({ onImport, onMidi, onError }: { onImport: () => void; onMidi: () => void; onError: (text: string) => void }) {
  const s = useMidiState();
  const { current, origin } = useKitState();
  const list = useSavedKits();
  const [menu, setMenu] = useState<Menu>(null);
  const { load, confirmModal } = useLoadSaved();
  const loadedId = savedIdOf(origin);
  const name = kitNameText(current);
  const exportName = name ? fileNameFor(0, name, 'snd') : null;

  const step = (d: number) => {
    const e = stepSavedKit(list, loadedId, d);
    if (e) load(e);
  };

  return (
    <header className="header">
      <div className="brand">
        Cauldron <span>Sound editor for the LXR-02</span>
      </div>
      <div className="appbar-center kitnav">
        <button className="kitnav__arrow" onClick={() => step(-1)} disabled={!list.length} aria-label="Previous saved kit" title="Previous saved kit">
          ◀
        </button>
        <KitName />
        <button className="kitnav__arrow" onClick={() => step(1)} disabled={!list.length} aria-label="Next saved kit" title="Next saved kit">
          ▶
        </button>
      </div>
      <nav className="appbar-buttons">
        <div className="btn-group">
          <Dropdown
            label="Load"
            open={menu === 'load'}
            onToggle={(o) => setMenu(o ? 'load' : null)}
            title="Load a kit saved in this browser"
          >
            <SavedList
              loadedId={loadedId}
              onLoad={(e) => {
                setMenu(null);
                load(e);
              }}
              onError={onError}
            />
          </Dropdown>
          <Dropdown label="Save" caret={false} open={menu === 'save'} onToggle={(o) => setMenu(o ? 'save' : null)} title="Save the current sound to the kits list in this browser">
            <SaveForm onSaved={() => setMenu(null)} onError={onError} />
          </Dropdown>
        </div>
        <div className="btn-group">
          <button onClick={onImport} title="Open .snd kit files or a folder (or drop them anywhere)">
            Import
          </button>
          <button
            onClick={() => exportName && download(serializeKit(current), exportName)}
            disabled={!exportName}
            title={exportName ? `Download the current sound as ${exportName}. The 00 is the slot: rename it to place the kit in a project folder on the card.` : 'Name the kit to export it'}
          >
            Export
          </button>
        </div>
        <button onClick={onMidi} title={s.connected ? 'Connected to the LXR-02. One-way: the app sends, the machine sends nothing back.' : 'Not connected'}>
          MIDI
        </button>
        <Transport />
      </nav>
      {confirmModal}
    </header>
  );
}

/**
 * Saves the current sound to the list under a name (prefilled with the kit's), as a new entry.
 * Names are unique: if the name is taken, it asks to pick another name or replace that kit.
 */
function SaveForm({ onSaved, onError }: { onSaved: () => void; onError: (text: string) => void }) {
  const model = useKitModel();
  const list = useSavedKits();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => kitNameText(model.getState().current));
  const [asking, setAsking] = useState(false);
  const trimmed = draft.replace(/ +$/, '');
  const taken = trimmed ? findSavedKitByName(list, trimmed) : null;

  /** Saves as a new entry, or in place of `replacing`. */
  const save = (replacing: SavedKit | null) => {
    model.setName(trimmed);
    const id = replacing?.id ?? newKitId();
    const entry = savedKit(model.getState().current, id, Date.now());
    if (!(replacing ? savedKits.replace(id, entry) : savedKits.add(entry))) {
      onError('Could not save: browser storage is full or unavailable.');
      return;
    }
    // the saved kit is now the loaded one: its values are the revert point
    model.markSaved(savedOrigin(id), null);
    onSaved();
  };

  return (
    <form
      className="saveform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        if (taken) setAsking(true);
        else save(null);
      }}
    >
      <input
        ref={input}
        className="kitname-input"
        value={draft}
        placeholder="KIT NAME"
        maxLength={8}
        spellCheck={false}
        aria-label="Kit name"
        autoFocus
        // caret at the end, nothing selected
        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
        title={`Up to 8 characters: ${NAME_CHARACTERS.trim()}`}
        onChange={(e) => {
          setDraft(cleanKitName(e.target.value));
          setAsking(false);
        }}
      />
      <button type="submit" className="primary" disabled={!trimmed || asking}>
        Save
      </button>
      {asking && taken && (
        <div className="saveform__taken" role="alert">
          <span>{taken.name} already exists.</span>
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              input.current?.focus();
            }}
          >
            Rename
          </button>
          <button type="button" className="danger" onClick={() => save(taken)}>
            Replace
          </button>
        </div>
      )}
    </form>
  );
}

/** A button with a panel below it. Closes on a click outside or Escape. */
function Dropdown({
  label,
  title,
  open,
  onToggle,
  caret = true,
  children,
}: {
  label: string;
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** Shows ▾ after the label. */
  caret?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      // clicks in a confirm dialog opened from the panel don't close it
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest('dialog')) onToggle(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onToggle(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open, onToggle]);
  return (
    <div className="dropdown" ref={ref}>
      <button className={open ? 'active' : ''} aria-expanded={open} aria-haspopup="true" onClick={() => onToggle(!open)} title={title}>
        {label}
        {caret && (
          <span className="caret" aria-hidden="true">
            ▾
          </span>
        )}
      </button>
      {open && <div className="dropdown__panel">{children}</div>}
    </div>
  );
}

/** The saved kits: click to load, × to delete (asks again first). */
function SavedList({ loadedId, onLoad, onError }: { loadedId: string | null; onLoad: (e: SavedKit) => void; onError: (text: string) => void }) {
  const list = useSavedKits();
  const [deleting, setDeleting] = useState<string | null>(null);
  if (!list.length) return <p className="muted small dropdown__empty">No saved kits yet. Save puts the current sound here.</p>;
  const width = String(list.length).length;
  return (
    <ul className="kitlist savedlist">
      {list.map((k, i) => (
        <li key={k.id} className={k.id === loadedId ? 'loaded' : ''}>
          {deleting === k.id ? (
            <div className="savedlist__confirm">
              <span>Delete {k.name || 'Unnamed'}?</span>
              <button onClick={() => setDeleting(null)}>No</button>
              <button
                className="danger"
                onClick={() => {
                  if (!savedKits.remove(k.id)) onError('Could not delete: browser storage is unavailable.');
                  setDeleting(null);
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => onLoad(k)} title={`Saved ${new Date(k.savedAt).toLocaleString()}`}>
                <span className="slotnr">{String(i + 1).padStart(width, '0')}</span>
                <span>{k.name || 'Unnamed'}</span>
              </button>
              <button className="savedlist__delete" onClick={() => setDeleting(k.id)} aria-label={`Delete ${k.name}`} title="Delete from the list">
                ×
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Loads a saved kit (and sends it). Unsaved edits to the current kit are only discarded after a confirmation. */
function useLoadSaved() {
  const model = useKitModel();
  const [pending, setPending] = useState<{ name: string; kit: Kit; id: string } | null>(null);
  const apply = (p: { kit: Kit; id: string }) => model.load(p.kit, savedOrigin(p.id), null);
  const load = (e: SavedKit) => {
    const p = { name: e.name || 'Unnamed', kit: kitOf(e), id: e.id };
    if (model.modifiedParams().length > 0 || model.isNameModified()) setPending(p);
    else apply(p);
  };
  const n = model.modifiedParams().length;
  const changes = !n ? 'the unsaved name change' : n === 1 ? 'the unsaved change' : `the ${n} unsaved changes`;
  const confirmModal = (
    <Modal open={pending !== null} onClose={() => setPending(null)} title="Load kit">
      <div className="confirm">
        <p>
          Load {pending?.name}? This discards {changes} to the current kit.
        </p>
        <div className="confirm__actions">
          <button onClick={() => setPending(null)} data-autofocus>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => {
              if (pending) apply(pending);
              setPending(null);
            }}
          >
            Load
          </button>
        </div>
      </div>
    </Modal>
  );
  return { load, confirmModal };
}

/** Changed-parameter count and Revert all, shown at the end of the tab row. */
export function ChangesBar() {
  const model = useKitModel();
  useKitState(); // re-render on change
  const modified = model.modifiedParams().length;
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className={`changes${modified ? ' changes--on' : ''}`}>
        {modified ? `${modified} parameter${modified === 1 ? '' : 's'} changed` : 'No changes'}
        <button disabled={!modified} onClick={() => setConfirm(true)}>
          Revert all
        </button>
      </div>
      {/* outside the changes bar, so the dialog doesn't take its red uppercase text */}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Revert all">
        <div className="confirm">
          <p>
            Revert the whole kit to the loaded file? This undoes {modified === 1 ? 'the change' : `all ${modified} changes`} and sends
            the loaded values to the machine.
          </p>
          <div className="confirm__actions">
            <button onClick={() => setConfirm(false)} data-autofocus>
              Cancel
            </button>
            <button
              className="primary"
              onClick={() => {
                model.revert();
                setConfirm(false);
              }}
            >
              Revert all
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Play/stop for the machine's sequencer (MIDI time code, see LiveMidi.start). Space toggles it.
 * If the sequencer was started on the machine, MIDI can't stop it: stop it there.
 */
function Transport() {
  const midi = useMidi();
  const { transport } = useMidiState();
  const fromMachine = transport.running && transport.by === 'machine';
  const label = transport.running ? 'Stop' : 'Play';
  return (
    <button
      className={`transport transport--${transport.running ? 'stop' : 'play'}`}
      aria-label={label}
      onClick={() => (transport.running ? midi.stop() : midi.start())}
      disabled={fromMachine}
      aria-pressed={transport.running}
      title={
        fromMachine
          ? 'Playing, started on the machine: stop it there (MIDI cannot stop it).'
          : `${label} the machine's sequencer (Space). Needs the machine's internal tempo and R in its MIDI RX filter.`
      }
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        {transport.running ? <rect x="3" y="3" width="10" height="10" rx="1.5" /> : <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7z" />}
      </svg>
    </button>
  );
}

/** Only characters the machine's name editor can show (menu.c characterOrder), 8 at most. */
export function cleanKitName(text: string): string {
  return [...text].filter((c) => NAME_CHARACTERS.includes(c)).join('').slice(0, 8);
}

/**
 * The current kit's name, centered in the app bar. Click to rename: Enter or leaving the field keeps
 * it, Escape cancels. The machine can't receive it over MIDI.
 */
function KitName() {
  const model = useKitModel();
  const { current } = useKitState();
  const name = kitNameText(current);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        className="kitname"
        onClick={() => setDraft(name)}
        title="Rename the kit (8 characters). Used when you save it; the machine can't receive names over MIDI."
      >
        {name || 'Unnamed'}
      </button>
    );
  }
  const commit = () => {
    model.setName(draft.replace(/ +$/, ''));
    setDraft(null);
  };
  return (
    <input
      className="kitname kitname--edit"
      value={draft}
      maxLength={8}
      spellCheck={false}
      aria-label="Kit name"
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(cleanKitName(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
