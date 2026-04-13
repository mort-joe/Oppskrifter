import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (!requireAdminSession(req, res)) return

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH'])
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

  const {
    query: { id },
  } = req

  const shoppingCategory = String(req.body?.shopping_category || '').trim()

  if (!id) {
    res.status(400).json({ error: 'Mangler ingrediens-id.' })
    return
  }

  if (!shoppingCategory) {
    res.status(400).json({ error: 'Mangler sorteringskategori.' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .update({ shopping_category: shoppingCategory })
    .eq('id', id)
    .select('id,name,shopping_category,created_at')
    .single()

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({ ingredient: data })
}
