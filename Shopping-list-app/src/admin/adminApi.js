const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const safeFetch = async (url, options) => {
  try {
    return await fetch(url, options)
  } catch {
    throw new Error(`Kunne ikke kontakte Admin-API. Start "npx vercel dev" og åpne siden på ${window.location.origin}/admin.`)
  }
}

const parseJson = async (response) => {
  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Admin-API finnes ikke i vanlig Vite-dev. Start med "vercel dev" for å teste innlogging lokalt.')
    }

    const plainTextError = text?.trim()
    throw new Error(data?.error || plainTextError || `API-feil (${response.status}).`)
  }

  return data
}

export const adminLogin = async (username, password) => {
  const response = await safeFetch('/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
  })

  return parseJson(response)
}

export const listUsers = async (token) => {
  const response = await safeFetch('/api/admin/users', {
    method: 'GET',
    headers: jsonHeaders(token),
  })

  return parseJson(response)
}

export const createUser = async (token, payload) => {
  const response = await safeFetch('/api/admin/users', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJson(response)
}

export const updateUser = async (token, userId, payload) => {
  const response = await safeFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJson(response)
}

export const deleteUser = async (token, userId) => {
  const response = await safeFetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  })

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.error || 'Kunne ikke slette brukeren.')
  }
}

export const fetchDashboard = async (token) => {
  const response = await safeFetch('/api/admin/dashboard', {
    method: 'GET',
    headers: jsonHeaders(token),
  })

  return parseJson(response)
}

export const listShoppingCategories = async (token) => {
  const response = await safeFetch('/api/admin/shopping-categories', {
    method: 'GET',
    headers: jsonHeaders(token),
  })

  return parseJson(response)
}

export const createShoppingCategory = async (token, payload) => {
  const response = await safeFetch('/api/admin/shopping-categories', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJson(response)
}

export const updateShoppingCategory = async (token, categoryId, payload) => {
  const response = await safeFetch(`/api/admin/shopping-categories/${categoryId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJson(response)
}

export const reorderShoppingCategories = async (token, orderedIds) => {
  const response = await safeFetch('/api/admin/shopping-categories/reorder', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ orderedIds }),
  })

  return parseJson(response)
}
