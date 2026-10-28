// SD card access through the File System Access API (Chromium), with a download fallback.
// All format and naming logic lives in src/core; this file only moves bytes.
import { planSlotWrite, projectFolders, type SlotWritePlan } from '../core/slotWrite';
import { decodeName } from '../core/kit';
import type { FileType } from '../core/naming';

export const canOpenFolders = (): boolean => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export interface FolderListing {
  handle: FileSystemDirectoryHandle;
  files: string[];
  folders: string[];
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error('This browser cannot open folders. Use Chrome or Edge.');
  return window.showDirectoryPicker({ id: 'lxr-sd', mode: 'readwrite' });
}

export async function listFolder(handle: FileSystemDirectoryHandle): Promise<FolderListing> {
  const files: string[] = [];
  const folders: string[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') files.push(entry.name);
    else folders.push(entry.name);
  }
  return { handle, files: files.sort(), folders: folders.sort() };
}

export async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array> {
  const file = await (await dir.getFileHandle(name)).getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export interface ProjectInfo {
  folder: string;
  number: number;
  /** Name from prj.nfo (8 bytes), if present. */
  name: string | null;
}

export async function listProjects(root: FolderListing): Promise<ProjectInfo[]> {
  return Promise.all(
    projectFolders(root.folders).map(async ({ name: folder, number }) => {
      let name: string | null = null;
      try {
        const dir = await root.handle.getDirectoryHandle(folder);
        const nfo = await readFile(dir, 'prj.nfo');
        name = decodeName(nfo.subarray(0, 8));
      } catch {
        // no prj.nfo: the machine shows "Empty"
      }
      return { folder, number, name };
    }),
  );
}

export function planWrite(listing: FolderListing, slot: number, name: Uint8Array, type: FileType): SlotWritePlan {
  return planSlotWrite(listing.files, slot, name, type);
}

/** Writes the file first, then removes the other files for the slot, so a failed write loses nothing. */
export async function executeWrite(dir: FileSystemDirectoryHandle, plan: SlotWritePlan, bytes: Uint8Array): Promise<void> {
  const handle = await dir.getFileHandle(plan.fileName, { create: true });
  const w = await handle.createWritable();
  await w.write(bytes as Uint8Array<ArrayBuffer>);
  await w.close();
  for (const f of plan.remove) await dir.removeEntry(f);
}

/** Fallback when folders can't be opened: a plain download. */
export function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
