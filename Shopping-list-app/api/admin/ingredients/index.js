import { requireAdminSession } from '../../_lib/adminSession.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

const normalizeDuplicateKey = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const buildIngredientPayload = async (supabaseAdmin) => {
  const [{ data: ingredients, error: ingredientsError }, { data: recipeIngredients, error: recipeIngredientsError }, { data: shoppingCategories, error: shoppingCategoriesError }] = await Promise.all([
    supabaseAdmin
      .from('ingredients')
      .select('id,name,shopping_category,created_at')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('recipe_ingredients')
      .select('ingredient_id'),
    supabaseAdmin
      .from('shopping_categories')
      .select('id,name,sort_order')
      .order('sort_order', { ascending: true }),
  ])

  if (ingredientsError) {
    throw new Error(ingredientsError.message)
  }

  if (recipeIngredientsError) {
    throw new Error(recipeIngredientsError.message)
  }

  if (shoppingCategoriesError) {
    throw new Error(shoppingCategoriesError.message)
  }

  const usageByIngredientId = (recipeIngredients || []).reduce((acc, row) => {
    const ingredientId = row.ingredient_id
    if (!ingredientId) return acc
    acc[ingredientId] = (acc[ingredientId] || 0) + 1
    return acc
  }, {})

  const enrichedIngredients = (ingredients || []).map((ingredient) => ({
    ...ingredient,
    usage_count: usageByIngredientId[ingredient.id] || 0,
  }))

  const duplicateGroupsMap = enrichedIngredients.reduce((acc, ingredient) => {
    const key = normalizeDuplicateKey(ingredient.name)
    if (!key) return acc
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(ingredient)
    return acc
  }, {})

  const duplicateGroups = Object.entries(duplicateGroupsMap)
    .filter(([, rows]) => rows.length > 1)
    .map(([normalized_key, rows]) => ({
      normalized_key,
      ingredients: [...rows].sort((a, b) => {
        if ((b.usage_count || 0) !== (a.usage_count || 0)) {
          return (b.usage_count || 0) - (a.usage_count || 0)
        }
        return String(a.name || '').localeCompare(String(b.name || ''), 'no', { sensitivity: 'base' })
      }),
    }))

  return {
    ingredients: enrichedIngredients,
    shoppingCategories: shoppingCategories || [],
    duplicateGroups,
  }
}

export default async function handler(req, res) {
  if (!requireAdminSession(req, res)) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
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

  try {
    const payload = await buildIngredientPayload(supabaseAdmin)
    res.status(200).json(payload)
  } catch (error) {
    res.status(500).json({ error: error.message || 'Kunne ikke hente ingrediensdata.' })
  }
}
