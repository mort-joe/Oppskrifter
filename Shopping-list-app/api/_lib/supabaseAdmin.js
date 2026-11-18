import { createClient } from '@supabase/supabase-js'

const getSupabaseUrl = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const getServiceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY
const getAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const CLIENT_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}

export const getSupabaseAdminEnvStatus = () => ({
  hasSupabaseUrl: Boolean(getSupabaseUrl()),
  hasServiceRoleKey: Boolean(getServiceRoleKey()),
})

const buildMissingEnvError = () => {
  const status = getSupabaseAdminEnvStatus()
  return new Error(
    `Mangler miljøvariabler for admin-API (VITE_SUPABASE_URL/SUPABASE_URL=${status.hasSupabaseUrl ? 'ok' : 'mangler'}, SUPABASE_SERVICE_ROLE_KEY=${status.hasServiceRoleKey ? 'ok' : 'mangler'}).`,
  )
}

let cachedAdminClient = null
let cachedAdminClientKey = ''

// Service-role client. Bypasses RLS, so it must only be used from the
// serverless functions and never be exposed to the browser.
export const getSupabaseAdmin = () => {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getServiceRoleKey()

  if (!supabaseUrl || !serviceRoleKey) {
    throw buildMissingEnvError()
  }

  const cacheKey = `${supabaseUrl}\n${serviceRoleKey}`
  if (!cachedAdminClient || cachedAdminClientKey !== cacheKey) {
    cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, CLIENT_OPTIONS)
    cachedAdminClientKey = cacheKey
  }

  return cachedAdminClient
}

// Client used only to check a Supabase user's password at admin login.
// Prefers the public anon key (least privilege); falls back to the service
// role key when no anon key is configured on the server.
export const getSupabaseAuthClient = () => {
  const supabaseUrl = getSupabaseUrl()
  const key = getAnonKey() || getServiceRoleKey()

  if (!supabaseUrl || !key) {
    throw buildMissingEnvError()
  }

  return createClient(supabaseUrl, key, CLIENT_OPTIONS)
}
