import { Outlet, createFileRoute } from '@tanstack/react-router'
import { ensureSession } from '#/auth/session'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => ({
    session: await ensureSession({ data: { href: location.href } }),
  }),
  component: Outlet,
})
