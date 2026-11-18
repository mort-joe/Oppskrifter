import { badRequest, getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../../_lib/http.js'
import { CONFIG_ADMIN_ID, normalizeRole } from '../../_lib/users.js'
import { isOptionalString, isUuid } from '../../_lib/validate.js'

export default withAdmin(async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

  const {
    query: { id },
  } = req

  if (!id) {
    badRequest(res, 'Mangler bruker-id.')
    return
  }

  if (id === CONFIG_ADMIN_ID) {
    badRequest(res, 'Denne administratorkontoen styres av konfigurasjon og kan ikke endres her.')
    return
  }

  if (!isUuid(id)) {
    badRequest(res, 'Ugyldig bruker-id.')
    return
  }

  if (req.method === 'PATCH') {
    const { password, role, email, username } = req.body || {}

    if (!isOptionalString(password) || !isOptionalString(email) || !isOptionalString(username)) {
      badRequest(res, 'Passord, e-post og visningsnavn må være tekst.')
      return
    }

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

    if (username !== undefined) {
      payload.user_metadata = { display_name: username || '' }
    }

    if (!Object.keys(payload).length) {
      badRequest(res, 'Ingen endringer oppgitt.')
      return
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, payload)
    if (error) {
      badRequest(res, error.message)
      return
    }

    res.status(200).json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: normalizeRole(data.user.app_metadata?.role),
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
        display_name: data.user.user_metadata?.display_name || '',
      },
    })
    return
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (error) {
      badRequest(res, error.message)
      return
    }

    res.status(204).end()
    return
  }

  methodNotAllowed(res, ['PATCH', 'DELETE'])
})
