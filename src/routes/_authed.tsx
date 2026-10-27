import { Outlet, createFileRoute } from '@tanstack/react-router'
import { ensureSession } from '#/auth/session'
import { AppShell } from '#/components/AppShell'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => ({
    session: await ensureSession({ data: { href: location.href } }),
  }),
  component: AuthedLayout,
})

function AuthedLayout() {
  const { session } = Route.useRouteContext()

  return (
    <AppShell brokerName={session.user.name}>
      <Outlet />
    </AppShell>
  )
}
