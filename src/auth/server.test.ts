import { describe, expect, test } from 'bun:test'
import { auth } from './server'

const base = 'http://localhost:3000/api/auth'

function post(path: string, body: unknown, headers: HeadersInit = {}) {
  return auth.handler(
    new Request(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

function sessionCookie(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

const ana = {
  name: 'Ana',
  email: 'ana@example.com',
  password: 'senha-forte-123',
}

describe('auth HTTP API', () => {
  test('a broker who signs up gets a session', async () => {
    const res = await post('/sign-up/email', ana)
    expect(res.status).toBe(200)

    const session = await auth.handler(
      new Request(`${base}/get-session`, {
        headers: { cookie: sessionCookie(res) },
      }),
    )
    const body = await session.json()
    expect(body.user.email).toBe('ana@example.com')
  })

  test('a broker signs in with the right password', async () => {
    await post('/sign-up/email', ana)

    const res = await post('/sign-in/email', {
      email: ana.email,
      password: ana.password,
    })
    expect(res.status).toBe(200)
    expect(sessionCookie(res)).toContain('better-auth.session_token=')
  })

  test('signing in with a wrong password is rejected', async () => {
    await post('/sign-up/email', ana)

    const res = await post('/sign-in/email', {
      email: ana.email,
      password: 'senha-errada-123',
    })
    expect(res.status).toBe(401)
    expect(sessionCookie(res)).toBe('')
  })

  test('an email can only sign up once', async () => {
    await post('/sign-up/email', ana)

    const res = await post('/sign-up/email', { ...ana, name: 'Outra Ana' })
    expect(res.status).toBe(422)
  })
})
