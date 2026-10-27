import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '#/auth/client'
import { Link } from './Link'

export function AppShell(props: {
  brokerName: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  async function signOut() {
    setError(null)
    const result = await authClient.signOut()
    if (result.error) {
      setError('Não foi possível sair. Tente novamente.')
      return
    }
    // Query keys aren't per Broker, so the next one to sign in on this tab
    // must not see this Broker's cached data.
    queryClient.clear()
    await router.invalidate()
  }

  return (
    <>
      <AppBar position="static" color="default" elevation={0}>
        <Toolbar sx={{ gap: 3 }}>
          <Typography variant="h6" component="span">
            Imobia
          </Typography>
          <Link to="/empreendimentos" underline="hover" color="inherit">
            Empreendimentos
          </Link>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2">{props.brokerName}</Typography>
          <Button color="inherit" onClick={signOut}>
            Sair
          </Button>
        </Toolbar>
      </AppBar>
      {error && <Alert severity="error">{error}</Alert>}
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {props.children}
      </Container>
    </>
  )
}
