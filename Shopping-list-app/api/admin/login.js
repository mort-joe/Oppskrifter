import { createAdminToken, validateAdminCredentials } from '../_lib/adminSession.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const isSupabaseAdmin = async (username, password) => {
  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (error) {
    return { valid: false, error: error.message, status: 500 }
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: username,
    password,
  })

  if (error || !data?.user) {
    return { valid: false, error: 'Feil brukernavn eller passord.' }
  }

  const role = data.user.app_metadata?.role
  if (String(role).toLowerCase() !== 'admin') {
    return { valid: false, error: 'Denne kontoen har ikke administratorrettigheter.' }
  }

  return { valid: true }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { username, password } = req.body || {}

  if (!username || !password) {
    res.status(400).json({ error: 'Mangler brukernavn eller passord.' })
    return
  }

  const trimmedUsername = String(username).trim()
  const trimmedPassword = String(password)

  if (validateAdminCredentials(trimmedUsername, trimmedPassword)) {
    const token = createAdminToken()
    res.status(200).json({ token })
    return
  }

  const adminLoginResult = await isSupabaseAdmin(trimmedUsername, trimmedPassword)
  if (!adminLoginResult.valid) {
    const status = adminLoginResult.status || (adminLoginResult.error === 'Denne kontoen har ikke administratorrettigheter.' ? 403 : 401)
    res.status(status).json({ error: adminLoginResult.error })
    return
  }

  const token = createAdminToken()
  res.status(200).json({ token })
}
