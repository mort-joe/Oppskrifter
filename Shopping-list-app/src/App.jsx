import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

const INGREDIENT_UNITS = ['', 'l', 'dl', 'cl', 'ml', 'kg', 'g', 'hg', 'ts', 'ss', 'stk', 'bunt', 'pk', 'fl', 'boks', 'glass', 'pose', 'eske', 'fed']
const DEFAULT_ACCOUNT_PEOPLE = 4
const IMPORT_GROUPS_STORAGE_KEY = 'recipe_import_collapsed_groups'
const MENU_ITEMS = [
  { id: 'matretter', label: 'Matretter' },
  { id: 'legg-til-matrett', label: 'Legg til matrett' },
  { id: 'lag-meny', label: 'Lag meny' },
  { id: 'lag-handleliste', label: 'Handleliste' },
]

const DEFAULT_SHOPPING_CATEGORY_ORDER = [
  'gronnsaker',
  'frukt',
  'kjott',
  'fisk',
  'kjolevarer',
  'pasta',
  'bakevarer',
  'frosenvarer',
  'melkeprodukter',
  'mineralvann',
  'annet',
]

const SHOPPING_CATEGORY_KEYWORDS = {
  gronnsaker: ['brokkoli', 'gulrot', 'potet', 'lok', 'purre', 'salat', 'tomat', 'agurk', 'paprika', 'spinat', 'blomkal', 'hvitlok', 'ingefaer', 'squash', 'avokado', 'sopp', 'rukkola', 'chili'],
  frukt: ['eple', 'banan', 'appelsin', 'pare', 'druer', 'sitron', 'lime', 'melon', 'ananas', 'kiwi', 'mango', 'jordbaer', 'bringebaer', 'blabaer'],
  kjott: ['kjott', 'biff', 'svin', 'kylling', 'karbonade', 'kjottdeig', 'kotelett', 'pylse', 'bacon', 'skinke', 'lam', 'rein', 'kalv', 'filet'],
  fisk: ['fisk', 'laks', 'torsk', 'sei', 'makrell', 'sild', 'reker', 'scampi', 'tunfisk', 'kveite', 'orsret', 'dorade'],
  kjolevarer: ['yoghurt', 'romme', 'creme fraiche', 'smoreost', 'kefir', 'skyr', 'ost', 'kebabdressing'],
  pasta: ['pasta', 'spagetti', 'penne', 'fusilli', 'lasagne', 'tagliatelle', 'makaroni', 'nudler', 'risnudler', 'lefse', 'lefser', 'tray', 'tortilla'],
  bakevarer: ['hvetemel', 'sammalt mel', 'speltmel', 'rugmel', 'byggmel', 'maismel', 'rismel', 'potetmel', 'kokosmel', 'mandelmel', 'gjaer', 'bakepulver', 'sukker', 'vaniljesukker', 'sirup', 'kakao', 'havregryn', 'smor', 'egg', 'brod', 'rundstykke', 'tortilla', 'lompe'],
  frosenvarer: ['frossen', 'fryst', 'fryse', 'is', 'fryste', 'frossne', 'rosenkal'],
  melkeprodukter: ['melk', 'flote', 'yoghurt', 'romme', 'creme fraiche', 'smoreost', 'kefir', 'skyr'],
  mineralvann: ['mineralvann', 'brus', 'cola', 'fanta', 'sprite', 'pepsi', 'sitronbrus', 'sodavann', 'tonic'],
}

const INGREDIENT_NAME_ALIASES = {
  soyasaus2: 'Soyasaus',
}

const normalizeIngredientText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const normalizeCategoryName = (value) => {
  const trimmedValue = String(value || '').trim()
  if (!trimmedValue) return ''
  if (normalizeIngredientText(trimmedValue) === 'supper') return 'Suppe'
  return trimmedValue
}

const normalizeShoppingCategoryKey = (value) =>
  normalizeIngredientText(String(value || '').trim())

const normalizeIngredientName = (value) => {
  const trimmedValue = String(value || '').trim()
  if (!trimmedValue) return ''

  const normalizedKey = normalizeIngredientText(trimmedValue)
  return INGREDIENT_NAME_ALIASES[normalizedKey] ?? trimmedValue
}

const normalizeNames = (values) =>
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]

const getShoppingCategory = (ingredientName) => {
  const normalizedName = normalizeIngredientText(ingredientName)

  for (const category of DEFAULT_SHOPPING_CATEGORY_ORDER) {
    if (category === 'annet') continue
    const keywords = SHOPPING_CATEGORY_KEYWORDS[category] ?? []
    if (keywords.some((keyword) => normalizedName.includes(normalizeIngredientText(keyword)))) {
      return category
    }
  }

  return 'annet'
}

const resolveShoppingCategory = (ingredientName, storedCategory) => {
  const inferredCategory = getShoppingCategory(ingredientName)
  if (inferredCategory !== 'annet') {
    return inferredCategory
  }

  return storedCategory ?? 'annet'
}

const normalizeDefaultPeopleValue = (value) =>
  Math.max(1, Number(value) || DEFAULT_ACCOUNT_PEOPLE)

const scaleIngredientQuantity = (quantity, factor) =>
  Math.max(0, Math.round(((Number(quantity) || 0) * factor + Number.EPSILON) * 1000) / 1000)

const RECIPE_NAME_SUFFIX_PATTERN = /\s\(\d+\)$/

const getRecipeDisplayName = (recipe) => {
  const recipeName = String(recipe?.name || '').trim()
  const sharedRootName = String(recipe?.sharedRootName || '').trim()

  if (recipe?.sharedVersionNumber) {
    return sharedRootName || recipeName.replace(RECIPE_NAME_SUFFIX_PATTERN, '')
  }

  if (recipe?.sharedRootRecipeId && RECIPE_NAME_SUFFIX_PATTERN.test(recipeName)) {
    return recipeName.replace(RECIPE_NAME_SUFFIX_PATTERN, '')
  }

  return recipeName
}

const getSharedRecipeDisplayName = (recipe) => {
  const recipeName = String(recipe?.name || '').trim()
  const sharedRootName = String(recipe?.sharedRootName || '').trim()

  if (recipe?.sharedVersionNumber) {
    return `${sharedRootName || recipeName} (${recipe.sharedVersionNumber})`
  }

  return recipeName
}

const getInitialCollapsedImportGroups = () => {
  if (typeof window === 'undefined') {
    return { own: false, existing: false, new: false }
  }

  try {
    const savedValue = window.localStorage.getItem(IMPORT_GROUPS_STORAGE_KEY)
    if (!savedValue) {
      return { own: false, existing: false, new: false }
    }

    const parsed = JSON.parse(savedValue)
    return {
      own: Boolean(parsed?.own),
      existing: Boolean(parsed?.existing),
      new: Boolean(parsed?.new),
    }
  } catch {
    return { own: false, existing: false, new: false }
  }
}

const getRecipeImportErrorMessage = (error) => {
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

const formatSupabaseErrorDetails = (error) => {
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

const getRecipeImportFailureMessage = (error) => {
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

function App() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authResetSubmitting, setAuthResetSubmitting] = useState(false)
  const [recipes, setRecipes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] = useState(null)
  const [selectedMenu, setSelectedMenu] = useState('matretter')
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [mobileRecipePane, setMobileRecipePane] = useState('list')
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [shoppingListRecipeCounts, setShoppingListRecipeCounts] = useState({})
  const [customShoppingItems, setCustomShoppingItems] = useState({})
  const [customItemName, setCustomItemName] = useState('')
  const [customItemQuantity, setCustomItemQuantity] = useState(1)
  const [showResetOptions, setShowResetOptions] = useState(false)
  const [resetIngredientsSelected, setResetIngredientsSelected] = useState(false)
  const [resetCustomItemsSelected, setResetCustomItemsSelected] = useState(false)
  const [ingredientHaveCounts, setIngredientHaveCounts] = useState({})
  const [checkedIngredients, setCheckedIngredients] = useState([])
  const [menuDays, setMenuDays] = useState(1)
  const [menuServings, setMenuServings] = useState(4)
  const [menuPlan, setMenuPlan] = useState([{ recipeId: null }])
  const [menuCreated, setMenuCreated] = useState(false)
  const [isShoppingStateReady, setIsShoppingStateReady] = useState(false)
  const [accountDefaultPeople, setAccountDefaultPeople] = useState(DEFAULT_ACCOUNT_PEOPLE)
  const [accountEmail, setAccountEmail] = useState('')
  const [accountDisplayName, setAccountDisplayName] = useState('')
  const [accountSettingsMessage, setAccountSettingsMessage] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('')
  const [accountPasswordMessage, setAccountPasswordMessage] = useState('')
  const [isAccountPasswordError, setIsAccountPasswordError] = useState(false)
  const [accountPasswordSubmitting, setAccountPasswordSubmitting] = useState(false)
  const [recipeImportCatalog, setRecipeImportCatalog] = useState([])
  const [selectedImportRecipeIds, setSelectedImportRecipeIds] = useState({})
  const [catalogDefaultPeopleByUser, setCatalogDefaultPeopleByUser] = useState({})
  const [recipeImportMessage, setRecipeImportMessage] = useState('')
  const [isRecipeImportError, setIsRecipeImportError] = useState(false)
  const [isRecipeCatalogLoadError, setIsRecipeCatalogLoadError] = useState(false)
  const [isRecipeCatalogLoading, setIsRecipeCatalogLoading] = useState(false)
  const [isImportingRecipes, setIsImportingRecipes] = useState(false)
  const [recipeImportSearch, setRecipeImportSearch] = useState('')
  const [showOnlyMissingImports, setShowOnlyMissingImports] = useState(false)
  const [collapsedImportGroups, setCollapsedImportGroups] = useState(getInitialCollapsedImportGroups)
  const [allCategories, setAllCategories] = useState([])
  const [allTags, setAllTags] = useState([])
  const [shoppingCategoryOrder, setShoppingCategoryOrder] = useState(DEFAULT_SHOPPING_CATEGORY_ORDER)
  const [globalIngredientNames, setGlobalIngredientNames] = useState([])
  const [dragIngredientIndex, setDragIngredientIndex] = useState(null)
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    ingredients: [{ name: '', quantity: 1, unit: '' }],
    typeTags: [],
    occasionTags: [],
  })

  const ingredientIdentityKey = (name, unit) => `${name}__${unit || ''}`

  const normalizePositiveNumberRecord = (value) => {
    if (!value || typeof value !== 'object') return {}

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, raw]) => [key, Number(raw) || 0])
        .filter(([, numberValue]) => numberValue > 0),
    )
  }

  const normalizeNonNegativeNumberRecord = (value) => {
    if (!value || typeof value !== 'object') return {}

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, raw]) => [key, Math.max(0, Number(raw) || 0)]),
    )
  }

  const filterRecordByAllowedKeys = (value, allowedKeys) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => allowedKeys.has(key)))

  const normalizeMenuPlan = (value, fallbackDays = 1) => {
    const defaultPlan = Array.from({ length: fallbackDays }, () => ({ recipeId: null }))
    if (!Array.isArray(value) || value.length === 0) {
      return defaultPlan
    }

    return value.map((entry) => ({
      recipeId: entry?.recipeId ? Number(entry.recipeId) : null,
    }))
  }

  const loadData = useCallback(async (userId) => {
    if (!userId) return

    const [{ data: categoryData, error: categoryError }, { data: tagData, error: tagError }, { data: recipeData, error: recipeError }, { data: shoppingCategoryData, error: shoppingCategoryError }, { data: ingredientNameData, error: ingredientNameError }] = await Promise.all([
      supabase.from('categories').select('name').order('name'),
      supabase.from('tags').select('name').order('name'),
      supabase
        .from('recipes')
        .select(
          'id,name,recipe_ingredients(ingredient_id,quantity,unit,ingredients(name,shopping_category)),recipe_categories(category_id,categories(name)),recipe_tags(tag_id,tags(name))',
        )
        .eq('user_id', userId)
        .order('id', { ascending: false }),
      supabase.from('shopping_categories').select('name,sort_order').order('sort_order', { ascending: true }),
      supabase.from('ingredients').select('name').order('name', { ascending: true }),
    ])

    if (categoryError) {
      console.error('Could not load categories:', categoryError)
    } else if (categoryData) {
      const normalizedCategoryNames = categoryData
        .map((row) => normalizeCategoryName(row.name))
        .filter(Boolean)
      setAllCategories(normalizeNames(normalizedCategoryNames))
    }

    if (tagError) {
      console.error('Could not load tags:', tagError)
    } else if (tagData) {
      setAllTags(tagData.map((row) => row.name))
    }

    if (shoppingCategoryError) {
      setShoppingCategoryOrder(DEFAULT_SHOPPING_CATEGORY_ORDER)
    } else if (shoppingCategoryData) {
      const orderedCategoryKeys = [
        ...new Set(
          shoppingCategoryData
            .map((row) => normalizeShoppingCategoryKey(row.name))
            .filter(Boolean),
        ),
      ]

      if (!orderedCategoryKeys.includes('annet')) {
        orderedCategoryKeys.push('annet')
      }

      setShoppingCategoryOrder(
        orderedCategoryKeys.length ? orderedCategoryKeys : DEFAULT_SHOPPING_CATEGORY_ORDER,
      )
    }

    if (ingredientNameError) {
      console.error('Could not load global ingredient names:', ingredientNameError)
      setGlobalIngredientNames([])
    } else if (ingredientNameData) {
      setGlobalIngredientNames(
        normalizeNames(
          ingredientNameData
            .map((row) => normalizeIngredientName(row.name))
            .filter(Boolean),
        ),
      )
    }

    if (recipeError) {
      console.error('Could not load recipes:', recipeError)
      return
    }

    if (recipeData) {
      setRecipes(
        recipeData.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          sharedRootRecipeId: recipe.shared_root_recipe_id,
          sharedRootName: recipe.shared_root_name,
          sharedVersionNumber: recipe.shared_version_number,
          ingredients:
            recipe.recipe_ingredients
              ?.map((row) => ({
                name: normalizeIngredientName(row.ingredients?.name),
                quantity: row.quantity ?? 1,
                unit: row.unit ?? '',
                shoppingCategory: resolveShoppingCategory(row.ingredients?.name, row.ingredients?.shopping_category),
              }))
              .filter((ingredient) => ingredient.name) ?? [],
          typeTags:
            normalizeNames(
              recipe.recipe_categories
                ?.map((row) => normalizeCategoryName(row.categories?.name))
                .filter(Boolean) ?? [],
            ),
          occasionTags:
            recipe.recipe_tags?.map((row) => row.tags?.name).filter(Boolean) ?? [],
        })),
      )
    }
  }, [])

  const getOrCreateRecords = async (table, names) => {
    const normalizedInputNames = table === 'categories'
      ? names.map((name) => normalizeCategoryName(name))
      : names
    const getLookupKey = (value) => normalizeIngredientText(String(value || '').trim())

    const _seenKeys = new Set()
    const uniqueNames = normalizeNames(normalizedInputNames).filter((name) => {
      const key = getLookupKey(name)
      if (_seenKeys.has(key)) return false
      _seenKeys.add(key)
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
        throw new Error(`Could not resolve id(s) in ${table} for one or more names.`)
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

  const getOrCreateIngredients = async (names) => {
    const normalizedNames = names.map((name) => normalizeIngredientName(name))
    const getLookupKey = (value) => normalizeIngredientText(String(value || '').trim())

    const _seenIngredientKeys = new Set()
    const uniqueNames = normalizeNames(normalizedNames).filter((name) => {
      const key = getLookupKey(name)
      if (_seenIngredientKeys.has(key)) return false
      _seenIngredientKeys.add(key)
      return true
    })
    if (!uniqueNames.length) return []

    const findIngredientIdByName = async (lookupName) => {
      const { data, error } = await supabase
        .from('ingredients')
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
        throw new Error('Could not resolve ingredient id(s) for one or more names.')
      }
      return resolvedIds
    }

    const { data: existing, error: existingError } = await supabase
      .from('ingredients')
      .select('id,name,shopping_category')
      .in('name', uniqueNames)
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

      const matchingId = await findIngredientIdByName(name)
      if (matchingId) {
        existingMap.set(lookupKey, matchingId)
      } else {
        missingNames.push(name)
      }
    }

    if (missingNames.length) {
      const rowsToInsert = missingNames.map((name) => ({
        name,
        shopping_category: getShoppingCategory(name),
      }))
      const { data: inserted, error: insertError } = await supabase
        .from('ingredients')
        .insert(rowsToInsert)
        .select('id,name')
      if (insertError) {
        if (insertError.code === '23505') {
          for (const name of missingNames) {
            if (existingMap.has(getLookupKey(name))) {
              continue
            }
            const matchingId = await findIngredientIdByName(name)
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

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setIsAuthLoading(false)
    }

    void initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setAuthError('')
      if (event === 'PASSWORD_RECOVERY') {
        setSelectedMenu('innstillinger')
        setAccountPasswordMessage('Du er i gjenopprettingsmodus. Skriv inn nytt passord under og lagre.')
        setIsAccountPasswordError(false)
      }
      if (!nextSession) {
        setIsShoppingStateReady(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const load = async () => {
      await loadData(user.id)

      const [{ data, error }, { data: userSettingsData, error: userSettingsError }] = await Promise.all([
        supabase
          .from('shopping_state')
          .select('state')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_settings')
          .select('default_people')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      if (error) {
        console.error('Could not load shopping state:', error)
        setIsShoppingStateReady(true)
        return
      }

      if (userSettingsError) {
        console.error('Could not load user settings:', userSettingsError)
      }

      const state = data?.state
      if (!state || typeof state !== 'object') {
        setAccountDefaultPeople(normalizeDefaultPeopleValue(userSettingsData?.default_people))
        setIsShoppingStateReady(true)
        return
      }

      const normalizedDefaultPeople = normalizeDefaultPeopleValue(
        userSettingsData?.default_people ?? state.userSettings?.defaultPeople ?? state.defaultPeople,
      )

      const normalizedMenuDays = Math.max(1, Number(state.menuDays) || 1)
      const normalizedPlan = normalizeMenuPlan(state.menuPlan, normalizedMenuDays)
      const normalizedMenuServings = Math.max(
        1,
        Number(
          state.menuServings ??
            (Array.isArray(state.menuPlan) && state.menuPlan[0]?.servings
              ? state.menuPlan[0].servings
              : 4),
        ) || 4,
      )

      setShoppingListRecipeCounts(normalizePositiveNumberRecord(state.shoppingListRecipeCounts))
      setCustomShoppingItems(normalizePositiveNumberRecord(state.customShoppingItems))
      setIngredientHaveCounts(normalizeNonNegativeNumberRecord(state.ingredientHaveCounts))
      setCheckedIngredients(
        Array.isArray(state.checkedIngredients)
          ? state.checkedIngredients.filter((item) => typeof item === 'string')
          : [],
      )
      setMenuDays(normalizedMenuDays)
  setMenuServings(normalizedMenuServings)
      setMenuPlan(normalizedPlan)
      setMenuCreated(Boolean(state.menuCreated))
      setAccountDefaultPeople(normalizedDefaultPeople)
      setIsShoppingStateReady(true)
    }
    void load()
  }, [user, loadData])

  useEffect(() => {
    if (!user || !isShoppingStateReady) return

    const persistUserSettings = async () => {
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            default_people: normalizeDefaultPeopleValue(accountDefaultPeople),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )

      if (error) {
        console.error('Could not save user settings:', error)
      }
    }

    void persistUserSettings()
  }, [user, isShoppingStateReady, accountDefaultPeople])

  useEffect(() => {
    if (!user || !isShoppingStateReady) return

    const persistState = async () => {
      const state = {
        shoppingListRecipeCounts,
        customShoppingItems,
        ingredientHaveCounts,
        checkedIngredients,
        menuDays,
  menuServings,
        menuPlan,
        menuCreated,
        defaultPeople: accountDefaultPeople,
        userSettings: {
          defaultPeople: accountDefaultPeople,
        },
      }

      const { error } = await supabase
        .from('shopping_state')
        .upsert(
          {
            user_id: user.id,
            state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )

      if (error) {
        console.error('Could not save shopping state:', error)
      }
    }

    void persistState()
  }, [
    user,
    isShoppingStateReady,
    shoppingListRecipeCounts,
    customShoppingItems,
    ingredientHaveCounts,
    checkedIngredients,
    menuDays,
    menuServings,
    menuPlan,
    menuCreated,
    accountDefaultPeople,
  ])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)')

    const handleMediaChange = (event) => {
      setIsMobile(event.matches)
      if (!event.matches) {
        setMobileRecipePane('list')
      }
    }

    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange)
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const rootStyle = document.documentElement.style

    const updateViewportWidth = () => {
      const measuredWidth = Math.round(window.visualViewport?.width || window.innerWidth || 0)
      if (!measuredWidth) return
      rootStyle.setProperty('--app-mobile-width', `${measuredWidth}px`)
    }

    updateViewportWidth()

    const visualViewport = window.visualViewport
    window.addEventListener('resize', updateViewportWidth)
    visualViewport?.addEventListener('resize', updateViewportWidth)
    visualViewport?.addEventListener('scroll', updateViewportWidth)

    return () => {
      window.removeEventListener('resize', updateViewportWidth)
      visualViewport?.removeEventListener('resize', updateViewportWidth)
      visualViewport?.removeEventListener('scroll', updateViewportWidth)
      rootStyle.removeProperty('--app-mobile-width')
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem(
      IMPORT_GROUPS_STORAGE_KEY,
      JSON.stringify(collapsedImportGroups),
    )
  }, [collapsedImportGroups])

  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId)
  const currentUserLabel = user?.user_metadata?.display_name || user?.email || '?'

  const filteredRecipes = useMemo(() => {
    const filter = searchTerm.trim().toLowerCase()
    const sortedRecipes = [...recipes].sort((a, b) =>
      getRecipeDisplayName(a).localeCompare(getRecipeDisplayName(b), 'no', { sensitivity: 'base' }),
    )

    if (!filter) return sortedRecipes

    return sortedRecipes.filter((recipe) => {
      const nameMatch = getRecipeDisplayName(recipe).toLowerCase().includes(filter) || recipe.name.toLowerCase().includes(filter)
      const typeMatch = recipe.typeTags.some((tag) => tag.toLowerCase().includes(filter))
      const occasionMatch = recipe.occasionTags.some((tag) => tag.toLowerCase().includes(filter))
      const ingredientMatch = recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(filter))
      return nameMatch || typeMatch || occasionMatch || ingredientMatch
    })
  }, [recipes, searchTerm])

  const ingredientNameSuggestions = useMemo(() => {
    const seen = new Set()
    const suggestions = []

    globalIngredientNames.forEach((name) => {
      const trimmedName = String(name || '').trim()
      if (!trimmedName) return

      const normalizedKey = normalizeIngredientText(trimmedName)
      if (seen.has(normalizedKey)) return

      seen.add(normalizedKey)
      suggestions.push(trimmedName)
    })

    if (suggestions.length === 0) {
      recipes.forEach((recipe) => {
        recipe.ingredients.forEach((ingredient) => {
          const trimmedName = String(ingredient.name || '').trim()
          if (!trimmedName) return

          const normalizedKey = normalizeIngredientText(trimmedName)
          if (seen.has(normalizedKey)) return

          seen.add(normalizedKey)
          suggestions.push(trimmedName)
        })
      })
    }

    return suggestions.sort((a, b) => a.localeCompare(b, 'no', { sensitivity: 'base' }))
  }, [globalIngredientNames, recipes])

  const sortedRecipeImportCatalog = useMemo(
    () =>
      [...recipeImportCatalog].sort((a, b) =>
        getSharedRecipeDisplayName(a).localeCompare(getSharedRecipeDisplayName(b), 'no', { sensitivity: 'base' }),
      ),
    [recipeImportCatalog],
  )

  const ownedRecipeRootIds = useMemo(() => {
    const rootIds = new Set()

    recipes.forEach((recipe) => {
      rootIds.add(recipe.sharedRootRecipeId ?? recipe.id)
    })

    return rootIds
  }, [recipes])

  const filteredRecipeImportCatalog = useMemo(() => {
    const normalizedSearch = normalizeIngredientText(recipeImportSearch)

    return sortedRecipeImportCatalog.filter((recipe) => {
      const alreadyInProfile = ownedRecipeRootIds.has(recipe.sharedRootRecipeId ?? recipe.id)

      if (showOnlyMissingImports && alreadyInProfile) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const searchableText = [
        getSharedRecipeDisplayName(recipe),
        recipe.name,
        recipe.sharedRootName,
        ...(recipe.ingredients || []).map((ingredient) => ingredient.name),
        ...(recipe.typeTags || []),
        ...(recipe.occasionTags || []),
      ]
        .filter(Boolean)
        .join(' ')

      return normalizeIngredientText(searchableText).includes(normalizedSearch)
    })
  }, [ownedRecipeRootIds, recipeImportSearch, showOnlyMissingImports, sortedRecipeImportCatalog])

  const groupedRecipeImportCatalog = useMemo(() => {
    const groups = {
      new: [],
      existing: [],
      own: [],
    }

    filteredRecipeImportCatalog.forEach((recipe) => {
      const isOwnRecipe = recipe.userId === user?.id
      const alreadyInProfile = ownedRecipeRootIds.has(recipe.sharedRootRecipeId ?? recipe.id)

      if (isOwnRecipe) {
        groups.own.push(recipe)
        return
      }

      if (alreadyInProfile) {
        groups.existing.push(recipe)
        return
      }

      groups.new.push(recipe)
    })

    return [
      { key: 'new', title: 'Nye', recipes: groups.new },
      { key: 'existing', title: 'Har allerede', recipes: groups.existing },
      { key: 'own', title: 'Dine', recipes: groups.own },
    ].filter((group) => group.recipes.length > 0)
  }, [filteredRecipeImportCatalog, ownedRecipeRootIds, user])

  const shoppingRecipes = useMemo(
    () =>
      recipes
        .filter((recipe) => shoppingListRecipeCounts[recipe.id])
        .map((recipe) => ({
          ...recipe,
          count: shoppingListRecipeCounts[recipe.id],
        })),
    [recipes, shoppingListRecipeCounts],
  )

  const shoppingRecipeCount = useMemo(
    () => shoppingRecipes.reduce((sum, recipe) => sum + recipe.count, 0),
    [shoppingRecipes],
  )

  const shoppingIngredients = useMemo(() => {
    const totals = new Map()
    shoppingRecipes.forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        const key = ingredientIdentityKey(ingredient.name, ingredient.unit)
        const existing = totals.get(key) ?? {
          name: ingredient.name,
          unit: ingredient.unit ?? '',
          shoppingCategory: ingredient.shoppingCategory ?? 'annet',
          requiredQuantity: 0,
        }
        totals.set(key, {
          ...existing,
          shoppingCategory: existing.shoppingCategory || ingredient.shoppingCategory || 'annet',
          requiredQuantity: existing.requiredQuantity + ingredient.quantity * recipe.count,
        })
      })
    })

    Object.entries(customShoppingItems).forEach(([name, quantity]) => {
      const key = ingredientIdentityKey(name, '')
      const existing = totals.get(key) ?? { name, unit: '', shoppingCategory: 'annet', requiredQuantity: 0 }
      totals.set(key, {
        ...existing,
        requiredQuantity: existing.requiredQuantity + quantity,
      })
    })

    const items = Array.from(totals.entries()).map(([key, item]) => {
      const haveQuantity = Number(ingredientHaveCounts[key] ?? 0)
      return {
        key,
        name: item.name,
        unit: item.unit,
        shoppingCategory: item.shoppingCategory ?? 'annet',
        requiredQuantity: item.requiredQuantity,
        haveQuantity,
        neededQuantity: Math.max(item.requiredQuantity - haveQuantity, 0),
      }
    })

    return items.sort((a, b) => {
      const categoryA = a.shoppingCategory || 'annet'
      const categoryB = b.shoppingCategory || 'annet'
      const categoryIndexA = shoppingCategoryOrder.indexOf(categoryA)
      const categoryIndexB = shoppingCategoryOrder.indexOf(categoryB)

      const safeCategoryIndexA = categoryIndexA >= 0 ? categoryIndexA : shoppingCategoryOrder.length
      const safeCategoryIndexB = categoryIndexB >= 0 ? categoryIndexB : shoppingCategoryOrder.length

      if (safeCategoryIndexA !== safeCategoryIndexB) {
        return safeCategoryIndexA - safeCategoryIndexB
      }

      return a.name.localeCompare(b.name, 'no', { sensitivity: 'base' })
    })
  }, [shoppingRecipes, ingredientHaveCounts, customShoppingItems, shoppingCategoryOrder])

  const getActiveShoppingIngredientKeys = (recipeCounts, customItems) => {
    const keys = new Set()

    recipes.forEach((recipe) => {
      if (!recipeCounts[recipe.id]) {
        return
      }

      recipe.ingredients.forEach((ingredient) => {
        keys.add(ingredientIdentityKey(ingredient.name, ingredient.unit))
      })
    })

    Object.keys(customItems).forEach((name) => {
      keys.add(ingredientIdentityKey(name, ''))
    })

    return keys
  }

  const pruneShoppingIngredientState = (recipeCounts, customItems) => {
    const activeIngredientKeys = getActiveShoppingIngredientKeys(recipeCounts, customItems)
    setIngredientHaveCounts((current) => filterRecordByAllowedKeys(current, activeIngredientKeys))
    setCheckedIngredients((current) => current.filter((key) => activeIngredientKeys.has(key)))
  }

  const handleSelectRecipe = (id) => {
    setSelectedRecipeId(id)
    if (isMobile) {
      setEditingRecipe(null)
      setMobileRecipePane('details')
    }
  }

  const refreshCurrentUserFromServer = useCallback(async () => {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

    if (!refreshError && refreshData?.session) {
      setSession(refreshData.session)
      setUser(refreshData.session.user ?? null)
      return refreshData.session.user ?? null
    }

    const {
      data: { user: freshUser },
    } = await supabase.auth.getUser()

    if (freshUser) {
      setUser(freshUser)
    }

    return freshUser ?? null
  }, [])

  const handleMenuSelect = (menuId) => {
    setSelectedMenu(menuId)
    setAccountSettingsMessage('')
    setAccountPasswordMessage('')
    setRecipeImportMessage('')
    if (menuId === 'matretter' && isMobile) {
      setMobileRecipePane('list')
    }
  }

  const handleOpenAccountSettings = async () => {
    const freshUser = await refreshCurrentUserFromServer()

    if (freshUser) {
      setUser(freshUser)
      setAccountEmail(freshUser?.email ?? '')
      setAccountDisplayName(freshUser?.user_metadata?.display_name ?? '')
    } else {
      setAccountEmail(user?.email ?? '')
      setAccountDisplayName(user?.user_metadata?.display_name ?? '')
    }

    setSelectedMenu('innstillinger')
    setAccountSettingsMessage('')
    setAccountPasswordMessage('')
    setIsAccountPasswordError(false)
    setRecipeImportMessage('')
    setAccountPassword('')
    setAccountPasswordConfirm('')
  }

  useEffect(() => {
    if (!session) return

    const syncUser = async () => {
      await refreshCurrentUserFromServer()
    }

    const intervalId = window.setInterval(() => {
      void syncUser()
    }, 15000)

    const handleWindowFocus = () => {
      void syncUser()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncUser()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session, refreshCurrentUserFromServer])

  const loadRecipeImportCatalog = useCallback(async () => {
    if (!user) return

    setIsRecipeCatalogLoading(true)
    setIsRecipeImportError(false)
    setIsRecipeCatalogLoadError(false)
    setRecipeImportMessage('')

    try {
      const [{ data: recipeData, error: recipeError }, { data: userSettingsData, error: userSettingsError }] = await Promise.all([
        supabase
          .from('recipes')
          .select(
            'id,name,user_id,shared_root_recipe_id,shared_root_name,shared_version_number,recipe_ingredients(quantity,unit,ingredients(name,shopping_category)),recipe_categories(categories(name)),recipe_tags(tags(name))',
          )
          .order('id', { ascending: false }),
        supabase.from('user_settings').select('user_id,default_people'),
      ])

      if (recipeError) {
        throw recipeError
      }

      if (userSettingsError) {
        console.error('Could not load default people for recipe catalog:', userSettingsError)
      }

      const defaultPeopleMap = Object.fromEntries(
        (userSettingsData || []).map((row) => [row.user_id, normalizeDefaultPeopleValue(row.default_people)]),
      )

      setCatalogDefaultPeopleByUser(defaultPeopleMap)
      setRecipeImportCatalog(
        (recipeData || []).map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          userId: recipe.user_id,
          sharedRootRecipeId: recipe.shared_root_recipe_id,
          sharedRootName: recipe.shared_root_name,
          sharedVersionNumber: recipe.shared_version_number,
          ingredients:
            recipe.recipe_ingredients
              ?.map((row) => ({
                name: normalizeIngredientName(row.ingredients?.name),
                quantity: row.quantity ?? 1,
                unit: row.unit ?? '',
                shoppingCategory: resolveShoppingCategory(row.ingredients?.name, row.ingredients?.shopping_category),
              }))
              .filter((ingredient) => ingredient.name) ?? [],
          typeTags:
            normalizeNames(
              recipe.recipe_categories
                ?.map((row) => normalizeCategoryName(row.categories?.name))
                .filter(Boolean) ?? [],
            ),
          occasionTags:
            recipe.recipe_tags?.map((row) => row.tags?.name).filter(Boolean) ?? [],
        })),
      )
      setSelectedImportRecipeIds((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([recipeId]) => (recipeData || []).some((recipe) => String(recipe.id) === recipeId)),
        ),
      )
      setIsRecipeCatalogLoadError(false)
    } catch (catalogError) {
      console.error('Could not load recipe import catalog:', catalogError)
      setRecipeImportCatalog([])
      setRecipeImportMessage(getRecipeImportErrorMessage(catalogError))
      setIsRecipeImportError(true)
      setIsRecipeCatalogLoadError(true)
    } finally {
      setIsRecipeCatalogLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (selectedMenu !== 'innstillinger' || !user) return
    void loadRecipeImportCatalog()
  }, [selectedMenu, user, loadRecipeImportCatalog])

  const handleSaveAccountSettings = async (event) => {
    event.preventDefault()

    const normalizedPeople = normalizeDefaultPeopleValue(accountDefaultPeople)
    setAccountDefaultPeople(normalizedPeople)

    if (!user) return

    const displayNameTrimmed = accountDisplayName.trim()

    const state = {
      shoppingListRecipeCounts,
      customShoppingItems,
      ingredientHaveCounts,
      checkedIngredients,
      menuDays,
      menuServings,
      menuPlan,
      menuCreated,
      defaultPeople: normalizedPeople,
      userSettings: {
        defaultPeople: normalizedPeople,
      },
    }

    const [{ error: shoppingStateError }, { error: userSettingsError }] = await Promise.all([
      supabase
        .from('shopping_state')
        .upsert(
          {
            user_id: user.id,
            state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        ),
      supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            default_people: normalizedPeople,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        ),
    ])

    if (shoppingStateError || userSettingsError) {
      console.error('Could not save account settings:', shoppingStateError || userSettingsError)
      setAccountSettingsMessage('Kunne ikke lagre innstillingene akkurat nå. Prøv igjen.')
      return
    }

    if (displayNameTrimmed !== (user.user_metadata?.display_name || '')) {
      const { error: displayNameError } = await supabase.auth.updateUser({
        data: { display_name: displayNameTrimmed },
      })
      if (displayNameError) {
        setAccountSettingsMessage('Innstillinger lagret, men visningsnavn ble ikke oppdatert: ' + displayNameError.message)
        return
      }
    }

    // Refresh user data to ensure UI is in sync
    const freshUser = await refreshCurrentUserFromServer()
    if (freshUser) {
      setUser(freshUser)
    }

    setAccountSettingsMessage('Innstillingene er lagret.')
  }

  const handleToggleImportRecipe = (recipeId) => {
    setSelectedImportRecipeIds((current) => ({
      ...current,
      [recipeId]: !current[recipeId],
    }))
    setRecipeImportMessage('')
    setIsRecipeImportError(false)
  }

  const handleToggleImportGroup = (groupKey) => {
    setCollapsedImportGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }))
  }

  const handleSelectAllNewImports = () => {
    setSelectedImportRecipeIds((current) => {
      const next = { ...current }
      const newGroup = groupedRecipeImportCatalog.find((group) => group.key === 'new')

      newGroup?.recipes.forEach((recipe) => {
        next[recipe.id] = true
      })

      return next
    })
    setRecipeImportMessage('')
    setIsRecipeImportError(false)
  }

  const handleClearImportSelections = () => {
    setSelectedImportRecipeIds({})
    setRecipeImportMessage('')
    setIsRecipeImportError(false)
  }

  const getNextSharedVersionNumber = async (rootRecipeId) => {
    const { data, error } = await supabase
      .from('recipes')
      .select('shared_version_number')
      .or(`id.eq.${rootRecipeId},shared_root_recipe_id.eq.${rootRecipeId}`)

    if (error) {
      throw error
    }

    const highestVersion = (data || []).reduce(
      (currentMax, row) => Math.max(currentMax, Number(row.shared_version_number) || 0),
      0,
    )

    return highestVersion + 1
  }

  const getImportRecipeNameCandidate = (baseName, attempt) => {
    const normalizedBaseName = String(baseName || '').trim()
    if (!normalizedBaseName) return normalizedBaseName
    return attempt === 0 ? normalizedBaseName : `${normalizedBaseName} (${attempt})`
  }

  const getNextAvailableRecipeNameGlobal = async (baseName) => {
    const normalizedBaseName = String(baseName || '').trim()
    if (!normalizedBaseName) return normalizedBaseName

    const { data, error } = await supabase.from('recipes').select('name')
    if (error) {
      throw error
    }

    const existingNames = new Set((data || []).map((row) => String(row.name || '').trim()))
    if (!existingNames.has(normalizedBaseName)) {
      return normalizedBaseName
    }

    let attempt = 1
    while (existingNames.has(getImportRecipeNameCandidate(normalizedBaseName, attempt))) {
      attempt += 1
    }

    return getImportRecipeNameCandidate(normalizedBaseName, attempt)
  }

  const handleImportSelectedRecipes = async () => {
    if (!user) return

    if (isRecipeCatalogLoadError || !recipeImportCatalog.length) {
      setRecipeImportMessage('Importlisten må lastes uten feil før du kan importere matretter.')
      setIsRecipeImportError(true)
      return
    }

    const selectedRecipes = sortedRecipeImportCatalog.filter(
      (recipe) => selectedImportRecipeIds[recipe.id] && recipe.userId !== user.id,
    )

    if (!selectedRecipes.length) {
      setRecipeImportMessage('Velg minst én matrett å importere.')
      setIsRecipeImportError(true)
      return
    }

    setIsImportingRecipes(true)
    setRecipeImportMessage('')
    setIsRecipeImportError(false)

    try {
      const targetDefaultPeople = normalizeDefaultPeopleValue(accountDefaultPeople)

      for (const sourceRecipe of selectedRecipes) {
        const sourceDefaultPeople = normalizeDefaultPeopleValue(catalogDefaultPeopleByUser[sourceRecipe.userId])
        const scaleFactor = targetDefaultPeople / sourceDefaultPeople
        const sharedRootRecipeId = sourceRecipe.sharedRootRecipeId ?? sourceRecipe.id
        const sharedRootName = String(sourceRecipe.sharedRootName || sourceRecipe.name || '').trim()
        // Version number is NOT assigned at import time.
        // It is only assigned later, if the user edits ingredient names while keeping the recipe name.

        const scaledIngredients = sourceRecipe.ingredients.map((ingredient) => ({
          name: ingredient.name,
          unit: ingredient.unit ?? '',
          quantity: scaleIngredientQuantity(ingredient.quantity, scaleFactor),
        }))

        // Build a deduplicated list mirroring getOrCreateIngredients' internal dedup,
        // so quantity/unit can be looked up by position after getting IDs back.
        const _seenImportKeys = new Set()
        const uniqueScaledIngredients = scaledIngredients.filter((ingredient) => {
          const key = normalizeIngredientText(normalizeIngredientName(ingredient.name))
          if (_seenImportKeys.has(key)) return false
          _seenImportKeys.add(key)
          return true
        })

        const ingredientIds = await getOrCreateIngredients(scaledIngredients.map((ingredient) => ingredient.name))
        const categoryIds = await getOrCreateRecords('categories', sourceRecipe.typeTags || [])
        const tagIds = await getOrCreateRecords('tags', sourceRecipe.occasionTags || [])

        let recipeNameToInsert = await getNextAvailableRecipeNameGlobal(sourceRecipe.name)
        let insertedRecipe = null
        let recipeInsertError = null

        for (let attempt = 0; attempt < 25; attempt += 1) {
          const { data, error } = await supabase
            .from('recipes')
            .insert([
              {
                name: recipeNameToInsert,
                user_id: user.id,
                shared_root_recipe_id: sharedRootRecipeId,
                shared_root_name: sharedRootName,
                shared_version_number: null,
              },
            ])
            .select('id')
            .single()

          insertedRecipe = data ?? null
          recipeInsertError = error ?? null

          if (!recipeInsertError && insertedRecipe) {
            break
          }

          const conflictTarget = String(recipeInsertError?.message || recipeInsertError?.details || '').toLowerCase()
          const isNameUniqueConflict =
            recipeInsertError?.code === '23505' &&
            (conflictTarget.includes('recipes_name_unique') || conflictTarget.includes('name'))

          if (isNameUniqueConflict) {
            recipeNameToInsert = await getNextAvailableRecipeNameGlobal(sourceRecipe.name)
            continue
          }

          break
        }

        if (recipeInsertError || !insertedRecipe) {
          throw recipeInsertError || new Error('Kunne ikke opprette matrett ved import.')
        }

        if (ingredientIds.length) {
          const ingredientRows = ingredientIds.map((ingredientId, index) => ({
            recipe_id: insertedRecipe.id,
            ingredient_id: ingredientId,
            quantity: uniqueScaledIngredients[index]?.quantity ?? 1,
            unit: uniqueScaledIngredients[index]?.unit ?? '',
          }))
          const { error: ingredientInsertError } = await supabase.from('recipe_ingredients').insert(ingredientRows)
          if (ingredientInsertError) {
            throw ingredientInsertError
          }
        }

        if (categoryIds.length) {
          const { error: categoryInsertError } = await supabase
            .from('recipe_categories')
            .insert([...new Set(categoryIds)].map((categoryId) => ({ recipe_id: insertedRecipe.id, category_id: categoryId })))
          if (categoryInsertError) {
            throw categoryInsertError
          }
        }

        if (tagIds.length) {
          const { error: tagInsertError } = await supabase
            .from('recipe_tags')
            .insert([...new Set(tagIds)].map((tagId) => ({ recipe_id: insertedRecipe.id, tag_id: tagId })))
          if (tagInsertError) {
            throw tagInsertError
          }
        }
      }

      setSelectedImportRecipeIds({})
      setRecipeImportMessage('Valgte matretter er importert til din brukerprofil.')
      await loadData(user.id)
      await loadRecipeImportCatalog()
    } catch (importError) {
      console.error('Could not import recipes:', importError)
      setRecipeImportMessage(getRecipeImportFailureMessage(importError))
      setIsRecipeImportError(true)
    } finally {
      setIsImportingRecipes(false)
    }
  }

  const handleAddToShoppingList = (recipeId, count = 1) => {
    setShoppingListRecipeCounts((current) => ({
      ...current,
      [recipeId]: (current[recipeId] ?? 0) + count,
    }))
  }

  const handleMenuDaysChange = (value) => {
    const days = Math.max(1, Number(value) || 1)
    setMenuDays(days)
    setMenuPlan((current) => {
      const next = Array.from({ length: days }, (_, index) => current[index] ?? { recipeId: null })
      return next
    })
    setMenuCreated(false)
  }

  const handleMenuRecipeChange = (index, recipeId) => {
    setMenuPlan((current) => {
      const next = [...current]
      next[index] = {
        ...(next[index] ?? { recipeId: null }),
        recipeId: recipeId ? Number(recipeId) : null,
      }
      return next
    })
    setMenuCreated(false)
  }

  const handleMenuServingsChange = (servings) => {
    setMenuServings(Math.max(1, Number(servings) || 4))
    setMenuCreated(false)
  }

  const handleCreateMenu = () => {
    if (menuPlan.some((dayPlan) => !dayPlan?.recipeId)) {
      alert('Velg en rett for hver dag før du oppretter menyen.')
      return
    }

    const basePeople = Math.max(1, Number(accountDefaultPeople) || DEFAULT_ACCOUNT_PEOPLE)
    const factor = menuServings / basePeople

    const counts = menuPlan.reduce((acc, dayPlan) => {
      const recipeId = dayPlan.recipeId
      acc[recipeId] = (acc[recipeId] ?? 0) + factor
      return acc
    }, {})

    setShoppingListRecipeCounts((current) => {
      const next = { ...current }
      Object.entries(counts).forEach(([recipeId, count]) => {
        next[recipeId] = (next[recipeId] ?? 0) + count
      })
      return next
    })
    setMenuCreated(true)
  }

  const handleToggleIngredient = (ingredient) => {
    setCheckedIngredients((current) =>
      current.includes(ingredient)
        ? current.filter((item) => item !== ingredient)
        : [...current, ingredient],
    )
  }

  const handleHaveQuantityChange = (ingredientName, value) => {
    setIngredientHaveCounts((current) => ({
      ...current,
      [ingredientName]: Math.max(0, Number(value) || 0),
    }))
  }

  const handleAddCustomShoppingItem = () => {
    const name = customItemName.trim()
    const quantity = Math.max(1, Number(customItemQuantity) || 1)

    if (!name) {
      alert('Skriv inn navn på varen du vil legge til i handlelisten.')
      return
    }

    setCustomShoppingItems((current) => ({
      ...current,
      [name]: (current[name] ?? 0) + quantity,
    }))
    setCustomItemName('')
    setCustomItemQuantity(1)
  }

  const handleRemoveCustomShoppingItem = (name) => {
    const nextCustomItems = { ...customShoppingItems }
    delete nextCustomItems[name]

    setCustomShoppingItems(nextCustomItems)
    pruneShoppingIngredientState(shoppingListRecipeCounts, nextCustomItems)
  }

  const handleRemoveShoppingRecipe = (recipeId) => {
    if (!shoppingListRecipeCounts[recipeId]) {
      return
    }

    const nextRecipeCounts = { ...shoppingListRecipeCounts }
    delete nextRecipeCounts[recipeId]

    setShoppingListRecipeCounts(nextRecipeCounts)
    pruneShoppingIngredientState(nextRecipeCounts, customShoppingItems)
  }

  const handleResetShoppingList = () => {
    if (!canResetShoppingList) {
      return
    }

    setResetIngredientsSelected(hasIngredientListItems)
    setResetCustomItemsSelected(hasCustomItems)
    setShowResetOptions(true)
  }

  const handleConfirmResetShoppingList = () => {
    const shouldResetIngredients = resetIngredientsSelected && hasIngredientListItems
    const shouldResetCustomItems = resetCustomItemsSelected && hasCustomItems

    if (!shouldResetIngredients && !shouldResetCustomItems) {
      alert('Velg minst en liste å nullstille.')
      return
    }

    const scopeText =
      shouldResetIngredients && shouldResetCustomItems
        ? 'handleliste med ingredienser og egne varer'
        : shouldResetIngredients
          ? 'handleliste med ingredienser'
          : 'egne varer'

    const shouldReset = window.confirm(`Er du sikker på at du vil nullstille ${scopeText}?`)
    if (!shouldReset) {
      return
    }

    if (shouldResetIngredients) {
      setShoppingListRecipeCounts({})
      setIngredientHaveCounts({})
      setCheckedIngredients([])
    }

    if (shouldResetCustomItems) {
      setCustomShoppingItems({})
      setCustomItemName('')
      setCustomItemQuantity(1)
    }

    setShowResetOptions(false)
    setResetIngredientsSelected(false)
    setResetCustomItemsSelected(false)
  }

  const handleCancelResetShoppingList = () => {
    setShowResetOptions(false)
    setResetIngredientsSelected(false)
    setResetCustomItemsSelected(false)
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    })

    if (error) {
      setAuthError(error.message)
    }

    setAuthSubmitting(false)
  }

  const handleSendPasswordResetEmail = async () => {
    const email = authEmail.trim()
    if (!email) {
      setAuthError('Skriv inn e-postadressen din først.')
      return
    }

    setAuthError('')
    setAuthNotice('')
    setAuthResetSubmitting(true)

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : undefined

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    )

    if (error) {
      setAuthError(error.message)
      setAuthResetSubmitting(false)
      return
    }

    setAuthNotice('Hvis adressen finnes, er e-post med lenke for passordbytte sendt.')
    setAuthResetSubmitting(false)
  }

  const handleSaveAccountPassword = async (event) => {
    event.preventDefault()

    if (!user) return

    const nextPassword = accountPassword.trim()
    const confirmPassword = accountPasswordConfirm.trim()

    if (nextPassword.length < 8) {
      setAccountPasswordMessage('Nytt passord må ha minst 8 tegn.')
      setIsAccountPasswordError(true)
      return
    }

    if (nextPassword !== confirmPassword) {
      setAccountPasswordMessage('Passordene er ikke like.')
      setIsAccountPasswordError(true)
      return
    }

    setAccountPasswordSubmitting(true)
    setAccountPasswordMessage('')
    setIsAccountPasswordError(false)

    const { error } = await supabase.auth.updateUser({ password: nextPassword })
    if (error) {
      setAccountPasswordMessage('Kunne ikke oppdatere passord: ' + error.message)
      setIsAccountPasswordError(true)
      setAccountPasswordSubmitting(false)
      return
    }

    setAccountPassword('')
    setAccountPasswordConfirm('')
    setAccountPasswordMessage('Passord er oppdatert.')
    setIsAccountPasswordError(false)
    setAccountPasswordSubmitting(false)
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      alert('Kunne ikke logge ut akkurat nå. Prøv igjen.')
      return
    }

    setShoppingListRecipeCounts({})
    setCustomShoppingItems({})
    setIngredientHaveCounts({})
    setCheckedIngredients([])
    setRecipes([])
    setSelectedRecipeId(null)
    setEditingRecipe(null)
    setMenuDays(1)
  setMenuServings(4)
  setMenuPlan([{ recipeId: null }])
    setMenuCreated(false)
    setAccountDefaultPeople(DEFAULT_ACCOUNT_PEOPLE)
    setAccountSettingsMessage('')
    setRecipeImportCatalog([])
    setSelectedImportRecipeIds({})
    setCatalogDefaultPeopleByUser({})
    setRecipeImportMessage('')
    setIsRecipeImportError(false)
    setRecipeImportSearch('')
    setShowOnlyMissingImports(false)
    setCollapsedImportGroups({ own: false, existing: false, new: false })
    setIsRecipeCatalogLoading(false)
    setIsImportingRecipes(false)
    setIsShoppingStateReady(false)
    setCustomItemName('')
    setCustomItemQuantity(1)
    setShowResetOptions(false)
    setResetIngredientsSelected(false)
    setResetCustomItemsSelected(false)
    setAccountPassword('')
    setAccountPasswordConfirm('')
    setAccountPasswordMessage('')
    setIsAccountPasswordError(false)
    setAuthNotice('')
    setAuthResetSubmitting(false)
  }

  const parseQuantityValue = (value) => {
    const normalized = String(value).replace(',', '.')
    const parsed = parseFloat(normalized)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const handleNewRecipeChange = (field, value) => {
    setNewRecipe((current) => ({ ...current, [field]: value }))
  }

  const handleToggleTag = (tagType, tagValue) => {
    setNewRecipe((current) => {
      const tags = current[tagType]
      return {
        ...current,
        [tagType]: tags.includes(tagValue)
          ? tags.filter((tag) => tag !== tagValue)
          : [...tags, tagValue],
      }
    })
  }

  const handleStartEditing = (recipe) => {
    setEditingRecipe({
      id: recipe.id,
      name: recipe.name,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      typeTags: [...recipe.typeTags],
      occasionTags: [...recipe.occasionTags],
    })
    setSelectedRecipeId(recipe.id)
    if (isMobile) {
      setMobileRecipePane('details')
    }
  }

  const handleEditToggleTag = (tagType, tagValue) => {
    setEditingRecipe((current) => {
      if (!current) return current
      const tags = current[tagType] || []
      return {
        ...current,
        [tagType]: tags.includes(tagValue)
          ? tags.filter((tag) => tag !== tagValue)
          : [...tags, tagValue],
      }
    })
  }

  const handleEditRecipeName = (value) => {
    setEditingRecipe((current) => (current ? { ...current, name: value } : current))
  }

  const handleEditIngredientChange = (index, field, value) => {
    setEditingRecipe((current) => {
      if (!current) return current
      const ingredients = [...current.ingredients]
      ingredients[index] = {
        ...ingredients[index],
        [field]: field === 'quantity' ? parseQuantityValue(value) : value,
      }
      return { ...current, ingredients }
    })
  }

  const handleAddEditIngredientRow = () => {
    setEditingRecipe((current) => {
      if (!current) return current
      return {
        ...current,
        ingredients: [...current.ingredients, { name: '', quantity: 1, unit: '' }],
      }
    })
  }

  const handleRemoveEditIngredientRow = (index) => {
    setEditingRecipe((current) => {
      if (!current) return current
      return {
        ...current,
        ingredients: current.ingredients.filter((_, idx) => idx !== index),
      }
    })
  }

  const handleIngredientDragStart = (index) => {
    setDragIngredientIndex(index)
  }

  const handleIngredientDragOver = (e, index) => {
    e.preventDefault()
    if (dragIngredientIndex === null || dragIngredientIndex === index) return
    setEditingRecipe((current) => {
      if (!current) return current
      const ingredients = [...current.ingredients]
      const [moved] = ingredients.splice(dragIngredientIndex, 1)
      ingredients.splice(index, 0, moved)
      return { ...current, ingredients }
    })
    setDragIngredientIndex(index)
  }

  const handleIngredientDragEnd = () => {
    setDragIngredientIndex(null)
  }

  const handleDeleteRecipe = async () => {
    if (!editingRecipe) return
    if (!window.confirm(`Er du sikker på at du vil slette matretten "${getRecipeDisplayName(editingRecipe)}"?`)) {
      return
    }

    try {
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', editingRecipe.id)
      await supabase.from('recipe_categories').delete().eq('recipe_id', editingRecipe.id)
      await supabase.from('recipe_tags').delete().eq('recipe_id', editingRecipe.id)
      await supabase.from('recipes').delete().eq('id', editingRecipe.id)
  await loadData(user.id)
      setEditingRecipe(null)
      setSelectedRecipeId(null)
    } catch (error) {
      console.error('Delete recipe error:', error)
      alert('Noe gikk galt ved sletting av matretten.')
    }
  }

  const handleSaveRecipeEdit = async (event) => {
    event.preventDefault()
    if (!editingRecipe) return

    const ingredientEntries = editingRecipe.ingredients
      .map((ingredient) => ({
        name: ingredient.name.trim(),
        quantity: Number(ingredient.quantity) || 1,
        unit: INGREDIENT_UNITS.includes(ingredient.unit) ? ingredient.unit : '',
      }))
      .filter((ingredient) => ingredient.name)

    if (!editingRecipe.name.trim()) {
      alert('Fyll inn navn på matretten før du lagrer endringene.')
      return
    }

    if (!ingredientEntries.length) {
      alert('Fyll inn minst én ingrediens før du lagrer endringene.')
      return
    }

    try {
      const ingredientMap = new Map()
      ingredientEntries.forEach((entry) => {
        const entryKey = ingredientIdentityKey(entry.name, entry.unit)
        if (!ingredientMap.has(entryKey)) {
          ingredientMap.set(entryKey, entry)
        }
      })

      const uniqueEntries = Array.from(ingredientMap.values())
      const ingredientNames = uniqueEntries.map((entry) => entry.name)
      const ingredientIds = await getOrCreateIngredients(ingredientNames)
      const categoryIds = await getOrCreateRecords('categories', editingRecipe.typeTags || [])
      const tagIds = await getOrCreateRecords('tags', editingRecipe.occasionTags || [])

      // Determine if a version number should be assigned:
      // Conditions: recipe is a shared fork, name is unchanged vs. root name,
      // ingredient names have changed, and no version number is set yet.
      let nextSharedVersionNumber = editingRecipe.sharedVersionNumber ?? null
      if (
        editingRecipe.sharedRootRecipeId != null &&
        nextSharedVersionNumber == null
      ) {
        const rootName = String(editingRecipe.sharedRootName || '').trim()
        const currentName = editingRecipe.name.trim()
        const nameIsUnchanged = rootName !== '' && currentName === rootName
        if (nameIsUnchanged) {
          const preEditRecipe = recipes.find((r) => r.id === editingRecipe.id)
          if (preEditRecipe) {
            const preEditNames = new Set(preEditRecipe.ingredients.map((i) => normalizeIngredientText(i.name)))
            const newNames = new Set(uniqueEntries.map((e) => normalizeIngredientText(e.name)))
            const ingredientNamesChanged =
              preEditNames.size !== newNames.size ||
              [...newNames].some((n) => !preEditNames.has(n))
            if (ingredientNamesChanged) {
              nextSharedVersionNumber = await getNextSharedVersionNumber(editingRecipe.sharedRootRecipeId)
            }
          }
        }
      }

      await supabase
        .from('recipes')
        .update({
          name: editingRecipe.name.trim(),
          shared_version_number: nextSharedVersionNumber,
        })
        .eq('id', editingRecipe.id)

      await supabase.from('recipe_categories').delete().eq('recipe_id', editingRecipe.id)
      if (categoryIds.length) {
        await supabase.from('recipe_categories').insert(categoryIds.map((categoryId) => ({ recipe_id: editingRecipe.id, category_id: categoryId })))
      }

      await supabase.from('recipe_tags').delete().eq('recipe_id', editingRecipe.id)
      if (tagIds.length) {
        await supabase.from('recipe_tags').insert(tagIds.map((tagId) => ({ recipe_id: editingRecipe.id, tag_id: tagId })))
      }

      await supabase.from('recipe_ingredients').delete().eq('recipe_id', editingRecipe.id)

      const ingredientRows = ingredientIds.map((ingredientId, index) => ({
        recipe_id: editingRecipe.id,
        ingredient_id: ingredientId,
        quantity: uniqueEntries[index]?.quantity ?? 1,
        unit: uniqueEntries[index]?.unit ?? '',
      }))

      if (ingredientRows.length) {
        await supabase.from('recipe_ingredients').insert(ingredientRows)
      }

  await loadData(user.id)
      setEditingRecipe(null)
    } catch (error) {
      console.error('Edit recipe error:', error)
      alert('Noe gikk galt ved lagring av endringene.')
    }
  }

  const handleNewIngredientChange = (index, field, value) => {
    setNewRecipe((current) => {
      const ingredients = [...current.ingredients]
      ingredients[index] = {
        ...ingredients[index],
        [field]: field === 'quantity' ? parseQuantityValue(value) : value,
      }
      return { ...current, ingredients }
    })
  }

  const handleAddIngredientRow = () => {
    setNewRecipe((current) => ({
      ...current,
      ingredients: [...current.ingredients, { name: '', quantity: 1, unit: '' }],
    }))
  }

  const handleRemoveIngredientRow = (index) => {
    setNewRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, idx) => idx !== index),
    }))
  }

  const handleAddRecipe = async (event) => {
    event.preventDefault()
    const ingredientEntries = newRecipe.ingredients
      .map((ingredient) => ({
        name: ingredient.name.trim(),
        quantity: Number(ingredient.quantity) || 1,
        unit: INGREDIENT_UNITS.includes(ingredient.unit) ? ingredient.unit : '',
      }))
      .filter((ingredient) => ingredient.name)

    if (!newRecipe.name.trim() || !ingredientEntries.length || !newRecipe.typeTags.length || !newRecipe.occasionTags.length) {
      alert('Fyll inn navn, ingredienser og alle tag-klassifiseringer før du legger til matretten.')
      return
    }

    try {
      const ingredientMap = new Map()
      ingredientEntries.forEach((entry) => {
        const entryKey = ingredientIdentityKey(entry.name, entry.unit)
        if (!ingredientMap.has(entryKey)) {
          ingredientMap.set(entryKey, entry)
        }
      })
      const uniqueEntries = Array.from(ingredientMap.values())
      const ingredientNames = uniqueEntries.map((entry) => entry.name)

      const ingredientIds = await getOrCreateIngredients(ingredientNames)
      const categoryIds = await getOrCreateRecords('categories', newRecipe.typeTags)
      const tagIds = await getOrCreateRecords('tags', newRecipe.occasionTags)

      const { data: recipeInsert, error: recipeError } = await supabase
        .from('recipes')
        .insert([{ name: newRecipe.name.trim(), user_id: user.id }])
        .select('id')
        .single()

      if (recipeError || !recipeInsert) {
        console.error('Recipe insert error:', recipeError)
        alert('Noe gikk galt ved lagring av oppskriften.')
        return
      }

      const recipeId = recipeInsert.id
      const ingredientRows = ingredientIds.map((ingredientId, index) => ({
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        quantity: uniqueEntries[index]?.quantity ?? 1,
        unit: uniqueEntries[index]?.unit ?? '',
      }))
      const categoryRows = categoryIds.map((categoryId) => ({ recipe_id: recipeId, category_id: categoryId }))
      const tagRows = tagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId }))

      if (ingredientRows.length) {
        await supabase.from('recipe_ingredients').insert(ingredientRows)
      }
      if (categoryRows.length) {
        await supabase.from('recipe_categories').insert(categoryRows)
      }
      if (tagRows.length) {
        await supabase.from('recipe_tags').insert(tagRows)
      }

    await loadData(user.id)
      setSelectedRecipeId(recipeId)
  setNewRecipe({ name: '', ingredients: [{ name: '', quantity: 1, unit: '' }], typeTags: [], occasionTags: [] })
    } catch (error) {
      console.error('Add recipe error:', error)
      alert('Noe gikk galt ved lagring i databasen.')
    }
  }

  const ingredientRowColumns = isMobile ? '1fr 1fr auto' : '2fr 1fr 1fr auto'
  const hasIngredientListItems =
    Object.keys(shoppingListRecipeCounts).length > 0 ||
    Object.keys(ingredientHaveCounts).length > 0 ||
    checkedIngredients.length > 0
  const hasCustomItems = Object.keys(customShoppingItems).length > 0
  const canResetShoppingList = hasIngredientListItems || hasCustomItems

  if (isAuthLoading) {
    return (
      <div className="App app-shell">
        <section className="auth-card">
          <h2>Laster inn…</h2>
          <p>Sjekker innlogging.</p>
        </section>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="App app-shell">
        <section className="auth-card">
          <div className="auth-brand">
            <img src="/favicon.svg" alt="Matretter logo" className="auth-logo" />
            <h1 className="auth-title">Innkjøpsplanlegger</h1>
          </div>
          <h2>Logg inn</h2>
          <p className="auth-help">Kun autorisert bruker har tilgang.</p>

          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              E-post
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Passord
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
              />
            </label>

            {authError && <p className="auth-error">{authError}</p>}
            {authNotice && <p className="auth-notice">{authNotice}</p>}

            <button type="submit" disabled={authSubmitting}>
              {authSubmitting ? 'Logger inn…' : 'Logg inn'}
            </button>

            <button
              type="button"
              className="auth-link-btn"
              onClick={() => void handleSendPasswordResetEmail()}
              disabled={authSubmitting || authResetSubmitting}
            >
              {authResetSubmitting ? 'Sender e-post…' : 'Glemt passord? Send e-post med lenke'}
            </button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className={`App app-shell ${isMobile ? 'mobile' : ''}`}>
      {isMobile ? (
        <div className="mobile-top-region">
          <div className="mobile-header">
            <div className="mobile-header-top">
              <div className="mobile-header-avatar" onClick={handleOpenAccountSettings}>
                {currentUserLabel[0].toUpperCase()}
              </div>
              <span className="mobile-header-username" onClick={handleOpenAccountSettings}>
                {currentUserLabel}
              </span>
              <div className="mobile-header-actions">
                <button
                  type="button"
                  className="account-settings-btn"
                  onClick={handleOpenAccountSettings}
                  aria-label="Åpne brukerinnstillinger"
                  title="Brukerinnstillinger"
                >
                  ⋯
                </button>
                <button type="button" className="toolbar-signout-btn" onClick={handleSignOut}>Logg ut</button>
              </div>
            </div>
            <div className="mobile-header-banner">
              <div className="mobile-header-brand">
                <span className="mobile-header-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M3 4h2.2a1 1 0 0 1 .98.8L6.6 7H20a1 1 0 0 1 .97 1.24l-1.5 6A1 1 0 0 1 18.5 15H8.2a1 1 0 0 1-.98-.8L5.1 5.99H3a1 1 0 1 1 0-2Zm5.98 9h8.74l1-4H7.98l1 4ZM10 20a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                  </svg>
                </span>
                <div className="mobile-header-brand-copy">
                  <h1>Innkjøpsplanlegger</h1>
                  <p>Planlegg handleturen smartere</p>
                </div>
              </div>
            </div>
          </div>

          <nav className="main-nav mobile">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleMenuSelect(item.id)}
                className={`main-nav-button mobile ${selectedMenu === item.id ? 'active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <>
          <div className="user-toolbar">
            <div className="user-toolbar-left">
              <button type="button" className="account-link-btn" onClick={handleOpenAccountSettings}>
                Innlogget som {currentUserLabel}
              </button>
              <button
                type="button"
                className="account-settings-btn"
                onClick={handleOpenAccountSettings}
                aria-label="Åpne brukerinnstillinger"
                title="Brukerinnstillinger"
              >
                ⋯
              </button>
            </div>
            <button type="button" className="toolbar-signout-btn" onClick={handleSignOut}>Logg ut</button>
          </div>
          <h1>Innkjøpsplanlegger</h1>
        </>
      )}

      <div className={`app-content-region ${isMobile ? 'mobile-content' : 'desktop-main-region'}`}>
      {!isMobile && (
        <nav className="main-nav">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMenuSelect(item.id)}
              className={`main-nav-button ${selectedMenu === item.id ? 'active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div className={`menu-workspace ${isMobile ? 'mobile' : ''}`}>
      {!selectedMenu && (
        <section style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa' }}>
          <p>Velg en meny for å åpne siden.</p>
        </section>
      )}

      {selectedMenu === 'innstillinger' && (
        <section className="account-settings-card">
          <h2>Brukerinnstillinger</h2>
          <p className="account-settings-help">
            Disse innstillingene lagres per brukerkonto.
          </p>

          <form onSubmit={handleSaveAccountSettings} className="account-settings-form">
            <label>
              <span className="account-settings-label-text">Standard antall personer i dine handlelister</span>
              <input
                type="number"
                min="1"
                step="1"
                value={accountDefaultPeople}
                onChange={(event) => {
                  setAccountDefaultPeople(event.target.value)
                  setAccountSettingsMessage('')
                }}
              />
            </label>
            <label>
              Brukernavn
              <div className="account-settings-readonly-field" aria-readonly="true">
                {accountEmail}
              </div>
            </label>

            <label>
              Visningsnavn
              <input
                type="text"
                value={accountDisplayName}
                onChange={(event) => {
                  setAccountDisplayName(event.target.value)
                  setAccountSettingsMessage('')
                }}
                placeholder="Ditt visningsnavn"
              />
            </label>

            <button type="submit">Lagre innstillinger</button>
          </form>

          {accountSettingsMessage && <p className="account-settings-message">{accountSettingsMessage}</p>}

          <form onSubmit={handleSaveAccountPassword} className="account-password-form">
            <h3>Endre passord</h3>
            <label>
              Nytt passord
              <input
                type="password"
                value={accountPassword}
                onChange={(event) => {
                  setAccountPassword(event.target.value)
                  setAccountPasswordMessage('')
                  setIsAccountPasswordError(false)
                }}
                placeholder="Minst 8 tegn"
                required
              />
            </label>

            <label>
              Bekreft nytt passord
              <input
                type="password"
                value={accountPasswordConfirm}
                onChange={(event) => {
                  setAccountPasswordConfirm(event.target.value)
                  setAccountPasswordMessage('')
                  setIsAccountPasswordError(false)
                }}
                placeholder="Skriv passordet på nytt"
                required
              />
            </label>

            <button type="submit" disabled={accountPasswordSubmitting}>
              {accountPasswordSubmitting ? 'Lagrer…' : 'Lagre nytt passord'}
            </button>
          </form>

          {accountPasswordMessage && (
            <p className={`account-password-message ${isAccountPasswordError ? 'error' : ''}`}>
              {accountPasswordMessage}
            </p>
          )}

          <div className="account-settings-divider" />

          <div className="account-import-section">
            <div className="account-import-header">
              <div>
                <h3>Importer matretter fra hele databasen</h3>
                <p className="account-settings-help">
                  Velg matretter du vil kopiere inn til din profil. Ingrediensmengdene skaleres automatisk fra kildens standard antall personer til dine innstillinger.
                </p>
              </div>
              <button
                type="button"
                className="account-import-refresh-btn"
                onClick={() => void loadRecipeImportCatalog()}
                disabled={isRecipeCatalogLoading || isImportingRecipes}
              >
                Oppdater liste
              </button>
            </div>

            <div className="account-import-toolbar">
              <input
                type="text"
                value={recipeImportSearch}
                onChange={(event) => setRecipeImportSearch(event.target.value)}
                placeholder="Søk etter matrett, ingrediens eller tag"
                className="account-import-search"
              />
              <label className="account-import-filter-toggle">
                <input
                  type="checkbox"
                  checked={showOnlyMissingImports}
                  onChange={(event) => setShowOnlyMissingImports(event.target.checked)}
                />
                Vis bare matretter jeg ikke har
              </label>
            </div>

            <div className="account-import-list">
              {isRecipeCatalogLoading ? (
                <p className="account-import-empty">Laster matretter…</p>
              ) : isRecipeCatalogLoadError ? (
                <p className="account-import-empty">{recipeImportMessage || 'Importlisten kunne ikke lastes.'}</p>
              ) : filteredRecipeImportCatalog.length === 0 ? (
                <p className="account-import-empty">Ingen matretter funnet i databasen.</p>
              ) : (
                groupedRecipeImportCatalog.map((group) => (
                  <section key={`import-group-${group.key}`} className="account-import-group">
                    <button
                      type="button"
                      className="account-import-group-header"
                      onClick={() => handleToggleImportGroup(group.key)}
                      aria-expanded={!collapsedImportGroups[group.key]}
                    >
                      <span className="account-import-group-title-wrap">
                        <span className="account-import-group-chevron">{collapsedImportGroups[group.key] ? '▸' : '▾'}</span>
                        <h4>{group.title}</h4>
                      </span>
                      <span>{group.recipes.length}</span>
                    </button>

                    {!collapsedImportGroups[group.key] && (
                      <div className="account-import-group-list">
                        {group.recipes.map((recipe) => {
                          const isOwnRecipe = recipe.userId === user?.id
                          const alreadyInProfile = ownedRecipeRootIds.has(recipe.sharedRootRecipeId ?? recipe.id)

                          return (
                            <label
                              key={`import-recipe-${recipe.id}`}
                              className={`account-import-row ${isOwnRecipe ? 'disabled' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(selectedImportRecipeIds[recipe.id])}
                                disabled={isOwnRecipe || isImportingRecipes}
                                onChange={() => handleToggleImportRecipe(recipe.id)}
                              />
                              <div className="account-import-title-row">
                                <span className="account-import-name">{getSharedRecipeDisplayName(recipe)}</span>
                                <span className={`account-import-badge ${isOwnRecipe ? 'own' : alreadyInProfile ? 'existing' : 'new'}`}>
                                  {isOwnRecipe ? 'Din' : alreadyInProfile ? 'Har allerede' : 'Ny'}
                                </span>
                              </div>
                              <span className="account-import-meta">
                                {recipe.ingredients.length} ingrediens(er)
                                {isOwnRecipe ? ' · Din matrett' : alreadyInProfile ? ' · Finnes allerede i din profil' : ' · Kan importeres'}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </section>
                ))
              )}
            </div>

            <div className="account-import-actions">
              <button
                type="button"
                className="account-import-secondary-btn"
                onClick={handleSelectAllNewImports}
                disabled={isRecipeCatalogLoading || isRecipeCatalogLoadError || isImportingRecipes || !groupedRecipeImportCatalog.some((group) => group.key === 'new' && group.recipes.length > 0)}
              >
                Marker alle nye
              </button>
              <button
                type="button"
                className="account-import-secondary-btn"
                onClick={handleClearImportSelections}
                disabled={isRecipeCatalogLoading || isRecipeCatalogLoadError || isImportingRecipes || !Object.values(selectedImportRecipeIds).some(Boolean)}
              >
                Fjern alle markeringer
              </button>
              <button
                type="button"
                onClick={handleImportSelectedRecipes}
                disabled={isRecipeCatalogLoading || isRecipeCatalogLoadError || isImportingRecipes}
              >
                {isImportingRecipes ? 'Importerer…' : 'Importer valgte matretter'}
              </button>
            </div>

            {recipeImportMessage && (
              <p className={`account-import-message ${isRecipeImportError ? 'error' : ''}`}>
                {recipeImportMessage}
              </p>
            )}
          </div>
        </section>
      )}

      {selectedMenu === 'matretter' && (
        <div className={`content-page menu-page ${isMobile ? 'mobile' : ''}`}>
          <section style={{ marginBottom: '24px' }}>
            <label htmlFor="search" style={{ display: 'block', marginBottom: '8px' }}>
              Søk etter tag eller ingrediens:
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Søk på navn, kategori, tag eller ingrediens"
              style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
            />
          </section>

          <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr' }}>
            <div style={{ display: !isMobile || mobileRecipePane === 'list' ? 'block' : 'none' }}>
              <h2>Matretter</h2>
              {filteredRecipes.length === 0 ? (
                <p>Ingen matretter matcher søket.</p>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredRecipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      role="button"
                      onClick={() => handleSelectRecipe(recipe.id)}
                      style={{
                        textAlign: 'left',
                        padding: '16px',
                        border: recipe.id === selectedRecipeId ? '2px solid #1f6feb' : '1px solid #ccc',
                        borderRadius: '10px',
                        background: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <strong style={{ minWidth: 0, flex: '1 1 auto' }}>{getRecipeDisplayName(recipe)}</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: '1 1 auto' }}>
                          {recipe.typeTags.map((tag) => (
                            <span
                              key={`type-${recipe.id}-${tag}`}
                              style={{ padding: '4px 8px', background: '#eef', borderRadius: '999px', fontSize: '13px' }}
                            >
                              {tag}
                            </span>
                          ))}
                          {recipe.occasionTags.map((tag) => (
                            <span
                              key={`occasion-${recipe.id}-${tag}`}
                              style={{ padding: '4px 8px', background: '#efe', borderRadius: '999px', fontSize: '13px' }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleStartEditing(recipe)
                          }}
                          aria-label="Rediger matrett"
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            border: '1px solid #ccc',
                            background: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            fontSize: '1.1rem',
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: !isMobile || mobileRecipePane === 'details' ? 'block' : 'none' }}>
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setMobileRecipePane('list')}
                  style={{ marginBottom: '10px', padding: '8px 12px', cursor: 'pointer' }}
                >
                  Tilbake til matretter
                </button>
              )}
              <h2>{editingRecipe ? 'Rediger matrett' : 'Valgt matrett'}</h2>
              {editingRecipe ? (
                <form onSubmit={handleSaveRecipeEdit} style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa', textAlign: 'left' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '8px' }}>
                      Navn på matrett:
                      <input
                        type="text"
                        value={editingRecipe.name}
                        onChange={(event) => handleEditRecipeName(event.target.value)}
                        style={{ width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box' }}
                      />
                    </label>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Velg kategori:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      {allCategories.map((tag) => (
                        <label key={`edit-category-${tag}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={editingRecipe.typeTags?.includes(tag)}
                            onChange={() => handleEditToggleTag('typeTags', tag)}
                          />
                          {tag}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Velg tag:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      {allTags.map((tag) => (
                        <label key={`edit-tag-${tag}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={editingRecipe.occasionTags?.includes(tag)}
                            onChange={() => handleEditToggleTag('occasionTags', tag)}
                          />
                          {tag}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Ingredienser</strong>
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {editingRecipe.ingredients.map((ingredient, index) => (
                      <div
                        key={`edit-ingredient-${index}`}
                        draggable
                        onDragStart={() => handleIngredientDragStart(index)}
                        onDragOver={(e) => handleIngredientDragOver(e, index)}
                        onDragEnd={handleIngredientDragEnd}
                        style={{ display: 'grid', gridTemplateColumns: ingredientRowColumns, gap: '10px', opacity: dragIngredientIndex === index ? 0.4 : 1 }}
                      >
                        <input
                          type="text"
                          placeholder="Ingrediensnavn"
                          value={ingredient.name}
                          list="ingredient-name-suggestions"
                          onChange={(event) => handleEditIngredientChange(index, 'name', event.target.value)}
                          style={{ width: '100%', padding: '10px', boxSizing: 'border-box', gridColumn: isMobile ? '1 / -1' : undefined }}
                        />
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          inputMode="decimal"
                          value={ingredient.quantity}
                          onChange={(event) => handleEditIngredientChange(index, 'quantity', event.target.value)}
                          style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                        />
                        <select
                          value={ingredient.unit || ''}
                          onChange={(event) => handleEditIngredientChange(index, 'unit', event.target.value)}
                          style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                        >
                          {INGREDIENT_UNITS.map((unit) => (
                            <option key={`edit-unit-${unit || 'none'}`} value={unit}>
                              {unit || 'Ingen enhet'}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span
                            title="Dra for å endre rekkefølge"
                            aria-label="Dra for å flytte ingrediens"
                            style={{ cursor: 'grab', fontSize: '20px', padding: '6px 10px', userSelect: 'none', color: '#888', lineHeight: 1 }}
                          >
                            ⋮
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditIngredientRow(index)}
                            style={{ padding: '10px', cursor: 'pointer' }}
                          >
                            Slett
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditIngredientRow}
                    style={{ marginTop: '12px', padding: '10px 16px', cursor: 'pointer' }}
                  >
                    Legg til ingrediens
                  </button>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <button type="submit" style={{ padding: '10px 16px', cursor: 'pointer' }}>
                      Lagre endringer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingRecipe(null)}
                      style={{ padding: '10px 16px', cursor: 'pointer' }}
                    >
                      Avbryt
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteRecipe}
                      className="app-danger-btn"
                      style={{ padding: '10px 16px', cursor: 'pointer' }}
                    >
                      Slett matrett
                    </button>
                  </div>
                </form>
              ) : selectedRecipe ? (
                <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0 }}>{getRecipeDisplayName(selectedRecipe)}</h3>
                    <button
                      type="button"
                      onClick={() => handleStartEditing(selectedRecipe)}
                      className="app-icon-btn"
                      aria-label="Rediger matrett"
                      style={{ cursor: 'pointer' }}
                    >
                      ⋯
                    </button>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Tags:</strong>{' '}
                    {[...selectedRecipe.typeTags, ...selectedRecipe.occasionTags].map((tag) => (
                      <span
                        key={`selected-${selectedRecipe.id}-${tag}`}
                        style={{ marginRight: '6px', padding: '4px 8px', background: '#ddd', borderRadius: '999px', fontSize: '13px' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h4>Ingredienser</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', display: 'block', overflowX: 'auto' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Ingrediens</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Antall</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Enhet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe.ingredients.map((ingredient) => (
                        <tr key={`selected-ingredient-${selectedRecipe.id}-${ingredient.name}-${ingredient.unit || 'none'}`}>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{ingredient.name}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{ingredient.quantity}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{ingredient.unit || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    onClick={() => handleAddToShoppingList(selectedRecipe.id)}
                    style={{ marginTop: '16px', padding: '10px 16px', cursor: 'pointer' }}
                  >
                    Legg til i handleliste
                  </button>
                </div>
              ) : (
                <p>{isMobile ? 'Velg en matrett for å se detaljer.' : 'Velg en matrett i listen for å se ingrediensene.'}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedMenu === 'legg-til-matrett' && (
        <section className={`content-page menu-page ${isMobile ? 'mobile' : ''}`} style={{ display: 'grid', gap: '12px' }}>
          <h2>Legg til matrett</h2>
          <form onSubmit={handleAddRecipe} style={{ display: 'grid', gap: '12px', padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa' }}>
            <label>
              Navn på matrett:
              <input
                type="text"
                value={newRecipe.name}
                onChange={(event) => handleNewRecipeChange('name', event.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box' }}
              />
            </label>
            <div>
              <strong>Ingredienser</strong>
              {newRecipe.ingredients.map((ingredient, index) => (
                <div key={`ingredient-row-${index}`} style={{ display: 'grid', gridTemplateColumns: ingredientRowColumns, gap: '10px', marginTop: '8px' }}>
                  <input
                    type="text"
                    placeholder="Navn på ingrediens"
                    value={ingredient.name}
                    list="ingredient-name-suggestions"
                    onChange={(event) => handleNewIngredientChange(index, 'name', event.target.value)}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box', gridColumn: isMobile ? '1 / -1' : undefined }}
                  />
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    inputMode="decimal"
                    value={ingredient.quantity}
                    onChange={(event) => handleNewIngredientChange(index, 'quantity', event.target.value)}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                  />
                  <select
                    value={ingredient.unit || ''}
                    onChange={(event) => handleNewIngredientChange(index, 'unit', event.target.value)}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                  >
                    {INGREDIENT_UNITS.map((unit) => (
                      <option key={`new-unit-${unit || 'none'}`} value={unit}>
                        {unit || 'Ingen enhet'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredientRow(index)}
                    style={{ padding: '10px', cursor: 'pointer' }}
                  >
                    Fjern
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddIngredientRow}
                style={{ marginTop: '12px', padding: '10px 16px', cursor: 'pointer' }}
              >
                Legg til ingrediens
              </button>
            </div>

            <div>
              <strong>Velg kategori:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {allCategories.map((tag) => (
                  <label key={`category-${tag}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      checked={newRecipe.typeTags.includes(tag)}
                      onChange={() => handleToggleTag('typeTags', tag)}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <strong>Velg tag:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {allTags.map((tag) => (
                  <label key={`tag-${tag}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      checked={newRecipe.occasionTags.includes(tag)}
                      onChange={() => handleToggleTag('occasionTags', tag)}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" style={{ padding: '12px 18px', cursor: 'pointer' }}>
              Legg til matrett
            </button>
          </form>
        </section>
      )}

      {selectedMenu === 'lag-handleliste' && (
        <section className={`content-page menu-page shopping-section ${isMobile ? 'mobile' : ''}`}>
          <h2>Lag handleliste</h2>
          <p>{shoppingRecipeCount} matrett(er) er valgt for handlelisten.</p>
          <div className={`menu-page-narrow ${isMobile ? 'mobile' : ''}`}>
          <div className="shopping-reset-row">
            <button
              type="button"
              onClick={handleResetShoppingList}
              disabled={!canResetShoppingList}
              className={`shopping-reset-btn ${isMobile ? 'mobile' : ''}`}
            >
              Nullstill handleliste
            </button>
          </div>
          {showResetOptions && (
            <div className={`shopping-reset-panel ${isMobile ? 'mobile' : ''}`}>
              <strong>Velg hva som skal nullstilles</strong>
              <label className="shopping-reset-option">
                <input
                  type="checkbox"
                  checked={resetIngredientsSelected}
                  onChange={(event) => setResetIngredientsSelected(event.target.checked)}
                  disabled={!hasIngredientListItems}
                />
                Handleliste med ingredienser
              </label>
              <label className="shopping-reset-option">
                <input
                  type="checkbox"
                  checked={resetCustomItemsSelected}
                  onChange={(event) => setResetCustomItemsSelected(event.target.checked)}
                  disabled={!hasCustomItems}
                />
                Egne varer
              </label>
              <div className="shopping-reset-actions">
                <button
                  type="button"
                  onClick={handleConfirmResetShoppingList}
                  className="shopping-reset-confirm-btn"
                >
                  Bekreft nullstilling
                </button>
                <button
                  type="button"
                  onClick={handleCancelResetShoppingList}
                  className="shopping-reset-cancel-btn"
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}
          <div className={`custom-item-card ${isMobile ? 'mobile' : ''}`}>
            <h3 className={`custom-item-title ${isMobile ? 'mobile' : ''}`}>Legg til egen vare</h3>
            <div className={`custom-item-form ${isMobile ? 'mobile' : ''}`}>
              <input
                type="text"
                value={customItemName}
                onChange={(event) => setCustomItemName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleAddCustomShoppingItem() }}
                placeholder="F.eks. kaffe eller melk"
                className="custom-item-input"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={customItemQuantity}
                onChange={(event) => setCustomItemQuantity(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleAddCustomShoppingItem() }}
                className="custom-item-quantity"
              />
              <button
                type="button"
                onClick={handleAddCustomShoppingItem}
                className={`custom-item-add-btn ${isMobile ? 'mobile' : ''}`}
              >
                Legg til
              </button>
            </div>
            {Object.keys(customShoppingItems).length > 0 && (
              <div>
                <strong>Egne varer:</strong>
                <ul className="custom-item-list">
                  {Object.entries(customShoppingItems).map(([name, quantity]) => (
                    <li key={`custom-item-${name}`} className="custom-item-list-row">
                      {name} ({quantity}){' '}
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomShoppingItem(name)}
                        className="custom-item-remove-btn"
                      >
                        Fjern
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {shoppingIngredients.length === 0 ? (
            <p>Handlelisten er tom. Legg til matretter eller egne varer.</p>
          ) : (
            <div className="shopping-content">
              {shoppingRecipes.length > 0 && (
                <div className="selected-recipes-summary">
                  <h3>Valgte matretter</h3>
                  <ul className="selected-recipes-list">
                    {shoppingRecipes.map((recipe) => (
                      <li key={`shopping-recipe-${recipe.id}`} className="selected-recipes-list-row">
                        <span>
                          {getRecipeDisplayName(recipe)} {recipe.count > 1 ? `(${recipe.count} ganger)` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveShoppingRecipe(recipe.id)}
                          className="selected-recipes-remove-btn"
                        >
                          Fjern
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3>Handleliste</h3>
                <div className="shopping-cards">
                  {shoppingIngredients.map((ingredient) => (
                    <div key={`shopping-ingredient-${ingredient.key}`} className={`shopping-ingredient-card ${isMobile ? 'mobile' : ''}`}>
                      <div className={`shopping-ingredient-row ${isMobile ? 'mobile' : ''}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={checkedIngredients.includes(ingredient.key) || ingredient.neededQuantity === 0}
                            onChange={() => handleToggleIngredient(ingredient.key)}
                          />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <strong>{ingredient.name}</strong>
                            {ingredient.unit ? ` (${ingredient.unit})` : ''} {ingredient.neededQuantity ? `(${ingredient.neededQuantity})` : ''}
                          </span>
                        </div>
                        <label className={`shopping-have-label ${isMobile ? 'mobile' : ''}`}>
                          {isMobile ? 'Har:' : 'Har allerede:'}
                          <select
                            value={ingredient.haveQuantity}
                            onChange={(e) => handleHaveQuantityChange(ingredient.key, e.target.value)}
                            className={`shopping-have-select ${isMobile ? 'mobile' : ''}`}
                          >
                            {Array.from({ length: 11 }, (_, index) => index).map((num) => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
        </section>
      )}

      <datalist id="ingredient-name-suggestions">
        {ingredientNameSuggestions.map((name) => (
          <option key={`ingredient-suggestion-${name}`} value={name} />
        ))}
      </datalist>

      {selectedMenu === 'lag-meny' && (
        <section className={`content-page menu-page ${isMobile ? 'mobile' : ''}`} style={{ display: 'grid', gap: '16px' }}>
          <section style={{ marginBottom: '8px' }}>
            <label htmlFor="menu-search" style={{ display: 'block', marginBottom: '8px' }}>
              Søk etter tag eller ingrediens:
            </label>
            <input
              id="menu-search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Søk på navn, kategori, tag eller ingrediens"
              style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
            />
          </section>
          <div className={`menu-page-narrow compact ${isMobile ? 'mobile' : ''}`}>
          <h2>Lag meny</h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'block' }}>
              Hvor mange dager skal menyen dekke?
              <select
                value={menuDays}
                onChange={(event) => handleMenuDaysChange(event.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box' }}
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              Porsjoner for hele menyen (basis i dine innstillinger: {Math.max(1, Number(accountDefaultPeople) || DEFAULT_ACCOUNT_PEOPLE)})
              <select
                value={menuServings}
                onChange={(event) => handleMenuServingsChange(event.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box' }}
              >
                {[2, 4, 6, 8].map((servings) => (
                  <option key={`menu-servings-${servings}`} value={servings}>
                    {servings} porsjoner
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {Array.from({ length: menuDays }, (_, index) => (
              <div key={`menu-day-${index}`} style={{ display: 'grid', gap: '6px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  Dag {index + 1}
                  <select
                    value={menuPlan[index]?.recipeId || ''}
                    onChange={(event) => handleMenuRecipeChange(index, event.target.value)}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
                  >
                    <option value="">Velg en rett</option>
                    {filteredRecipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {getRecipeDisplayName(recipe)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleCreateMenu} style={{ padding: '12px 18px', cursor: 'pointer', width: 'fit-content' }}>
            Opprett meny
          </button>
          {menuCreated && (
            <div className="menu-created-summary" style={{ padding: '16px', border: '1px solid #ccc', borderRadius: '10px', background: '#fff' }}>
              <h3>Meny opprettet</h3>
              <p>Ingrediensene fra valgte retter er lagt til i handlelisten.</p>
              <div className="menu-created-days" role="table" aria-label="Valgte retter per dag">
                {menuPlan.map((dayPlan, index) => {
                  const recipe = recipes.find((item) => item.id === dayPlan?.recipeId)
                  return (
                    <div key={`menu-summary-${index}`} className="menu-created-day-row" role="row">
                      <span className="menu-created-day-label" role="cell">Dag {index + 1}:</span>
                      <span className="menu-created-day-recipe" role="cell">{recipe ? getRecipeDisplayName(recipe) : 'Ingen rett valgt'}</span>
                    </div>
                  )
                })}
              </div>
              <p>Alle dager er beregnet med {menuServings} porsjoner.</p>
            </div>
          )}
          </div>
        </section>
      )}
      </div>
      </div>
    </div>
  )
}

export default App
