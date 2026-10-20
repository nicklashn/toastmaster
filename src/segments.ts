// Splits a speech into short passages. Model quotes are mapped back to these,
// so we always show the original text instead of model output.
const MAX_SEGMENT_CHARS = 400

export function splitSegments(text: string): string[] {
  const segments: string[] = []
  for (const paragraph of text.split(/\n\s*\n|\n/)) {
    const sentences = paragraph.trim().match(/[^.!?…]+[.!?…]*["”»]?\s*/g) ?? []
    let current = ''
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > MAX_SEGMENT_CHARS) {
        segments.push(current.trim())
        current = ''
      }
      current += sentence
    }
    if (current.trim()) segments.push(current.trim())
  }
  return segments
}

// Groups segments into chunks that fit the model's 4k-token context window
// together with a chunk from another speech.
const MAX_CHUNK_CHARS = 2400

export function chunkSegments(segments: string[]): number[][] {
  const chunks: number[][] = []
  let current: number[] = []
  let size = 0
  segments.forEach((segment, i) => {
    if (current.length && size + segment.length > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(i)
    size += segment.length
  })
  if (current.length) chunks.push(current)
  return chunks
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\d]{3,}/gu) ?? []

// Returns the index of the segment that best contains the quoted words,
// or -1 if no segment matches at least half of them.
export function findSegment(quote: string, segments: string[], ids: number[]): number {
  const q = words(quote)
  if (!q.length) return -1
  let best = -1
  let bestScore = 0
  for (const i of ids) {
    const seg = new Set(words(segments[i]))
    const score = q.filter((w) => seg.has(w)).length / q.length
    if (score >= 0.5 && score > bestScore) {
      best = i
      bestScore = score
    }
  }
  return best
}

/** A finding between speech `sa` (passages `a`) and speech `sb` (passages `b`). */
export interface Found {
  sa: number
  sb: number
  a: number[]
  b: number[]
  kind: string
  explanation: string
}

// Adds a finding, merging it into an earlier one for the same two speeches
// that points at the same or neighbouring passages (one story split in two).
export function addFinding(
  found: Found[],
  sa: number,
  sb: number,
  ia: number,
  ib: number,
  kind: string,
  explanation: string,
) {
  const near = (list: number[], i: number) => list.some((x) => Math.abs(x - i) <= 1)
  const same = found.find((f) => f.sa === sa && f.sb === sb && near(f.a, ia) && near(f.b, ib))
  if (same) {
    if (!same.a.includes(ia)) same.a.push(ia)
    if (!same.b.includes(ib)) same.b.push(ib)
    if (same.kind === 'andet') same.kind = kind
  } else {
    found.push({ sa, sb, a: [ia], b: [ib], kind, explanation })
  }
}

export const excerpt = (idx: number[], segments: string[]) =>
  [...idx].sort((x, y) => x - y).map((i) => segments[i]).join(' ')
