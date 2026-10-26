import { redirect } from '@tanstack/react-router'
import { auth } from './server'

export async function requireSession(headers: Headers, href: string) {
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw redirect({ to: '/login', search: { redirect: href } })
  }
  return session
}
