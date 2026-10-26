import Button from '@mui/material/Button'
import MuiTextField from '@mui/material/TextField'
import { createFormHook, createFormHookContexts } from '@tanstack/react-form'

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

function TextField(props: {
  label: string
  type?: string
  autoComplete?: string
}) {
  const field = useFieldContext<string>()
  const error = field.state.meta.isTouched
    ? field.state.meta.errors.map((e) => e?.message ?? e).join(', ')
    : ''

  return (
    <MuiTextField
      {...props}
      name={field.name}
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
      error={Boolean(error)}
      helperText={error || undefined}
      fullWidth
    />
  )
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" variant="contained" loading={isSubmitting}>
          {children}
        </Button>
      )}
    </form.Subscribe>
  )
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
})
