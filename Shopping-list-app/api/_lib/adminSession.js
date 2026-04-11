import crypto from 'node:crypto'

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'mortenadmin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Postboks22@oppskrifter'
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'change-this-secret'
const SESSION_TTL_SECONDS = 60 * 60 * 8

export const getAdminConfigDebugInfo = () => ({
  effectiveUsername: ADMIN_USERNAME,
  usernameSource: process.env.ADMIN_USERNAME ? 'env' : 'default',
  passwordSource: process.env.ADMIN_PASSWORD ? 'env' : 'default',
})

const base64UrlEncode = (value) =>
  Buffer.from(value, 'utf8').toString('base64url')

const base64UrlDecode = (value) =>
  Buffer.from(value, 'base64url').toString('utf8')

const signValue = (value) =>
  crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url')

export const validateAdminCredentials = (username, password) =>
  username === ADMIN_USERNAME && password === ADMIN_PASSWORD

export const createAdminToken = () => {
  const payload = {
    sub: ADMIN_USERNAME,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload))
  const signature = signValue(payloadEncoded)
  return `${payloadEncoded}.${signature}`
}

export const verifyAdminToken = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'missing token' }
  }

  const [payloadEncoded, signature] = token.split('.')
  const expectedSignature = signValue(payloadEncoded)

  if (signature.length !== expectedSignature.length) {
    return { valid: false, reason: 'invalid signature' }
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return { valid: false, reason: 'invalid signature' }
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded))
    const now = Math.floor(Date.now() / 1000)
    if (!payload?.exp || payload.exp < now) {
      return { valid: false, reason: 'token expired' }
    }

    if (payload.sub !== ADMIN_USERNAME) {
      return { valid: false, reason: 'invalid subject' }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: 'invalid payload' }
  }
}

export const readAdminTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }

  return authHeader.slice('Bearer '.length).trim()
}

export const requireAdminSession = (req, res) => {
  const token = readAdminTokenFromHeader(req)
  const verification = verifyAdminToken(token)

  if (!verification.valid) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }

  return true
}
