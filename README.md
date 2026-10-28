# Apothek-02

A live companion for the LXR-02 drum machine: play with a kit's sound in real time over USB MIDI,
and audition `.snd` kits without taking the SD card out. Fully client-side.

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
