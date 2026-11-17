import { getAdminConfigDebugInfo } from '../_lib/adminSession.js'
import { methodNotAllowed, withAdmin } from '../_lib/http.js'

// Diagnostic endpoint: reports where the admin configuration comes from.
// Requires an admin session so that it never reveals the admin username to
// unauthenticated callers.
export default withAdmin(async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  const info = getAdminConfigDebugInfo()
  res.status(200).json({
    effectiveUsername: info.effectiveUsername,
    usernameSource: info.usernameSource,
    passwordSource: info.passwordSource,
    sessionSecretSource: info.sessionSecretSource,
  })
})
