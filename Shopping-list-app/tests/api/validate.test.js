import { describe, expect, it } from 'vitest'
import { isIntegerId, isIntegerIdList, isNonEmptyString, isOptionalString, isUuid } from '../../api/_lib/validate.js'

describe('validate helpers', () => {
  it('recognizes uuids', () => {
    expect(isUuid('6f1f4b1e-8c3a-4d2b-9a7e-1234567890ab')).toBe(true)
    expect(isUuid('6F1F4B1E-8C3A-4D2B-9A7E-1234567890AB')).toBe(true)
    expect(isUuid('__local_admin__')).toBe(false)
    expect(isUuid(123)).toBe(false)
  })

  it('recognizes integer ids from numbers and strings', () => {
    expect(isIntegerId(12)).toBe(true)
    expect(isIntegerId('12')).toBe(true)
    expect(isIntegerId('0')).toBe(false)
    expect(isIntegerId('-1')).toBe(false)
    expect(isIntegerId('1.5')).toBe(false)
    expect(isIntegerId('abc')).toBe(false)
    expect(isIntegerId(null)).toBe(false)
  })

  it('requires unique integer ids in lists', () => {
    expect(isIntegerIdList([1, 2, '3'])).toBe(true)
    expect(isIntegerIdList([1, 1])).toBe(false)
    expect(isIntegerIdList([1, '1'])).toBe(false)
    expect(isIntegerIdList([])).toBe(false)
    expect(isIntegerIdList('1')).toBe(false)
  })

  it('checks strings', () => {
    expect(isOptionalString(undefined)).toBe(true)
    expect(isOptionalString(null)).toBe(true)
    expect(isOptionalString('x')).toBe(true)
    expect(isOptionalString({})).toBe(false)
    expect(isNonEmptyString(' ')).toBe(false)
    expect(isNonEmptyString('a')).toBe(true)
  })
})
