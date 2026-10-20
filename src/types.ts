export interface Speech {
  name: string
  text: string
}

/** 'klar': the same story or joke. 'gråzone': similar enough to feel repeated. */
export type Level = 'klar' | 'gråzone'

export interface Overlap {
  speakerA: string
  speakerB: string
  kind: string
  level: Level
  explanation: string
  /** Advice for the toastmaster, based on the speaking order. */
  suggestion: string
  excerptA: string
  excerptB: string
}

export type Provider = { kind: 'local' } | { kind: 'chatgpt'; token: string; model: string }

export type ToWorker = { type: 'analyze'; speeches: Speech[]; provider: Provider }

export type FromWorker =
  | { type: 'status'; text: string; progress?: number }
  | { type: 'result'; overlaps: Overlap[] }
  | { type: 'error'; message: string }

/** An error whose message is already written for the user. */
export class FriendlyError extends Error {}
