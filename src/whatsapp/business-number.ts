import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { businessNumber } from '#/db/schema'

export async function linkBusinessNumber(input: {
  brokerId: string
  phoneNumberId: string
  displayPhoneNumber: string
}) {
  await db.insert(businessNumber).values(input)
}

export async function findBusinessNumber(phoneNumberId: string) {
  const [found] = await db
    .select()
    .from(businessNumber)
    .where(eq(businessNumber.phoneNumberId, phoneNumberId))
  return found
}
