import React, { useEffect, useMemo, useState } from 'react'
import './AdminApp.css'
import {
  adminLogin,
  createShoppingCategory,
  createUser,
  deleteUser,
  fetchDashboard,
  listIngredients,
  listShoppingCategories,
  listUsers,
  mergeDuplicateIngredients,
  reorderShoppingCategories,
  updateIngredientCategory,
  updateShoppingCategory,
  updateUser,
} from './adminApi'

const ADMIN_TOKEN_KEY = 'admin_session_token'

const getStoredToken = () => window.localStorage.getItem(ADMIN_TOKEN_KEY) || ''

const formatDate = (value, includeTime = true) => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return includeTime ? parsed.toLocaleString('no-NO') : parsed.toLocaleDateString('no-NO')
}

function AdminApp() {
  const [token, setToken] = useState(getStoredToken)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [activeMenu, setActiveMenu] = useState('brukeradministrering')
  const [dashboardDetailPage, setDashboardDetailPage] = useState('all-recipes')
  const [dashboardUsers, setDashboardUsers] = useState([])
  const [dashboardRecipes, setDashboardRecipes] = useState([])
  const [shoppingCategories, setShoppingCategories] = useState([])
  const [categoryNameDrafts, setCategoryNameDrafts] = useState({})
  const [newCategoryName, setNewCategoryName] = useState('')
  const [ingredients, setIngredients] = useState([])
  const [ingredientCategoryDrafts, setIngredientCategoryDrafts] = useState({})
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [duplicateGroups, setDuplicateGroups] = useState([])
  const [showDuplicateCheckResults, setShowDuplicateCheckResults] = useState(false)
  const [duplicateKeepByGroup, setDuplicateKeepByGroup] = useState({})

  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [newUsername, setNewUsername] = useState('')

  const [passwordDrafts, setPasswordDrafts] = useState({})
  const [roleDrafts, setRoleDrafts] = useState({})
  const [emailDrafts, setEmailDrafts] = useState({})
  const [displayNameDrafts, setDisplayNameDrafts] = useState({})
  const [openUserActionsId, setOpenUserActionsId] = useState(null)

  const isLoggedIn = Boolean(token)

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const roleA = a.role === 'admin' ? 0 : 1
        const roleB = b.role === 'admin' ? 0 : 1
        if (roleA !== roleB) {
          return roleA - roleB
        }

        return (a.email || '').localeCompare(b.email || '', 'no', { sensitivity: 'base' })
      }),
    [users],
  )

  const dashboardSummary = useMemo(() => {
    const totalUsers = dashboardUsers.length
    const adminUsers = dashboardUsers.filter((user) => user.role === 'admin').length
    const normalUsers = totalUsers - adminUsers

    return { totalUsers, adminUsers, normalUsers }
  }, [dashboardUsers])

  const sortedDashboardUsers = useMemo(
    () =>
      [...dashboardUsers].sort((a, b) => {
        const roleA = a.role === 'admin' ? 0 : 1
        const roleB = b.role === 'admin' ? 0 : 1

        if (roleA !== roleB) {
          return roleA - roleB
        }

        return (a.email || '').localeCompare(b.email || '', 'no', { sensitivity: 'base' })
      }),
    [dashboardUsers],
  )

  const shoppingCategoryNames = useMemo(() => {
    const names = shoppingCategories
      .map((category) => String(category?.name || '').trim())
      .filter(Boolean)

    return [...new Set(names)]
  }, [shoppingCategories])

  const filteredIngredients = useMemo(() => {
    const normalizedSearch = ingredientSearch.trim().toLowerCase()
    const sortedIngredients = [...ingredients].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'no', { sensitivity: 'base' }),
    )

    if (!normalizedSearch) {
      return sortedIngredients
    }

    return sortedIngredients.filter((ingredient) =>
      String(ingredient.name || '').toLowerCase().includes(normalizedSearch),
    )
  }, [ingredientSearch, ingredients])

  const loadDashboard = async () => {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      const [dashboardResult, categoryResult] = await Promise.all([
        fetchDashboard(token),
        listShoppingCategories(token),
      ])

      setDashboardUsers(dashboardResult.users || [])
      setDashboardRecipes(dashboardResult.recipes || [])
      const categories = categoryResult.categories || []
      setShoppingCategories(categories)

      const draftMap = {}
      categories.forEach((category) => {
        draftMap[category.id] = category.name
      })
      setCategoryNameDrafts(draftMap)
    } catch (dashboardError) {
      setError(dashboardError.message)
    } finally {
      setLoading(false)
    }
  }

  const loadIngredientData = async () => {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      const result = await listIngredients(token)
      const nextIngredients = result.ingredients || []
      const nextDuplicateGroups = result.duplicateGroups || []
      const nextShoppingCategories = result.shoppingCategories || []

      setIngredients(nextIngredients)
      setDuplicateGroups(nextDuplicateGroups)

      if (nextShoppingCategories.length > 0) {
        setShoppingCategories(nextShoppingCategories)
      }

      const nextCategoryDrafts = {}
      nextIngredients.forEach((ingredient) => {
        nextCategoryDrafts[ingredient.id] = ingredient.shopping_category || 'annet'
      })
      setIngredientCategoryDrafts(nextCategoryDrafts)

      setDuplicateKeepByGroup((current) => {
        const next = {}
        nextDuplicateGroups.forEach((group) => {
          const ids = (group.ingredients || []).map((ingredient) => ingredient.id)
          if (!ids.length) return
          const previous = current[group.normalized_key]
          next[group.normalized_key] = ids.includes(previous) ? previous : ids[0]
        })
        return next
      })
    } catch (ingredientError) {
      setError(ingredientError.message)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    if (!token) return

    setLoading(true)
    setError('')
    try {
      const result = await listUsers(token)
      setUsers(result.users || [])
      const roleMap = {}
      const emailMap = {}
      ;(result.users || []).forEach((user) => {
        roleMap[user.id] = user.role || 'user'
        emailMap[user.id] = user.email || ''
      })
      setRoleDrafts(roleMap)
      setEmailDrafts(emailMap)
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

  useEffect(() => {
    if (token && activeMenu === 'dashboard') {
      void loadDashboard()
    }
  }, [token, activeMenu])

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
    setEmailDrafts({})
    setOpenUserActionsId(null)
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
        username: newUsername.trim(),
      })
      setNewEmail('')
      setNewPassword('')
      setNewRole('user')
      setNewUsername('')
      await loadUsers()
    } catch (createError) {
      setError(createError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveUser = async (user) => {
    if (user.is_config_admin) {
      return
    }

    const password = (passwordDrafts[user.id] || '').trim()
    const role = roleDrafts[user.id] || user.role || 'user'
    const email = (emailDrafts[user.id] || '').trim()
    const displayName = (displayNameDrafts[user.id] || '').trim()

    if (!password && role === user.role && email === user.email && displayName === user.display_name) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {}
      if (password) payload.password = password
      if (role !== user.role) payload.role = role
      if (email && email !== user.email) payload.email = email
      if (displayName !== user.display_name) payload.username = displayName
      await updateUser(token, user.id, payload)
      setPasswordDrafts((current) => ({ ...current, [user.id]: '' }))
      setOpenUserActionsId(null)
      await loadUsers()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (user) => {
    if (user.is_config_admin) {
      return
    }

    const confirmed = window.confirm(`Slette brukeren ${user.email}?`)
    if (!confirmed) return

    setLoading(true)
    setError('')

    try {
      await deleteUser(token, user.id)
      setOpenUserActionsId(null)
      await loadUsers()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCategory = async (event) => {
    event.preventDefault()

    const name = newCategoryName.trim()
    if (!name) {
      setError('Kategorinavn ma fylles ut.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await createShoppingCategory(token, { name })
      setNewCategoryName('')
      await loadDashboard()
    } catch (categoryError) {
      setError(categoryError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectMainMenu = (menuId) => {
    setActiveMenu(menuId)
    if (menuId === 'dashboard') {
      setDashboardDetailPage('all-recipes')
    }
  }

  const handleSaveCategoryName = async (categoryId) => {
    const name = String(categoryNameDrafts[categoryId] || '').trim()
    if (!name) {
      setError('Kategorinavn ma fylles ut.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await updateShoppingCategory(token, categoryId, { name })
      await loadDashboard()
    } catch (categoryError) {
      setError(categoryError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMoveCategory = async (categoryId, direction) => {
    const index = shoppingCategories.findIndex((category) => category.id === categoryId)
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= shoppingCategories.length) {
      return
    }

    const reordered = [...shoppingCategories]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    setLoading(true)
    setError('')
    try {
      const result = await reorderShoppingCategories(
        token,
        reordered.map((category) => category.id),
      )
      const categories = result.categories || []
      setShoppingCategories(categories)
      const draftMap = {}
      categories.forEach((category) => {
        draftMap[category.id] = category.name
      })
      setCategoryNameDrafts(draftMap)
    } catch (categoryError) {
      setError(categoryError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveIngredientCategory = async (ingredientId) => {
    const shoppingCategory = String(ingredientCategoryDrafts[ingredientId] || '').trim()
    if (!shoppingCategory) {
      setError('Velg en sorteringskategori for ingrediensen.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await updateIngredientCategory(token, ingredientId, { shopping_category: shoppingCategory })
      await loadIngredientData()
    } catch (ingredientError) {
      setError(ingredientError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRunDuplicateCheck = async () => {
    setShowDuplicateCheckResults(true)
    await loadIngredientData()
  }

  const handleMergeDuplicateGroup = async (group) => {
    const rows = group?.ingredients || []
    if (rows.length < 2) return

    const keepIngredientId = Number(duplicateKeepByGroup[group.normalized_key] || rows[0]?.id)
    const mergeIngredientIds = rows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id !== keepIngredientId)

    if (!mergeIngredientIds.length) {
      setError('Velg en ingrediens som skal beholdes før sammenslaing.')
      return
    }

    const confirmed = window.confirm(
      `Sla sammen ${mergeIngredientIds.length} duplikat(er) til valgt ingrediens? Dette kan ikke angres.`,
    )
    if (!confirmed) return

    setLoading(true)
    setError('')
    try {
      await mergeDuplicateIngredients(token, {
        keepIngredientId,
        mergeIngredientIds,
      })
      await loadIngredientData()
    } catch (ingredientError) {
      setError(ingredientError.message)
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
          onClick={() => handleSelectMainMenu('brukeradministrering')}
        >
          Brukeradministrering
        </button>
        <button
          type="button"
          className={activeMenu === 'dashboard' ? 'active' : ''}
          onClick={() => handleSelectMainMenu('dashboard')}
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
            <input
              type="text"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              placeholder="Visningsnavn"
            />
            <select value={newRole} onChange={(event) => setNewRole(event.target.value)}>
              <option value="user">Bruker</option>
              <option value="admin">Administrator</option>
            </select>
            <button type="submit" disabled={loading}>Opprett</button>
          </form>

          <div className="admin-table-wrap admin-users-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Brukernavn (epost)</th>
                  <th>Visningsnavn</th>
                  <th>Rolle</th>
                  <th>Opprettet</th>
                  <th>Sist inn</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
                  <React.Fragment key={user.id}>
                    <tr className={user.role === 'admin' ? 'admin-user-row' : ''}>
                      <td>
                        <span className="admin-user-email-display">{user.email}</span>
                        {user.role === 'admin' && <span className="admin-user-badge">Administrator</span>}
                      </td>
                      <td>
                        <span>{user.display_name || '-'}</span>
                      </td>
                      <td>
                        <select
                          value={roleDrafts[user.id] || user.role || 'user'}
                          disabled={Boolean(user.is_config_admin) || openUserActionsId === user.id}
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
                      <td>{formatDate(user.created_at, false)}</td>
                      <td>{formatDate(user.last_sign_in_at, false)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-more-btn"
                          onClick={() =>
                            setOpenUserActionsId((current) => (current === user.id ? null : user.id))
                          }
                          disabled={loading || Boolean(user.is_config_admin)}
                          aria-label={openUserActionsId === user.id ? 'Lukk handlinger' : 'Vis handlinger'}
                          title={openUserActionsId === user.id ? 'Lukk' : 'Rediger'}
                        >
                          {openUserActionsId === user.id ? '✕' : '⋯'}
                        </button>
                      </td>
                    </tr>

                    {openUserActionsId === user.id && !user.is_config_admin && (
                      <tr className="admin-user-edit-row">
                        <td colSpan={6}>
                          <div className="admin-user-edit-fields">
                            <div className="admin-edit-field">
                              <label>Epostadresse</label>
                              <input
                                type="email"
                                className="admin-user-email-input"
                                value={emailDrafts[user.id] ?? user.email ?? ''}
                                onChange={(event) =>
                                  setEmailDrafts((current) => ({
                                    ...current,
                                    [user.id]: event.target.value,
                                  }))
                                }
                                placeholder="Brukernavn (epost)"
                              />
                            </div>

                            <div className="admin-edit-field">
                              <label>Visningsnavn</label>
                              <input
                                type="text"
                                className="admin-user-email-input"
                                value={displayNameDrafts[user.id] ?? user.display_name ?? ''}
                                onChange={(event) =>
                                  setDisplayNameDrafts((current) => ({
                                    ...current,
                                    [user.id]: event.target.value,
                                  }))
                                }
                                placeholder="Visningsnavn"
                              />
                            </div>

                            <div className="admin-edit-field">
                              <label>Nytt passord</label>
                              <input
                                type="text"
                                value={passwordDrafts[user.id] || ''}
                                onChange={(event) =>
                                  setPasswordDrafts((current) => ({
                                    ...current,
                                    [user.id]: event.target.value,
                                  }))
                                }
                                placeholder="Nytt passord (hvis nødvendig)"
                              />
                            </div>

                            <div className="admin-edit-actions">
                              <button
                                type="button"
                                className="admin-inline-action-btn-compact"
                                onClick={() => handleSaveUser(user)}
                                disabled={loading}
                              >
                                Lagre
                              </button>
                              <button
                                type="button"
                                className="admin-inline-action-btn-compact danger"
                                onClick={() => handleDeleteUser(user)}
                                disabled={loading}
                              >
                                Slett
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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

          <div className="dashboard-grid">
            <article className="dashboard-panel">
              <h3>Kontooversikt</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Brukerkonto</th>
                      <th>Rolle</th>
                      <th>Matretter</th>
                      <th>Sist innlogget</th>
                      <th>Sist aktiv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDashboardUsers.map((user) => (
                      <tr key={`dashboard-user-${user.id}`} className={user.role === 'admin' ? 'admin-user-row' : ''}>
                        <td>
                          <span className="admin-user-email">{user.email}</span>
                          {user.role === 'admin' && <span className="admin-user-badge">Administrator</span>}
                        </td>
                        <td>{user.role === 'admin' ? 'Administrator' : 'Bruker'}</td>
                        <td>{user.recipe_count || 0}</td>
                        <td>{formatDate(user.last_sign_in_at)}</td>
                        <td>{formatDate(user.last_active_at)}</td>
                      </tr>
                    ))}
                    {sortedDashboardUsers.length === 0 && (
                      <tr>
                        <td colSpan={5}>Ingen kontoer funnet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <nav className="dashboard-submenu" aria-label="Dashboard undermeny">
              <button
                type="button"
                className={dashboardDetailPage === 'all-recipes' ? 'active' : ''}
                onClick={() => setDashboardDetailPage('all-recipes')}
              >
                Alle matretter
              </button>
              <button
                type="button"
                className={dashboardDetailPage === 'shopping-categories' ? 'active' : ''}
                onClick={() => setDashboardDetailPage('shopping-categories')}
              >
                Sorteringskategorier
              </button>
              <button
                type="button"
                className={dashboardDetailPage === 'ingredients-check' ? 'active' : ''}
                onClick={() => {
                  setDashboardDetailPage('ingredients-check')
                  void loadIngredientData()
                }}
              >
                Sjekk ingredienser
              </button>
            </nav>

            {dashboardDetailPage === 'all-recipes' && (
              <article className="dashboard-panel">
                <h3>Alle matretter i databasen</h3>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Matrett</th>
                        <th>Opprettet av</th>
                        <th>Opprettet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardRecipes.map((recipe) => (
                        <tr key={`dashboard-recipe-${recipe.id}`}>
                          <td>{recipe.name}</td>
                          <td>{recipe.owner_email}</td>
                          <td>{formatDate(recipe.created_at, false)}</td>
                        </tr>
                      ))}
                      {dashboardRecipes.length === 0 && (
                        <tr>
                          <td colSpan={3}>Ingen matretter funnet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            {dashboardDetailPage === 'shopping-categories' && (
              <article className="dashboard-panel">
                <h3>Sorteringskategorier for handleliste</h3>

                <form onSubmit={handleCreateCategory} className="category-create-form">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Legg til ny kategori"
                  />
                  <button type="submit" disabled={loading}>Legg til kategori</button>
                </form>

                <div className="category-list">
                  {shoppingCategories.map((category, index) => (
                    <div key={`category-${category.id}`} className="category-row">
                      <span className="category-index">{index + 1}</span>
                      <input
                        type="text"
                        value={categoryNameDrafts[category.id] ?? category.name}
                        onChange={(event) =>
                          setCategoryNameDrafts((current) => ({
                            ...current,
                            [category.id]: event.target.value,
                          }))
                        }
                      />
                      <button type="button" onClick={() => handleSaveCategoryName(category.id)} disabled={loading}>Lagre navn</button>
                      <button
                        type="button"
                        onClick={() => handleMoveCategory(category.id, 'up')}
                        disabled={loading || index === 0}
                        aria-label="Flytt kategori opp"
                        title="Flytt opp"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveCategory(category.id, 'down')}
                        disabled={loading || index === shoppingCategories.length - 1}
                        aria-label="Flytt kategori ned"
                        title="Flytt ned"
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                  {shoppingCategories.length === 0 && (
                    <p>Ingen sorteringskategorier funnet. Kjor SQL-oppsettet for dashboard-kategorier.</p>
                  )}
                </div>
              </article>
            )}

            {dashboardDetailPage === 'ingredients-check' && (
              <article className="dashboard-panel">
                <h3>Ingredienser i global database</h3>

                <div className="ingredients-toolbar">
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={(event) => setIngredientSearch(event.target.value)}
                    placeholder="Sok etter ingrediensnavn"
                  />
                  <button type="button" onClick={() => void loadIngredientData()} disabled={loading}>
                    Last pa nytt
                  </button>
                  <button type="button" onClick={() => void handleRunDuplicateCheck()} disabled={loading}>
                    Sjekk for duplikater
                  </button>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table ingredients-table">
                    <thead>
                      <tr>
                        <th>Ingrediens</th>
                        <th>Sorteringskategori</th>
                        <th>Brukt i</th>
                        <th>Lagre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIngredients.map((ingredient) => (
                        <tr key={`ingredient-${ingredient.id}`}>
                          <td>{ingredient.name}</td>
                          <td>
                            <select
                              value={ingredientCategoryDrafts[ingredient.id] ?? ingredient.shopping_category ?? 'annet'}
                              onChange={(event) =>
                                setIngredientCategoryDrafts((current) => ({
                                  ...current,
                                  [ingredient.id]: event.target.value,
                                }))
                              }
                            >
                              {shoppingCategoryNames.map((categoryName) => (
                                <option key={`ingredient-category-${categoryName}`} value={categoryName}>
                                  {categoryName}
                                </option>
                              ))}
                              {!shoppingCategoryNames.includes('annet') && (
                                <option value="annet">annet</option>
                              )}
                            </select>
                          </td>
                          <td>{ingredient.usage_count || 0}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => void handleSaveIngredientCategory(ingredient.id)}
                              disabled={loading}
                            >
                              Lagre
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredIngredients.length === 0 && (
                        <tr>
                          <td colSpan={4}>Ingen ingredienser funnet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {showDuplicateCheckResults && (
                  <section className="duplicate-groups-section">
                    <h4>Duplikatsok</h4>
                    {duplicateGroups.length === 0 ? (
                      <p>Ingen duplikater funnet.</p>
                    ) : (
                      <div className="duplicate-groups-list">
                        {duplicateGroups.map((group) => {
                          const rows = group.ingredients || []
                          const keepId = duplicateKeepByGroup[group.normalized_key] ?? rows[0]?.id
                          return (
                            <article key={`duplicate-group-${group.normalized_key}`} className="duplicate-group-card">
                              <div className="duplicate-group-header">
                                <strong>{rows[0]?.name || 'Duplikatgruppe'}</strong>
                                <span>{rows.length} treff</span>
                              </div>

                              <ul>
                                {rows.map((row) => (
                                  <li key={`duplicate-row-${row.id}`}>
                                    <label>
                                      <input
                                        type="radio"
                                        name={`keep-${group.normalized_key}`}
                                        checked={Number(keepId) === Number(row.id)}
                                        onChange={() =>
                                          setDuplicateKeepByGroup((current) => ({
                                            ...current,
                                            [group.normalized_key]: row.id,
                                          }))
                                        }
                                      />
                                      <span>{row.name}</span>
                                      <span className="duplicate-meta">kategori: {row.shopping_category || 'annet'} · brukt i {row.usage_count || 0}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>

                              <button
                                type="button"
                                onClick={() => void handleMergeDuplicateGroup(group)}
                                disabled={loading || rows.length < 2}
                              >
                                Sla sammen duplikater
                              </button>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )}
              </article>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

export default AdminApp
