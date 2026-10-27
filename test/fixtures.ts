import { auth } from '#/auth/server'

export async function createBroker(email = 'ana@example.com') {
  const { user } = await auth.api.signUpEmail({
    body: { name: 'Ana', email, password: 'senha-forte-123' },
  })
  return user
}

export function textMessageWebhook(opts: {
  phoneNumberId: string
  from: string
  wamid: string
  text: string
  name?: string
  timestamp?: number
}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000000',
                phone_number_id: opts.phoneNumberId,
              },
              contacts: [
                { wa_id: opts.from, profile: { name: opts.name ?? 'Maria' } },
              ],
              messages: [
                {
                  id: opts.wamid,
                  from: opts.from,
                  timestamp: String(opts.timestamp ?? 1793000000),
                  type: 'text',
                  text: { body: opts.text },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}
