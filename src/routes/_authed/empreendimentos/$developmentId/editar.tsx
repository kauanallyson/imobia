import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { DevelopmentForm } from '#/portfolio/DevelopmentForm'
import { developmentQuery } from '#/portfolio/queries'
import { updateDevelopmentFn } from '#/portfolio/server'

export const Route = createFileRoute(
  '/_authed/empreendimentos/$developmentId/editar',
)({
  loader: async ({ context, params }) => {
    const development = await context.queryClient.ensureQueryData(
      developmentQuery(params.developmentId),
    )
    if (!development) throw notFound()
  },
  component: EditDevelopment,
})

function EditDevelopment() {
  const { developmentId } = Route.useParams()
  const { data } = useSuspenseQuery(developmentQuery(developmentId))
  // The loader already turned a missing Development into "not found".
  const development = data!
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const update = useMutation({
    mutationFn: updateDevelopmentFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['developments'] })
      await navigate({
        to: '/empreendimentos/$developmentId',
        params: { developmentId },
      })
    },
  })

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Editar {development.name}
      </Typography>
      <DevelopmentForm
        kindLocked
        defaultValues={{
          kind: development.kind,
          name: development.name,
          city: development.city,
          neighborhood: development.neighborhood,
          address: development.address ?? '',
          description: development.description ?? '',
          amenities: development.amenities ?? '',
          paymentTerms: development.paymentTerms ?? '',
        }}
        submitLabel="Salvar"
        onSubmit={(values) =>
          update.mutateAsync({
            data: { id: developmentId, development: values },
          })
        }
      />
    </Stack>
  )
}
