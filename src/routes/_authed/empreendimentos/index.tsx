import { ButtonLink, CardActionAreaLink } from '#/components/Link'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { kindLabel } from '#/portfolio/labels'
import { developmentsQuery } from '#/portfolio/queries'

export const Route = createFileRoute('/_authed/empreendimentos/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(developmentsQuery),
  component: Portfolio,
})

function Portfolio() {
  const { data: developments } = useSuspenseQuery(developmentsQuery)

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h4" component="h1">
          Empreendimentos
        </Typography>
        <ButtonLink variant="contained" to="/empreendimentos/novo">
          Novo empreendimento
        </ButtonLink>
      </Stack>

      {developments.length === 0 ? (
        <Typography color="text.secondary">
          Nenhum empreendimento ainda. Cadastre o primeiro para o Assistente
          poder oferecer seus imóveis.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {developments.map((d) => (
            <Grid key={d.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card variant="outlined">
                <CardActionAreaLink
                  to="/empreendimentos/$developmentId"
                  params={{ developmentId: d.id }}
                >
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="overline" color="text.secondary">
                        {kindLabel[d.kind]}
                      </Typography>
                      <Typography variant="h6" component="h2">
                        {d.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {d.neighborhood}, {d.city}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Chip
                          size="small"
                          color="success"
                          label={`${d.units.available} disponíveis`}
                        />
                        <Chip
                          size="small"
                          color="warning"
                          label={`${d.units.reserved} reservados`}
                        />
                        <Chip size="small" label={`${d.units.sold} vendidos`} />
                      </Stack>
                    </Stack>
                  </CardContent>
                </CardActionAreaLink>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  )
}
