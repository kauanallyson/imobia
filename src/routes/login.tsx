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

export const Route = createFileRoute('/login')({
  validateSearch: authSearch,
  beforeLoad: async ({ search }) => {
    if (await getSession()) throw redirect({ href: search.redirect ?? '/' })
  },
  loader: () => getAuthProviders(),
  component: Login,
})

const schema = z.object({
  email: z.email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})

function Login() {
  const search = Route.useSearch()
  const providers = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { email: '', password: '' },
    validators: { onBlur: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setError(null)
      const result = await authClient.signIn.email(value)
      if (result.error) {
        setError(
          result.error.status === 401
            ? 'E-mail ou senha incorretos.'
            : 'Não foi possível entrar. Tente novamente.',
        )
        return
      }
      await router.invalidate()
      await router.navigate({ href: search.redirect ?? '/' })
    },
  })

  return (
    <AuthCard
      title="Entrar"
      error={error}
      google={providers.google}
      redirect={search.redirect}
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" search={search}>
            Cadastre-se
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
                autoComplete="current-password"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton>Entrar</form.SubmitButton>
          </form.AppForm>
        </Stack>
      </form>
    </AuthCard>
  )
}
