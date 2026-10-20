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

export type ToWorker = { type: 'analyze'; speeches: Speech[] }

export type FromWorker =
  | { type: 'status'; text: string; progress?: number }
  | { type: 'result'; overlaps: Overlap[] }
  | { type: 'error'; message: string }
