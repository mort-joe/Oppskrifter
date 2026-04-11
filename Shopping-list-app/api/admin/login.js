import { createAdminToken, validateAdminCredentials } from '../_lib/adminSession'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { username, password } = req.body || {}
  if (!validateAdminCredentials(username, password)) {
    res.status(401).json({ error: 'Feil brukernavn eller passord.' })
    return
  }

  const token = createAdminToken()
  res.status(200).json({ token })
}
