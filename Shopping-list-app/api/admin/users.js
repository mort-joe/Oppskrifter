import { requireAdminSession } from '../_lib/adminSession.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getAdminConfigDebugInfo } from '../_lib/adminSession.js'

const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'user')
const CONFIG_ADMIN_ID = '__local_admin__'

export default async function handler(req, res) {
  if (!requireAdminSession(req, res)) return

  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (error) {
    res.status(500).json({ error: error.message || 'Kunne ikke initialisere Supabase admin-klient.' })
    return
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    const users = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      username: user.user_metadata?.display_name || user.email,
      role: normalizeRole(user.app_metadata?.role),
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    }))

    const adminConfig = getAdminConfigDebugInfo()
    const hasConfigAdminInList = users.some((user) => (user.email || '').toLowerCase() === adminConfig.effectiveUsername.toLowerCase())

    if (!hasConfigAdminInList) {
      users.unshift({
        id: CONFIG_ADMIN_ID,
        email: adminConfig.effectiveUsername,
        username: adminConfig.effectiveUsername,
        role: 'admin',
        created_at: null,
        last_sign_in_at: null,
        is_config_admin: true,
      })
    }

    res.status(200).json({ users })
    return
  }

  if (req.method === 'POST') {
    const { username, email, password, role } = req.body || {}

    if (!username || !email || !password) {
      res.status(400).json({ error: 'Mangler brukernavn, epost eller passord.' })
      return
    }

    const normalizedRole = normalizeRole(role)

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: username },
      app_metadata: { role: normalizedRole },
    })

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    res.status(201).json({
      user: {
        id: data.user.id,
        email: data.user.email,
        username: username,
        role: normalizedRole,
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
      },
    })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).json({ error: 'Method not allowed' })
}
