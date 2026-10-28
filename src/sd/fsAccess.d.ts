// showDirectoryPicker is not in TypeScript's DOM lib yet (Chromium only).
interface Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}
