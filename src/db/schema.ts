import {
  bigint,
  date,
  numeric,
  pgEnum,
  pgTable,
  smallint,
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

export const developmentKind = pgEnum('development_kind', [
  'lot',
  'off_plan_house',
])

export const development = pgTable('development', {
  id: uuid('id').primaryKey().defaultRandom(),
  brokerId: brokerId(),
  kind: developmentKind('kind').notNull(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  neighborhood: text('neighborhood').notNull(),
  address: text('address'),
  description: text('description'),
  amenities: text('amenities'),
  paymentTerms: text('payment_terms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const availability = pgEnum('availability', [
  'available',
  'reserved',
  'sold',
])

export const property = pgTable(
  'property',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: brokerId(),
    developmentId: uuid('development_id')
      .notNull()
      .references(() => development.id, { onDelete: 'cascade' }),
    // How the developer names the unit, e.g. "Quadra 3, Lote 12" or "Casa 7".
    identifier: text('identifier').notNull(),
    // In centavos, so money never goes through floating point.
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    areaM2: numeric('area_m2', { precision: 10, scale: 2, mode: 'number' }),
    // Off-plan Houses only.
    bedrooms: smallint('bedrooms'),
    bathrooms: smallint('bathrooms'),
    parkingSpaces: smallint('parking_spaces'),
    expectedDelivery: date('expected_delivery'),
    availability: availability('availability').notNull().default('available'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique().on(table.developmentId, table.identifier)],
)
