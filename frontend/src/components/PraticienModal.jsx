import { useState, useEffect } from 'react'

import { API_BASE } from '../utils/api'

export default function PraticienModal({ onClose, onSuccess }) {
  const [praticiens, setPraticiens] = useState([])
  const [pratId, setPratId] = useState('')
  const [pratPin, setPratPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/praticiens/`)
      .then(r => r.json())
      .then(data => {
        const actifs = Array.isArray(data) ? data.filter(p => p.est_actif) : []
        setPraticiens(actifs)
        if (actifs.length > 0) setPratId(String(actifs[0].id_praticien))
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const body = new URLSearchParams({ username: pratId, password: pratPin })
      const res = await fetch(`${API_BASE}/api/v1/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Identifiants incorrects.')

      // Vérification que c'est bien un token praticien (pas le compte secrétaire)
      const payload = JSON.parse(atob(data.access_token.split('.')[1]))
      if (payload.role !== 'praticien') throw new Error('Identifiants invalides.')

      onSuccess(data.access_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fermeture en cliquant sur l'overlay
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-card">
        <div className="modal-header">
          <h3>Accès Praticien</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="alert alert--error">{error}</div>}

          <div className="form-group">
            <label htmlFor="modal-prat-id">Praticien</label>
            <select
              id="modal-prat-id"
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
            <label htmlFor="modal-prat-pin">PIN (6 chiffres)</label>
            <input
              id="modal-prat-pin"
              type="password"
              value={pratPin}
              onChange={e => setPratPin(e.target.value)}
              required
              maxLength={6}
              placeholder="••••••"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
