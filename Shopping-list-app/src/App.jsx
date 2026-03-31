import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

function App() {
  const [recipes, setRecipes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] = useState(null)
  const [selectedMenu, setSelectedMenu] = useState('')
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [shoppingListRecipeCounts, setShoppingListRecipeCounts] = useState({})
  const [ingredientHaveCounts, setIngredientHaveCounts] = useState({})
  const [checkedIngredients, setCheckedIngredients] = useState([])
  const [menuDays, setMenuDays] = useState(1)
  const [menuPlan, setMenuPlan] = useState([null])
  const [menuCreated, setMenuCreated] = useState(false)
  const [allCategories, setAllCategories] = useState([])
  const [allTags, setAllTags] = useState([])
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    ingredients: [{ name: '', quantity: 1 }],
    typeTags: [],
    occasionTags: [],
  })

  const normalizeNames = (values) =>
    [...new Set(values.map((value) => value.trim()).filter(Boolean))]

  const loadData = async () => {
    const [{ data: categoryData, error: categoryError }, { data: tagData, error: tagError }, { data: recipeData, error: recipeError }] = await Promise.all([
      supabase.from('categories').select('name').order('name'),
      supabase.from('tags').select('name').order('name'),
      supabase
        .from('recipes')
        .select(
          'id,name,recipe_ingredients(ingredient_id,quantity,ingredients(name)),recipe_categories(category_id,categories(name)),recipe_tags(tag_id,tags(name))',
        )
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
              ?.map((row) => ({ name: row.ingredients?.name, quantity: row.quantity ?? 1 }))
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

  useEffect(() => {
    const load = async () => {
      await loadData()
    }
    void load()
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
        const current = totals.get(ingredient.name) ?? 0
        totals.set(ingredient.name, current + ingredient.quantity * recipe.count)
      })
    })
    return Array.from(totals.entries()).map(([name, requiredQuantity]) => {
      const haveQuantity = Number(ingredientHaveCounts[name] ?? 0)
      return {
        name,
        requiredQuantity,
        haveQuantity,
        neededQuantity: Math.max(requiredQuantity - haveQuantity, 0),
      }
    })
  }, [shoppingRecipes, ingredientHaveCounts])

  const handleSelectRecipe = (id) => {
    setSelectedRecipeId(id)
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
      const next = Array.from({ length: days }, (_, index) => current[index] ?? null)
      return next
    })
    setMenuCreated(false)
  }

  const handleMenuRecipeChange = (index, recipeId) => {
    setMenuPlan((current) => {
      const next = [...current]
      next[index] = recipeId ? Number(recipeId) : null
      return next
    })
    setMenuCreated(false)
  }

  const handleCreateMenu = () => {
    if (menuPlan.some((recipeId) => !recipeId)) {
      alert('Velg en rett for hver dag før du oppretter menyen.')
      return
    }

    const counts = menuPlan.reduce((acc, recipeId) => {
      acc[recipeId] = (acc[recipeId] ?? 0) + 1
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
        ingredients: [...current.ingredients, { name: '', quantity: 1 }],
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
      await loadData()
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
      .map((ingredient) => ({ name: ingredient.name.trim(), quantity: Number(ingredient.quantity) || 1 }))
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
        if (!ingredientMap.has(entry.name)) {
          ingredientMap.set(entry.name, entry.quantity)
        }
      })

      const ingredientNames = Array.from(ingredientMap.keys())
      const ingredientQuantities = Array.from(ingredientMap.values())
      const ingredientIds = await getOrCreateRecords('ingredients', ingredientNames)
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
        quantity: ingredientQuantities[index] ?? 1,
      }))

      if (ingredientRows.length) {
        await supabase.from('recipe_ingredients').insert(ingredientRows)
      }

      await loadData()
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
      ingredients: [...current.ingredients, { name: '', quantity: 1 }],
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
      .map((ingredient) => ({ name: ingredient.name.trim(), quantity: Number(ingredient.quantity) || 1 }))
      .filter((ingredient) => ingredient.name)

    if (!newRecipe.name.trim() || !ingredientEntries.length || !newRecipe.typeTags.length || !newRecipe.occasionTags.length) {
      alert('Fyll inn navn, ingredienser og alle tag-klassifiseringer før du legger til matretten.')
      return
    }

    try {
      const ingredientMap = new Map()
      ingredientEntries.forEach((entry) => {
        if (!ingredientMap.has(entry.name)) {
          ingredientMap.set(entry.name, entry.quantity)
        }
      })
      const ingredientNames = Array.from(ingredientMap.keys())
      const ingredientQuantities = Array.from(ingredientMap.values())

      const ingredientIds = await getOrCreateRecords('ingredients', ingredientNames)
      const categoryIds = await getOrCreateRecords('categories', newRecipe.typeTags)
      const tagIds = await getOrCreateRecords('tags', newRecipe.occasionTags)

      const { data: recipeInsert, error: recipeError } = await supabase
        .from('recipes')
        .insert([{ name: newRecipe.name.trim() }])
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
        quantity: ingredientQuantities[index] ?? 1,
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

      await loadData()
      setSelectedRecipeId(recipeId)
      setNewRecipe({ name: '', ingredients: [{ name: '', quantity: 1 }], typeTags: [], occasionTags: [] })
    } catch (error) {
      console.error('Add recipe error:', error)
      alert('Noe gikk galt ved lagring i databasen.')
    }
  }

  return (
    <div className="App" style={{ padding: '16px', fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Matretter - Innkjøpsplanlegger</h1>

      <nav style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'matretter', label: 'Matretter' },
          { id: 'legg-til-matrett', label: 'Legg til matrett' },
          { id: 'lag-meny', label: 'Lag meny' },
          { id: 'lag-handleliste', label: 'Lag handleliste' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedMenu(item.id)}
            style={{
              padding: '18px 24px',
              borderRadius: '14px',
              fontSize: '1.2rem',
              flex: '1 1 min(180px, 100%)',
              maxWidth: '260px',
              border: selectedMenu === item.id ? '3px solid #1f6feb' : '1px solid #ccc',
              background: selectedMenu === item.id ? '#e8f0ff' : '#fff',
              cursor: 'pointer',
            }}
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

          <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: '1.6fr 1fr' }}>
            <div>
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
                          ✏️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
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
                      <div key={`edit-ingredient-${index}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px' }}>
                        <input
                          type="text"
                          placeholder="Ingrediensnavn"
                          value={ingredient.name}
                          onChange={(event) => handleEditIngredientChange(index, 'name', event.target.value)}
                          style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
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
                        <button
                          type="button"
                          onClick={() => handleRemoveEditIngredientRow(index)}
                          style={{ padding: '10px', cursor: 'pointer' }}
                        >
                          Slett
                        </button>
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
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Ingrediens</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Antall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe.ingredients.map((ingredient) => (
                        <tr key={`selected-ingredient-${selectedRecipe.id}-${ingredient.name}`}>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{ingredient.name}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{ingredient.quantity}</td>
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
                <p>Velg en matrett i listen for å se ingrediensene.</p>
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
                <div key={`ingredient-row-${index}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', marginTop: '8px' }}>
                  <input
                    type="text"
                    placeholder="Navn på ingrediens"
                    value={ingredient.name}
                    onChange={(event) => handleNewIngredientChange(index, 'name', event.target.value)}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
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
        <section style={{ display: 'grid', gap: '24px' }}>
          <h2>Lag handleliste</h2>
          <p>{shoppingRecipeCount} matrett(er) er valgt for handlelisten.</p>
          {shoppingRecipes.length === 0 ? (
            <p>Du har ikke lagt til noen matretter i handlelisten ennå.</p>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <h3>Valgte matretter</h3>
                <ul>
                  {shoppingRecipes.map((recipe) => (
                    <li key={`shopping-recipe-${recipe.id}`}>
                      {recipe.name} {recipe.count > 1 ? `(${recipe.count} ganger)` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Handleliste</h3>
                {shoppingIngredients.length === 0 ? (
                  <p>Ingen ingredienser å vise.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {shoppingIngredients.map((ingredient) => (
                      <div key={`shopping-ingredient-${ingredient.name}`} style={{ display: 'grid', gap: '8px', padding: '10px', border: '1px solid #ddd', borderRadius: '10px', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={checkedIngredients.includes(ingredient.name) || ingredient.neededQuantity === 0}
                              onChange={() => handleToggleIngredient(ingredient.name)}
                            />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <strong>{ingredient.name}</strong> {ingredient.neededQuantity ? `(${ingredient.neededQuantity})` : ''}
                            </span>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                            Har allerede:
                            <input
                              type="number"
                              min="0"
                              value={ingredient.haveQuantity}
                              onChange={(e) => handleHaveQuantityChange(ingredient.name, e.target.value)}
                              style={{ width: '80px', padding: '4px 6px' }}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {selectedMenu === 'lag-meny' && (
        <section style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa', display: 'grid', gap: '16px' }}>
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
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {Array.from({ length: menuDays }, (_, index) => (
              <label key={`menu-day-${index}`} style={{ display: 'grid', gap: '6px' }}>
                Dag {index + 1}
                <select
                  value={menuPlan[index] || ''}
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
            ))}
          </div>
          <button type="button" onClick={handleCreateMenu} style={{ padding: '12px 18px', cursor: 'pointer', width: 'fit-content' }}>
            Opprett meny
          </button>
          {menuCreated && (
            <div style={{ padding: '16px', border: '1px solid #ccc', borderRadius: '10px', background: '#fff' }}>
              <h3>Meny opprettet</h3>
              <p>Ingrediensene fra valgte retter er lagt til i handlelisten.</p>
              <ul>
                {menuPlan.map((recipeId, index) => {
                  const recipe = recipes.find((item) => item.id === recipeId)
                  return <li key={`menu-summary-${index}`}>Dag {index + 1}: {recipe?.name || 'Ingen rett valgt'}</li>
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default App
