import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

function decodeToken(token) {
  try {
    // JWT payload is the middle part, base64url encoded
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

function isTokenValid(token) {
  if (!token) return false
  const payload = decodeToken(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 > Date.now()
}

function resolveInitialView() {
  const secToken = localStorage.getItem('dental_sec_token')
  const pratToken = localStorage.getItem('dental_prat_token')
  const lastView = localStorage.getItem('dental_last_view')

  if (lastView === 'praticien' && isTokenValid(pratToken)) return 'praticien'
  if (isTokenValid(secToken)) return 'secretaire'
  if (isTokenValid(pratToken)) return 'praticien'
  return 'login'
}

export function AuthProvider({ children }) {
  const [secretaireToken, setSecretaireToken] = useState(() => {
    const t = localStorage.getItem('dental_sec_token')
    return isTokenValid(t) ? t : null
  })

  const [praticienToken, setPraticienToken] = useState(() => {
    const t = localStorage.getItem('dental_prat_token')
    return isTokenValid(t) ? t : null
  })

  const [view, setView] = useState(resolveInitialView)

  function loginSecretaire(token) {
    localStorage.setItem('dental_sec_token', token)
    localStorage.setItem('dental_last_view', 'secretaire')
    setSecretaireToken(token)
    setView('secretaire')
  }

  function loginPraticien(token) {
    localStorage.setItem('dental_prat_token', token)
    localStorage.setItem('dental_last_view', 'praticien')
    setPraticienToken(token)
    setView('praticien')
  }

  // Appelé depuis la page secrétaire pour basculer vers l'espace praticien
  function switchToPraticien(token) {
    localStorage.setItem('dental_prat_token', token)
    localStorage.setItem('dental_last_view', 'praticien')
    setPraticienToken(token)
    setView('praticien')
  }

  // Retour à la page secrétaire sans toucher au token secrétaire
  function backToSecretaire() {
    localStorage.setItem('dental_last_view', 'secretaire')
    setView('secretaire')
  }

  function logout() {
    localStorage.removeItem('dental_sec_token')
    localStorage.removeItem('dental_prat_token')
    localStorage.removeItem('dental_last_view')
    setSecretaireToken(null)
    setPraticienToken(null)
    setView('login')
  }

  useEffect(() => {
    const id = setInterval(() => {
      const active = view === 'praticien' ? praticienToken : secretaireToken
      if (!isTokenValid(active)) {
        localStorage.removeItem('dental_sec_token')
        localStorage.removeItem('dental_prat_token')
        localStorage.removeItem('dental_last_view')
        setSecretaireToken(null)
        setPraticienToken(null)
        setView('login')
      }
    }, 60_000)
    return () => clearInterval(id)
  }, [view, secretaireToken, praticienToken])

  const activeToken = view === 'praticien' ? praticienToken : secretaireToken
  const activeUser = activeToken ? decodeToken(activeToken) : null

  return (
    <AuthContext.Provider value={{
      view,
      secretaireToken,
      praticienToken,
      activeToken,
      activeUser,
      hasSecretaireSession: isTokenValid(secretaireToken),
      loginSecretaire,
      loginPraticien,
      switchToPraticien,
      backToSecretaire,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
