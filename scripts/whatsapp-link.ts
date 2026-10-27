// Links a Business Number to a Broker until Embedded Signup does it.
// Usage: bun run whatsapp:link <broker-email> <phone-number-id> <display-number>
import { eq, or } from 'drizzle-orm'
import { db } from '#/db'
import { businessNumber, user } from '#/db/schema'
import { linkBusinessNumber } from '#/whatsapp/business-number'

const [email, phoneNumberId, displayPhoneNumber] = process.argv.slice(2)
if (!email || !phoneNumberId || !displayPhoneNumber) {
  console.error(
    'Usage: bun run whatsapp:link <broker-email> <phone-number-id> <display-number>',
  )
  process.exit(1)
}

const [broker] = await db.select().from(user).where(eq(user.email, email))
if (!broker) {
  console.error(`No Broker with e-mail ${email}`)
  process.exit(1)
}

const [linked] = await db
  .select()
  .from(businessNumber)
  .where(
    or(
      eq(businessNumber.brokerId, broker.id),
      eq(businessNumber.phoneNumberId, phoneNumberId),
    ),
  )
if (linked) {
  console.error(
    linked.brokerId === broker.id
      ? `${email} already has Business Number ${linked.displayPhoneNumber} (${linked.phoneNumberId}); a Broker has only one`
      : `phone_number_id ${phoneNumberId} is already linked to another Broker`,
  )
  process.exit(1)
}

await linkBusinessNumber({
  brokerId: broker.id,
  phoneNumberId,
  displayPhoneNumber,
})
console.log(`Linked ${displayPhoneNumber} (${phoneNumberId}) to ${email}`)
process.exit(0)
