import { getSupabaseAdminOr500, methodNotAllowed, withAdmin } from '../_lib/http.js'
import { buildActivityByUserId, normalizeRole, pickLatestDate, withConfigAdmin } from '../_lib/users.js'

export default withAdmin(async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }

  const supabaseAdmin = getSupabaseAdminOr500(res)
  if (!supabaseAdmin) return

  const [{ data: authData, error: authError }, { data: recipeData, error: recipeError }, { data: shoppingStateData, error: shoppingStateError }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers(),
    supabaseAdmin.from('recipes').select('id,name,user_id').order('id', { ascending: false }),
    supabaseAdmin.from('shopping_state').select('user_id,updated_at'),
  ])

  if (authError) {
    res.status(500).json({ error: authError.message })
    return
  }

  if (recipeError) {
    res.status(500).json({ error: recipeError.message })
    return
  }

  // shopping_state can be missing in some environments; continue without activity snapshots.
  const shoppingStates = shoppingStateError ? [] : (shoppingStateData || [])

  const users = withConfigAdmin(
    (authData?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      role: normalizeRole(user.app_metadata?.role),
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    })),
  )

  const recipes = recipeData || []

  const recipeCountByUserId = recipes.reduce((acc, recipe) => {
    if (!recipe.user_id) return acc
    acc[recipe.user_id] = (acc[recipe.user_id] || 0) + 1
    return acc
  }, {})

  const activityByUserId = buildActivityByUserId(shoppingStates)

  const usersWithStats = users.map((user) => ({
    ...user,
    recipe_count: recipeCountByUserId[user.id] || 0,
    last_active_at: pickLatestDate(user.last_sign_in_at, activityByUserId[user.id]),
  }))

  const emailByUserId = users.reduce((acc, user) => {
    acc[user.id] = user.email || 'Ukjent bruker'
    return acc
  }, {})

  const recipesWithOwner = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    user_id: recipe.user_id,
    owner_email: emailByUserId[recipe.user_id] || 'Ukjent bruker',
    created_at: null,
  }))

  res.status(200).json({
    users: usersWithStats,
    recipes: recipesWithOwner,
  })
})
