import { requireAdminSession } from '../_lib/adminSession'
import { supabaseAdmin } from '../_lib/supabaseAdmin'

const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'user')

export default async function handler(req, res) {
  if (!requireAdminSession(req, res)) return

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    const users = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      role: normalizeRole(user.app_metadata?.role),
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    }))

    res.status(200).json({ users })
    return
  }

  if (req.method === 'POST') {
    const { email, password, role } = req.body || {}

    if (!email || !password) {
      res.status(400).json({ error: 'Mangler brukernavn eller passord.' })
      return
    }

    const normalizedRole = normalizeRole(role)

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {},
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
      },
    })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).json({ error: 'Method not allowed' })
}
