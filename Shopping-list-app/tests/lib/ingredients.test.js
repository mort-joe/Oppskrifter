import { describe, expect, it } from 'vitest'
import {
  getCategoryFromKeywordMap,
  getShoppingCategoryForCustomItem,
  ingredientIdentityKey,
  normalizeCategoryName,
  normalizeIngredientLookupKey,
  normalizeIngredientName,
  normalizeIngredientText,
  normalizeNames,
  normalizeShoppingCategory,
  parseQuantityValue,
  scaleIngredientQuantity,
} from '../../src/lib/ingredients'

describe('normalizeIngredientText', () => {
  it('lower-cases and strips combining diacritics but keeps ø and æ', () => {
    expect(normalizeIngredientText('Blåbær')).toBe('blabær')
    expect(normalizeIngredientText('Rømme')).toBe('rømme')
    expect(normalizeIngredientText('Müsli')).toBe('musli')
    expect(normalizeIngredientText(null)).toBe('')
  })
})

describe('name normalization', () => {
  it('maps the Supper category to Suppe', () => {
    expect(normalizeCategoryName(' supper ')).toBe('Suppe')
    expect(normalizeCategoryName('Middag')).toBe('Middag')
    expect(normalizeCategoryName('')).toBe('')
  })

  it('applies ingredient aliases', () => {
    expect(normalizeIngredientName('soyasaus2')).toBe('Soyasaus')
    expect(normalizeIngredientName(' Melk ')).toBe('Melk')
    expect(normalizeIngredientLookupKey('SOYASAUS2')).toBe('soyasaus')
  })

  it('deduplicates trimmed names', () => {
    expect(normalizeNames([' a', 'a', 'b ', '', null])).toEqual(['a', 'b'])
  })

  it('falls back to annet for empty shopping categories', () => {
    expect(normalizeShoppingCategory(' Frukt ')).toBe('frukt')
    expect(normalizeShoppingCategory('')).toBe('annet')
    expect(normalizeShoppingCategory(undefined)).toBe('annet')
  })

  it('builds identity keys from name and unit', () => {
    expect(ingredientIdentityKey('Melk', 'dl')).toBe('Melk__dl')
    expect(ingredientIdentityKey('Melk', undefined)).toBe('Melk__')
  })
})

describe('getCategoryFromKeywordMap', () => {
  it('matches whole words in normalized text', () => {
    expect(getCategoryFromKeywordMap('kyllingfilet')).toBe('')
    expect(getCategoryFromKeywordMap('kylling filet')).toBe('kjott')
    expect(getCategoryFromKeywordMap('Grønn paprika')).toBe('gronnsaker')
    expect(getCategoryFromKeywordMap('eplejuice')).toBe('')
    expect(getCategoryFromKeywordMap('')).toBe('')
  })

  it('lets the first matching category win', () => {
    expect(getCategoryFromKeywordMap('juice')).toBe('mineralvann')
    expect(getCategoryFromKeywordMap('brød')).toBe('bakevarer')
    expect(getCategoryFromKeywordMap('knekkebrød')).toBe('kjolevarer')
    expect(getCategoryFromKeywordMap('is')).toBe('frosenvarer')
  })
})

describe('getShoppingCategoryForCustomItem', () => {
  it('prefers the category from the ingredient catalog', () => {
    expect(getShoppingCategoryForCustomItem('Kaffe', { kaffe: 'Annet' })).toBe('annet')
    expect(getShoppingCategoryForCustomItem('Kaffe', {})).toBe('torrvarer')
    expect(getShoppingCategoryForCustomItem('Ukjent vare', {})).toBe('annet')
    expect(getShoppingCategoryForCustomItem('', {})).toBe('annet')
  })
})

describe('quantities', () => {
  it('scales and rounds to three decimals', () => {
    expect(scaleIngredientQuantity(2, 1.5)).toBe(3)
    expect(scaleIngredientQuantity('1', 1 / 3)).toBe(0.333)
    expect(scaleIngredientQuantity('x', 2)).toBe(0)
  })

  it('parses decimal comma input', () => {
    expect(parseQuantityValue('1,5')).toBe(1.5)
    expect(parseQuantityValue('2')).toBe(2)
    expect(parseQuantityValue('abc')).toBe(0)
  })
})
