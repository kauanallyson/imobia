import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'

export * from './auth-schema'

// Better Auth names the Broker's table `user`; in our code it's the Broker.
const brokerId = () =>
  text('broker_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })

export const businessNumber = pgTable('business_number', {
  id: uuid('id').primaryKey().defaultRandom(),
  brokerId: brokerId().unique(),
  phoneNumberId: text('phone_number_id').notNull().unique(),
  displayPhoneNumber: text('display_phone_number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const contact = pgTable('contact', {
  id: uuid('id').primaryKey().defaultRandom(),
  brokerId: brokerId(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// One Conversation per Contact number; `waId` is that number as WhatsApp reports it.
export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: brokerId(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    waId: text('wa_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [unique().on(table.brokerId, table.waId)],
)

export const messageDirection = pgEnum('message_direction', ['in', 'out'])

export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: brokerId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    // WhatsApp's message id; unique per Broker so a webhook Meta retries is stored once.
    wamid: text('wamid').notNull(),
    direction: messageDirection('direction').notNull(),
    type: text('type').notNull(),
    text: text('text'),
    sentAt: timestamp('sent_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [unique().on(table.brokerId, table.wamid)],
)
