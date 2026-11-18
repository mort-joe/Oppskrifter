import { badRequest, getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../../_lib/http.js'
import { isIntegerIdList } from '../../_lib/validate.js'

export default withAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : []

  if (!orderedIds.length) {
    badRequest(res, 'Mangler sortert kategoriliste.')
    return
  }

  if (!isIntegerIdList(orderedIds)) {
    badRequest(res, 'Kategorilisten ma inneholde unike kategori-id-er.')
    return
  }

  const updates = orderedIds.map((id, index) =>
    supabaseAdmin
      .from('shopping_categories')
      .update({ sort_order: index + 1 })
      .eq('id', id),
  )

  const results = await Promise.all(updates)
  const firstError = results.find((result) => result.error)?.error

  if (firstError) {
    badRequest(res, firstError.message)
    return
  }

  const { data, error } = await supabaseAdmin
    .from('shopping_categories')
    .select('id,name,sort_order,created_at')
    .order('sort_order', { ascending: true })

  if (error) {
    badRequest(res, error.message)
    return
  }

  res.status(200).json({ categories: data || [] })
})
