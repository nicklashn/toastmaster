// Forwards the app's two ChatGPT calls to OpenAI on the hosted version.
// OpenAI omits CORS headers on responses for ChatGPT plan tokens, so the
// browser can't call it directly (locally, vite.config.ts does the same).
// Nothing is stored or logged: only the user's own token and the request
// body are passed on, and the response is streamed straight back.
const ALLOWED: Record<string, string> = { models: 'GET', responses: 'POST' }

async function forward(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get('path') ?? ''
  if (ALLOWED[path] !== request.method) return new Response('Not found', { status: 404 })
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return new Response('Missing authorization', { status: 401 })

  const post = request.method === 'POST'
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: request.method,
    headers: post ? { authorization: auth, 'content-type': 'application/json' } : { authorization: auth },
    body: post ? await request.text() : undefined,
    signal: request.signal,
  })
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}

export const GET = forward
export const POST = forward
