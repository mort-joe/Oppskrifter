export const getRecipeImportErrorMessage = (error) => {
  const rawMessage = String(error?.message || error?.details || '').toLowerCase()

  if (
    rawMessage.includes('shared_root_recipe_id') ||
    rawMessage.includes('shared_root_name') ||
    rawMessage.includes('shared_version_number') ||
    rawMessage.includes('user_settings') ||
    rawMessage.includes('permission denied') ||
    rawMessage.includes('row-level security')
  ) {
    return 'Importlisten krever at oppdatert SQL er kjørt i Supabase. Kjør auth_setup.sql og last siden på nytt.'
  }

  return 'Kunne ikke laste listen over matretter i databasen.'
}

export const formatSupabaseErrorDetails = (error) => {
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '').trim()
  const details = String(error?.details || '').trim()
  const hint = String(error?.hint || '').trim()

  const segments = []
  if (code) segments.push(`kode: ${code}`)
  if (message) segments.push(`melding: ${message}`)
  if (details) segments.push(`detaljer: ${details}`)
  if (hint) segments.push(`hint: ${hint}`)

  return segments.join(' | ')
}

export const getRecipeImportFailureMessage = (error) => {
  const rawMessage = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    rawMessage.includes('shared_root_recipe_id') ||
    rawMessage.includes('shared_root_name') ||
    rawMessage.includes('shared_version_number') ||
    rawMessage.includes('user_settings')
  ) {
    return 'Import krever at oppdatert SQL er kjørt i Supabase. Kjør auth_setup.sql og last siden på nytt.'
  }

  if (rawMessage.includes('permission denied') || rawMessage.includes('row-level security')) {
    return 'Import feilet på grunn av manglende database-tilgang (RLS-policy). Kjør auth_setup.sql i Supabase.'
  }

  if (rawMessage.includes('duplicate key') || rawMessage.includes('unique')) {
    const duplicateDiagnosticText = formatSupabaseErrorDetails(error)
    if (duplicateDiagnosticText) {
      return `Import feilet på grunn av duplikatdata i databasen. ${duplicateDiagnosticText}`
    }
    return 'Import feilet på grunn av duplikatdata i databasen (for eksempel ingrediens, kategori eller tag med samme navn).'
  }

  const diagnosticText = formatSupabaseErrorDetails(error)
  if (diagnosticText) {
    return `Import feilet. ${diagnosticText}`
  }

  return 'Noe gikk galt under import av matretter.'
}
