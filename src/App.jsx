import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listModels, solveImage } from './gemini.js';
import { captureFromVideo, fileToPayload } from './image.js';

const DEFAULT_MODEL = 'gemini-flash-latest';
const CONCURRENCY = 2; // images processed in parallel in the background

const uid = () => Math.random().toString(36).slice(2, 10);
const ls = {
  get: (k, d) => localStorage.getItem(k) ?? d,
  set: (k, v) => localStorage.setItem(k, v),
};

/* ---------------------------------------------------------------- Settings */
function Settings({ apiKey, setApiKey, model, setModel, onClose }) {
  const [models, setModels] = useState([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setMsg('Loading models…');
    try {
      const list = await listModels(apiKey);
      setModels(list);
      setMsg(`${list.length} models available`);
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="sheet">
      <h2>Settings</h2>
      <label>
        Gemini API key
        <input
          type="password"
          value={apiKey}
          placeholder="Paste key from Google AI Studio"
          onChange={(e) => setApiKey(e.target.value.trim())}
        />
      </label>
      <label>
        Model
        <input value={model} onChange={(e) => setModel(e.target.value.trim())} list="models" />
        <datalist id="models">
          {models.map((m) => <option key={m} value={m} />)}
        </datalist>
      </label>
      <button className="ghost" disabled={!apiKey} onClick={load}>Fetch available models</button>
      {msg && <p className="hint">{msg}</p>}
      <p className="hint">The key is stored only in this browser (localStorage) and is sent directly to Google.</p>
      <button className="primary" disabled={!apiKey || !model} onClick={onClose}>Done</button>
    </div>
  );
}

/* ------------------------------------------------------------------ Camera */
function Camera({ onCapture, count }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setError(
          window.isSecureContext
            ? `Camera unavailable (${e.name}). Use the photo button below.`
            : 'Live camera needs HTTPS. Use the photo button below, or open the https:// URL.'
        );
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    onCapture(captureFromVideo(v));
    setFlash(true);
    navigator.vibrate?.(30);
    setTimeout(() => setFlash(false), 150);
  };

  const onFiles = async (e) => {
    for (const f of Array.from(e.target.files || [])) onCapture(await fileToPayload(f));
    e.target.value = '';
  };

  return (
    <div className="camera">
      {error ? <div className="cam-error">{error}</div> : <video ref={videoRef} autoPlay playsInline muted />}
      {flash && <div className="flash" />}
      <div className="cam-controls">
        <button className="ghost small" onClick={() => fileRef.current.click()}>📷 Photo / Gallery</button>
        <button className="shutter" onClick={snap} disabled={!!error} aria-label="Capture" />
        <span className="badge">{count}</span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={onFiles} />
    </div>
  );
}

/* ----------------------------------------------------------------- Results */
function StatusPill({ status }) {
  const map = { queued: '⏳ Queued', processing: '⚙️ Solving', done: '✅ Done', error: '⚠️ Failed' };
  return <span className={`pill ${status}`}>{map[status]}</span>;
}

function Results({ items, onRetry, onRemove }) {
  const answerKey = useMemo(() => {
    let n = 0;
    return items.flatMap((it) =>
      (it.result?.questions || []).map((q) => ({
        key: `${it.id}-${n}`,
        n: ++n,
        label: q.number || String(n),
        ans: q.readable ? q.answerLabels.join(', ') || '?' : '—',
        low: q.confidence === 'low' || !q.readable,
      }))
    );
  }, [items]);

  const copy = () =>
    navigator.clipboard?.writeText(answerKey.map((a) => `Q${a.label}: ${a.ans}`).join('\n'));

  if (!items.length) return <p className="empty">No captures yet. Go to the Capture tab and start snapping questions.</p>;

  return (
    <div className="results">
      {answerKey.length > 0 && (
        <section className="key">
          <div className="key-head">
            <h3>Answer key</h3>
            <button className="ghost small" onClick={copy}>Copy</button>
          </div>
          <div className="key-grid">
            {answerKey.map((a) => (
              <div key={a.key} className={`key-cell ${a.low ? 'low' : ''}`}>
                <small>Q{a.label}</small>
                <b>{a.ans}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {items.map((it, i) => (
        <article key={it.id} className="card">
          <div className="card-head">
            <img src={it.dataUrl} alt={`Capture ${i + 1}`} />
            <div>
              <b>Image {i + 1}</b>
              <StatusPill status={it.status} />
            </div>
            <button className="icon" onClick={() => onRemove(it.id)} aria-label="Remove">✕</button>
          </div>

          {it.status === 'error' && (
            <div className="err">
              {it.error} <button className="ghost small" onClick={() => onRetry(it.id)}>Retry</button>
            </div>
          )}

          {it.result?.questions?.map((q, j) => (
            <div key={j} className="q">
              <p className="q-text">
                {q.number && <b>Q{q.number}. </b>}
                {q.question}
              </p>
              <ul>
                {q.options.map((o) => (
                  <li key={o.label} className={q.answerLabels.includes(o.label) ? 'correct' : ''}>
                    <b>{o.label}</b> {o.text}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="expl">{q.explanation}</p>}
              <small className={`conf ${q.confidence}`}>
                Confidence: {q.confidence}{!q.readable && ' · image unclear, retake recommended'}
              </small>
            </div>
          ))}
          {it.status === 'done' && !it.result?.questions?.length && <p className="hint">No questions detected.</p>}
        </article>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- App */
export default function App() {
  const [apiKey, setApiKey] = useState(() => ls.get('gemini_key', ''));
  const [model, setModel] = useState(() => ls.get('gemini_model', DEFAULT_MODEL));
  const [showSettings, setShowSettings] = useState(() => !ls.get('gemini_key', ''));
  const [tab, setTab] = useState('capture');
  const [items, setItems] = useState([]);
  const inFlight = useRef(new Set());

  useEffect(() => ls.set('gemini_key', apiKey), [apiKey]);
  useEffect(() => ls.set('gemini_model', model), [model]);

  const update = useCallback(
    (id, patch) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    []
  );

  // Background queue: whenever items change, start queued ones up to CONCURRENCY.
  useEffect(() => {
    if (!apiKey) return;
    const free = CONCURRENCY - inFlight.current.size;
    if (free <= 0) return;
    items
      .filter((x) => x.status === 'queued' && !inFlight.current.has(x.id))
      .slice(0, free)
      .forEach(async (item) => {
        inFlight.current.add(item.id);
        update(item.id, { status: 'processing', error: '' });
        try {
          const result = await solveImage({ apiKey, model, base64: item.base64, mimeType: item.mimeType });
          update(item.id, { status: 'done', result });
        } catch (e) {
          update(item.id, { status: 'error', error: e.message });
        } finally {
          inFlight.current.delete(item.id);
          setItems((xs) => [...xs]); // nudge the effect to pick up the next item
        }
      });
  }, [items, apiKey, model, update]);

  // Warn before losing work on refresh.
  useEffect(() => {
    const h = (e) => { if (items.length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [items.length]);

  const addCapture = useCallback((payload) => {
    setItems((xs) => [...xs, { id: uid(), status: 'queued', ...payload }]);
  }, []);

  const stats = useMemo(() => {
    const done = items.filter((x) => x.status === 'done').length;
    const failed = items.filter((x) => x.status === 'error').length;
    return { done, failed, total: items.length, pending: items.length - done - failed };
  }, [items]);

  return (
    <div className="app">
      <header>
        <h1>MCQ Snap Solver</h1>
        <button className="icon" onClick={() => setShowSettings(true)} aria-label="Settings">⚙️</button>
      </header>

      {stats.total > 0 && (
        <div className="progress">
          <div className="bar"><span style={{ width: `${((stats.done + stats.failed) / stats.total) * 100}%` }} /></div>
          <small>
            {stats.done}/{stats.total} solved
            {stats.pending > 0 && ` · ${stats.pending} in background`}
            {stats.failed > 0 && ` · ${stats.failed} failed`}
          </small>
        </div>
      )}

      <main>
        {tab === 'capture' ? (
          <Camera onCapture={addCapture} count={stats.total} />
        ) : (
          <Results
            items={items}
            onRetry={(id) => update(id, { status: 'queued', error: '' })}
            onRemove={(id) => setItems((xs) => xs.filter((x) => x.id !== id))}
          />
        )}
      </main>

      <nav>
        <button className={tab === 'capture' ? 'active' : ''} onClick={() => setTab('capture')}>Capture</button>
        <button className={tab === 'answers' ? 'active' : ''} onClick={() => setTab('answers')}>
          Answers {stats.total > 0 && `(${stats.done}/${stats.total})`}
        </button>
        {items.length > 0 && (
          <button className="danger" onClick={() => confirm('Clear all captures?') && setItems([])}>Clear</button>
        )}
      </nav>

      {showSettings && (
        <div className="overlay">
          <Settings
            apiKey={apiKey} setApiKey={setApiKey}
            model={model} setModel={setModel}
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}
    </div>
  );
}
