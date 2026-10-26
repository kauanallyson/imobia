import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { authClient } from '#/auth/client'

export function AuthCard(props: {
  title: string
  error: string | null
  google: boolean
  redirect: string | undefined
  footer: React.ReactNode
  children: React.ReactNode
}) {
  const [googleError, setGoogleError] = useState<string | null>(null)
  const error = props.error ?? googleError

  async function signInWithGoogle() {
    setGoogleError(null)
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: props.redirect ?? '/',
    })
    if (result.error) {
      setGoogleError('Não foi possível entrar com o Google. Tente novamente.')
    }
  }

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h5" component="h1">
            {props.title}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {props.children}
          {props.google && (
            <>
              <Divider>ou</Divider>
              <Button variant="outlined" onClick={signInWithGoogle}>
                Continuar com Google
              </Button>
            </>
          )}
          <Typography variant="body2">{props.footer}</Typography>
        </Stack>
      </Paper>
    </Container>
  )
}
