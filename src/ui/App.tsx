import { useEffect, useMemo, useState } from 'react';
import { KitModel } from '../core/kitModel';
import { LiveMidi } from '../midi/live';
import { MidiPanel } from './MidiPanel';
import { paramDef } from '../core/schema';
import { Header } from './Header';
import { FxPage, KitPage, TABS, VoicePage } from './Pages';
import { KitBrowser } from './KitBrowser';
import { PerformancePage } from './Performance';
import { KitContext, MidiContext, useKitModel, useKitState } from './store';

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
      if (v >= 1 && v <= 7 && midi.getState().outputId) {
        e.preventDefault();
        midi.play(v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [midi]);
}

export function App() {
  const model = useMemo(() => new KitModel(), []);
  const midi = useMemo(() => new LiveMidi(model), [model]);
  // dev-only handle for debugging in the browser console
  if (import.meta.env.DEV) (window as unknown as { apothek: unknown }).apothek = { model, midi };
  const [tab, setTab] = useState('perf');
  usePlayKeys(midi);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  return (
    <KitContext.Provider value={model}>
      <MidiContext.Provider value={midi}>
      <div className="app">
        <Header />
        {message && (
          <div className={`message message--${message.kind}`} role="status">
            {message.text}
            <button onClick={() => setMessage(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        <div className="body">
          <main>
            <Tabs tab={tab} setTab={setTab} />
            {tab === 'perf' && <PerformancePage />}
            {tab.startsWith('v') && <VoicePage voice={Number(tab.slice(1))} />}
            {tab === 'fx' && <FxPage />}
            {tab === 'kit' && <KitPage />}
          </main>
          <div className="side">
            <MidiPanel onInfo={(text) => setMessage({ kind: 'info', text })} />
            <KitBrowser onError={(text) => setMessage({ kind: 'error', text })} />
          </div>
        </div>
      </div>
      </MidiContext.Provider>
    </KitContext.Provider>
  );
}
