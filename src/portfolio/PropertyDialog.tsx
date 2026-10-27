import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { z } from 'zod'
import { useAppForm } from '#/components/form'
import { centsToInput, parseDecimal } from './format'

const decimal = (message: string) =>
  z.string().refine((text) => parseDecimal(text) > 0, message)
const optionalDecimal = z
  .string()
  .refine(
    (text) => text.trim() === '' || parseDecimal(text) > 0,
    'Valor inválido',
  )
const optionalCount = z
  .string()
  .refine(
    (text) => text.trim() === '' || /^\d{1,2}$/.test(text.trim()),
    'Use um número inteiro',
  )

const schema = z.object({
  identifier: z.string().trim().min(1, 'Informe a identificação'),
  price: decimal('Informe o preço'),
  area: optionalDecimal,
  bedrooms: optionalCount,
  bathrooms: optionalCount,
  parkingSpaces: optionalCount,
  expectedDelivery: z.string(),
})

type PropertyValues = z.infer<typeof schema>

// What the server functions take: a Lot sends no house details at all.
export type PropertySubmit = {
  identifier: string
  priceCents: number
  areaM2?: number
  bedrooms?: number
  bathrooms?: number
  parkingSpaces?: number
  expectedDelivery?: string
}

export type EditableProperty = {
  identifier: string
  priceCents: number
  areaM2: number | null
  bedrooms: number | null
  bathrooms: number | null
  parkingSpaces: number | null
  expectedDelivery: string | null
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n))
const count = (input: string) =>
  input.trim() === '' ? undefined : Number(input)

function toValues(property?: EditableProperty): PropertyValues {
  return {
    identifier: property?.identifier ?? '',
    price: property ? centsToInput(property.priceCents) : '',
    area:
      property?.areaM2 == null ? '' : String(property.areaM2).replace('.', ','),
    bedrooms: text(property?.bedrooms),
    bathrooms: text(property?.bathrooms),
    parkingSpaces: text(property?.parkingSpaces),
    expectedDelivery: property?.expectedDelivery ?? '',
  }
}

function toSubmit(values: PropertyValues, isHouse: boolean): PropertySubmit {
  const submit: PropertySubmit = {
    identifier: values.identifier.trim(),
    priceCents: Math.round(parseDecimal(values.price) * 100),
    areaM2: values.area.trim() === '' ? undefined : parseDecimal(values.area),
  }
  if (!isHouse) return submit
  return {
    ...submit,
    bedrooms: count(values.bedrooms),
    bathrooms: count(values.bathrooms),
    parkingSpaces: count(values.parkingSpaces),
    expectedDelivery: values.expectedDelivery || undefined,
  }
}

export function PropertyDialog(props: {
  open: boolean
  isHouse: boolean
  property?: EditableProperty
  onClose: () => void
  onSubmit: (property: PropertySubmit) => Promise<{ error: string | null }>
}) {
  const [error, setError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: toValues(props.property),
    validators: { onBlur: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const result = await props.onSubmit(toSubmit(value, props.isHouse))
        if (result.error) {
          setError(result.error)
          return
        }
        props.onClose()
      } catch {
        setError('Não foi possível salvar. Tente novamente.')
      }
    },
  })

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <DialogTitle>
          {props.property ? 'Editar imóvel' : 'Novo imóvel'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <form.AppField name="identifier">
              {(field) => (
                <field.TextField
                  label={
                    props.isHouse
                      ? 'Identificação (ex.: Casa 7)'
                      : 'Identificação (ex.: Quadra 3, Lote 12)'
                  }
                />
              )}
            </form.AppField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <form.AppField name="price">
                {(field) => (
                  <field.TextField label="Preço (R$)" inputMode="decimal" />
                )}
              </form.AppField>
              <form.AppField name="area">
                {(field) => (
                  <field.TextField label="Área (m²)" inputMode="decimal" />
                )}
              </form.AppField>
            </Stack>
            {props.isHouse && (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <form.AppField name="bedrooms">
                    {(field) => (
                      <field.TextField label="Quartos" inputMode="numeric" />
                    )}
                  </form.AppField>
                  <form.AppField name="bathrooms">
                    {(field) => (
                      <field.TextField label="Banheiros" inputMode="numeric" />
                    )}
                  </form.AppField>
                  <form.AppField name="parkingSpaces">
                    {(field) => (
                      <field.TextField label="Vagas" inputMode="numeric" />
                    )}
                  </form.AppField>
                </Stack>
                <form.AppField name="expectedDelivery">
                  {(field) => (
                    <field.TextField label="Previsão de entrega" type="date" />
                  )}
                </form.AppField>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={props.onClose}>Cancelar</Button>
          <form.AppForm>
            <form.SubmitButton>Salvar</form.SubmitButton>
          </form.AppForm>
        </DialogActions>
      </form>
    </Dialog>
  )
}
