import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

const INGREDIENT_UNITS = ['', 'l', 'dl', 'cl', 'ml', 'kg', 'g', 'hg', 'ts', 'ss', 'stk', 'bunt', 'pk', 'fl', 'boks', 'glass', 'pose', 'eske', 'fed']

const SHOPPING_CATEGORY_ORDER = [
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
  kjolevarer: ['yoghurt', 'romme', 'creme fraiche', 'smoreost', 'kefir', 'skyr', 'ost'],
  pasta: ['pasta', 'spagetti', 'penne', 'fusilli', 'lasagne', 'tagliatelle', 'makaroni', 'nudler', 'risnudler', 'lefse', 'lefser', 'tray', 'tortilla'],
  bakevarer: ['mel', 'gjaer', 'bakepulver', 'sukker', 'vaniljesukker', 'sirup', 'kakao', 'havregryn', 'smor', 'egg', 'brod', 'rundstykke', 'tortilla', 'lompe'],
  frosenvarer: ['frossen', 'fryst', 'fryse', 'is', 'fryste', 'frossne', 'rosenkal'],
  melkeprodukter: ['melk', 'flote', 'yoghurt', 'romme', 'creme fraiche', 'smoreost', 'kefir', 'skyr'],
  mineralvann: ['mineralvann', 'brus', 'cola', 'fanta', 'sprite', 'pepsi', 'sitronbrus', 'sodavann', 'tonic'],
}

const normalizeIngredientText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const getShoppingCategory = (ingredientName) => {
  const normalizedName = normalizeIngredientText(ingredientName)

  for (const category of SHOPPING_CATEGORY_ORDER) {
    if (category === 'annet') continue
    const keywords = SHOPPING_CATEGORY_KEYWORDS[category] ?? []
    if (keywords.some((keyword) => normalizedName.includes(normalizeIngredientText(keyword)))) {
      return category
    }
  }

  return 'annet'
}

function App() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
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
  const [allCategories, setAllCategories] = useState([])
  const [allTags, setAllTags] = useState([])
  const [dragIngredientIndex, setDragIngredientIndex] = useState(null)
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    ingredients: [{ name: '', quantity: 1, unit: '' }],
    typeTags: [],
    occasionTags: [],
  })

  const normalizeNames = (values) =>
    [...new Set(values.map((value) => value.trim()).filter(Boolean))]

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

  const normalizeMenuPlan = (value, fallbackDays = 1) => {
    const defaultPlan = Array.from({ length: fallbackDays }, () => ({ recipeId: null }))
    if (!Array.isArray(value) || value.length === 0) {
      return defaultPlan
    }

    return value.map((entry) => ({
      recipeId: entry?.recipeId ? Number(entry.recipeId) : null,
    }))
  }

  const loadData = async (userId) => {
    if (!userId) return

    const [{ data: categoryData, error: categoryError }, { data: tagData, error: tagError }, { data: recipeData, error: recipeError }] = await Promise.all([
      supabase.from('categories').select('name').order('name'),
      supabase.from('tags').select('name').order('name'),
      supabase
        .from('recipes')
        .select(
          'id,name,recipe_ingredients(ingredient_id,quantity,unit,ingredients(name,shopping_category)),recipe_categories(category_id,categories(name)),recipe_tags(tag_id,tags(name))',
        )
        .eq('user_id', userId)
        .order('id', { ascending: false }),
    ])

    if (categoryError) {
      console.error('Could not load categories:', categoryError)
    } else if (categoryData) {
      setAllCategories(categoryData.map((row) => row.name))
    }

    if (tagError) {
      console.error('Could not load tags:', tagError)
    } else if (tagData) {
      setAllTags(tagData.map((row) => row.name))
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
          ingredients:
            recipe.recipe_ingredients
              ?.map((row) => ({
                name: row.ingredients?.name,
                quantity: row.quantity ?? 1,
                unit: row.unit ?? '',
                shoppingCategory: row.ingredients?.shopping_category ?? 'annet',
              }))
              .filter((ingredient) => ingredient.name) ?? [],
          typeTags:
            recipe.recipe_categories?.map((row) => row.categories?.name).filter(Boolean) ?? [],
          occasionTags:
            recipe.recipe_tags?.map((row) => row.tags?.name).filter(Boolean) ?? [],
        })),
      )
    }
  }

  const getOrCreateRecords = async (table, names) => {
    const uniqueNames = normalizeNames(names)
    if (!uniqueNames.length) return []

    const { data: existing, error: existingError } = await supabase.from(table).select('id,name').in('name', uniqueNames)
    if (existingError) {
      throw existingError
    }

    const existingMap = new Map(existing.map((row) => [row.name, row.id]))
    const missingNames = uniqueNames.filter((name) => !existingMap.has(name))

    if (missingNames.length) {
      const { data: inserted, error: insertError } = await supabase.from(table).insert(missingNames.map((name) => ({ name }))).select('id,name')
      if (insertError) {
        throw insertError
      }
      inserted.forEach((row) => existingMap.set(row.name, row.id))
    }

    return uniqueNames.map((name) => existingMap.get(name))
  }

  const getOrCreateIngredients = async (names) => {
    const uniqueNames = normalizeNames(names)
    if (!uniqueNames.length) return []

    const { data: existing, error: existingError } = await supabase
      .from('ingredients')
      .select('id,name,shopping_category')
      .in('name', uniqueNames)
    if (existingError) {
      throw existingError
    }

    const existingMap = new Map(existing.map((row) => [row.name, row.id]))
    const missingNames = uniqueNames.filter((name) => !existingMap.has(name))

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
        throw insertError
      }
      inserted.forEach((row) => existingMap.set(row.name, row.id))
    }

    return uniqueNames.map((name) => existingMap.get(name))
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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setAuthError('')
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

      const { data, error } = await supabase
        .from('shopping_state')
        .select('state')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Could not load shopping state:', error)
        setIsShoppingStateReady(true)
        return
      }

      const state = data?.state
      if (!state || typeof state !== 'object') {
        setIsShoppingStateReady(true)
        return
      }

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
      setIsShoppingStateReady(true)
    }
    void load()
  }, [user])

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

  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId)

  const filteredRecipes = useMemo(() => {
    const filter = searchTerm.trim().toLowerCase()
    const sortedRecipes = [...recipes].sort((a, b) =>
      a.name.localeCompare(b.name, 'no', { sensitivity: 'base' }),
    )

    if (!filter) return sortedRecipes

    return sortedRecipes.filter((recipe) => {
      const nameMatch = recipe.name.toLowerCase().includes(filter)
      const typeMatch = recipe.typeTags.some((tag) => tag.toLowerCase().includes(filter))
      const occasionMatch = recipe.occasionTags.some((tag) => tag.toLowerCase().includes(filter))
      const ingredientMatch = recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(filter))
      return nameMatch || typeMatch || occasionMatch || ingredientMatch
    })
  }, [recipes, searchTerm])

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
      const categoryIndexA = SHOPPING_CATEGORY_ORDER.indexOf(categoryA)
      const categoryIndexB = SHOPPING_CATEGORY_ORDER.indexOf(categoryB)

      const safeCategoryIndexA = categoryIndexA >= 0 ? categoryIndexA : SHOPPING_CATEGORY_ORDER.length
      const safeCategoryIndexB = categoryIndexB >= 0 ? categoryIndexB : SHOPPING_CATEGORY_ORDER.length

      if (safeCategoryIndexA !== safeCategoryIndexB) {
        return safeCategoryIndexA - safeCategoryIndexB
      }

      return a.name.localeCompare(b.name, 'no', { sensitivity: 'base' })
    })
  }, [shoppingRecipes, ingredientHaveCounts, customShoppingItems])

  const handleSelectRecipe = (id) => {
    setSelectedRecipeId(id)
    if (isMobile) {
      setEditingRecipe(null)
      setMobileRecipePane('details')
    }
  }

  const handleMenuSelect = (menuId) => {
    setSelectedMenu(menuId)
    if (menuId === 'matretter' && isMobile) {
      setMobileRecipePane('list')
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

    const counts = menuPlan.reduce((acc, dayPlan) => {
      const recipeId = dayPlan.recipeId
      const factor = menuServings / 4
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
    setCustomShoppingItems((current) => {
      const next = { ...current }
      delete next[name]
      return next
    })
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
    setIsShoppingStateReady(false)
    setCustomItemName('')
    setCustomItemQuantity(1)
    setShowResetOptions(false)
    setResetIngredientsSelected(false)
    setResetCustomItemsSelected(false)
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
    if (!window.confirm(`Er du sikker på at du vil slette matretten "${editingRecipe.name}"?`)) {
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

      await supabase.from('recipes').update({ name: editingRecipe.name.trim() }).eq('id', editingRecipe.id)

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

            <button type="submit" disabled={authSubmitting}>
              {authSubmitting ? 'Logger inn…' : 'Logg inn'}
            </button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className={`App app-shell ${isMobile ? 'mobile' : ''}`}>
      <div className="user-toolbar">
        <span>Innlogget som {user?.email}</span>
        <button type="button" onClick={handleSignOut}>Logg ut</button>
      </div>

      <h1>Innkjøpsplanlegger</h1>

      <nav className={`main-nav ${isMobile ? 'mobile' : ''}`}>
        {[
          { id: 'matretter', label: 'Matretter' },
          { id: 'legg-til-matrett', label: 'Legg til matrett' },
          { id: 'lag-meny', label: 'Lag meny' },
          { id: 'lag-handleliste', label: 'Lag handleliste' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleMenuSelect(item.id)}
            className={`main-nav-button ${isMobile ? 'mobile' : ''} ${selectedMenu === item.id ? 'active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {!selectedMenu && (
        <section style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa' }}>
          <p>Velg en meny for å åpne siden.</p>
        </section>
      )}

      {selectedMenu === 'matretter' && (
        <>
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
                        <strong style={{ minWidth: 0, flex: '1 1 auto' }}>{recipe.name}</strong>
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
                      style={{ padding: '10px 16px', cursor: 'pointer', background: '#ffe6e6', border: '1px solid #ff9999' }}
                    >
                      Slett matrett
                    </button>
                  </div>
                </form>
              ) : selectedRecipe ? (
                <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa', textAlign: 'left' }}>
                  <h3>{selectedRecipe.name}</h3>
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
        </>
      )}

      {selectedMenu === 'legg-til-matrett' && (
        <section style={{ display: 'grid', gap: '12px' }}>
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
        <section className={`shopping-section ${isMobile ? 'mobile' : ''}`}>
          <h2>Lag handleliste</h2>
          <p>{shoppingRecipeCount} matrett(er) er valgt for handlelisten.</p>
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
                placeholder="F.eks. kaffe eller melk"
                className="custom-item-input"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={customItemQuantity}
                onChange={(event) => setCustomItemQuantity(event.target.value)}
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
                      <li key={`shopping-recipe-${recipe.id}`}>
                        {recipe.name} {recipe.count > 1 ? `(${recipe.count} ganger)` : ''}
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
        </section>
      )}

      {selectedMenu === 'lag-meny' && (
        <section style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa', display: 'grid', gap: '16px' }}>
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
              Porsjoner for hele menyen (standard er 4)
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
                        {recipe.name}
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
                      <span className="menu-created-day-recipe" role="cell">{recipe?.name || 'Ingen rett valgt'}</span>
                    </div>
                  )
                })}
              </div>
              <p>Alle dager er beregnet med {menuServings} porsjoner.</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default App
