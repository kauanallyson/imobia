import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { contact, conversation, message } from '#/db/schema'
import { findBusinessNumber } from './business-number'

// A delivery can mix several kinds of changes; only `messages` ones are read,
// so a change we don't understand never blocks the messages next to it.
const webhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
    }),
  ),
})

// Only the parts of a `messages` change we use; anything else is ignored.
const messagesChangeSchema = z.object({
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
})

type MessagesChange = z.infer<typeof messagesChangeSchema>
type IncomingMessage = NonNullable<MessagesChange['messages']>[number]

export async function receiveWebhook(payload: unknown) {
  const { entry } = webhookSchema.parse(payload)
  for (const { changes } of entry) {
    for (const change of changes) {
      if (change.field !== 'messages') continue
      const parsed = messagesChangeSchema.safeParse(change.value)
      if (!parsed.success) {
        console.warn(
          `WhatsApp webhook: skipped a messages change it couldn't read: ${parsed.error.message}`,
        )
        continue
      }
      await receiveMessages(parsed.data)
    }
  }
}

async function receiveMessages(value: MessagesChange) {
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
    await storeIncoming(number.brokerId, conversationId, incoming)
  }
}

async function findOrStartConversation(
  brokerId: string,
  waId: string,
  name: string | undefined,
) {
  const existing = await findConversationId(db, brokerId, waId)
  if (existing) return existing

  return db.transaction(async (tx) => {
    // Meta can deliver a new number's first messages in parallel; the lock
    // makes the second delivery wait and then find the Conversation the first made.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${brokerId}:${waId}`}))`,
    )
    const raced = await findConversationId(tx, brokerId, waId)
    if (raced) return raced

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

async function findConversationId(
  executor: Pick<typeof db, 'select'>,
  brokerId: string,
  waId: string,
) {
  const [found] = await executor
    .select({ id: conversation.id })
    .from(conversation)
    .where(
      and(eq(conversation.brokerId, brokerId), eq(conversation.waId, waId)),
    )
  return found?.id
}

async function storeIncoming(
  brokerId: string,
  conversationId: string,
  incoming: IncomingMessage,
) {
  await db
    .insert(message)
    .values({
      brokerId,
      conversationId,
      wamid: incoming.id,
      direction: 'in',
      type: incoming.type,
      text: incoming.text?.body,
      sentAt: new Date(Number(incoming.timestamp) * 1000),
    })
    .onConflictDoNothing({ target: [message.brokerId, message.wamid] })
}
