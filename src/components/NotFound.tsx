import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from './Link'

export function NotFound() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          Página não encontrada
        </Typography>
        <Link to="/">Voltar ao início</Link>
      </Stack>
    </Container>
  )
}
