import { describe, expect, test } from 'bun:test'
import { isRedirect } from '@tanstack/react-router'
import { auth } from './server'
import { requireSession } from './guard'

async function signedInHeaders() {
  const res = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'senha-forte-123',
      }),
    }),
  )
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return new Headers({ cookie })
}

async function caught(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected requireSession to throw')
}

describe('requireSession', () => {
  test('returns the session of a signed-in broker', async () => {
    const session = await requireSession(await signedInHeaders(), '/')
    expect(session.user.email).toBe('ana@example.com')
  })

  test('sends a visitor without a session to /login, remembering where they were going', async () => {
    const error = await caught(requireSession(new Headers(), '/clientes?x=1'))
    if (!isRedirect(error)) throw error
    expect(error.options.to).toBe('/login')
    expect<unknown>(error.options.search).toEqual({ redirect: '/clientes?x=1' })
  })
})
