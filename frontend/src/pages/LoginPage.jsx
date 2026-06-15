import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

const API_BASE = 'http://localhost:8000'

async function fetchToken(username, password) {
  const body = new URLSearchParams({ username, password })
  const res = await fetch(`${API_BASE}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Identifiants incorrects.')
  return data.access_token
}

export default function LoginPage() {
  const { loginSecretaire, loginPraticien } = useAuth()
  const [mode, setMode] = useState('secretaire')
  const [nomCabinet, setNomCabinet] = useState('')

  const [secPassword, setSecPassword] = useState('')
  const [secError, setSecError] = useState('')
  const [secLoading, setSecLoading] = useState(false)

  const [praticiens, setPraticiens] = useState([])
  const [pratId, setPratId] = useState('')
  const [pratPin, setPratPin] = useState('')
  const [pratError, setPratError] = useState('')
  const [pratLoading, setPratLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/systeme/config`)
      .then(r => r.json())
      .then(data => { if (data.nom_cabinet) setNomCabinet(data.nom_cabinet) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (mode !== 'praticien') return
    fetch(`${API_BASE}/api/v1/praticiens/`)
      .then(r => r.json())
      .then(data => {
        const actifs = Array.isArray(data) ? data.filter(p => p.est_actif) : []
        setPraticiens(actifs)
        if (actifs.length > 0) setPratId(String(actifs[0].id_praticien))
      })
      .catch(() => {})
  }, [mode])

  async function handleSecLogin(e) {
    e.preventDefault()
    setSecLoading(true)
    setSecError('')
    try {
      const token = await fetchToken('secretaire', secPassword)
      loginSecretaire(token)
    } catch (err) {
      setSecError(err.message)
    } finally {
      setSecLoading(false)
    }
  }

  async function handlePratLogin(e) {
    e.preventDefault()
    setPratLoading(true)
    setPratError('')
    try {
      const token = await fetchToken(pratId, pratPin)
      loginPraticien(token)
    } catch (err) {
      setPratError(err.message)
    } finally {
      setPratLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Dental KPI</h1>
          <p>{nomCabinet || 'Tableau de bord cabinet dentaire'}</p>
        </div>

        <div className="login-tabs">
          <button
            className={`tab-btn ${mode === 'secretaire' ? 'tab-btn--active' : ''}`}
            onClick={() => setMode('secretaire')}
          >
            Secrétaire
          </button>
          <button
            className={`tab-btn ${mode === 'praticien' ? 'tab-btn--active' : ''}`}
            onClick={() => setMode('praticien')}
          >
            Praticien
          </button>
        </div>

        {mode === 'secretaire' && (
          <form onSubmit={handleSecLogin} className="login-form" noValidate>
            {secError && <div className="alert alert--error">{secError}</div>}
            <div className="form-group">
              <label htmlFor="sec-password">Mot de passe</label>
              <input
                id="sec-password"
                type="password"
                value={secPassword}
                onChange={e => setSecPassword(e.target.value)}
                required
                autoFocus
                placeholder=""
              />
            </div>
            <button type="submit" className="btn-primary btn-full" disabled={secLoading}>
              {secLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        )}

        {mode === 'praticien' && (
          <form onSubmit={handlePratLogin} className="login-form" noValidate>
            {pratError && <div className="alert alert--error">{pratError}</div>}
            <div className="form-group">
              <label htmlFor="prat-id">Praticien</label>
              <select
                id="prat-id"
                value={pratId}
                onChange={e => setPratId(e.target.value)}
                required
                autoFocus
                disabled={praticiens.length === 0}
              >
                {praticiens.length === 0 && (
                  <option value="">Chargement...</option>
                )}
                {praticiens.map(p => (
                  <option key={p.id_praticien} value={String(p.id_praticien)}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="prat-pin">PIN (6 chiffres)</label>
              <input
                id="prat-pin"
                type="password"
                value={pratPin}
                onChange={e => setPratPin(e.target.value)}
                required
                maxLength={6}
                placeholder="••••••"
              />
            </div>
            <button type="submit" className="btn-primary btn-full" disabled={pratLoading}>
              {pratLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
