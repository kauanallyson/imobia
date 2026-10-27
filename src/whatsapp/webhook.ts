import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '#/env'
import { receiveWebhook } from './receive'

// Meta calls GET once to verify the endpoint, then POSTs every event to it.
export async function handleWebhook(request: Request) {
  if (request.method === 'GET') return verify(new URL(request.url))

  const body = await request.text()
  if (!isSignedByMeta(body, request.headers.get('x-hub-signature-256'))) {
    console.warn('WhatsApp webhook: rejected, bad X-Hub-Signature-256')
    return new Response('Invalid signature', { status: 401 })
  }
  await receiveWebhook(JSON.parse(body))
  return new Response(null, { status: 200 })
}

function verify(url: URL) {
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  if (mode !== 'subscribe' || token !== env.WHATSAPP_VERIFY_TOKEN) {
    return new Response('Forbidden', { status: 403 })
  }
  return new Response(url.searchParams.get('hub.challenge'), { status: 200 })
}

function isSignedByMeta(body: string, header: string | null) {
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', env.WHATSAPP_APP_SECRET).update(body).digest('hex')}`,
  )
  const received = Buffer.from(header ?? '')
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}
