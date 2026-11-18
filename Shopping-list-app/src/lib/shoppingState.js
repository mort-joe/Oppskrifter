export const normalizePositiveNumberRecord = (value) => {
  if (!value || typeof value !== 'object') return {}

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key, Number(raw) || 0])
      .filter(([, numberValue]) => numberValue > 0),
  )
}

export const normalizeNonNegativeNumberRecord = (value) => {
  if (!value || typeof value !== 'object') return {}

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key, Math.max(0, Number(raw) || 0)]),
  )
}

export const filterRecordByAllowedKeys = (value, allowedKeys) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => allowedKeys.has(key)))

export const normalizeMenuPlan = (value, fallbackDays = 1) => {
  const defaultPlan = Array.from({ length: fallbackDays }, () => ({ recipeId: null }))
  if (!Array.isArray(value) || value.length === 0) {
    return defaultPlan
  }

  return value.map((entry) => ({
    recipeId: entry?.recipeId ? Number(entry.recipeId) : null,
  }))
}

// The JSON document stored in shopping_state.state for a user.
export const buildShoppingState = ({
  shoppingListRecipeCounts,
  customShoppingItems,
  ingredientHaveCounts,
  checkedIngredients,
  menuDays,
  menuServings,
  menuPlan,
  menuCreated,
  defaultPeople,
}) => ({
  shoppingListRecipeCounts,
  customShoppingItems,
  ingredientHaveCounts,
  checkedIngredients,
  menuDays,
  menuServings,
  menuPlan,
  menuCreated,
  defaultPeople,
  userSettings: {
    defaultPeople,
  },
})
