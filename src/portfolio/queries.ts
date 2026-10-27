import { queryOptions } from '@tanstack/react-query'
import { getDevelopmentFn, listDevelopmentsFn } from './server'

export const developmentsQuery = queryOptions({
  queryKey: ['developments'],
  queryFn: () => listDevelopmentsFn(),
})

export const developmentQuery = (id: string) =>
  queryOptions({
    queryKey: ['developments', id],
    queryFn: () => getDevelopmentFn({ data: { id } }),
  })
