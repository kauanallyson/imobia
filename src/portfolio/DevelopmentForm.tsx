import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { z } from 'zod'
import { useAppForm } from '#/components/form'
import { kindLabel } from './labels'

const schema = z.object({
  kind: z.enum(['lot', 'off_plan_house']),
  name: z.string().trim().min(1, 'Informe o nome'),
  city: z.string().trim().min(1, 'Informe a cidade'),
  neighborhood: z.string().trim().min(1, 'Informe o bairro'),
  address: z.string(),
  description: z.string(),
  amenities: z.string(),
  paymentTerms: z.string(),
})

export type DevelopmentValues = z.infer<typeof schema>

export const emptyDevelopment: DevelopmentValues = {
  kind: 'lot',
  name: '',
  city: '',
  neighborhood: '',
  address: '',
  description: '',
  amenities: '',
  paymentTerms: '',
}

export function DevelopmentForm(props: {
  defaultValues: DevelopmentValues
  // The kind can't change once Properties depend on it.
  kindLocked?: boolean
  submitLabel: string
  onSubmit: (values: DevelopmentValues) => Promise<unknown>
}) {
  const [error, setError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: props.defaultValues,
    validators: { onBlur: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await props.onSubmit(value)
      } catch {
        setError('Não foi possível salvar. Tente novamente.')
      }
    },
  })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!props.kindLocked && (
          <form.AppField name="kind">
            {(field) => (
              <field.TextField
                label="O que o empreendimento vende"
                options={Object.entries(kindLabel).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="name">
          {(field) => <field.TextField label="Nome" />}
        </form.AppField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <form.AppField name="city">
            {(field) => <field.TextField label="Cidade" />}
          </form.AppField>
          <form.AppField name="neighborhood">
            {(field) => <field.TextField label="Bairro" />}
          </form.AppField>
        </Stack>
        <form.AppField name="address">
          {(field) => <field.TextField label="Endereço (opcional)" />}
        </form.AppField>
        <form.AppField name="description">
          {(field) => (
            <field.TextField label="Descrição" multiline minRows={3} />
          )}
        </form.AppField>
        <form.AppField name="amenities">
          {(field) => (
            <field.TextField
              label="Infraestrutura e lazer"
              multiline
              minRows={2}
            />
          )}
        </form.AppField>
        <form.AppField name="paymentTerms">
          {(field) => (
            <field.TextField
              label="Condições de pagamento"
              multiline
              minRows={2}
            />
          )}
        </form.AppField>
        <form.AppForm>
          <form.SubmitButton>{props.submitLabel}</form.SubmitButton>
        </form.AppForm>
      </Stack>
    </form>
  )
}
