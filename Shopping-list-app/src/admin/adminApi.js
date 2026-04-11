const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const parseJson = async (response) => {
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(data?.error || 'Noe gikk galt.')
  }

  return data
}

export const adminLogin = async (username, password) => {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
  })

  return parseJson(response)
}

export const listUsers = async (token) => {
  const response = await fetch('/api/admin/users', {
    method: 'GET',
    headers: jsonHeaders(token),
  })

  return parseJson(response)
}

export const createUser = async (token, payload) => {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJson(response)
}

export const updateUser = async (token, userId, payload) => {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJson(response)
}

export const deleteUser = async (token, userId) => {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  })

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data?.error || 'Kunne ikke slette brukeren.')
  }
}
