import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { contact, conversation, message } from '#/db/schema'

export async function getConversation(brokerId: string, waId: string) {
  const [found] = await db
    .select({ conversation, contact })
    .from(conversation)
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .where(
      and(eq(conversation.brokerId, brokerId), eq(conversation.waId, waId)),
    )
  if (!found) return undefined

  const messages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, found.conversation.id))
    .orderBy(asc(message.sentAt), asc(message.createdAt))

  return { ...found.conversation, contact: found.contact, messages }
}
