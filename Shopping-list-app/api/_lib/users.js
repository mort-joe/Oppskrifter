import { getAdminConfigDebugInfo } from './adminSession.js'

export const CONFIG_ADMIN_ID = '__local_admin__'

export const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'user')

export const toTimestamp = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

export const pickLatestDate = (first, second) => {
  const firstTime = toTimestamp(first)
  const secondTime = toTimestamp(second)

  if (!firstTime && !secondTime) return null
  if (!firstTime) return second
  if (!secondTime) return first
  return firstTime >= secondTime ? first : second
}

export const buildActivityByUserId = (shoppingStates) =>
  (shoppingStates || []).reduce((acc, row) => {
    if (!row.user_id || !row.updated_at) return acc
    acc[row.user_id] = pickLatestDate(acc[row.user_id], row.updated_at)
    return acc
  }, {})

// Adds the config-admin account to the top of the list when it is not already
// a Supabase user. Mutates and returns the given array.
export const withConfigAdmin = (users, extraFields = {}) => {
  const configUsername = getAdminConfigDebugInfo().effectiveUsername
  if (!configUsername) {
    return users
  }

  const hasConfigAdminInList = users.some((user) => (user.email || '').toLowerCase() === configUsername.toLowerCase())

  if (!hasConfigAdminInList) {
    users.unshift({
      id: CONFIG_ADMIN_ID,
      email: configUsername,
      role: 'admin',
      created_at: null,
      last_sign_in_at: null,
      ...extraFields,
      is_config_admin: true,
    })
  }

  return users
}
