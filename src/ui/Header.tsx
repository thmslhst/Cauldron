import { MidiPill } from './MidiPanel';
import { useKitModel, useKitState } from './store';

export function confirmDiscard(model: ReturnType<typeof useKitModel>): boolean {
  const dirty = model.modifiedParams().length > 0 || model.isNameModified();
  return !dirty || window.confirm('The current kit has unsaved changes. Discard them?');
}

export function Header() {
  const model = useKitModel();
  useKitState(); // re-render on change
  const modified = model.modifiedParams().length;

  return (
    <header className="header">
      <div className="brand">
        Apothek <span>live companion for the LXR-02</span>
      </div>
      <MidiPill />
      <div className={`changes${modified ? ' changes--on' : ''}`}>
        {modified ? `${modified} parameter${modified === 1 ? '' : 's'} changed` : 'No changes'}
        <button disabled={!modified} onClick={() => model.revert()}>
          Revert all
        </button>
      </div>
    </header>
  );
}
