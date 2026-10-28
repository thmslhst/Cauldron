// Browser file plumbing: reading picked/dropped files and downloading. Read-only toward the card.

export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Relative path of a picked or dropped file (folder pick gives webkitRelativePath). */
export function filePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** All files from a drop, including folders (webkitGetAsEntry), with their relative paths. */
export async function droppedFiles(dt: DataTransfer): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + entry.name, file });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns batches until empty
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      }
    }
  };
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => e !== null);
  if (entries.length) for (const e of entries) await walk(e, '');
  else for (const f of [...dt.files]) out.push({ path: f.name, file: f });
  return out;
}
