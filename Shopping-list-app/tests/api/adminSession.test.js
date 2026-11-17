import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminToken,
  getAdminConfigDebugInfo,
  requireAdminSession,
  validateAdminCredentials,
  verifyAdminToken,
} from '../../api/_lib/adminSession.js'

const fakeResponse = () => {
  const res = { statusCode: null, body: null }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (body) => {
    res.body = body
    return res
  }
  return res
}

beforeEach(() => {
  vi.stubEnv('ADMIN_USERNAME', 'admin@example.com')
  vi.stubEnv('ADMIN_PASSWORD', 'correct horse battery staple')
  vi.stubEnv('ADMIN_SESSION_SECRET', 'unit-test-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('validateAdminCredentials', () => {
  it('accepts the configured credentials only', () => {
    expect(validateAdminCredentials('admin@example.com', 'correct horse battery staple')).toBe(true)
    expect(validateAdminCredentials('admin@example.com', 'wrong')).toBe(false)
    expect(validateAdminCredentials('someone@example.com', 'correct horse battery staple')).toBe(false)
    expect(validateAdminCredentials('', '')).toBe(false)
  })

  it('fails closed when the configuration is missing', () => {
    vi.stubEnv('ADMIN_PASSWORD', '')
    expect(validateAdminCredentials('admin@example.com', '')).toBe(false)
    expect(getAdminConfigDebugInfo().passwordSource).toBe('missing')
  })
})

describe('admin tokens', () => {
  it('round-trips a freshly created token', () => {
    const token = createAdminToken()
    expect(token.split('.')).toHaveLength(2)
    expect(verifyAdminToken(token)).toEqual({ valid: true })
  })

  it('rejects a tampered payload', () => {
    const [payload, signature] = createAdminToken().split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin@example.com', exp: 4102444800 })).toString('base64url')
    expect(verifyAdminToken(`${forgedPayload}.${signature}`).valid).toBe(false)
    expect(verifyAdminToken(`${payload}.${signature.slice(0, -1)}x`).valid).toBe(false)
    expect(verifyAdminToken(`${payload}.`).valid).toBe(false)
    expect(verifyAdminToken('')).toEqual({ valid: false, reason: 'missing token' })
    expect(verifyAdminToken(null).valid).toBe(false)
  })

  it('rejects an expired token', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = createAdminToken()
    vi.setSystemTime(new Date('2026-01-01T07:59:00Z'))
    expect(verifyAdminToken(token).valid).toBe(true)
    vi.setSystemTime(new Date('2026-01-01T08:01:00Z'))
    expect(verifyAdminToken(token)).toEqual({ valid: false, reason: 'token expired' })
  })

  it('rejects a token signed for another subject', () => {
    const token = createAdminToken()
    vi.stubEnv('ADMIN_USERNAME', 'other@example.com')
    expect(verifyAdminToken(token)).toEqual({ valid: false, reason: 'invalid subject' })
  })

  it('cannot create or verify tokens without a session secret', () => {
    const token = createAdminToken()
    vi.stubEnv('ADMIN_SESSION_SECRET', '')
    expect(() => createAdminToken()).toThrow(/ADMIN_SESSION_SECRET/)
    expect(verifyAdminToken(token)).toEqual({ valid: false, reason: 'missing session secret' })
  })

  it('does not accept a token signed with the old default secret', () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'change-this-secret')
    const token = createAdminToken()
    vi.stubEnv('ADMIN_SESSION_SECRET', 'unit-test-secret')
    expect(verifyAdminToken(token)).toEqual({ valid: false, reason: 'invalid signature' })
  })
})

describe('requireAdminSession', () => {
  it('responds 401 without a valid bearer token', () => {
    const res = fakeResponse()
    expect(requireAdminSession({ headers: {} }, res)).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })

    const res2 = fakeResponse()
    expect(requireAdminSession({ headers: { authorization: 'Bearer nope' } }, res2)).toBe(false)
    expect(res2.statusCode).toBe(401)
  })

  it('passes with a valid bearer token', () => {
    const res = fakeResponse()
    expect(requireAdminSession({ headers: { authorization: `Bearer ${createAdminToken()}` } }, res)).toBe(true)
    expect(res.statusCode).toBeNull()
  })
})
