import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { googleEnabled } from '#/env'
import { requireSession } from './guard'
import { auth } from './server'

export const ensureSession = createServerFn()
  .validator(z.object({ href: z.string() }))
  .handler(({ data }) => requireSession(getRequestHeaders(), data.href))

export const getSession = createServerFn().handler(() =>
  auth.api.getSession({ headers: getRequestHeaders() }),
)

export const getAuthProviders = createServerFn().handler(() => ({
  google: googleEnabled,
}))

// For server function handlers: the signed-in Broker, or an error if nobody is.
export async function currentBrokerId() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Not signed in')
  return session.user.id
}
