import { badRequest, getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../_lib/http.js'
import { buildActivityByUserId, normalizeRole, pickLatestDate, withConfigAdmin } from '../_lib/users.js'
import { isNonEmptyString, isOptionalString } from '../_lib/validate.js'

export default withAdmin(async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

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

    const activityByUserId = buildActivityByUserId(shoppingStates)

    const users = withConfigAdmin(
      (data?.users || []).map((user) => ({
        id: user.id,
        email: user.email,
        role: normalizeRole(user.app_metadata?.role),
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        last_active_at: pickLatestDate(user.last_sign_in_at, activityByUserId[user.id]),
        display_name: user.user_metadata?.display_name || '',
      })),
      { last_active_at: null },
    )

    res.status(200).json({ users })
    return
  }

  if (req.method === 'POST') {
    const { email, password, role, username } = req.body || {}

    if (!email || !password) {
      badRequest(res, 'Mangler brukernavn eller passord.')
      return
    }

    if (!isNonEmptyString(email) || typeof password !== 'string' || !isOptionalString(username)) {
      badRequest(res, 'Brukernavn, passord og visningsnavn må være tekst.')
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
      badRequest(res, error.message)
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

  methodNotAllowed(res, ['GET', 'POST'])
})
