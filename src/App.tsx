import { useEffect, useRef, useState } from 'react'
import { SAMPLE_SPEECHES } from './samples'
import type { FromWorker, Overlap, Speech } from './types'

const MIN = 2
const MAX = 6
const empty = (): Speech => ({ name: '', text: '' })
const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator

const KIND_LABEL: Record<string, string> = { historie: 'Historie', joke: 'Joke', andet: 'Andet' }

export default function App() {
  const [speeches, setSpeeches] = useState<Speech[]>([empty(), empty()])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; progress?: number } | null>(null)
  const [error, setError] = useState<string | null>(
    hasWebGPU
      ? null
      : 'Din browser understøtter ikke WebGPU, som er nødvendig for at køre AI-modellen lokalt. Brug en nyere udgave af Chrome eller Edge på en computer.',
  )
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
  const canCompare = !busy && hasWebGPU && filled.length >= MIN

  const compare = () => {
    setError(null)
    setOverlaps(null)
    setBusy(true)
    setStatus({ text: 'Starter…' })
    const named = filled.map((s, i) => ({ name: s.name.trim() || `Taler ${i + 1}`, text: s.text }))
    worker.current?.postMessage({ type: 'analyze', speeches: named })
  }

  return (
    <main>
      <h1>Sammenlign bryllupstaler</h1>
      <p className="intro">
        Find historier og jokes, som flere talere har tænkt sig at fortælle. AI-modellen (Qwen3-4B) kører
        lokalt i din browser – talerne sendes ikke nogen steder hen og gemmes ikke.
      </p>

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
      {!busy && hasWebGPU && filled.length < MIN && <p className="hint">Udfyld mindst to taler.</p>}

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
