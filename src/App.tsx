import { useEffect, useRef, useState } from 'react'
import { ChatGPTPanel } from './ChatGPTPanel'
import { accessToken, savedSession, type Session } from './chatgpt'
import { SAMPLE_SPEECHES } from './samples'
import type { FromWorker, Overlap, Provider, Speech } from './types'

const MIN = 2
const MAX = 6
const empty = (): Speech => ({ name: '', text: '' })
const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator

const KIND_LABEL: Record<string, string> = { historie: 'Historie', joke: 'Joke', andet: 'Andet' }

export default function App() {
  const [speeches, setSpeeches] = useState<Speech[]>([empty(), empty()])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; progress?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider['kind']>(hasWebGPU ? 'local' : 'chatgpt')
  const [session, setSession] = useState<Session | null>(savedSession)
  const [model, setModel] = useState('')
  const [overlaps, setOverlaps] = useState<Overlap[] | null>(null)
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      if (msg.type === 'status') setStatus({ text: msg.text, progress: msg.progress })
      else {
        setBusy(false)
        setStatus(null)
        if (msg.type === 'result') setOverlaps(msg.overlaps)
        else setError(msg.message)
      }
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const update = (i: number, patch: Partial<Speech>) =>
    setSpeeches((s) => s.map((sp, j) => (j === i ? { ...sp, ...patch } : sp)))

  const filled = speeches.filter((s) => s.text.trim())
  const aiReady = provider === 'local' ? hasWebGPU : Boolean(session && model)
  const canCompare = !busy && aiReady && filled.length >= MIN

  const compare = async () => {
    setError(null)
    setOverlaps(null)
    setBusy(true)
    setStatus({ text: 'Starter…' })
    const named = filled.map((s, i) => ({ name: s.name.trim() || `Taler ${i + 1}`, text: s.text }))
    let chosen: Provider = { kind: 'local' }
    if (provider === 'chatgpt') {
      try {
        chosen = { kind: 'chatgpt', token: await accessToken(), model }
      } catch (err) {
        setBusy(false)
        setStatus(null)
        setSession(savedSession())
        setError(err instanceof Error ? err.message : String(err))
        return
      }
    }
    worker.current?.postMessage({ type: 'analyze', speeches: named, provider: chosen })
  }

  return (
    <main>
      <h1>Sammenlign bryllupstaler</h1>
      <p className="intro">
        Find historier og jokes, som flere talere har tænkt sig at fortælle. Talerne gemmes ikke.
      </p>

      <fieldset className="provider">
        <legend>AI</legend>
        <label>
          <input
            type="radio"
            checked={provider === 'local'}
            onChange={() => setProvider('local')}
            disabled={busy}
          />{' '}
          <strong>Lokal AI i browseren</strong> – privat og gratis. Talerne forlader ikke din computer. Mindre præcis
          (Qwen3-4B, ca. 2–3 GB download første gang).
        </label>
        {provider === 'local' && !hasWebGPU && (
          <div className="error">
            Din browser understøtter ikke WebGPU, som er nødvendig for den lokale AI. Brug en nyere udgave af Chrome
            eller Edge på en computer – eller vælg ChatGPT.
          </div>
        )}
        <label>
          <input
            type="radio"
            checked={provider === 'chatgpt'}
            onChange={() => setProvider('chatgpt')}
            disabled={busy}
          />{' '}
          <strong>ChatGPT</strong> – mere præcis. Bruger dit eget ChatGPT Plus- eller Pro-abonnement.
        </label>
        {provider === 'chatgpt' && (
          <ChatGPTPanel session={session} setSession={setSession} model={model} setModel={setModel} disabled={busy} />
        )}
      </fieldset>

      <div className="toolbar">
        <button type="button" onClick={() => setSpeeches(SAMPLE_SPEECHES.map((s) => ({ ...s })))} disabled={busy}>
          Indsæt eksempeltaler
        </button>
        <button
          type="button"
          onClick={() => setSpeeches((s) => [...s, empty()])}
          disabled={busy || speeches.length >= MAX}
        >
          + Tilføj tale
        </button>
      </div>

      <div className="speeches">
        {speeches.map((s, i) => (
          <div className="speech" key={i}>
            <div className="speech-head">
              <input
                placeholder={`Taler ${i + 1} (navn)`}
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={busy}
              />
              {speeches.length > MIN && (
                <button
                  type="button"
                  className="remove"
                  aria-label="Fjern tale"
                  onClick={() => setSpeeches((all) => all.filter((_, j) => j !== i))}
                  disabled={busy}
                >
                  ×
                </button>
              )}
            </div>
            <textarea
              placeholder="Indsæt talen her…"
              value={s.text}
              onChange={(e) => update(i, { text: e.target.value })}
              disabled={busy}
            />
          </div>
        ))}
      </div>

      <button type="button" className="primary" onClick={compare} disabled={!canCompare}>
        {busy ? 'Arbejder…' : 'Sammenlign taler'}
      </button>
      {!busy && aiReady && filled.length < MIN && <p className="hint">Udfyld mindst to taler.</p>}

      {status && (
        <div className="status">
          <p>{status.text}</p>
          {status.progress !== undefined && <progress value={status.progress} max={1} />}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {overlaps && (
        <section>
          <h2>{overlaps.length ? `Mulige overlap (${overlaps.length})` : 'Ingen overlap fundet'}</h2>
          {overlaps.length > 0 && (
            <p className="hint">AI'en kan tage fejl – brug resultatet som et udgangspunkt for en snak med talerne.</p>
          )}
          {overlaps.map((o, i) => (
            <article className="overlap" key={i}>
              <p>
                <span className="tag">{KIND_LABEL[o.kind] ?? o.kind}</span> {o.explanation}
              </p>
              <div className="side-by-side">
                <blockquote>
                  <cite>{o.speakerA}</cite>
                  {o.excerptA}
                </blockquote>
                <blockquote>
                  <cite>{o.speakerB}</cite>
                  {o.excerptB}
                </blockquote>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
