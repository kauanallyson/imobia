import Stack from '@mui/material/Stack'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { authClient } from '#/auth/client'
import { authSearch } from '#/auth/redirect'
import { getAuthProviders, getSession } from '#/auth/session'
import { AuthCard } from '#/components/AuthCard'
import { Link } from '#/components/Link'
import { useAppForm } from '#/components/form'

export const Route = createFileRoute('/cadastro')({
  validateSearch: authSearch,
  beforeLoad: async ({ search }) => {
    if (await getSession()) throw redirect({ href: search.redirect ?? '/' })
  },
  loader: () => getAuthProviders(),
  component: SignUp,
})

const schema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome'),
  email: z.email('E-mail inválido'),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
})

function SignUp() {
  const search = Route.useSearch()
  const providers = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onBlur: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setError(null)
      const result = await authClient.signUp.email(value)
      if (result.error) {
        setError(
          result.error.status === 422
            ? 'Este e-mail já está cadastrado.'
            : 'Não foi possível criar a conta. Tente novamente.',
        )
        return
      }
      await router.invalidate()
      await router.navigate({ href: search.redirect ?? '/' })
    },
  })

  return (
    <AuthCard
      title="Criar conta"
      error={error}
      google={providers.google}
      redirect={search.redirect}
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" search={search}>
            Entrar
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <Stack spacing={2}>
          <form.AppField name="name">
            {(field) => <field.TextField label="Nome" autoComplete="name" />}
          </form.AppField>
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="E-mail"
                type="email"
                autoComplete="email"
              />
            )}
          </form.AppField>
          <form.AppField name="password">
            {(field) => (
              <field.TextField
                label="Senha"
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton>Criar conta</form.SubmitButton>
          </form.AppForm>
        </Stack>
      </form>
    </AuthCard>
  )
}
