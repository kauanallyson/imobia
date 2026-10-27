import { describe, expect, test } from 'bun:test'
import { createBroker, textMessageWebhook } from '../../test/fixtures'
import { linkBusinessNumber } from './business-number'
import { getConversation } from './conversations'
import { receiveWebhook } from './receive'

async function brokerWithNumber(phoneNumberId = 'pn-1', email?: string) {
  const broker = await createBroker(email)
  await linkBusinessNumber({
    brokerId: broker.id,
    phoneNumberId,
    displayPhoneNumber: '15550000000',
  })
  return broker
}

describe('receiveWebhook', () => {
  test('a first message from a new number creates a Contact and its Conversation', async () => {
    const broker = await brokerWithNumber()

    await receiveWebhook(
      textMessageWebhook({
        phoneNumberId: 'pn-1',
        from: '5588999990000',
        wamid: 'wamid.1',
        text: 'Oi, tem terreno no centro?',
        name: 'Maria',
      }),
    )

    const conversation = await getConversation(broker.id, '5588999990000')
    expect(conversation?.contact.name).toBe('Maria')
    expect(conversation?.messages.map((m) => [m.direction, m.text])).toEqual([
      ['in', 'Oi, tem terreno no centro?'],
    ])
  })

  test('later messages from the same number join the same Conversation', async () => {
    const broker = await brokerWithNumber()
    const from = '5588999990000'

    await receiveWebhook(
      textMessageWebhook({
        phoneNumberId: 'pn-1',
        from,
        wamid: 'w1',
        text: 'Oi',
        timestamp: 100,
      }),
    )
    const first = await getConversation(broker.id, from)
    await receiveWebhook(
      textMessageWebhook({
        phoneNumberId: 'pn-1',
        from,
        wamid: 'w2',
        text: 'Tem casa?',
        timestamp: 200,
      }),
    )

    const conversation = await getConversation(broker.id, from)
    expect(conversation?.id).toBe(first!.id)
    expect(conversation?.messages.map((m) => m.text)).toEqual([
      'Oi',
      'Tem casa?',
    ])
  })

  test('a message Meta delivers twice is stored once', async () => {
    const broker = await brokerWithNumber()
    const webhook = textMessageWebhook({
      phoneNumberId: 'pn-1',
      from: '5588999990000',
      wamid: 'w1',
      text: 'Oi',
    })

    await receiveWebhook(webhook)
    await receiveWebhook(webhook)

    const conversation = await getConversation(broker.id, '5588999990000')
    expect(conversation?.messages).toHaveLength(1)
  })

  test('a message to a number no Broker connected is ignored', async () => {
    const broker = await brokerWithNumber('pn-1')

    await receiveWebhook(
      textMessageWebhook({
        phoneNumberId: 'pn-other',
        from: '5588999990000',
        wamid: 'w1',
        text: 'Oi',
      }),
    )

    expect(await getConversation(broker.id, '5588999990000')).toBeUndefined()
  })

  test('the same person writing to two Brokers is a separate Contact for each', async () => {
    const ana = await brokerWithNumber('pn-ana', 'ana@example.com')
    const bia = await brokerWithNumber('pn-bia', 'bia@example.com')
    const from = '5588999990000'

    await receiveWebhook(
      textMessageWebhook({
        phoneNumberId: 'pn-ana',
        from,
        wamid: 'w1',
        text: 'Oi Ana',
      }),
    )
    await receiveWebhook(
      textMessageWebhook({
        phoneNumberId: 'pn-bia',
        from,
        wamid: 'w2',
        text: 'Oi Bia',
      }),
    )

    const withAna = await getConversation(ana.id, from)
    const withBia = await getConversation(bia.id, from)
    expect(withAna?.contact.id).not.toBe(withBia?.contact.id)
    expect(withAna?.messages.map((m) => m.text)).toEqual(['Oi Ana'])
    expect(withBia?.messages.map((m) => m.text)).toEqual(['Oi Bia'])
  })

  test('messages from a new number arriving at once still make one Contact', async () => {
    const broker = await brokerWithNumber()
    const from = '5588999990000'
    const texts = Array.from({ length: 20 }, (_, i) => `mensagem ${i}`)

    await Promise.all(
      texts.map((text, i) =>
        receiveWebhook(
          textMessageWebhook({
            phoneNumberId: 'pn-1',
            from,
            wamid: `w${i}`,
            text,
            timestamp: 100 + i,
          }),
        ),
      ),
    )

    const conversation = await getConversation(broker.id, from)
    expect(conversation?.messages.map((m) => m.text)).toEqual(texts)
  })

  test('messages are stored even when the delivery also carries other kinds of changes', async () => {
    const broker = await brokerWithNumber()
    const webhook = textMessageWebhook({
      phoneNumberId: 'pn-1',
      from: '5588999990000',
      wamid: 'w1',
      text: 'Oi',
    })
    webhook.entry[0].changes.unshift({
      field: 'account_update',
      value: { event: 'VERIFIED_ACCOUNT' },
    } as never)

    await receiveWebhook(webhook)

    const conversation = await getConversation(broker.id, '5588999990000')
    expect(conversation?.messages.map((m) => m.text)).toEqual(['Oi'])
  })
})
