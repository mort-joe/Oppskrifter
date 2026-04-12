import { getAdminConfigDebugInfo, requireAdminSession } from '../_lib/adminSession.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'user')
const CONFIG_ADMIN_ID = '__local_admin__'

const toTimestamp = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

const pickLatestDate = (first, second) => {
  const firstTime = toTimestamp(first)
  const secondTime = toTimestamp(second)

  if (!firstTime && !secondTime) return null
  if (!firstTime) return second
  if (!secondTime) return first
  return firstTime >= secondTime ? first : second
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

  const users = (authData?.users || []).map((user) => ({
    id: user.id,
    email: user.email,
    role: normalizeRole(user.app_metadata?.role),
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  }))

  const adminConfig = getAdminConfigDebugInfo()
  const hasConfigAdminInList = users.some((user) => (user.email || '').toLowerCase() === adminConfig.effectiveUsername.toLowerCase())

  if (!hasConfigAdminInList) {
    users.unshift({
      id: CONFIG_ADMIN_ID,
      email: adminConfig.effectiveUsername,
      role: 'admin',
      created_at: null,
      last_sign_in_at: null,
      is_config_admin: true,
    })
  }

  const recipes = recipeData || []

  const recipeCountByUserId = recipes.reduce((acc, recipe) => {
    if (!recipe.user_id) return acc
    acc[recipe.user_id] = (acc[recipe.user_id] || 0) + 1
    return acc
  }, {})

  const activityByUserId = shoppingStates.reduce((acc, row) => {
    if (!row.user_id || !row.updated_at) return acc
    acc[row.user_id] = pickLatestDate(acc[row.user_id], row.updated_at)
    return acc
  }, {})

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
}
