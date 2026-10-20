export interface Speech {
  name: string
  text: string
}

export interface Overlap {
  speakerA: string
  speakerB: string
  kind: string
  explanation: string
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
