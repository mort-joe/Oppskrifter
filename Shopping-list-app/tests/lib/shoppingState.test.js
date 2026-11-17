import { describe, expect, it } from 'vitest'
import {
  buildShoppingState,
  filterRecordByAllowedKeys,
  normalizeMenuPlan,
  normalizeNonNegativeNumberRecord,
  normalizePositiveNumberRecord,
} from '../../src/lib/shoppingState'
import { normalizeDefaultPeopleValue } from '../../src/lib/settings'

describe('record normalization', () => {
  it('keeps only positive numbers', () => {
    expect(normalizePositiveNumberRecord({ a: '2', b: 0, c: 'x', d: -1 })).toEqual({ a: 2 })
    expect(normalizePositiveNumberRecord(null)).toEqual({})
  })

  it('clamps to non-negative numbers', () => {
    expect(normalizeNonNegativeNumberRecord({ a: '2', b: -3, c: 'x' })).toEqual({ a: 2, b: 0, c: 0 })
  })

  it('filters by allowed keys', () => {
    expect(filterRecordByAllowedKeys({ a: 1, b: 2 }, new Set(['b']))).toEqual({ b: 2 })
  })

  it('normalizes menu plans', () => {
    expect(normalizeMenuPlan(null, 2)).toEqual([{ recipeId: null }, { recipeId: null }])
    expect(normalizeMenuPlan([{ recipeId: '5' }, {}, null])).toEqual([{ recipeId: 5 }, { recipeId: null }, { recipeId: null }])
  })

  it('normalizes the default number of people', () => {
    expect(normalizeDefaultPeopleValue('6')).toBe(6)
    expect(normalizeDefaultPeopleValue(0)).toBe(4)
    expect(normalizeDefaultPeopleValue('')).toBe(4)
    expect(normalizeDefaultPeopleValue(-2)).toBe(1)
  })
})

describe('buildShoppingState', () => {
  it('mirrors defaultPeople into userSettings', () => {
    expect(
      buildShoppingState({
        shoppingListRecipeCounts: { 1: 2 },
        customShoppingItems: { Kaffe: 1 },
        ingredientHaveCounts: {},
        checkedIngredients: ['Melk__dl'],
        menuDays: 3,
        menuServings: 4,
        menuPlan: [{ recipeId: 1 }],
        menuCreated: true,
        defaultPeople: 6,
      }),
    ).toEqual({
      shoppingListRecipeCounts: { 1: 2 },
      customShoppingItems: { Kaffe: 1 },
      ingredientHaveCounts: {},
      checkedIngredients: ['Melk__dl'],
      menuDays: 3,
      menuServings: 4,
      menuPlan: [{ recipeId: 1 }],
      menuCreated: true,
      defaultPeople: 6,
      userSettings: { defaultPeople: 6 },
    })
  })
})
