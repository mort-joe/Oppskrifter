import { badRequest, getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../../_lib/http.js'
import { isIntegerId, isOptionalString } from '../../_lib/validate.js'

export default withAdmin(async function handler(req, res) {
  if (req.method !== 'PATCH') {
    methodNotAllowed(res, ['PATCH'])
    return
  }

  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

  const {
    query: { id },
  } = req

  if (!id) {
    badRequest(res, 'Mangler ingrediens-id.')
    return
  }

  if (!isIntegerId(id)) {
    badRequest(res, 'Ugyldig ingrediens-id.')
    return
  }

  if (!isOptionalString(req.body?.name) || !isOptionalString(req.body?.shopping_category)) {
    badRequest(res, 'Navn og sorteringskategori må være tekst.')
    return
  }

  const name = String(req.body?.name || '').trim()
  const shoppingCategory = String(req.body?.shopping_category || '').trim()

  if (!name && !shoppingCategory) {
    badRequest(res, 'Mangler felter som skal oppdateres.')
    return
  }

  const updates = {}
  if (name) updates.name = name
  if (shoppingCategory) updates.shopping_category = shoppingCategory

  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .update(updates)
    .eq('id', id)
    .select('id,name,shopping_category')
    .single()

  if (error) {
    badRequest(res, error.message)
    return
  }

  res.status(200).json({ ingredient: data })
})
