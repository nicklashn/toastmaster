import { CreateMLCEngine, prebuiltAppConfig, type MLCEngine } from '@mlc-ai/web-llm'
import { chunkSegments, findSegment, splitSegments } from './segments'
import type { FromWorker, Overlap, Speech, ToWorker } from './types'

// Both ids are in WebLLM's prebuilt model list. f16 is smaller and faster but
// needs the GPU to support the "shader-f16" feature.
const MODEL_F16 = 'Qwen3-4B-q4f16_1-MLC'
const MODEL_F32 = 'Qwen3-4B-q4f32_1-MLC'

let engine: MLCEngine | null = null

interface MinimalGPU {
  requestAdapter(opts?: object): Promise<{ features: Set<string> } | null>
}

const post = (msg: FromWorker) => self.postMessage(msg)

async function getEngine(): Promise<MLCEngine> {
  if (engine) return engine
  const gpu = (navigator as Navigator & { gpu?: MinimalGPU }).gpu
  if (!gpu) throw new FriendlyError(NO_WEBGPU)
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new FriendlyError(NO_WEBGPU)
  const model = adapter.features.has('shader-f16') ? MODEL_F16 : MODEL_F32

  post({ type: 'status', text: 'Forbereder AI-model…', progress: 0 })
  engine = await CreateMLCEngine(model, {
    appConfig: { ...prebuiltAppConfig, cacheBackend: await pickCacheBackend() },
    initProgressCallback: (r) =>
      post({ type: 'status', text: describeProgress(r.text), progress: r.progress }),
  })
  return engine
}

// Cache Storage is the default, but it can fail in some browser profiles;
// IndexedDB is the fallback. Only model files are cached, never speeches.
async function pickCacheBackend(): Promise<'cache' | 'indexeddb'> {
  try {
    await caches.open('webllm-probe')
    await caches.delete('webllm-probe')
    return 'cache'
  } catch {
    return 'indexeddb'
  }
}

function describeProgress(text: string): string {
  if (/fetching|loading model from cache/i.test(text)) {
    return `Henter AI-model (ca. 2–3 GB første gang, derefter fra browserens cache). ${text}`
  }
  return text
}

const SYSTEM_PROMPT = `Du hjælper med at planlægge et dansk bryllup. Du sammenligner to bryllupstaler og finder historier, anekdoter og jokes, som BEGGE talere fortæller – også når de er formuleret forskelligt, fortalt fra en anden vinkel, eller detaljerne afviger lidt. Tænk: "Den historie har gæsterne allerede hørt."
Tæller IKKE som overlap:
- almindelige floskler og hilsner (fx "tillykke", "skål for brudeparret", "I er så smukke")
- to forskellige historier, der blot handler om samme person, sted eller egenskab
Nævn hver historie eller joke kun én gang. Svar kun med JSON.`

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    overlaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['historie', 'joke', 'andet'] },
          citat_a: { type: 'string' },
          citat_b: { type: 'string' },
          forklaring: { type: 'string' },
        },
        required: ['type', 'citat_a', 'citat_b', 'forklaring'],
      },
    },
  },
  required: ['overlaps'],
})

interface RawOverlap {
  type: string
  citat_a: string
  citat_b: string
  forklaring: string
}

interface Part {
  speech: Speech
  segments: string[]
  ids: number[]
}

interface Found {
  a: number[]
  b: number[]
  kind: string
  explanation: string
}

async function comparePair(llm: MLCEngine, a: Part, b: Part): Promise<Overlap[]> {
  const text = (part: Part) => part.ids.map((i) => part.segments[i]).join('\n')

  const user = `Tale A (af ${a.speech.name}):
"""
${text(a)}
"""

Tale B (af ${b.speech.name}):
"""
${text(b)}
"""

Find ALLE historier og jokes, der fortælles i både tale A og tale B. Gå tale A igennem afsnit for afsnit og tjek hvert afsnit mod tale B – der er ofte mere end ét overlap.
For hver: kopiér en kort sætning ORDRET fra hver tale, hvor historien fortælles, og forklar kort på dansk (1–2 sætninger), hvad der gentages.
Returnér JSON på formen {"overlaps":[{"type":"historie","citat_a":"...","citat_b":"...","forklaring":"..."}]}.
Hvis der ikke er nogen overlap, returnér {"overlaps":[]}.`

  const reply = await llm.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_tokens: 900,
    response_format: { type: 'json_object', schema: SCHEMA },
    extra_body: { enable_thinking: false },
  })

  let raw: RawOverlap[] = []
  try {
    raw = JSON.parse(stripThink(reply.choices[0].message.content)).overlaps ?? []
  } catch {
    return [] // truncated or invalid JSON: treat as no result for this pair
  }

  // Map each quote back to the original passage, and merge findings that
  // point at the same or neighbouring passages (one story split in two).
  const found: Found[] = []
  for (const o of raw) {
    const ia = findSegment(o.citat_a, a.segments, a.ids)
    const ib = findSegment(o.citat_b, b.segments, b.ids)
    if (ia < 0 || ib < 0) continue
    const near = (list: number[], i: number) => list.some((x) => Math.abs(x - i) <= 1)
    const same = found.find((f) => near(f.a, ia) && near(f.b, ib))
    if (same) {
      if (!same.a.includes(ia)) same.a.push(ia)
      if (!same.b.includes(ib)) same.b.push(ib)
      if (same.kind === 'andet') same.kind = o.type
    } else {
      found.push({ a: [ia], b: [ib], kind: o.type, explanation: o.forklaring })
    }
  }

  const excerpt = (idx: number[], part: Part) =>
    [...idx].sort((x, y) => x - y).map((i) => part.segments[i]).join(' ')
  const overlaps: Overlap[] = []
  for (const f of found) {
    const o = {
      speakerA: a.speech.name,
      speakerB: b.speech.name,
      kind: f.kind,
      explanation: f.explanation,
      excerptA: excerpt(f.a, a),
      excerptB: excerpt(f.b, b),
    }
    if (await isSameStory(llm, o.excerptA, o.excerptB)) overlaps.push(o)
  }
  return overlaps
}

// Second, focused check on just the two excerpts. A small model is much more
// precise judging one pair than when scanning two whole speeches.
async function isSameStory(llm: MLCEngine, a: string, b: string): Promise<boolean> {
  const reply = await llm.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: `Uddrag 1: "${a}"

Uddrag 2: "${b}"

Fortæller de to uddrag den SAMME konkrete historie, hændelse eller joke (samme pointe), så gæsterne ville tænke "den har vi hørt"? Det er IKKE nok, at de handler om samme person, sted eller egenskab.
Svar med JSON: {"samme": true} eller {"samme": false}.`,
      },
    ],
    temperature: 0,
    max_tokens: 30,
    response_format: { type: 'json_object', schema: VERIFY_SCHEMA },
    extra_body: { enable_thinking: false },
  })
  try {
    return JSON.parse(stripThink(reply.choices[0].message.content)).samme === true
  } catch {
    return false
  }
}

const VERIFY_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { samme: { type: 'boolean' } },
  required: ['samme'],
})

// With thinking disabled WebLLM still prefixes an empty <think></think> block.
const stripThink = (content: string | null) => (content ?? '').replace(/<think>[\s\S]*?<\/think>/, '')

async function analyze(speeches: Speech[]) {
  const llm = await getEngine()
  const prepared = speeches.map((speech) => {
    const segments = splitSegments(speech.text)
    return { speech, segments, chunks: chunkSegments(segments) }
  })

  const jobs: Array<() => Promise<Overlap[]>> = []
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const [p, q] = [prepared[i], prepared[j]]
      for (const ca of p.chunks) {
        for (const cb of q.chunks) {
          jobs.push(() =>
            comparePair(
              llm,
              { speech: p.speech, segments: p.segments, ids: ca },
              { speech: q.speech, segments: q.segments, ids: cb },
            ),
          )
        }
      }
    }
  }

  const overlaps: Overlap[] = []
  for (let k = 0; k < jobs.length; k++) {
    post({ type: 'status', text: `Sammenligner taler (${k + 1} af ${jobs.length})…`, progress: k / jobs.length })
    overlaps.push(...(await jobs[k]()))
  }
  post({ type: 'result', overlaps })
}

class FriendlyError extends Error {}

const NO_WEBGPU =
  'Din browser understøtter ikke WebGPU, som er nødvendig for at køre AI-modellen lokalt. Brug en nyere udgave af Chrome eller Edge på en computer (ikke mobil), og sørg for at hardwareacceleration er slået til.'

function friendlyMessage(err: unknown): string {
  if (err instanceof FriendlyError) return err.message
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  if (/webgpu|navigator\.gpu|adapter/i.test(text) && !/memory/i.test(text)) return NO_WEBGPU
  if (/memory|OOM|device.*lost|DeviceLost|allocat|maxBufferSize|maxStorageBuffer/i.test(text)) {
    return 'Din computer har ikke nok grafikhukommelse til AI-modellen (kræver ca. 3,5–4,5 GB). Luk andre faner og programmer og prøv igen, eller brug en computer med et kraftigere grafikkort.'
  }
  if (/quota|storage|cache/i.test(text)) {
    return 'Der er ikke plads nok i browserens lager til at gemme AI-modellen (ca. 2–3 GB). Frigør diskplads, og undgå privat/inkognito-tilstand.'
  }
  if (/fetch|network/i.test(text)) {
    return 'AI-modellen kunne ikke hentes. Tjek din internetforbindelse og prøv igen.'
  }
  return `Der opstod en fejl: ${text}`
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  if (e.data.type !== 'analyze') return
  try {
    await analyze(e.data.speeches)
  } catch (err) {
    console.error(err)
    // A lost device makes the engine unusable; recreate it next time.
    if (/lost/i.test(String(err))) engine = null
    post({ type: 'error', message: friendlyMessage(err) })
  }
}
