import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DevelopmentForm, emptyDevelopment } from '#/portfolio/DevelopmentForm'
import { createDevelopmentFn } from '#/portfolio/server'

export const Route = createFileRoute('/_authed/empreendimentos/novo')({
  component: NewDevelopment,
})

function NewDevelopment() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: createDevelopmentFn,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['developments'] })
      await navigate({
        to: '/empreendimentos/$developmentId',
        params: { developmentId: created.id },
      })
    },
  })

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Novo empreendimento
      </Typography>
      <DevelopmentForm
        defaultValues={emptyDevelopment}
        submitLabel="Cadastrar"
        onSubmit={(values) => create.mutateAsync({ data: values })}
      />
    </Stack>
  )
}
