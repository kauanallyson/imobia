import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import MuiTextField from '@mui/material/TextField'
import { createFormHook, createFormHookContexts } from '@tanstack/react-form'

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

function TextField({
  options,
  inputMode,
  ...props
}: {
  label: string
  type?: string
  autoComplete?: string
  multiline?: boolean
  minRows?: number
  inputMode?: 'decimal' | 'numeric'
  // Renders a select with these choices instead of a text input.
  options?: { value: string; label: string }[]
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
      select={Boolean(options)}
      slotProps={{
        htmlInput: { inputMode },
        inputLabel: props.type === 'date' ? { shrink: true } : undefined,
      }}
      fullWidth
    >
      {options?.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </MuiTextField>
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
