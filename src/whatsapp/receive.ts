import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { contact, conversation, message } from '#/db/schema'
import { findBusinessNumber } from './business-number'

// Only the parts of Meta's webhook payload we use; anything else is ignored.
const webhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
})

type Change = z.infer<typeof webhookSchema>['entry'][number]['changes'][number]
type IncomingMessage = NonNullable<Change['value']['messages']>[number]

export async function receiveWebhook(payload: unknown) {
  const { entry } = webhookSchema.parse(payload)
  for (const { changes } of entry) {
    for (const change of changes) {
      if (change.field === 'messages') await receiveChange(change)
    }
  }
}

async function receiveChange({ value }: Change) {
  const number = await findBusinessNumber(value.metadata.phone_number_id)
  if (!number) {
    console.warn(
      `WhatsApp webhook: ignored, no Business Number with phone_number_id ${value.metadata.phone_number_id}`,
    )
    return
  }

  for (const incoming of value.messages ?? []) {
    const name = value.contacts?.find((c) => c.wa_id === incoming.from)?.profile
      ?.name
    const conversationId = await findOrStartConversation(
      number.brokerId,
      incoming.from,
      name,
    )
    await storeIncoming(conversationId, incoming)
  }
}

async function findOrStartConversation(
  brokerId: string,
  waId: string,
  name: string | undefined,
) {
  const [existing] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(
      and(eq(conversation.brokerId, brokerId), eq(conversation.waId, waId)),
    )
  if (existing) return existing.id

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contact)
      .values({ brokerId, name })
      .returning({ id: contact.id })
    const [started] = await tx
      .insert(conversation)
      .values({ brokerId, contactId: created.id, waId })
      .returning({ id: conversation.id })
    return started.id
  })
}

async function storeIncoming(
  conversationId: string,
  incoming: IncomingMessage,
) {
  await db
    .insert(message)
    .values({
      conversationId,
      wamid: incoming.id,
      direction: 'in',
      type: incoming.type,
      text: incoming.text?.body,
      sentAt: new Date(Number(incoming.timestamp) * 1000),
    })
    .onConflictDoNothing({ target: message.wamid })
}
