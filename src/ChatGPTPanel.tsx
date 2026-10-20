import { useEffect, useState } from 'react'
import {
  accessToken,
  autoCallback,
  completeLogin,
  listModels,
  loginUrl,
  MANAGE_USAGE_URL,
  signOut,
  type Session,
} from './chatgpt'

const WELCOME_KEY = 'toastmaster.welcomeSeen'
// Example model from OpenAI's plan-usage docs; used when the list is unavailable.
const DEFAULT_MODEL = 'gpt-6.1-sol'

interface Props {
  session: Session | null
  setSession: (s: Session | null) => void
  model: string
  setModel: (m: string) => void
  disabled: boolean
}

export function ChatGPTPanel({ session, setSession, model, setModel, disabled }: Props) {
  const [waiting, setWaiting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [welcome, setWelcome] = useState(false)

  const finish = async (url: string) => {
    setError(null)
    try {
      const s = await completeLogin(url)
      setWaiting(false)
      setPasted('')
      setSession(s)
      try {
        if (!localStorage.getItem(WELCOME_KEY)) setWelcome(true)
      } catch {
        setWelcome(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Running locally on the callback address: the popup posts the result back.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.type === 'chatgpt-callback') void finish(e.data.url)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  useEffect(() => {
    if (!session) return
    accessToken()
      .then(listModels)
      .then((list) => {
        setModels(list)
        if (!list.includes(model)) setModel(list.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (list[0] ?? DEFAULT_MODEL))
      })
      .catch((err) => {
        if (!model) setModel(DEFAULT_MODEL)
        setError(err instanceof Error ? err.message : String(err))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const start = async () => {
    setError(null)
    // Open synchronously so the popup isn't blocked, then navigate it.
    const popup = window.open('about:blank', 'chatgpt-login', 'popup,width=520,height=720')
    const url = await loginUrl()
    if (popup) popup.location.href = url
    else window.open(url, '_blank')
    setWaiting(true)
  }

  const logout = async () => {
    const revoked = await signOut()
    setSession(null)
    setModels([])
    if (!revoked) {
      setError(
        'Du er logget ud her, men det kunne ikke bekræftes hos OpenAI. Du kan fjerne appen under Indstillinger i ChatGPT.',
      )
    }
  }

  const dismissWelcome = () => {
    setWelcome(false)
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <div className="chatgpt">
      <p className="hint">
        Talerne sendes direkte fra din browser til OpenAI under din egen ChatGPT-konto (aldrig via os), og
        OpenAI gemmer ikke svaret som en samtale. Kræver ChatGPT Plus eller Pro.
      </p>

      {welcome && (
        <div className="notice">
          <strong>Du bruger din ChatGPT-plan</strong>
          <p>
            Analyserne bruger af din ChatGPT-plan. Du kan se og begrænse forbruget i{' '}
            <a href={MANAGE_USAGE_URL} target="_blank" rel="noreferrer">
              ChatGPT-indstillingerne
            </a>
            .
          </p>
          <button type="button" onClick={dismissWelcome}>
            Forstået
          </button>
        </div>
      )}

      {session ? (
        <div className="signed-in">
          <span>
            Logget ind som <strong>{session.email || 'ChatGPT-bruger'}</strong> · Bruger din ChatGPT-plan ·{' '}
            <a href={MANAGE_USAGE_URL} target="_blank" rel="noreferrer">
              Administrér forbrug
            </a>
          </span>
          <label>
            Model{' '}
            <input list="chatgpt-models" value={model} onChange={(e) => setModel(e.target.value.trim())} disabled={disabled} />
            <datalist id="chatgpt-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <button type="button" onClick={logout} disabled={disabled}>
            Log ud
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={start} disabled={disabled}>
            Fortsæt med ChatGPT
          </button>
          {waiting && !autoCallback() && (
            <div className="paste">
              <p>
                Log ind i vinduet, der åbnede. Til sidst ender det på en side, der <em>ikke kan åbnes</em> (adressen
                starter med <code>http://127.0.0.1:1455/auth/callback</code>). Det er meningen. Kopiér hele adressen
                fra adresselinjen og indsæt den her:
              </p>
              <div className="paste-row">
                <input
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="http://127.0.0.1:1455/auth/callback?code=…"
                />
                <button type="button" onClick={() => finish(pasted)} disabled={!pasted.trim()}>
                  Fortsæt
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  )
}
