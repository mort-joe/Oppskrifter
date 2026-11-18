import { requireAdminSession } from './adminSession.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export const methodNotAllowed = (res, allowed) => {
  res.setHeader('Allow', allowed)
  res.status(405).json({ error: 'Method not allowed' })
}

export const badRequest = (res, message) => {
  res.status(400).json({ error: message })
}

// Returns the service-role client, or responds with 500 and returns null.
export const getSupabaseAdminOr500 = (res) => {
  try {
    return getSupabaseAdmin()
  } catch (error) {
    res.status(500).json({ error: error.message || 'Kunne ikke initialisere Supabase admin-klient.' })
    return null
  }
}

// Wraps a handler so that it only runs with a valid admin session.
export const withAdmin = (handler) => async (req, res) => {
  if (!requireAdminSession(req, res)) return
  await handler(req, res)
}
