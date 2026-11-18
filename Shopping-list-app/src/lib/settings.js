import { DEFAULT_ACCOUNT_PEOPLE, IMPORT_GROUPS_STORAGE_KEY } from './constants'

export const normalizeDefaultPeopleValue = (value) =>
  Math.max(1, Number(value) || DEFAULT_ACCOUNT_PEOPLE)

export const getInitialCollapsedImportGroups = () => {
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
