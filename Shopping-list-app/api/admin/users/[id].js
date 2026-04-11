import { requireAdminSession } from '../../_lib/adminSession'
import { supabaseAdmin } from '../../_lib/supabaseAdmin'

const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'user')

export default async function handler(req, res) {
  if (!requireAdminSession(req, res)) return

  const {
    query: { id },
  } = req

  if (!id) {
    res.status(400).json({ error: 'Mangler bruker-id.' })
    return
  }

  if (req.method === 'PATCH') {
    const { password, role } = req.body || {}
    const payload = {}

    if (password) {
      payload.password = password
    }

    if (role) {
      payload.app_metadata = { role: normalizeRole(role) }
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
