import { createClient } from '@supabase/supabase-js'

const getSupabaseUrl = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL

export const getSupabaseAdminEnvStatus = () => ({
  hasSupabaseUrl: Boolean(getSupabaseUrl()),
  hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
})

export const getSupabaseAdmin = () => {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    const status = getSupabaseAdminEnvStatus()
    throw new Error(
      `Mangler miljøvariabler for admin-API (VITE_SUPABASE_URL/SUPABASE_URL=${status.hasSupabaseUrl ? 'ok' : 'mangler'}, SUPABASE_SERVICE_ROLE_KEY=${status.hasServiceRoleKey ? 'ok' : 'mangler'}).`,
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
