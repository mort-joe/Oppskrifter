import crypto from 'node:crypto'

const SESSION_TTL_SECONDS = 60 * 60 * 8

// All three values must be set as environment variables (see .env.example).
// There are deliberately no fallback values: if one is missing, the config
// admin login is disabled and tokens can neither be created nor verified.
const getAdminConfig = () => ({
  username: process.env.ADMIN_USERNAME || '',
  password: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.ADMIN_SESSION_SECRET || '',
})

export const getAdminConfigDebugInfo = () => {
  const config = getAdminConfig()

  return {
    effectiveUsername: config.username,
    usernameSource: config.username ? 'env' : 'missing',
    passwordSource: config.password ? 'env' : 'missing',
    sessionSecretSource: config.sessionSecret ? 'env' : 'missing',
  }
}

const base64UrlEncode = (value) =>
  Buffer.from(value, 'utf8').toString('base64url')

const base64UrlDecode = (value) =>
  Buffer.from(value, 'base64url').toString('utf8')

const requireSessionSecret = () => {
  const { sessionSecret } = getAdminConfig()
  if (!sessionSecret) {
    throw new Error('ADMIN_SESSION_SECRET mangler i miljøvariablene.')
  }
  return sessionSecret
}

const signValue = (value) =>
  crypto.createHmac('sha256', requireSessionSecret()).update(value).digest('base64url')

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest()

// Constant-time string comparison. Both sides are hashed first so that the
// comparison never short-circuits on length.
const safeEqual = (first, second) => crypto.timingSafeEqual(sha256(first), sha256(second))

export const validateAdminCredentials = (username, password) => {
  const config = getAdminConfig()
  if (!config.username || !config.password) {
    return false
  }

  const usernameMatches = safeEqual(username, config.username)
  const passwordMatches = safeEqual(password, config.password)
  return usernameMatches && passwordMatches
}

export const createAdminToken = () => {
  const payload = {
    sub: getAdminConfig().username,
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

  const config = getAdminConfig()
  if (!config.sessionSecret) {
    return { valid: false, reason: 'missing session secret' }
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

    if (payload.sub !== config.username) {
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
