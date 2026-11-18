import { supabase } from '../supabaseClient'
import { normalizeCategoryName, normalizeIngredientName, normalizeIngredientText, normalizeNames } from '../lib/ingredients'

// Finds or creates rows by name in a catalog table (categories, tags,
// ingredients) and returns their ids in the order of the deduplicated names.
// Names are deduplicated on their normalized form (case/diacritics), and
// lookups are case-insensitive to match existing rows.
const getOrCreateByName = async ({ table, names, normalizeName, unresolvedMessage }) => {
  const normalizedInputNames = names.map((name) => normalizeName(name))
  const getLookupKey = (value) => normalizeIngredientText(String(value || '').trim())

  const seenKeys = new Set()
  const uniqueNames = normalizeNames(normalizedInputNames).filter((name) => {
    const key = getLookupKey(name)
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
  if (!uniqueNames.length) return []

  const findRecordIdByName = async (lookupName) => {
    const { data, error } = await supabase
      .from(table)
      .select('id,name')
      .ilike('name', lookupName)
      .limit(1)
    if (error) {
      throw error
    }
    return data?.[0]?.id ?? null
  }

  const resolveIdsFromMap = (nameToIdMap) => {
    const resolvedIds = uniqueNames.map((name) => nameToIdMap.get(getLookupKey(name)))
    if (resolvedIds.some((id) => !id)) {
      throw new Error(unresolvedMessage)
    }
    return resolvedIds
  }

  const { data: existing, error: existingError } = await supabase.from(table).select('id,name').in('name', uniqueNames)
  if (existingError) {
    throw existingError
  }

  const existingMap = new Map(
    (existing || []).map((row) => [getLookupKey(row.name), row.id]),
  )

  const missingNames = []
  for (const name of uniqueNames) {
    const lookupKey = getLookupKey(name)
    if (existingMap.has(lookupKey)) {
      continue
    }

    const matchingId = await findRecordIdByName(name)
    if (matchingId) {
      existingMap.set(lookupKey, matchingId)
    } else {
      missingNames.push(name)
    }
  }

  if (missingNames.length) {
    const { data: inserted, error: insertError } = await supabase.from(table).insert(missingNames.map((name) => ({ name }))).select('id,name')
    if (insertError) {
      if (insertError.code === '23505') {
        for (const name of missingNames) {
          if (existingMap.has(getLookupKey(name))) {
            continue
          }
          const matchingId = await findRecordIdByName(name)
          if (matchingId) {
            existingMap.set(getLookupKey(name), matchingId)
          }
        }
        return resolveIdsFromMap(existingMap)
      }
      throw insertError
    }
    inserted.forEach((row) => existingMap.set(getLookupKey(row.name), row.id))
  }

  return resolveIdsFromMap(existingMap)
}

export const getOrCreateRecords = (table, names) =>
  getOrCreateByName({
    table,
    names,
    normalizeName: table === 'categories' ? normalizeCategoryName : (name) => name,
    unresolvedMessage: `Could not resolve id(s) in ${table} for one or more names.`,
  })

export const getOrCreateIngredients = (names) =>
  getOrCreateByName({
    table: 'ingredients',
    names,
    normalizeName: normalizeIngredientName,
    unresolvedMessage: 'Could not resolve ingredient id(s) for one or more names.',
  })
