import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Typography variant="h4" component="h1">
        Imobia
      </Typography>
    </Container>
  )
}
