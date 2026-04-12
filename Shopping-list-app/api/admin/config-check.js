import { getAdminConfigDebugInfo } from '../_lib/adminSession.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const info = getAdminConfigDebugInfo()
  res.status(200).json({
    effectiveUsername: info.effectiveUsername,
    usernameSource: info.usernameSource,
    passwordSource: info.passwordSource,
  })
}
