import { useState } from 'react';
import { decodeName, parseKit, serializeKit, kitNameText } from '../core/kit';
import { NUM_SLOTS } from '../core/naming';
import { filesBySlot, type SlotWritePlan } from '../core/slotWrite';
import { canOpenFolders, executeWrite, listFolder, listProjects, pickFolder, planWrite, readFile, type FolderListing, type ProjectInfo } from '../sd/folder';
import { confirmDiscard } from './Header';
import { useKitModel, useKitState } from './store';

interface SlotInfo {
  slot: number;
  files: string[];
  name: string | null;
}

async function readSlots(listing: FolderListing): Promise<SlotInfo[]> {
  const bySlot = filesBySlot(listing.files, 'snd');
  return Promise.all(
    [...bySlot.entries()].map(async ([slot, files]) => {
      let name: string | null = null;
      try {
        name = decodeName((await readFile(listing.handle, files[0]!)).subarray(0, 8));
      } catch {
        // unreadable: show the file name only
      }
      return { slot, files, name };
    }),
  );
}

export function SdPanel({ onError, onInfo }: { onError: (m: string) => void; onInfo: (m: string) => void }) {
  const model = useKitModel();
  const state = useKitState();
  const [root, setRoot] = useState<FolderListing | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [folder, setFolder] = useState<{ listing: FolderListing; label: string } | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [target, setTarget] = useState(0);
  const [plan, setPlan] = useState<SlotWritePlan | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canOpenFolders()) {
    return (
      <aside className="sd">
        <h2>SD card</h2>
        <p className="muted">
          This browser can't open folders (it works in Chrome and Edge). Use <b>Open .snd</b> and <b>Download .snd</b>, then copy the file into a{' '}
          <code>/projNN/</code> folder on the card yourself.
        </p>
      </aside>
    );
  }

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFolder = (listing: FolderListing, label: string) =>
    run(async () => {
      setFolder({ listing, label });
      setSlots(await readSlots(listing));
      setPlan(null);
    });

  const pick = () =>
    run(async () => {
      const listing = await listFolder(await pickFolder());
      const projs = await listProjects(listing);
      if (projs.length) {
        setRoot(listing);
        setProjects(projs);
        setFolder(null);
        setSlots([]);
      } else {
        setRoot(null);
        setProjects([]);
        await openFolder(listing, listing.handle.name);
      }
    });

  const openProject = (p: ProjectInfo) =>
    run(async () => {
      const dir = await root!.handle.getDirectoryHandle(p.folder);
      await openFolder(await listFolder(dir), `${p.folder}${p.name ? ` · ${p.name}` : ''}`);
    });

  const load = (s: SlotInfo) =>
    run(async () => {
      if (!folder || !confirmDiscard(model)) return;
      const kit = parseKit(await readFile(folder.listing.handle, s.files[0]!));
      model.load(kit, `${folder.label}/${s.files[0]}`, s.slot);
      setTarget(s.slot);
    });

  const prepareSave = () =>
    run(async () => {
      if (!folder) return;
      const listing = await listFolder(folder.listing.handle); // fresh listing
      setFolder({ ...folder, listing });
      setPlan(planWrite(listing, target, state.current.name, 'snd'));
    });

  const save = () =>
    run(async () => {
      if (!folder || !plan) return;
      await executeWrite(folder.listing.handle, plan, serializeKit(state.current));
      model.markSaved(`${folder.label}/${plan.fileName}`, target);
      const listing = await listFolder(folder.listing.handle);
      setFolder({ ...folder, listing });
      setSlots(await readSlots(listing));
      setPlan(null);
      onInfo(`Saved ${plan.fileName}. On the machine, reload the project to use it: kits are read into memory when a project loads.`);
    });

  const bySlot = new Map(slots.map((s) => [s.slot, s]));

  return (
    <aside className="sd">
      <h2>SD card</h2>
      <button onClick={pick} disabled={busy}>
        Open SD card or project folder…
      </button>

      {projects.length > 0 && (
        <div className="projects">
          <h4>Projects on {root?.handle.name}</h4>
          <ul>
            {projects.map((p) => (
              <li key={p.folder}>
                <button className={folder?.listing.handle.name === p.folder ? 'active' : ''} onClick={() => openProject(p)} disabled={busy}>
                  {p.folder.replace(/^proj/i, '')} <span>{p.name ?? 'Empty'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {folder && (
        <>
          <h4>Kits in {folder.label}</h4>
          <ul className="slots">
            {Array.from({ length: NUM_SLOTS }, (_, n) => {
              const s = bySlot.get(n);
              return (
                <li key={n} className={`${s ? '' : 'empty'}${state.slot === n ? ' loaded' : ''}`}>
                  <button disabled={!s || busy} onClick={() => s && load(s)} title={s?.files.join(', ')}>
                    <span className="slotnr">{String(n).padStart(2, '0')}</span>
                    <span>{s ? (s.name ?? s.files[0]) : '—'}</span>
                    {s && s.files.length > 1 && <span className="warn" title="Several files for this slot">!</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="save">
            <label>
              Save “{kitNameText(state.current) || 'unnamed'}” to slot
              <select value={target} onChange={(e) => { setTarget(Number(e.target.value)); setPlan(null); }}>
                {Array.from({ length: NUM_SLOTS }, (_, n) => (
                  <option key={n} value={n}>
                    {String(n).padStart(2, '0')}
                    {bySlot.get(n) ? ` · ${bySlot.get(n)!.name ?? ''}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {!plan && (
              <button onClick={prepareSave} disabled={busy}>
                Save…
              </button>
            )}
            {plan && (
              <div className="confirm">
                <p>
                  {plan.overwrite ? 'Overwrite' : 'Write'} <code>{plan.fileName}</code>
                </p>
                {plan.remove.length > 0 && (
                  <p>
                    and <b>delete</b> {plan.remove.map((f) => <code key={f}>{f}</code>)} (the machine allows only one kit file per slot)
                  </p>
                )}
                <div className="row">
                  <button className="primary" onClick={save} disabled={busy}>
                    Confirm
                  </button>
                  <button onClick={() => setPlan(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
