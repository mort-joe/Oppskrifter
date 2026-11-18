import { badRequest, getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../../_lib/http.js'
import { isIntegerId, isOptionalString } from '../../_lib/validate.js'

export default withAdmin(async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

  const {
    query: { id },
  } = req

  if (!id) {
    badRequest(res, 'Mangler kategori-id.')
    return
  }

  if (!isIntegerId(id)) {
    badRequest(res, 'Ugyldig kategori-id.')
    return
  }

  if (req.method === 'PATCH') {
    if (!isOptionalString(req.body?.name)) {
      badRequest(res, 'Kategorinavn ma vaere tekst.')
      return
    }

    const name = String(req.body?.name || '').trim()

    if (!name) {
      badRequest(res, 'Kategorinavn ma fylles ut.')
      return
    }

    // Get the current category name before updating
    const { data: currentCategory, error: fetchError } = await supabaseAdmin
      .from('shopping_categories')
      .select('name')
      .eq('id', id)
      .single()

    if (fetchError) {
      badRequest(res, fetchError.message)
      return
    }

    const oldName = currentCategory.name

    const { data, error } = await supabaseAdmin
      .from('shopping_categories')
      .update({ name })
      .eq('id', id)
      .select('id,name,sort_order,created_at')
      .single()

    if (error) {
      badRequest(res, error.message)
      return
    }

    // Update all ingredients with the old category name to the new name
    if (oldName !== name) {
      const { error: updateIngredientsError } = await supabaseAdmin
        .from('ingredients')
        .update({ shopping_category: name })
        .eq('shopping_category', oldName)

      if (updateIngredientsError) {
        // Log the error but don't fail the request since the category was updated
        console.error('Failed to update ingredients shopping_category:', updateIngredientsError.message)
      }
    }

    res.status(200).json({ category: data })
    return
  }

  methodNotAllowed(res, ['PATCH'])
})
