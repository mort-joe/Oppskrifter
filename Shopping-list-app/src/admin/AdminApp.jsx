import { useEffect, useMemo, useState } from 'react'
import './AdminApp.css'
import { adminLogin, createUser, deleteUser, listUsers, updateUser } from './adminApi'

const ADMIN_TOKEN_KEY = 'admin_session_token'

const getStoredToken = () => window.localStorage.getItem(ADMIN_TOKEN_KEY) || ''

const formatDate = (value) => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('no-NO')
}

function AdminApp() {
  const [token, setToken] = useState(getStoredToken)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [activeMenu, setActiveMenu] = useState('brukeradministrering')

  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')

  const [passwordDrafts, setPasswordDrafts] = useState({})
  const [roleDrafts, setRoleDrafts] = useState({})

  const isLoggedIn = Boolean(token)

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => (a.email || '').localeCompare(b.email || '', 'no', { sensitivity: 'base' })),
    [users],
  )

  const dashboardSummary = useMemo(() => {
    const totalUsers = users.length
    const adminUsers = users.filter((user) => user.role === 'admin').length
    const normalUsers = totalUsers - adminUsers

    return { totalUsers, adminUsers, normalUsers }
  }, [users])

  const loadUsers = async () => {
    if (!token) return

    setLoading(true)
    setError('')
    try {
      const result = await listUsers(token)
      setUsers(result.users || [])
      const roleMap = {}
      ;(result.users || []).forEach((user) => {
        roleMap[user.id] = user.role || 'user'
      })
      setRoleDrafts(roleMap)
    } catch (loadError) {
      setError(loadError.message)
      if (loadError.message === 'Unauthorized') {
        handleLogOut()
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      void loadUsers()
    }
  }, [token])

  const handleLogIn = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await adminLogin(loginUsername.trim(), loginPassword)
      const nextToken = result.token
      window.localStorage.setItem(ADMIN_TOKEN_KEY, nextToken)
      setToken(nextToken)
      setLoginPassword('')
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogOut = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    setToken('')
    setUsers([])
    setPasswordDrafts({})
    setRoleDrafts({})
  }

  const handleCreateUser = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await createUser(token, {
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      setNewEmail('')
      setNewPassword('')
      setNewRole('user')
      await loadUsers()
    } catch (createError) {
      setError(createError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEnsureTestUser = async () => {
    setLoading(true)
    setError('')

    try {
      const existing = users.find((user) => (user.email || '').toLowerCase() === 'morten@jorgensen.nu')
      if (existing) {
        await updateUser(token, existing.id, { password: 'Oppskrifter2026!' })
      } else {
        await createUser(token, {
          email: 'morten@jorgensen.nu',
          password: 'Oppskrifter2026!',
          role: 'user',
        })
      }

      await loadUsers()
    } catch (testError) {
      setError(testError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveUser = async (user) => {
    const password = (passwordDrafts[user.id] || '').trim()
    const role = roleDrafts[user.id] || user.role || 'user'

    if (!password && role === user.role) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {}
      if (password) payload.password = password
      if (role !== user.role) payload.role = role
      await updateUser(token, user.id, payload)
      setPasswordDrafts((current) => ({ ...current, [user.id]: '' }))
      await loadUsers()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (user) => {
    const confirmed = window.confirm(`Slette brukeren ${user.email}?`)
    if (!confirmed) return

    setLoading(true)
    setError('')

    try {
      await deleteUser(token, user.id)
      await loadUsers()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isLoggedIn) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <h1>Admin innlogging</h1>
          <p>Denne siden brukes kun av administrator.</p>
          <form onSubmit={handleLogIn} className="admin-form">
            <label>
              Brukernavn
              <input
                type="text"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                required
              />
            </label>
            <label>
              Passord
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </label>
            {error && <p className="admin-error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'Logger inn...' : 'Logg inn'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <h1>Adminportal</h1>
        <div className="admin-header-actions">
          <button type="button" onClick={loadUsers} disabled={loading}>Oppdater liste</button>
          <button type="button" onClick={handleLogOut}>Logg ut</button>
        </div>
      </header>

      {error && <p className="admin-error">{error}</p>}

      <nav className="admin-menu-tabs" aria-label="Admin meny">
        <button
          type="button"
          className={activeMenu === 'brukeradministrering' ? 'active' : ''}
          onClick={() => setActiveMenu('brukeradministrering')}
        >
          Brukeradministrering
        </button>
        <button
          type="button"
          className={activeMenu === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveMenu('dashboard')}
        >
          Dashboard
        </button>
      </nav>

      {activeMenu === 'brukeradministrering' && (
        <section className="admin-card">
          <h2>Brukeradministrering</h2>
          <form onSubmit={handleCreateUser} className="admin-create-form">
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="Brukernavn (epost)"
              required
            />
            <input
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Passord"
              required
            />
            <select value={newRole} onChange={(event) => setNewRole(event.target.value)}>
              <option value="user">Bruker</option>
              <option value="admin">Administrator</option>
            </select>
            <button type="submit" disabled={loading}>Opprett konto</button>
            <button type="button" onClick={handleEnsureTestUser} disabled={loading}>Lag/oppdater testbruker</button>
          </form>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Brukernavn</th>
                  <th>Rolle</th>
                  <th>Opprettet</th>
                  <th>Sist innlogget</th>
                  <th>Nytt passord</th>
                  <th>Handlinger</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>
                      <select
                        value={roleDrafts[user.id] || user.role || 'user'}
                        onChange={(event) =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="user">Bruker</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>{formatDate(user.last_sign_in_at)}</td>
                    <td>
                      <input
                        type="text"
                        value={passwordDrafts[user.id] || ''}
                        onChange={(event) =>
                          setPasswordDrafts((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                        placeholder="Nytt passord"
                      />
                    </td>
                    <td className="admin-actions-cell">
                      <button type="button" onClick={() => handleSaveUser(user)} disabled={loading}>Lagre</button>
                      <button type="button" onClick={() => handleDeleteUser(user)} disabled={loading}>Slett</button>
                    </td>
                  </tr>
                ))}
                {sortedUsers.length === 0 && (
                  <tr>
                    <td colSpan={6}>Ingen brukere funnet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeMenu === 'dashboard' && (
        <section className="admin-card">
          <h2>Dashboard</h2>
          <div className="dashboard-kpis">
            <article>
              <h3>Totalt antall kontoer</h3>
              <strong>{dashboardSummary.totalUsers}</strong>
            </article>
            <article>
              <h3>Administratorer</h3>
              <strong>{dashboardSummary.adminUsers}</strong>
            </article>
            <article>
              <h3>Vanlige brukere</h3>
              <strong>{dashboardSummary.normalUsers}</strong>
            </article>
          </div>
          <p>Detaljert dashboard kommer i del 2.</p>
        </section>
      )}
    </main>
  )
}

export default AdminApp
