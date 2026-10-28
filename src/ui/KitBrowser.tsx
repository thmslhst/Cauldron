import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeName, KitFormatError, parseKit, serializeKit } from '../core/kit';
import { fileNameFor } from '../core/naming';
import { groupKits } from '../core/kitLibrary';
import { download, droppedFiles, filePath, readBytes } from '../files/files';
import { confirmDiscard } from './Header';
import { useKitModel, useKitState } from './store';

interface Item {
  file: File;
  name: string | null;
}

/** Read-only list of .snd kits from opened files, a folder or a drop. Click a kit to load (and send) it. */
export function KitBrowser({ onError, onShowList }: { onError: (m: string) => void; onShowList: () => void }) {
  const model = useKitModel();
  const state = useKitState();
  const [items, setItems] = useState<Map<string, Item>>(new Map());
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const add = useCallback(async (files: { path: string; file: File }[], replace: boolean) => {
    const kits = files.filter(({ path }) => /\.snd$/i.test(path) && !path.split('/').pop()!.startsWith('._'));
    const next = new Map(replace ? [] : items);
    for (const { path, file } of kits) {
      let name: string | null = null;
      try {
        name = decodeName((await readBytes(file.slice(0, 8))).subarray(0, 8));
      } catch {
        // unreadable: list it by file name
      }
      next.set(path, { file, name });
    }
    setItems(next);
    return kits.map((k) => k.path);
  }, [items]);

  const load = useCallback(
    async (path: string, item: Item | undefined = items.get(path)) => {
      if (!item || !confirmDiscard(model)) return;
      try {
        const kit = parseKit(await readBytes(item.file));
        const entry = groupKits([path])[0]?.kits[0];
        model.load(kit, item.file.name, entry?.slot ?? null);
        setLoadedPath(path);
      } catch (e) {
        onError(e instanceof KitFormatError ? `${item.file.name}: ${e.message}` : `Could not read ${item.file.name}`);
      }
    },
    [items, model, onError],
  );

  // Drop .snd files or folders anywhere on the page
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      setDragging(false);
      const files = await droppedFiles(e.dataTransfer);
      const paths = await add(files, false);
      if (!paths.length) onError('No .snd kit files in what was dropped.');
      else if (paths.length === 1) void load(paths[0]!, { file: files.find((f) => f.path === paths[0])!.file, name: null });
      else onShowList(); // several kits: open the list to pick one
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [add, load, onError, onShowList]);

  const groups = groupKits([...items.keys()]);
  const flat = groups.flatMap((g) => g.kits.map((k) => k.path));
  const at = loadedPath ? flat.indexOf(loadedPath) : -1;
  const step = (d: number) => {
    if (!flat.length) return;
    const i = at < 0 ? 0 : (at + d + flat.length) % flat.length;
    void load(flat[i]!);
  };
  // the loaded kit may have been replaced (New, ...)
  const loadedHere = loadedPath !== null && state.origin === items.get(loadedPath)?.file.name;

  const pick = (input: HTMLInputElement, replace: boolean) => {
    const files = [...(input.files ?? [])].map((file) => ({ path: filePath(file), file }));
    input.value = '';
    void add(files, replace).then((paths) => {
      if (!paths.length) onError('No .snd kit files there.');
    });
  };

  return (
    <section className="browser">
      {dragging && <div className="dropzone">Drop .snd kits or a folder</div>}
      <div className="row">
        <button onClick={() => folderInput.current?.click()} title="A folder of kits, a /projNN/ folder or the whole SD card">
          Open folder…
        </button>
        <button onClick={() => filesInput.current?.click()}>Open files…</button>
      </div>
      <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '' }} onChange={(e) => pick(e.target, true)} />
      <input ref={filesInput} type="file" hidden multiple accept=".snd,.SND" onChange={(e) => pick(e.target, false)} />

      {flat.length === 0 ? (
        <p className="muted small">Or drop .snd files anywhere. Kits are only read: nothing is written to the card.</p>
      ) : (
        <>
          <div className="row stepper">
            <button onClick={() => step(-1)} aria-label="Previous kit" title="Previous kit">
              ◀
            </button>
            <span className="muted small">
              {at >= 0 && loadedHere ? `${at + 1} / ${flat.length}` : `${flat.length} kits`}
            </span>
            <button onClick={() => step(1)} aria-label="Next kit" title="Next kit">
              ▶
            </button>
          </div>
          <div className="kitlist">
            {groups.map((g) => (
              <div key={g.folder}>
                {g.folder && <h4>{g.project !== null ? `Project ${String(g.project).padStart(2, '0')}` : g.folder.split('/').pop()}</h4>}
                <ul>
                  {g.kits.map((k) => {
                    const item = items.get(k.path)!;
                    const active = loadedHere && k.path === loadedPath;
                    // position in this app's list (1-based), not the machine slot
                    const n = flat.indexOf(k.path) + 1;
                    return (
                      <li key={k.path} className={active ? 'loaded' : ''}>
                        <button onClick={() => void load(k.path)} title={k.path}>
                          <span className="slotnr">{String(n).padStart(String(flat.length).length, '0')}</span>
                          <span>{item.name || k.fileName}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      <button
        className="download"
        onClick={() => download(serializeKit(state.current), fileNameFor(state.slot ?? 0, state.current.name, 'snd'))}
        title="Download the current kit, with your edits, as a .snd file"
      >
        Download .snd
      </button>
    </section>
  );
}
