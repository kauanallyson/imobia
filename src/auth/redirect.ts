import { z } from 'zod'

const origin = 'http://same.origin'

// Only same-origin paths, so ?redirect= can't send the broker to another site.
// Parsing (not prefix checks) catches tricks like `//evil.com` and `/\evil.com`.
function isSameOriginPath(path: string) {
  return path.startsWith('/') && new URL(path, origin).origin === origin
}

export const authSearch = z.object({
  redirect: z.string().refine(isSameOriginPath).optional().catch(undefined),
})
