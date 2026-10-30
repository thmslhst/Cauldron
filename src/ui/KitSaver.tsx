import { useEffect, useState } from 'react';
import { kitNameText, serializeKit, withName } from '../core/kit';
import { fileNameFor } from '../core/naming';
import { NAME_CHARACTERS } from '../core/schema';
import { cleanKitName } from './Header';
import { download } from '../files/files';
import { useKitState } from './store';

/**
 * Saves the current sound, edits included, as a new .snd file under a name the user types.
 * Independent of which kit was loaded.
 */
export function KitSaver() {
  const { current } = useKitState();
  const kitName = kitNameText(current);
  // starts from the kit's name (renamed in the app bar)
  const [name, setName] = useState(kitName);
  useEffect(() => setName(kitName), [kitName]);
  const [saved, setSaved] = useState<string | null>(null);
  const trimmed = name.replace(/ +$/, '');
  const fileName = trimmed ? fileNameFor(0, trimmed, 'snd') : null;

  return (
    <form
      className="saver"
      onSubmit={(e) => {
        e.preventDefault();
        if (!fileName) return;
        download(serializeKit(withName(current, trimmed)), fileName);
        setSaved(fileName);
      }}
    >
      <p className="muted small">Saves the current sound, with all your changes, as a new kit (.snd file). It doesn't change any loaded kit.</p>
      <div className="row">
        <input
          className="kitname-input"
          value={name}
          placeholder="KIT NAME"
          maxLength={8}
          spellCheck={false}
          aria-label="Kit name"
          data-autofocus
          title={`Up to 8 characters: ${NAME_CHARACTERS.trim()}`}
          onChange={(e) => {
            setName(cleanKitName(e.target.value));
            setSaved(null);
          }}
        />
        <button type="submit" className="primary" disabled={!fileName}>
          Save kit
        </button>
      </div>
      <p className="muted small">
        {saved
          ? `Saved ${saved}.`
          : fileName
            ? `File: ${fileName}. The 00 is the slot: rename it to place the kit in a project folder on the card.`
            : 'Name the kit (up to 8 characters) to save it.'}
      </p>
    </form>
  );
}
