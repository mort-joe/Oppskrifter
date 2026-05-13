import { requireAdminSession } from '../_lib/adminSession.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getAdminConfigDebugInfo } from '../_lib/adminSession.js'

const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'user')
const CONFIG_ADMIN_ID = '__local_admin__'

const toTimestamp = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

const pickLatestDate = (first, second) => {
  const firstTime = toTimestamp(first)
  const secondTime = toTimestamp(second)

  if (!firstTime && !secondTime) return null
  if (!firstTime) return second
  if (!secondTime) return first
  return firstTime >= secondTime ? first : second
}

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
    const [{ data, error }, { data: shoppingStateData, error: shoppingStateError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers(),
      supabaseAdmin.from('shopping_state').select('user_id,updated_at'),
    ])

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    // shopping_state can be missing in some environments; continue without activity snapshots.
    const shoppingStates = shoppingStateError ? [] : (shoppingStateData || [])

    const activityByUserId = shoppingStates.reduce((acc, row) => {
      if (!row.user_id || !row.updated_at) return acc
      acc[row.user_id] = pickLatestDate(acc[row.user_id], row.updated_at)
      return acc
    }, {})

    const users = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      role: normalizeRole(user.app_metadata?.role),
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      last_active_at: pickLatestDate(user.last_sign_in_at, activityByUserId[user.id]),
      display_name: user.user_metadata?.display_name || '',
    }))

    const adminConfig = getAdminConfigDebugInfo()
    const hasConfigAdminInList = users.some((user) => (user.email || '').toLowerCase() === adminConfig.effectiveUsername.toLowerCase())

    if (!hasConfigAdminInList) {
      users.unshift({
        id: CONFIG_ADMIN_ID,
        email: adminConfig.effectiveUsername,
        role: 'admin',
        created_at: null,
        last_sign_in_at: null,
        last_active_at: null,
        is_config_admin: true,
      })
    }

    res.status(200).json({ users })
    return
  }

  if (req.method === 'POST') {
    const { email, password, role, username } = req.body || {}

    if (!email || !password) {
      res.status(400).json({ error: 'Mangler brukernavn eller passord.' })
      return
    }

    const normalizedRole = normalizeRole(role)

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: username || '' },
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
        role: normalizedRole,
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
        display_name: username || '',
      },
    })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).json({ error: 'Method not allowed' })
}
