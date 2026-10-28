// MIDIOutput.clear() exists in Chromium but is not in TypeScript's DOM lib.
interface MIDIOutput {
  clear?(): void;
}
