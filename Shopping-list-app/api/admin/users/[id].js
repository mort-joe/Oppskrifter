import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

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

  const {
    query: { id },
  } = req

  if (!id) {
    res.status(400).json({ error: 'Mangler bruker-id.' })
    return
  }

  if (id === CONFIG_ADMIN_ID) {
    res.status(400).json({ error: 'Denne administratorkontoen styres av konfigurasjon og kan ikke endres her.' })
    return
  }

  if (req.method === 'PATCH') {
    const { password, role, email } = req.body || {}
    const payload = {}

    if (password) {
      payload.password = password
    }

    if (role) {
      payload.app_metadata = { role: normalizeRole(role) }
    }

    if (email) {
      payload.email = email
    }

    if (!Object.keys(payload).length) {
      res.status(400).json({ error: 'Ingen endringer oppgitt.' })
      return
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, payload)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    res.status(200).json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: normalizeRole(data.user.app_metadata?.role),
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
      },
    })
    return
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    res.status(204).end()
    return
  }

  res.setHeader('Allow', ['PATCH', 'DELETE'])
  res.status(405).json({ error: 'Method not allowed' })
}
