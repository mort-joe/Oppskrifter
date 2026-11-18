import { badRequest, getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../../_lib/http.js'
import { isOptionalString } from '../../_lib/validate.js'

const MISSING_TABLE_MESSAGE = 'Tabellen shopping_categories mangler. Kjor SQL-oppsettet for dashboard-kategorier.'

const ensureTableExistsError = (errorMessage) =>
  String(errorMessage || '').toLowerCase().includes('shopping_categories')

const describeReadError = (error) =>
  ensureTableExistsError(error.message) ? MISSING_TABLE_MESSAGE : error.message

export default withAdmin(async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('shopping_categories')
      .select('id,name,sort_order,created_at')
      .order('sort_order', { ascending: true })

    if (error) {
      res.status(500).json({ error: describeReadError(error) })
      return
    }

    res.status(200).json({ categories: data || [] })
    return
  }

  if (req.method === 'POST') {
    if (!isOptionalString(req.body?.name)) {
      badRequest(res, 'Kategorinavn ma vaere tekst.')
      return
    }

    const name = String(req.body?.name || '').trim()

    if (!name) {
      badRequest(res, 'Kategorinavn ma fylles ut.')
      return
    }

    const { data: existingRows, error: maxError } = await supabaseAdmin
      .from('shopping_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    if (maxError) {
      res.status(500).json({ error: describeReadError(maxError) })
      return
    }

    const nextSortOrder = ((existingRows && existingRows[0]?.sort_order) || 0) + 1

    const { data, error } = await supabaseAdmin
      .from('shopping_categories')
      .insert([{ name, sort_order: nextSortOrder }])
      .select('id,name,sort_order,created_at')
      .single()

    if (error) {
      badRequest(res, error.message)
      return
    }

    res.status(201).json({ category: data })
    return
  }

  methodNotAllowed(res, ['GET', 'POST'])
})
