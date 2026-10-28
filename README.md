# Apothek

A web app for editing kits, patterns, songs and global settings of the LXR-02 drum machine,
offline through SD card files or live over USB MIDI. Fully client-side.

## Development

```sh
git submodule update --init   # firmware source in vendor/lxr-firmware
npm install
npm test
npm run dev
```

`npm run extract-schema` regenerates `src/schema/*.json` from the firmware source. It needs a host
`gcc` (Xcode Command Line Tools on macOS). The generated files are committed.

## Licence

GPL-3.0-only. The parameter schema is derived from the LXR firmware, which is GPL-3.0.
