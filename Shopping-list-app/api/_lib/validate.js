const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTEGER_ID_PATTERN = /^\d+$/

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value)

// Accepts a positive integer, or a string holding one (ids from the URL are strings).
export const isIntegerId = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0
  }
  return typeof value === 'string' && INTEGER_ID_PATTERN.test(value) && Number(value) > 0
}

export const isIntegerIdList = (values) =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every(isIntegerId) &&
  new Set(values.map(String)).size === values.length

// true when the value is absent or a string (fields that may be left out of a payload).
export const isOptionalString = (value) =>
  value === undefined || value === null || typeof value === 'string'

export const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
