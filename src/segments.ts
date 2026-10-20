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
