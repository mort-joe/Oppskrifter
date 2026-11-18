import { INGREDIENT_NAME_ALIASES } from './constants'

// Lower-cases and strips combining diacritics (å -> a, ö -> o, ü -> u).
// Note: ø and æ have no decomposition in NFD and are kept as they are.
export const normalizeIngredientText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export const normalizeCategoryName = (value) => {
  const trimmedValue = String(value || '').trim()
  if (!trimmedValue) return ''
  if (normalizeIngredientText(trimmedValue) === 'supper') return 'Suppe'
  return trimmedValue
}

export const normalizeShoppingCategoryKey = (value) =>
  normalizeIngredientText(String(value || '').trim())

export const normalizeIngredientName = (value) => {
  const trimmedValue = String(value || '').trim()
  if (!trimmedValue) return ''

  const normalizedKey = normalizeIngredientText(trimmedValue)
  return INGREDIENT_NAME_ALIASES[normalizedKey] ?? trimmedValue
}

export const normalizeIngredientLookupKey = (value) =>
  normalizeIngredientText(normalizeIngredientName(String(value || '').trim()))

export const normalizeNames = (values) =>
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]

export const normalizeShoppingCategory = (value) => {
  const normalizedCategory = normalizeShoppingCategoryKey(value)
  return normalizedCategory || 'annet'
}

// Key used to merge the same ingredient (name + unit) across recipes in the shopping list.
export const ingredientIdentityKey = (name, unit) => `${name}__${unit || ''}`

export const scaleIngredientQuantity = (quantity, factor) =>
  Math.max(0, Math.round(((Number(quantity) || 0) * factor + Number.EPSILON) * 1000) / 1000)

export const parseQuantityValue = (value) => {
  const normalized = String(value).replace(',', '.')
  const parsed = parseFloat(normalized)
  return Number.isNaN(parsed) ? 0 : parsed
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The first category whose keyword list matches wins, so a keyword that also
// appears in an earlier category can never trigger a later one.
// Keywords are matched against text normalized with normalizeIngredientText,
// which strips å/ü; keywords spelled with those letters (kål, blåskjell,
// blomkål, müsli) therefore never match today and are kept only to show intent.
const CATEGORY_KEYWORDS = [
  { category: 'kjott', keywords: ['kjøtt', 'kjott', 'kylling', 'fugl', 'okse', 'storfe', 'svin', 'lam', 'pølse', 'bacon', 'skinke'] },
  { category: 'fisk', keywords: ['fisk', 'laks', 'torsk', 'sei', 'reke', 'reker', 'tunfisk', 'krabbe', 'blåskjell', 'sjømat'] },
  { category: 'gronnsaker', keywords: ['tomat', 'agurk', 'paprika', 'salat', 'gulrot', 'løk', 'hvitløk', 'kål', 'brokkoli', 'spinat', 'squash', 'selleri', 'blomkål'] },
  { category: 'frukt', keywords: ['eple', 'banan', 'appelsin', 'sitron', 'lime', 'melon', 'jordbær', 'bringebær', 'pære', 'plomme', 'fersken', 'druer'] },
  { category: 'mineralvann', keywords: ['brus', 'cola', 'vann', 'farris', 'juice', 'energi', 'saft'] },
  { category: 'melkeprodukter', keywords: ['melk', 'ost', 'yoghurt', 'smør', 'fløte', 'krem', 'rømme', 'kesam'] },
  { category: 'frosenvarer', keywords: ['frossen', 'fryse', 'is', 'pizza', 'pinne', 'frysevarer'] },
  { category: 'bakevarer', keywords: ['kake', 'bakst', 'brød', 'baguett', 'boller', 'kjeks', 'mel', 'bakemiks', 'bakervarer'] },
  { category: 'torrvarer', keywords: ['pasta', 'ris', 'sukker', 'salt', 'olje', 'eddik', 'buljong', 'krydder', 'bønner', 'linser', 'kaffe', 'te', 'honning', 'müsli', 'tørrvarer', 'torrvarer'] },
  { category: 'kjolevarer', keywords: ['knekkebrød', 'tortilla', 'lefse', 'hamburgerbrød', 'wrap', 'pita'] },
]

const CATEGORY_KEYWORD_PATTERNS = CATEGORY_KEYWORDS.map(({ category, keywords }) => ({
  category,
  patterns: keywords.map((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`)),
}))

export const getCategoryFromKeywordMap = (ingredientName) => {
  if (!ingredientName) return ''

  const normalizedText = normalizeIngredientText(ingredientName)

  for (const entry of CATEGORY_KEYWORD_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalizedText))) {
      return entry.category
    }
  }

  return ''
}

export const getShoppingCategoryForCustomItem = (itemName, ingredientCategoryMap) => {
  const normalizedName = normalizeIngredientLookupKey(itemName)
  if (!normalizedName) return 'annet'

  if (ingredientCategoryMap && Object.prototype.hasOwnProperty.call(ingredientCategoryMap, normalizedName)) {
    return normalizeShoppingCategory(ingredientCategoryMap[normalizedName])
  }

  const guessedCategory = getCategoryFromKeywordMap(normalizedName)
  return normalizeShoppingCategory(guessedCategory)
}
