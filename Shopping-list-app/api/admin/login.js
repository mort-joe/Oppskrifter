import { createAdminToken, validateAdminCredentials } from '../_lib/adminSession.js'
import { methodNotAllowed } from '../_lib/http.js'
import { getSupabaseAuthClient } from '../_lib/supabaseAdmin.js'
import { isNonEmptyString } from '../_lib/validate.js'

const isSupabaseAdmin = async (username, password) => {
  let authClient
  try {
    authClient = getSupabaseAuthClient()
  } catch (error) {
    return { valid: false, error: error.message, status: 500 }
  }

  const { data, error } = await authClient.auth.signInWithPassword({
    email: username,
    password,
  })

  if (error || !data?.user) {
    return { valid: false, error: 'Feil brukernavn eller passord.' }
  }

  // The password check created a server-side session that is never used
  // again. Revoke just that session ('local'), leaving the user's own
  // browser sessions untouched.
  try {
    await authClient.auth.signOut({ scope: 'local' })
  } catch (signOutError) {
    console.error('Could not revoke the admin login session:', signOutError)
  }

  const role = data.user.app_metadata?.role
  if (String(role).toLowerCase() !== 'admin') {
    return { valid: false, error: 'Denne kontoen har ikke administratorrettigheter.' }
  }

  return { valid: true }
}

const respondWithToken = (res) => {
  let token
  try {
    token = createAdminToken()
  } catch (error) {
    res.status(500).json({ error: error.message || 'Kunne ikke opprette admin-sesjon.' })
    return
  }

  res.status(200).json({ token })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const { username, password } = req.body || {}

  if (!username || !password) {
    res.status(400).json({ error: 'Mangler brukernavn eller passord.' })
    return
  }

  if (!isNonEmptyString(username) || typeof password !== 'string') {
    res.status(400).json({ error: 'Brukernavn og passord må være tekst.' })
    return
  }

  const trimmedUsername = username.trim()
  const trimmedPassword = password

  if (validateAdminCredentials(trimmedUsername, trimmedPassword)) {
    respondWithToken(res)
    return
  }

  const adminLoginResult = await isSupabaseAdmin(trimmedUsername, trimmedPassword)
  if (!adminLoginResult.valid) {
    const status = adminLoginResult.status || (adminLoginResult.error === 'Denne kontoen har ikke administratorrettigheter.' ? 403 : 401)
    res.status(status).json({ error: adminLoginResult.error })
    return
  }

  respondWithToken(res)
}
