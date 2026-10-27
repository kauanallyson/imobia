import Button from '@mui/material/Button'
import { ButtonLink } from '#/components/Link'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { formatPrice } from '#/portfolio/format'
import { availabilityLabel, kindLabel } from '#/portfolio/labels'
import type { EditableProperty } from '#/portfolio/PropertyDialog'
import { PropertyDialog } from '#/portfolio/PropertyDialog'
import { developmentQuery } from '#/portfolio/queries'
import {
  addPropertyFn,
  markAvailabilityFn,
  updatePropertyFn,
} from '#/portfolio/server'

export const Route = createFileRoute(
  '/_authed/empreendimentos/$developmentId/',
)({
  loader: async ({ context, params }) => {
    const development = await context.queryClient.ensureQueryData(
      developmentQuery(params.developmentId),
    )
    if (!development) throw notFound()
  },
  component: DevelopmentPage,
})

type Availability = keyof typeof availabilityLabel

function DevelopmentPage() {
  const { developmentId } = Route.useParams()
  const { data } = useSuspenseQuery(developmentQuery(developmentId))
  // The loader already turned a missing Development into "not found".
  const development = data!
  const isHouse = development.kind === 'off_plan_house'
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['developments'] })

  // `null` = closed; `{}` = adding; `{ id, property }` = editing.
  const [dialog, setDialog] = useState<null | {
    id?: string
    property?: EditableProperty
  }>(null)

  const add = useMutation({ mutationFn: addPropertyFn, onSuccess: refresh })
  const update = useMutation({
    mutationFn: updatePropertyFn,
    onSuccess: refresh,
  })
  const mark = useMutation({
    mutationFn: markAvailabilityFn,
    onSuccess: refresh,
  })

  const details = [
    ['Endereço', development.address],
    ['Descrição', development.description],
    ['Infraestrutura e lazer', development.amenities],
    ['Condições de pagamento', development.paymentTerms],
  ].filter(([, value]) => value)

  return (
    <Stack spacing={4}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between' }}
      >
        <div>
          <Typography variant="overline" color="text.secondary">
            {kindLabel[development.kind]}
          </Typography>
          <Typography variant="h4" component="h1">
            {development.name}
          </Typography>
          <Typography color="text.secondary">
            {development.neighborhood}, {development.city}
          </Typography>
        </div>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <ButtonLink
            variant="outlined"
            to="/empreendimentos/$developmentId/editar"
            params={{ developmentId }}
          >
            Editar
          </ButtonLink>
          <Button variant="contained" onClick={() => setDialog({})}>
            Novo imóvel
          </Button>
        </Stack>
      </Stack>

      {details.length > 0 && (
        <Stack spacing={2}>
          {details.map(([label, value]) => (
            <div key={label}>
              <Typography variant="subtitle2">{label}</Typography>
              <Typography sx={{ whiteSpace: 'pre-line' }}>{value}</Typography>
            </div>
          ))}
        </Stack>
      )}

      {development.properties.length === 0 ? (
        <Typography color="text.secondary">
          Nenhum imóvel cadastrado neste empreendimento.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Imóvel</TableCell>
                <TableCell align="right">Preço</TableCell>
                <TableCell align="right">Área</TableCell>
                {isHouse && <TableCell>Quartos / banheiros / vagas</TableCell>}
                {isHouse && <TableCell>Entrega</TableCell>}
                <TableCell>Situação</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {development.properties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.identifier}</TableCell>
                  <TableCell align="right">
                    {formatPrice(p.priceCents)}
                  </TableCell>
                  <TableCell align="right">
                    {p.areaM2 == null
                      ? '—'
                      : `${p.areaM2.toLocaleString('pt-BR')} m²`}
                  </TableCell>
                  {isHouse && (
                    <TableCell>
                      {[p.bedrooms, p.bathrooms, p.parkingSpaces]
                        .map((n) => n ?? '—')
                        .join(' / ')}
                    </TableCell>
                  )}
                  {isHouse && (
                    <TableCell>
                      {p.expectedDelivery
                        ? new Date(
                            `${p.expectedDelivery}T00:00`,
                          ).toLocaleDateString('pt-BR', {
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    <Select
                      size="small"
                      value={p.availability}
                      onChange={(e) =>
                        mark.mutate({
                          data: {
                            id: p.id,
                            availability: e.target.value as Availability,
                          },
                        })
                      }
                    >
                      {Object.entries(availabilityLabel).map(
                        ([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ),
                      )}
                    </Select>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => setDialog({ id: p.id, property: p })}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {dialog && (
        <PropertyDialog
          open
          isHouse={isHouse}
          property={dialog.property}
          onClose={() => setDialog(null)}
          onSubmit={(property) =>
            dialog.id
              ? update.mutateAsync({ data: { id: dialog.id, property } })
              : add.mutateAsync({ data: { developmentId, property } })
          }
        />
      )}
    </Stack>
  )
}
