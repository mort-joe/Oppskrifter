import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

const mergeRowsForSameRecipeAndUnit = async (supabaseAdmin, keepIngredientId, mergeIngredientIds) => {
  const idsToScan = [keepIngredientId, ...mergeIngredientIds]

  const { data: rows, error } = await supabaseAdmin
    .from('recipe_ingredients')
    .select('id,recipe_id,ingredient_id,quantity,unit')
    .in('ingredient_id', idsToScan)

  if (error) {
    throw new Error(error.message)
  }

  const keepRowsByRecipeAndUnit = new Map()
  const mergeRows = []

  ;(rows || []).forEach((row) => {
    const key = `${row.recipe_id}::${row.unit || ''}`
    if (row.ingredient_id === keepIngredientId) {
      keepRowsByRecipeAndUnit.set(key, row)
    } else if (mergeIngredientIds.includes(row.ingredient_id)) {
      mergeRows.push(row)
    }
  })

  for (const row of mergeRows) {
    const key = `${row.recipe_id}::${row.unit || ''}`
    const existingKeep = keepRowsByRecipeAndUnit.get(key)

    if (existingKeep) {
      const mergedQuantity = (Number(existingKeep.quantity) || 0) + (Number(row.quantity) || 0)
      const { error: updateKeepError } = await supabaseAdmin
        .from('recipe_ingredients')
        .update({ quantity: mergedQuantity })
        .eq('id', existingKeep.id)

      if (updateKeepError) {
        throw new Error(updateKeepError.message)
      }

      const { error: deleteMergeError } = await supabaseAdmin
        .from('recipe_ingredients')
        .delete()
        .eq('id', row.id)

      if (deleteMergeError) {
        throw new Error(deleteMergeError.message)
      }
    } else {
      const { error: moveError } = await supabaseAdmin
        .from('recipe_ingredients')
        .update({ ingredient_id: keepIngredientId })
        .eq('id', row.id)

      if (moveError) {
        throw new Error(moveError.message)
      }
    }
  }
}

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

  const keepIngredientId = Number(req.body?.keepIngredientId)
  const mergeIngredientIds = Array.isArray(req.body?.mergeIngredientIds)
    ? req.body.mergeIngredientIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : []

  if (!Number.isFinite(keepIngredientId) || keepIngredientId <= 0) {
    res.status(400).json({ error: 'Mangler ingrediens som skal beholdes.' })
    return
  }

  if (!mergeIngredientIds.length) {
    res.status(400).json({ error: 'Mangler ingredienser som skal slas sammen.' })
    return
  }

  if (mergeIngredientIds.includes(keepIngredientId)) {
    res.status(400).json({ error: 'Ingrediens som beholdes kan ikke ogsa slaes sammen.' })
    return
  }

  try {
    await mergeRowsForSameRecipeAndUnit(supabaseAdmin, keepIngredientId, mergeIngredientIds)

    const { error: deleteIngredientsError } = await supabaseAdmin
      .from('ingredients')
      .delete()
      .in('id', mergeIngredientIds)

    if (deleteIngredientsError) {
      throw new Error(deleteIngredientsError.message)
    }

    res.status(200).json({
      keepIngredientId,
      mergedIngredientIds: mergeIngredientIds,
    })
  } catch (error) {
    res.status(400).json({ error: error.message || 'Kunne ikke sla sammen ingredienser.' })
  }
}
