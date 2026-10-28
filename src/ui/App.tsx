import { useMemo, useState } from 'react';
import { KitModel } from '../core/kitModel';
import { paramDef } from '../core/schema';
import { Header } from './Header';
import { FxPage, KitPage, TABS, VoicePage } from './Pages';
import { SdPanel } from './SdPanel';
import { KitContext, useKitModel, useKitState } from './store';

function Tabs({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const model = useKitModel();
  useKitState(); // re-render on change for the modified markers
  const modified = model.modifiedParams().map(paramDef);
  const tabModified = (id: string) => {
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

export function App() {
  const model = useMemo(() => new KitModel(), []);
  const [tab, setTab] = useState('v1');
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  return (
    <KitContext.Provider value={model}>
      <div className="app">
        <Header onError={(text) => setMessage({ kind: 'error', text })} />
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
            {tab.startsWith('v') && <VoicePage voice={Number(tab.slice(1))} />}
            {tab === 'fx' && <FxPage />}
            {tab === 'kit' && <KitPage />}
          </main>
          <SdPanel onError={(text) => setMessage({ kind: 'error', text })} onInfo={(text) => setMessage({ kind: 'info', text })} />
        </div>
      </div>
    </KitContext.Provider>
  );
}
