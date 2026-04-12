import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

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
    res.status(400).json({ error: 'Mangler kategori-id.' })
    return
  }

  if (req.method === 'PATCH') {
    const name = String(req.body?.name || '').trim()

    if (!name) {
      res.status(400).json({ error: 'Kategorinavn ma fylles ut.' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('shopping_categories')
      .update({ name })
      .eq('id', id)
      .select('id,name,sort_order,created_at')
      .single()

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    res.status(200).json({ category: data })
    return
  }

  res.setHeader('Allow', ['PATCH'])
  res.status(405).json({ error: 'Method not allowed' })
}
