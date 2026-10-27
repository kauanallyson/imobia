import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { currentBrokerId } from '#/auth/session'
import {
  InvalidPropertyError,
  NotFoundError,
  addProperty,
  createDevelopment,
  developmentEdit,
  developmentInput,
  getDevelopment,
  listDevelopments,
  markAvailability,
  propertyInput,
  updateDevelopment,
  updateProperty,
} from './portfolio'

const id = z.uuid()

export const listDevelopmentsFn = createServerFn().handler(async () =>
  listDevelopments(await currentBrokerId()),
)

// `null` when the id doesn't exist or is another Broker's; the page shows "not found".
export const getDevelopmentFn = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const brokerId = await currentBrokerId()
    if (!z.uuid().safeParse(data.id).success) return null
    try {
      return await getDevelopment(brokerId, data.id)
    } catch (error) {
      if (error instanceof NotFoundError) return null
      throw error
    }
  })

export const createDevelopmentFn = createServerFn({ method: 'POST' })
  .validator(developmentInput)
  .handler(async ({ data }) => createDevelopment(await currentBrokerId(), data))

export const updateDevelopmentFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, development: developmentEdit }))
  .handler(async ({ data }) =>
    updateDevelopment(await currentBrokerId(), data.id, data.development),
  )

export const addPropertyFn = createServerFn({ method: 'POST' })
  .validator(z.object({ developmentId: id, property: propertyInput }))
  .handler(async ({ data }) =>
    inPortuguese(async () =>
      addProperty(await currentBrokerId(), data.developmentId, data.property),
    ),
  )

export const updatePropertyFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, property: propertyInput }))
  .handler(async ({ data }) =>
    inPortuguese(async () =>
      updateProperty(await currentBrokerId(), data.id, data.property),
    ),
  )

export const markAvailabilityFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id, availability: z.enum(['available', 'reserved', 'sold']) }),
  )
  .handler(async ({ data }) =>
    markAvailability(await currentBrokerId(), data.id, data.availability),
  )

// A rule the Broker can break from the form comes back as a message to show
// (in Portuguese); anything else still throws.
async function inPortuguese(run: () => Promise<unknown>) {
  try {
    await run()
    return { error: null }
  } catch (error) {
    if (!(error instanceof InvalidPropertyError)) throw error
    return {
      error:
        error.reason === 'duplicate_unit'
          ? 'Já existe um imóvel com essa identificação neste empreendimento.'
          : 'Terrenos não têm quartos, banheiros, vagas nem previsão de entrega.',
    }
  }
}
