import { useEffect, useMemo, useState } from 'react';
import { KitModel } from '../core/kitModel';
import { paramDef } from '../core/schema';
import { LiveMidi } from '../midi/live';
import { ConnectScreen } from './ConnectScreen';
import { ChangesBar, Header } from './Header';
import { Modal } from './Modal';
import { KitBrowser } from './KitBrowser';
import { MidiPage, SkippedWarning } from './MidiPanel';
import { FxPage, KitPage, TABS, VoicePage } from './Pages';
import { PerformancePage } from './Performance';
import { KitContext, MidiContext, useKitModel, useKitState, useMidiState } from './store';

function Tabs({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const model = useKitModel();
  useKitState(); // re-render on change for the modified markers
  const modified = model.modifiedParams().map(paramDef);
  const tabModified = (id: string) => {
    if (id === 'perf') return false;
    if (id.startsWith('v')) return modified.some((p) => p.voices.includes(Number(id.slice(1))));
    if (id === 'fx') return modified.some((p) => p.pages.some((r) => r.page === 'FX_MODE_PAGE'));
    return modified.some((p) => p.voices.length === 0 && !p.pages.some((r) => r.page === 'FX_MODE_PAGE'));
  };
  return (
    <nav className="tabs" role="tablist">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
          {t.label}
          {tabModified(t.id) && <span className="dot" />}
        </button>
      ))}
      <ChangesBar />
    </nav>
  );
}

/** Keys 1-7 play the voices, unless typing in a field. */
function usePlayKeys(midi: LiveMidi) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || t.closest('input, select, textarea')) return;
      const v = Number(e.key);
      if (v >= 1 && v <= 7 && midi.getState().connected) {
        e.preventDefault();
        midi.play(v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [midi]);
}

function Main() {
  const [tab, setTab] = useState('perf');
  const [modal, setModal] = useState<'kits' | 'midi' | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  return (
    <div className="app">
      <Header onKits={() => setModal('kits')} onMidi={() => setModal('midi')} />
      {message && (
        <div className={`message message--${message.kind}`} role="status">
          {message.text}
          <button onClick={() => setMessage(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <main>
        <SkippedWarning />
        <Tabs tab={tab} setTab={setTab} />
        {tab === 'perf' && <PerformancePage />}
        {tab.startsWith('v') && <VoicePage voice={Number(tab.slice(1))} />}
        {tab === 'fx' && <FxPage />}
        {tab === 'kit' && <KitPage />}
      </main>
      <Modal open={modal === 'kits'} onClose={() => setModal(null)} title="Kits">
        <KitBrowser onError={(text) => setMessage({ kind: 'error', text })} onShowList={() => setModal('kits')} />
      </Modal>
      <Modal open={modal === 'midi'} onClose={() => setModal(null)} title="MIDI">
        <MidiPage />
      </Modal>
    </div>
  );
}

/** Nothing but the connect screen until the LXR-02 is connected. */
function Gate() {
  const s = useMidiState();
  return s.connected ? <Main /> : <ConnectScreen />;
}

export function App() {
  const model = useMemo(() => new KitModel(), []);
  const midi = useMemo(() => new LiveMidi(model), [model]);
  // dev-only handle for debugging in the browser console
  if (import.meta.env.DEV) (window as unknown as { apothek: unknown }).apothek = { model, midi };
  usePlayKeys(midi);
  useEffect(() => void midi.init(), [midi]);

  return (
    <KitContext.Provider value={model}>
      <MidiContext.Provider value={midi}>
        <Gate />
      </MidiContext.Provider>
    </KitContext.Provider>
  );
}
