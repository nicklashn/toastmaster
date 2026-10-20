import { apiBase, autoCallback, MANAGE_USAGE_URL, NOT_LOCAL } from './chatgpt'
import { addFinding, excerpt, findSegment, splitSegments, type Found } from './segments'
import { FriendlyError, type Overlap, type Speech } from './types'

// Plan-usage requests must use the Responses API with store: false and
// stream: true, and must not set temperature or max_output_tokens.
// See https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

const INSTRUCTIONS = `Du hjælper med at planlægge et dansk bryllup. Du får flere bryllupstaler og finder historier, anekdoter og jokes, som MINDST TO talere fortæller – også når de er formuleret forskelligt, fortalt fra en anden vinkel, eller detaljerne afviger lidt. Tænk: "Den historie har gæsterne allerede hørt."
Tæller IKKE som overlap:
- almindelige floskler og hilsner (fx "tillykke", "skål for brudeparret", "I er så smukke")
- to forskellige historier, der blot handler om samme person, sted eller egenskab
Angiv hvert overlap som et par af to taler. Fortæller tre taler samme historie, så angiv hvert par.
For hver tale: kopiér en kort sætning ORDRET fra talen, hvor historien fortælles. Forklar kort på dansk (1–2 sætninger), hvad der gentages.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overlaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tale_a: { type: 'integer' },
          citat_a: { type: 'string' },
          tale_b: { type: 'integer' },
          citat_b: { type: 'string' },
          type: { type: 'string', enum: ['historie', 'joke', 'andet'] },
          forklaring: { type: 'string' },
        },
        required: ['tale_a', 'citat_a', 'tale_b', 'citat_b', 'type', 'forklaring'],
      },
    },
  },
  required: ['overlaps'],
}

interface RawOverlap {
  tale_a: number
  citat_a: string
  tale_b: number
  citat_b: string
  type: string
  forklaring: string
}

export async function analyzeWithChatGPT(speeches: Speech[], token: string, model: string): Promise<Overlap[]> {
  const segments = speeches.map((s) => splitSegments(s.text))
  const text = speeches
    .map((s, i) => `Tale ${i + 1} (af ${s.name}):\n"""\n${s.text.trim()}\n"""`)
    .join('\n\n')

  let res: Response
  try {
    res = await fetch(`${apiBase()}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: INSTRUCTIONS,
        input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
        text: { format: { type: 'json_schema', name: 'overlaps', strict: true, schema: SCHEMA } },
        store: false,
        stream: true,
      }),
    })
  } catch {
    throw new FriendlyError(autoCallback() ? 'Kunne ikke få forbindelse til ChatGPT. Tjek din internetforbindelse.' : NOT_LOCAL)
  }
  if (!res.ok || !res.body) throw new FriendlyError(await errorMessage(res))

  let raw: RawOverlap[]
  try {
    raw = JSON.parse(await readStream(res.body)).overlaps ?? []
  } catch (err) {
    if (err instanceof FriendlyError) throw err
    throw new FriendlyError('ChatGPT returnerede et svar, der ikke kunne læses. Prøv igen.')
  }

  const found: Found[] = []
  for (const o of raw) {
    const [sa, sb] = [o.tale_a - 1, o.tale_b - 1]
    if (!segments[sa] || !segments[sb] || sa === sb) continue
    const all = (i: number) => segments[i].map((_, k) => k)
    const ia = findSegment(o.citat_a, segments[sa], all(sa))
    const ib = findSegment(o.citat_b, segments[sb], all(sb))
    if (ia < 0 || ib < 0) continue
    // Keep a consistent order so the same pair merges either way round.
    if (sa < sb) addFinding(found, sa, sb, ia, ib, o.type, o.forklaring)
    else addFinding(found, sb, sa, ib, ia, o.type, o.forklaring)
  }

  return found.map((f) => ({
    speakerA: speeches[f.sa].name,
    speakerB: speeches[f.sb].name,
    kind: f.kind,
    explanation: f.explanation,
    excerptA: excerpt(f.a, segments[f.sa]),
    excerptB: excerpt(f.b, segments[f.sb]),
  }))
}

/** Reads the server-sent events and returns the output text once completed. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const data = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('')
      if (!data || data === '[DONE]') continue
      const msg = JSON.parse(data)
      if (msg.type === 'response.output_text.delta') output += msg.delta
      else if (msg.type === 'response.completed') return output
      else if (msg.type === 'response.failed' || msg.type === 'error') {
        throw new FriendlyError(describeError(msg.response?.error?.code ?? msg.code, msg.response?.error?.message ?? msg.message))
      }
    }
  }
  throw new FriendlyError('Svaret fra ChatGPT blev afbrudt. Prøv igen.')
}

async function errorMessage(res: Response): Promise<string> {
  let code = ''
  let message = ''
  try {
    const body = await res.json()
    code = body.error?.code ?? ''
    message = body.error?.message ?? ''
  } catch {
    // no JSON body
  }
  if (res.status === 401) return 'Dit ChatGPT-login er udløbet eller ugyldigt. Log ud og ind igen.'
  return describeError(code, message || `HTTP ${res.status}`)
}

function describeError(code: string | undefined, message: string): string {
  if (code === 'subscription_sharing_usage_limit_exceeded') {
    return `Du har nået grænsen for, hvor meget af din ChatGPT-plan denne app må bruge. Se "Administrér forbrug": ${MANAGE_USAGE_URL}`
  }
  if (code === 'subscription_sharing_user_not_eligible') {
    return 'Din ChatGPT-konto kan ikke bruges i andre apps (det kræver ChatGPT Plus eller Pro, og din arbejdsplads kan have slået det fra). Brug i stedet den lokale AI.'
  }
  return `ChatGPT-fejl: ${message}`
}
