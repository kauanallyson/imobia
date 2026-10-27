import { and, asc, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { development, property } from '#/db/schema'

export const developmentInput = z.object({
  kind: z.enum(['lot', 'off_plan_house']),
  name: z.string().trim().min(1),
  city: z.string().trim().min(1),
  neighborhood: z.string().trim().min(1),
  address: optionalText(),
  description: optionalText(),
  amenities: optionalText(),
  paymentTerms: optionalText(),
})

// Blank form fields are stored as null, not as empty strings.
function optionalText() {
  return z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
}

// Thrown when an id doesn't exist or belongs to another Broker; callers can't tell which.
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
  }
}

export async function createDevelopment(
  brokerId: string,
  input: z.input<typeof developmentInput>,
) {
  const [created] = await db
    .insert(development)
    .values({ brokerId, ...developmentInput.parse(input) })
    .returning()
  return created
}

export async function listDevelopments(brokerId: string) {
  const developments = await db
    .select()
    .from(development)
    .where(eq(development.brokerId, brokerId))
    .orderBy(asc(development.name))
  const counts = await db
    .select({
      developmentId: property.developmentId,
      availability: property.availability,
      units: count(),
    })
    .from(property)
    .where(eq(property.brokerId, brokerId))
    .groupBy(property.developmentId, property.availability)

  return developments.map((d) => {
    const units = { available: 0, reserved: 0, sold: 0 }
    for (const c of counts) {
      if (c.developmentId === d.id) units[c.availability] = c.units
    }
    return { ...d, units }
  })
}

export async function updateDevelopment(
  brokerId: string,
  id: string,
  input: z.input<typeof developmentInput>,
) {
  const [updated] = await db
    .update(development)
    .set(developmentInput.parse(input))
    .where(and(eq(development.id, id), eq(development.brokerId, brokerId)))
    .returning()
  if (!updated) throw new NotFoundError('Development')
  return updated
}

export const propertyInput = z.object({
  identifier: z.string().trim().min(1),
  priceCents: z.number().int().positive(),
  areaM2: z.number().positive().optional(),
  bedrooms: houseCount(),
  bathrooms: houseCount(),
  parkingSpaces: houseCount(),
  expectedDelivery: z.iso.date().optional(),
})

function houseCount() {
  return z.number().int().min(0).max(99).optional()
}

const houseDetails = [
  'bedrooms',
  'bathrooms',
  'parkingSpaces',
  'expectedDelivery',
] as const

export class InvalidPropertyError extends Error {
  constructor(
    readonly reason: 'duplicate_unit' | 'lot_house_details',
    message: string,
  ) {
    super(message)
  }
}

export async function getDevelopment(brokerId: string, id: string) {
  const [found] = await db
    .select()
    .from(development)
    .where(and(eq(development.id, id), eq(development.brokerId, brokerId)))
  if (!found) throw new NotFoundError('Development')

  const properties = await db
    .select()
    .from(property)
    .where(eq(property.developmentId, id))
    .orderBy(asc(property.identifier))
  return { ...found, properties }
}

export async function addProperty(
  brokerId: string,
  developmentId: string,
  input: z.input<typeof propertyInput>,
) {
  const { kind } = await getDevelopment(brokerId, developmentId)
  const values = parseProperty(kind, input)
  try {
    const [created] = await db
      .insert(property)
      .values({ brokerId, developmentId, ...values })
      .returning()
    return created
  } catch (error) {
    throw duplicateUnitOr(error, values.identifier)
  }
}

export async function updateProperty(
  brokerId: string,
  id: string,
  input: z.input<typeof propertyInput>,
) {
  const { kind } = await findProperty(brokerId, id)
  const values = parseProperty(kind, input)
  try {
    const [updated] = await db
      .update(property)
      .set({ ...emptyOptionalFields, ...values })
      .where(eq(property.id, id))
      .returning()
    return updated
  } catch (error) {
    throw duplicateUnitOr(error, values.identifier)
  }
}

export async function markAvailability(
  brokerId: string,
  id: string,
  availability: 'available' | 'reserved' | 'sold',
) {
  await findProperty(brokerId, id)
  await db.update(property).set({ availability }).where(eq(property.id, id))
}

async function findProperty(brokerId: string, id: string) {
  const [found] = await db
    .select({ id: property.id, kind: development.kind })
    .from(property)
    .innerJoin(development, eq(development.id, property.developmentId))
    .where(and(eq(property.id, id), eq(property.brokerId, brokerId)))
  if (!found) throw new NotFoundError('Property')
  return found
}

// An edit replaces the whole Property, so fields left out become empty.
const emptyOptionalFields = {
  areaM2: null,
  bedrooms: null,
  bathrooms: null,
  parkingSpaces: null,
  expectedDelivery: null,
}

function parseProperty(
  kind: 'lot' | 'off_plan_house',
  input: z.input<typeof propertyInput>,
) {
  const values = propertyInput.parse(input)
  if (kind === 'lot' && houseDetails.some((key) => values[key] !== undefined)) {
    throw new InvalidPropertyError(
      'lot_house_details',
      'Lots have no house details',
    )
  }
  return values
}

// Postgres reports the (development, identifier) unique constraint as 23505.
function duplicateUnitOr(error: unknown, identifier: string) {
  const code = (error as { cause?: { code?: string } }).cause?.code
  return code === '23505'
    ? new InvalidPropertyError(
        'duplicate_unit',
        `${identifier} is already in this Development`,
      )
    : error
}
