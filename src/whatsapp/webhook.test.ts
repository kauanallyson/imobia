import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { createBroker, textMessageWebhook } from '../../test/fixtures'
import { linkBusinessNumber } from './business-number'
import { getConversation } from './conversations'
import { handleWebhook } from './webhook'

const url = 'http://localhost:3000/api/whatsapp/webhook'

function verifyRequest(token: string) {
  const params = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': token,
    'hub.challenge': '1158201444',
  })
  return new Request(`${url}?${params}`)
}

function signedPost(body: string, secret = 'test-app-secret') {
  const signature = createHmac('sha256', secret).update(body).digest('hex')
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body,
  })
}

describe('WhatsApp webhook endpoint', () => {
  test('Meta verifying the endpoint with the right token gets the challenge back', async () => {
    const res = await handleWebhook(verifyRequest('test-verify-token'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('1158201444')
  })

  test('verification with a wrong token is refused', async () => {
    const res = await handleWebhook(verifyRequest('wrong'))
    expect(res.status).toBe(403)
  })

  test('a delivery signed with the app secret is accepted and stored', async () => {
    const broker = await createBroker()
    await linkBusinessNumber({
      brokerId: broker.id,
      phoneNumberId: 'pn-1',
      displayPhoneNumber: '15550000000',
    })
    const body = JSON.stringify(
      textMessageWebhook({
        phoneNumberId: 'pn-1',
        from: '5588999990000',
        wamid: 'w1',
        text: 'Oi',
      }),
    )

    const res = await handleWebhook(signedPost(body))

    expect(res.status).toBe(200)
    const conversation = await getConversation(broker.id, '5588999990000')
    expect(conversation?.messages.map((m) => m.text)).toEqual(['Oi'])
  })

  test('a delivery with a bad signature is refused and not stored', async () => {
    const broker = await createBroker()
    await linkBusinessNumber({
      brokerId: broker.id,
      phoneNumberId: 'pn-1',
      displayPhoneNumber: '15550000000',
    })
    const body = JSON.stringify(
      textMessageWebhook({
        phoneNumberId: 'pn-1',
        from: '5588999990000',
        wamid: 'w1',
        text: 'Oi',
      }),
    )

    const res = await handleWebhook(signedPost(body, 'someone-else'))

    expect(res.status).toBe(401)
    expect(await getConversation(broker.id, '5588999990000')).toBeUndefined()
  })
})
