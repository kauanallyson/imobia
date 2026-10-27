import { describe, expect, test } from 'bun:test'
import { createBroker } from '../../test/fixtures'
import {
  addProperty,
  createDevelopment,
  getDevelopment,
  listDevelopments,
  markAvailability,
  updateDevelopment,
  updateProperty,
} from './portfolio'

const vilaNova = {
  kind: 'off_plan_house' as const,
  name: 'Residencial Vila Nova',
  city: 'Sobral',
  neighborhood: 'Derby',
}

const solar = {
  kind: 'lot' as const,
  name: 'Loteamento Solar',
  city: 'Sobral',
  neighborhood: 'Centro',
}

describe('Portfolio', () => {
  test('a Broker sees the Developments they register', async () => {
    const broker = await createBroker()

    await createDevelopment(broker.id, solar)

    const developments = await listDevelopments(broker.id)
    expect(developments.map((d) => [d.name, d.kind])).toEqual([
      ['Loteamento Solar', 'lot'],
    ])
  })

  test('a Broker edits their Development', async () => {
    const broker = await createBroker()
    const created = await createDevelopment(broker.id, solar)

    await updateDevelopment(broker.id, created.id, {
      ...solar,
      paymentTerms: '20% de entrada e 120 parcelas',
    })

    const [edited] = await listDevelopments(broker.id)
    expect(edited.paymentTerms).toBe('20% de entrada e 120 parcelas')
  })

  test('another Broker can neither see nor edit it', async () => {
    const ana = await createBroker('ana@example.com')
    const bia = await createBroker('bia@example.com')
    const created = await createDevelopment(ana.id, solar)

    expect(await listDevelopments(bia.id)).toEqual([])
    await expect(
      updateDevelopment(bia.id, created.id, { ...solar, name: 'Roubado' }),
    ).rejects.toThrow('not found')
    const [untouched] = await listDevelopments(ana.id)
    expect(untouched.name).toBe('Loteamento Solar')
  })

  test('a Property added to a Development starts Available', async () => {
    const broker = await createBroker()
    const solarDev = await createDevelopment(broker.id, solar)

    await addProperty(broker.id, solarDev.id, {
      identifier: 'Quadra 3, Lote 12',
      priceCents: 15_000_000,
      areaM2: 250,
    })

    const found = await getDevelopment(broker.id, solarDev.id)
    expect(
      found.properties.map((p) => [
        p.identifier,
        p.priceCents,
        p.areaM2,
        p.availability,
      ]),
    ).toEqual([['Quadra 3, Lote 12', 15_000_000, 250, 'available']])
  })

  test('an Off-plan House carries its house details', async () => {
    const broker = await createBroker()
    const vila = await createDevelopment(broker.id, vilaNova)

    await addProperty(broker.id, vila.id, {
      identifier: 'Casa 7',
      priceCents: 32_000_000,
      areaM2: 180,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 2,
      expectedDelivery: '2028-06-01',
    })

    const [casa] = (await getDevelopment(broker.id, vila.id)).properties
    expect([
      casa.bedrooms,
      casa.bathrooms,
      casa.parkingSpaces,
      casa.expectedDelivery,
    ]).toEqual([3, 2, 2, '2028-06-01'])
  })

  test('a Lot refuses house details', async () => {
    const broker = await createBroker()
    const solarDev = await createDevelopment(broker.id, solar)

    await expect(
      addProperty(broker.id, solarDev.id, {
        identifier: 'Quadra 1, Lote 1',
        priceCents: 9_000_000,
        bedrooms: 2,
      }),
    ).rejects.toThrow('Lots have no house details')
    expect((await getDevelopment(broker.id, solarDev.id)).properties).toEqual(
      [],
    )
  })

  test('a Development cannot list the same unit twice', async () => {
    const broker = await createBroker()
    const solarDev = await createDevelopment(broker.id, solar)
    const lote = { identifier: 'Quadra 3, Lote 12', priceCents: 15_000_000 }
    await addProperty(broker.id, solarDev.id, lote)

    await expect(addProperty(broker.id, solarDev.id, lote)).rejects.toThrow(
      'Quadra 3, Lote 12 is already in this Development',
    )
  })

  test('a Broker edits a Property and marks it Sold when it sold elsewhere', async () => {
    const broker = await createBroker()
    const solarDev = await createDevelopment(broker.id, solar)
    const lote = await addProperty(broker.id, solarDev.id, {
      identifier: 'Quadra 3, Lote 12',
      priceCents: 15_000_000,
    })

    await updateProperty(broker.id, lote.id, {
      identifier: 'Quadra 3, Lote 12',
      priceCents: 14_500_000,
    })
    await markAvailability(broker.id, lote.id, 'sold')

    const [edited] = (await getDevelopment(broker.id, solarDev.id)).properties
    expect([edited.priceCents, edited.availability]).toEqual([
      14_500_000,
      'sold',
    ])
  })

  test("another Broker can't add to, edit or mark another's Properties", async () => {
    const ana = await createBroker('ana@example.com')
    const bia = await createBroker('bia@example.com')
    const solarDev = await createDevelopment(ana.id, solar)
    const lote = await addProperty(ana.id, solarDev.id, {
      identifier: 'Quadra 3, Lote 12',
      priceCents: 15_000_000,
    })

    await expect(
      addProperty(bia.id, solarDev.id, { identifier: 'X', priceCents: 1 }),
    ).rejects.toThrow('not found')
    await expect(
      updateProperty(bia.id, lote.id, { identifier: 'X', priceCents: 1 }),
    ).rejects.toThrow('not found')
    await expect(markAvailability(bia.id, lote.id, 'sold')).rejects.toThrow(
      'not found',
    )

    const [untouched] = (await getDevelopment(ana.id, solarDev.id)).properties
    expect([untouched.identifier, untouched.availability]).toEqual([
      'Quadra 3, Lote 12',
      'available',
    ])
  })

  test('the Developments list counts units by availability', async () => {
    const broker = await createBroker()
    const solarDev = await createDevelopment(broker.id, solar)
    for (const identifier of ['Lote 1', 'Lote 2', 'Lote 3']) {
      await addProperty(broker.id, solarDev.id, {
        identifier,
        priceCents: 10_000_000,
      })
    }
    const [lote1, lote2] = (await getDevelopment(broker.id, solarDev.id))
      .properties
    await markAvailability(broker.id, lote1.id, 'sold')
    await markAvailability(broker.id, lote2.id, 'reserved')

    const [listed] = await listDevelopments(broker.id)
    expect(listed.units).toEqual({ available: 1, reserved: 1, sold: 1 })
  })
})
