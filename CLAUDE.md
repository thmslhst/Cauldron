# Apothek

Live companion app for the **Erica Synths LXR-02** drum machine. The LXR-02 is a live machine, so the app is built around **playing with a kit's sound in real time, with the machine's audio as feedback**, without menu-diving on the machine:

- **Live over USB**, through Web MIDI. The machine is a class-compliant USB MIDI device ("Sonic Potions USB MIDI"), so no driver is needed. Every edit goes to the machine immediately.
- **Audition `.snd` kits** (downloaded, or from a folder or the SD card) by opening them and sending them to the machine, without taking the SD card out.

The app does **not** write to the SD card. To keep a kit, the user saves it on the machine (incoming CCs land in its edit buffer). Downloading the edited kit as a `.snd` file is still offered.

The app is fully client-side: no backend and no accounts. It is deployed as a static site on Vercel.

## Scope and phases

Finish each phase, with its tests passing, before starting the next.

1. **Kit format and parameter schema.** *(done)* Read and write `.snd` files byte-for-byte, driven by a parameter schema extracted from the firmware source.
2. **Kit editing UI.** *(done)* Edit the 7 voices, the LFOs, the velocity modulations and the kit name. Open and download `.snd` files.
3. **Live MIDI/USB sending (stock firmware).** *(done)* Every parameter edit is sent to the machine as a CC or NRPN message. The app can also push a whole kit in one burst.
4. **Live-first redesign.** *(current)* Edits are always live. A **Performance** tab shows all voices at once with the most-played controls; the full per-voice editing tabs stay. No play pads: the voices are played on the machine. A read-only kit browser (open a folder or files, click a kit to load and send it). Only offer what the machine can receive over MIDI.
5. **SysEx and two-way sync.** **This phase requires a firmware fork.** The stock firmware cannot do it (see "Phase 5" below). It is designed and implemented in both repos: Apothek here, and the firmware in `vendor/lxr-firmware`. It is the main limit of a live tool today: the app doesn't know when a knob is turned on the machine.

**Deferred:** patterns, songs and globals (`.pat`, `.sng`, `glo.cfg`). The stock firmware cannot receive them over MIDI, so they would only be offline file editing, which doesn't fit the live-first direction. The format notes below are kept for later.

**Architecture rule from day one:** a parameter change is a pure event `(paramIndex, value)`.

- The kit model emits these events.
- The UI and the MIDI output are both subscribers.
- Later, incoming MIDI and SysEx become producers of the same events.

Keep `src/core/` free of any I/O.

## Source of truth: the firmware

The LXR-02 firmware is open source under GPL-3.0. Fork: https://github.com/thmslhst/lxr-desktop-app

Clone it into `vendor/lxr-firmware/` as a submodule. **Every format or protocol rule comes from that code, never from memory or guesswork.** When something is unclear, read the C.

| What | Where in the firmware |
|---|---|
| Parameter enum (byte order in files) | `Core/Inc/Parameters.h` |
| Kit save/load | `Core/Src/Preset/presetManager.c`: `preset_saveDrumsetSD`, `preset_writeDrumsetData`, `preset_loadDrumsetSD`, `preset_readDrumsetData` |
| Pattern save/load | `presetManager.c`: `preset_savePatternSD`, `preset_writePatternData`, `preset_loadPatternSD`, `preset_readPatternData` (several versions; the current tag is `PatV03`) |
| Songs | `presetManager.c`: `preset_saveSongSD`, `preset_loadSongSD` |
| Globals | `presetManager.c`: `preset_saveGlobals`, `preset_writeGlobalData`, `preset_readGlobalData`, `preset_loadDefaultGlobals` |
| Projects | `presetManager.c`: `preset_saveProject`, `preset_loadProject`, `preset_createProject` (folder `/projNN/`, file `prj.nfo`); `/proj.idx` = last project used |
| Step / sequencer structures | `Core/Inc/Preset/SeqStep.h`, `Core/Inc/Soundengine/Sequencer/sequencer.h` |
| File naming | `presetManager.c`: `preset_makeFileNameSave`, `preset_makeFileNameLoad`, `clearIllegalCharacters` |
| Parameter types and ranges | `Core/Src/menu/menu.c`: `parameter_dtypes[NUM_PARAMS]`; enum `Datatypes` in `Core/Inc/menu/menu.h` |
| Menu pages (UI grouping, short names) | `Core/Src/menu/menu.c` (`menuPages`), `Core/Inc/menu/MenuText.h`, `Core/Inc/menu/menuPages.h` |
| Modulation targets | `Core/Src/menu/Cc2Text.c`: `modTargets[]`, `paramToModTarget[]`, `getNumModTargets()` |
| Incoming MIDI (CC/NRPN, channels, filters) | `Core/Src/Soundengine/MIDI/MidiParser.c`: `midiParser_parseMidiMessage`, `midiParser_ccHandler`, `midiParser_cc2voiceNr` |
| CC → edit buffer | `Core/Src/frontPanelParser.c`: `frontPanel_ccHandler`, `frontParser_parseNrpn` |
| USB MIDI | `Core/Src/Soundengine/USB/usb_manager.c`, `USB_DEVICE_MIDI/`, `Middlewares/JS/.../usbd_cdc.c` |

## `.snd` format (verified against firmware and a real file)

```
offset 0..7    name: 8 ASCII bytes, space-padded, not NUL-terminated
offset 8..254  parameter bytes: activeParameters[0 .. END_OF_SOUND_PARAMETERS-1]
               one uint8 per parameter, in Parameters.h enum order
total          255 bytes   (END_OF_SOUND_PARAMETERS = 247)
```

- There is no header, version field or checksum.
- Byte index `i` after the name is parameter `i` of the enum. Index 0 is `PAR_NONE`, the last index is `PAR_MORPH_KIT_DEST` (246).
- Ignore the enum comments such as `//228`: they are stale. **Compute** the values instead (see the extractor below).
- **On read:** if the file is shorter than 255 bytes, the missing parameters are set to 0. Then, for `i` in 0..5, if `PAR_VEL_DEST_1+i` or `PAR_TARGET_LFO1+i` is `>= getNumModTargets()`, it is reset to 0. Reproduce this normalisation exactly.
- **Modulation targets** (`PAR_TARGET_LFO1..6`, `PAR_VEL_DEST_1..6`) are not parameter numbers. They are **indices into `modTargets[]`**, and values above 127 are normal (the fixture has 184, 153 and 197 at indices 170–172). The UI has to turn them into readable names using the ported table.
- **Values are not all 0–127.** Read each parameter's range from `parameter_dtypes`. Check how signed types (`DTYPE_PM63`, `DTYPE_PM100`) are stored in the byte before you display them.
- **On export, preserve unknown bytes:** a kit that is loaded and saved without edits must be byte-identical to the original.

### SD card file names

- Pattern: `NN-XXXXX.ext`. `NN` is the slot, 00–63, zero-padded. `XXXXX` is the first 5 characters of the name after `clearIllegalCharacters` (space → `_`; allowed characters are `A–Z a–z 0–9 ! # $ % & ( ) - @ ^ _ \` { } ~`; anything else → `_`).
- Extensions: `.snd` for kits, `.pat` for patterns, `.sng` for songs.
- The machine loads files with the wildcard `NN-*.ext`, so the slot number is what matters. There must be **only one file per slot and type**.
- Kits live in the project folders `/projNN/` on the card. The machine loads files into RAM when it loads a project, so the user has to reload the project after copying.
- FAT32 shows names in uppercase (`03-LYSER.SND`). Match names case-insensitively.
- Old naming scheme `pNNN.ext` (`preset_makeFileNameOld`): read it, never write it.

## Patterns, songs, globals (deferred)

The formats below are a starting point. **Read the code before implementing any of them.**

- **`.sng`**: 8-byte name, then `MAX_SONG_LENGTH` (64) bytes from `seq_songData`.
- **`glo.cfg`**: the raw bytes `activeParameters[PAR_BEGINNING_OF_GLOBALS .. NUM_PARAMS-1]`. Compute that count (it should be 30); don't hard-code it.
- **`.pat`**: 8-byte name, the `"PatV03"` tag, then the output of `preset_writePatternData`.
  - That output contains `Step` structs, step timing (bitfields!), main steps (`uint16_t`, little-endian), shuffle, lengths and the associated kit number.
  - The layout depends on the C structs as compiled for **ARM (arm-none-eabi-gcc, little-endian)**. Compute `sizeof`, offsets and bitfield order from the firmware. If needed, compile a probe with `arm-none-eabi-gcc` and inspect it with `offsetof`.
  - Support reading the older versions handled by `preset_loadPatternSD`.
- Ask the user for real fixtures (`.pat`, `.sng`, `glo.cfg`) before you consider a format done. The same rule applies to every format: **byte-identical round-trip**.

## Live MIDI over USB (phase 3, stock firmware)

- Use Web MIDI (`navigator.requestMIDIAccess()`). It works in Chromium and Firefox, not in Safari. Detect the port named "Sonic Potions USB MIDI", and let the user pick another port (DIN interface).
- **Mapping (to confirm in the C before coding):**
  - CC `n` (1..127) → parameter `n−1`.
  - Parameters ≥ 128 go through NRPN (CC 99/98 for the number, CC 6 for the value): NRPN `n` → parameter `n+128`.
  - CCs 0, 1, 6, 98 and 99 are reserved (see `midiParser_cc2voiceNr`).
  - Look closely at these edge cases: parameter 127, the "hh slope 127 → 0" wrap in `CortexParser.c`, and modulation targets, which are sent as a parameter number and converted with `paramToModTarget`.
  - A parameter that can't be reached over MIDI is greyed out in the UI and flagged `// TODO verify on hardware`. Never send an invented message.
- **Channels:** a voice-specific CC is accepted only on that voice's channel or on the global channel (`midi_MidiChannels[0..7]`). The app sends everything on the global channel, the only channel setting it exposes. It defaults to the machine's default, as given in the firmware.
- The machine must have **CC reception** turned on (MIDI filter). The UI states this requirement.
- CC 0 (bank change) loads a kit **from the RAM slot**. Program change selects the next pattern. Both are useful for navigation.
- **Kit burst:** send the whole kit as a burst of messages, with throttling (configurable, a few ms between messages) so the machine's buffer is not overrun. Value changes from the UI are coalesced (last value wins per parameter, per animation frame).
- Show the user that the machine **does not send anything back**: neither knob moves nor kit reads. Until phase 5, sync is one-way only (app → machine).

### Findings from the firmware (verified on hardware where noted)

- **Modulation targets over MIDI:** the NRPN value for `PAR_TARGET_LFOn` / `PAR_VEL_DEST_n` is a parameter number (7-bit), converted by the front panel with `paramToModTarget`. Targets on parameters ≥ 128 (pulse width, velocity settings, FM mode, transient, filter type/drive, LFO sync/wave/retrigger/offset, FX P1–P4) **cannot be set over MIDI**, although the machine's own menu offers them (verified on hardware). The app does not offer them; if a loaded kit uses one, it says so instead of sending something else.
- **`PAR_VOICE_LFOn` over NRPN** only updates the edit buffer; it does not retarget. When the app changes it, it sends the target too.
- **Channels:** `midiParser_parseMidiMessage` checks a voice CC against `midi_MidiChannels[voiceNr]` with a 1-based `voiceNr` on a 0-based array, so drum 1's CCs are checked against voice 2's channel. Sending on the global channel avoids this; the app always does.
- **Defaults** (`preset_loadDefaultGlobals`): every voice on channel 1; the global channel is stored as 0, which reads as channel 1. TODO verify on hardware.
- **Each NRPN also writes** parameters 5, 97 and 98 (CC 6, 98, 99 → param n−1) in the edit buffer. They are placeholders; a kit saved after a burst differs from the file only there.
- **Kit burst order:** `parameterOrder` in `Core/Src/Parameters.c` (the order the machine itself uses, "to prevent clicks").
- **Transport (play/stop):** with the internal tempo the firmware ignores MIDI Start/Stop (`MidiParser.c` honours them only when `seq_getExtSync()`: BPM set to EXT or MID). It does follow **MIDI Time Code**: 8 quarter frames at 00:00:00:00 start the sequencer, and if frame 0 stops arriving it stops again (`midiParser_checkMtc`, about 100 ms per the code comment). Needs **R** in the RX filter. The app starts with time code, keeps it alive with Web MIDI timestamps scheduled ahead, and stops by clearing them. The machine sends MIDI Start/Stop when its sequencer starts or stops (**R** in its TX filter), so the app follows the machine's own play button; a sequencer started on the machine can't be stopped over MIDI. TODO verify on hardware.
- **Playing voices:** a note-on on a voice's channel triggers it (`midiParser_noteOn`, needs **N** in the RX filter). If the voice's MIDI note setting (`PAR_MIDI_NOTEn`, default 48) is not "any", only that note triggers, at the default pitch (`SEQ_DEFAULT_NOTE` 60); with "any", the note number is the pitch. A note on the global channel plays the voice selected on the machine. Notes are ignored for playing while the machine shows the sequencer step page (they set the step's note), are recorded when the sequencer records, and muted voices stay silent. With the default channels (all 1), one note triggers every voice: per-voice play needs distinct voice channels on the machine.

## Phase 5: SysEx and two-way sync (firmware fork)

What the stock firmware does **not** do:

- It ignores SysEx ("we don't interpret sysex data right now").
- Turning a knob does not send any CC.
- There is no dump of the current kit.
- There is no remote save.

Plan for when you get there:

- Write a small, versioned SysEx protocol. Use manufacturer ID `0x7D` (non-commercial, for development). Commands: `HELLO/VERSION`, `GET_KIT` / `KIT_DUMP`, `SET_KIT`, `SAVE_KIT slot`, `PARAM_CHANGED` (an echo of edits made on the machine), and possibly `GET/SET_PATTERN`.
- Specify it in `docs/sysex-protocol.md` **before** you write any code. That document is shared by both repos.
- Encode 8-bit data in 7 bits (packing 7 bytes → 8, as already done with `frontParser_sysexBuffer`).
- **Firmware-side bug to fix:** `usb_sendMidi` computes the USB-MIDI CIN as `status>>4`, which is wrong for SysEx. Packets need CIN 0x4 to 0x7.
- Request SysEx permission in Web MIDI only from this phase on (`requestMIDIAccess({ sysex: true })`).

## Test fixtures

`test/fixtures/03-LYSER.SND` is a real kit exported from the machine. It is the reference for the kit parser:

- Size 255 bytes, name `"Lyserg  "`.
- Bytes 170, 171 and 172 (after the name) = 184, 153, 197 (LFO4–6 targets).
- Required test: `serialize(parse(file))` is identical byte-for-byte to the file.

Add every real file you receive (kits, patterns, songs, globals) as a fixture, along with its round-trip test.

For MIDI, test the kit/pattern → message list generation as a pure function (snapshot tests). The Web MIDI layer stays thin.

## Parameter schema (phase 1, do first)

Write a Node script `scripts/extract-schema.ts` that reads `vendor/lxr-firmware` and generates `src/schema/params.json`, which is **committed**. For each index 0..`NUM_PARAMS-1` it records:

- index and enum name,
- type (from `parameter_dtypes`), min, max and display,
- voice (1–7 or global/LFO),
- menu page and short name,
- MIDI address (CC, NRPN or none),
- `inKit` (index < `END_OF_SOUND_PARAMETERS`) and `isGlobal`.

Also generate `src/schema/modTargets.json` from `modTargets[]`.

Compute enum values reliably. The most reliable method is to compile a small C program with `gcc` and a stub `stm32f7xx_hal.h` that prints `printf("%d NAME")` for each enumerator. Check that `END_OF_SOUND_PARAMETERS === 247`, `PAR_BEGINNING_OF_GLOBALS === 272` and `NUM_PARAMS === 302`.

The app never parses C at runtime. It only reads the generated JSON.

## Stack

- Vite + TypeScript (strict) + React. Vitest for tests.
- No backend. Static deployment on Vercel.
- **Kit files:** read-only. Open files or a folder (`<input webkitdirectory>`, works in every browser) or drop files; list `.snd` kits grouped by folder (`/projNN/` on the card). Never write to the card. Download an edited kit as a `.snd` file.
- **MIDI:** Web MIDI, wrapped in `src/midi/`.
- The core is pure and independent of React (`src/core/`), and all of it is unit-tested:
  - `parseKit` and `serializeKit`, then the same pair for patterns, songs and globals,
  - `fileNameFor(slot, name, type)`,
  - value ↔ display conversions,
  - `kitToMidiMessages`.

## Suggested layout

```
src/core/       kit.ts, pattern.ts, song.ts, globals.ts, format.ts, naming.ts, values.ts, events.ts, midiMap.ts
src/schema/     params.json, modTargets.json              (generated, committed)
src/ui/         components: voices, LFO/velocity, step sequencer, song, settings, MIDI connection
src/files/      opening files/folders, download
src/midi/       Web MIDI: ports, sending, throttling (phase 5: SysEx)
scripts/        extract-schema.ts
docs/           sysex-protocol.md (phase 5)
test/fixtures/  real files from the machine
vendor/         lxr-firmware (submodule, read-only from this repo)
```

## UI principles

- **Connect first.** Like Overbridge, nothing but a connect screen shows until the app is connected to the machine. Only the "Sonic Potions USB MIDI" port is used; **Connect** appears when it is present. Unplugging returns to the connect screen. The app bar has **Load kits**, **Save kit** (asks for a name, saves the current sound as a new `00-NAME.snd`), **MIDI** and play/stop; the first three open modals.
- **Look: minimal, console-like, like the machine.** Black and white, monospace type, uppercase small labels, rounded corners. The only accent is the machine's red OLED (one red): changes and warnings. Values are white until changed; a changed parameter turns red (name, value and control). Green is for play and the connected device. Colors are tokens at the top of `src/ui/styles.css`.
- **Live first.** The app is for playing with the sound in real time. Prefer fast, direct controls (drag, mouse wheel, double-click to go back to the loaded value) and keep the machine's audio as the feedback loop.
- A **Performance** tab shows all 7 voices at once, with the most-played controls. There are no play pads and no per-voice channel settings (removed: the app can't set the machine's voice channels over MIDI, so pads only worked after matching channels by hand). The per-voice tabs follow the machine's menu pages (voice → page → parameters) so that you find your way around as you do on the hardware. Use full readable names alongside the short names from the LCD.
- Only offer settings and values the machine can receive over MIDI.
- Menu-type parameters (waveforms, modulation targets, etc.) are shown as named lists, never as raw numbers.
- Provide a "Revert" action and an indicator showing which parameters differ from the loaded file.
- Always show the MIDI connection state: port, live sending on or off, and the reminder that sync is one-way.

## Rules

- Never invent a parameter, range, value or MIDI message. If the firmware doesn't settle it, flag it as `// TODO verify on hardware` and say so.
- Never modify `vendor/lxr-firmware` from this repo. Firmware changes (phase 5) are committed in the fork.
- Licence: the schema is derived from GPL-3.0 code, so Apothek is published under **GPL-3.0**.
- Do not use the names "Erica Synths" or "LXR" as the product name or logo. "For the LXR-02" in the description is fine.
- Commits are small and the tests pass before each commit.
