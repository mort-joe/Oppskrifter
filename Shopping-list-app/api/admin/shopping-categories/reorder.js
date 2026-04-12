import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (!requireAdminSession(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (error) {
    res.status(500).json({ error: error.message || 'Kunne ikke initialisere Supabase admin-klient.' })
    return
  }

  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : []

  if (!orderedIds.length) {
    res.status(400).json({ error: 'Mangler sortert kategoriliste.' })
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
    res.status(400).json({ error: firstError.message })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('shopping_categories')
    .select('id,name,sort_order,created_at')
    .order('sort_order', { ascending: true })

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({ categories: data || [] })
}
