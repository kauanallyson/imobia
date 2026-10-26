import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { authClient } from '#/auth/client'

export const Route = createFileRoute('/_authed/')({ component: Home })

function Home() {
  const { session } = Route.useRouteContext()
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    await router.invalidate()
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h4" component="h1">
          Olá, {session.user.name}
        </Typography>
        <Button variant="outlined" onClick={signOut}>
          Sair
        </Button>
      </Stack>
    </Container>
  )
}
