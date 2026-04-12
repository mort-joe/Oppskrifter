import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

const ensureTableExistsError = (errorMessage) =>
  String(errorMessage || '').toLowerCase().includes('shopping_categories')

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
    const { data, error } = await supabaseAdmin
      .from('shopping_categories')
      .select('id,name,sort_order,created_at')
      .order('sort_order', { ascending: true })

    if (error) {
      const errorMessage = ensureTableExistsError(error.message)
        ? 'Tabellen shopping_categories mangler. Kjor SQL-oppsettet for dashboard-kategorier.'
        : error.message
      res.status(500).json({ error: errorMessage })
      return
    }

    res.status(200).json({ categories: data || [] })
    return
  }

  if (req.method === 'POST') {
    const name = String(req.body?.name || '').trim()

    if (!name) {
      res.status(400).json({ error: 'Kategorinavn ma fylles ut.' })
      return
    }

    const { data: existingRows, error: maxError } = await supabaseAdmin
      .from('shopping_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    if (maxError) {
      const errorMessage = ensureTableExistsError(maxError.message)
        ? 'Tabellen shopping_categories mangler. Kjor SQL-oppsettet for dashboard-kategorier.'
        : maxError.message
      res.status(500).json({ error: errorMessage })
      return
    }

    const nextSortOrder = ((existingRows && existingRows[0]?.sort_order) || 0) + 1

    const { data, error } = await supabaseAdmin
      .from('shopping_categories')
      .insert([{ name, sort_order: nextSortOrder }])
      .select('id,name,sort_order,created_at')
      .single()

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    res.status(201).json({ category: data })
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).json({ error: 'Method not allowed' })
}
