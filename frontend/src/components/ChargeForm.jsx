import { useState } from 'react'

import { API_BASE } from '../utils/api'
import { formatApiErrors } from '../utils/apiErrors'

const initialState = {
  designation: '',
  montant: '',
  periodicite: 'MENSUEL',
  date_debut: '',
  date_fin: '',
  lissage_mensuel: true,
}

export default function ChargeForm({ token, idPraticien, onSuccess, embedded = false }) {
  const [form, setForm] = useState(initialState)
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    const payload = {
      designation: form.designation,
      montant: parseFloat(form.montant),
      periodicite: form.periodicite,
      date_debut: form.date_debut,
      lissage_mensuel: form.lissage_mensuel,
      id_praticien: idPraticien,
    }

    // date_fin ignorée si ponctuel (le backend la force à null)
    if (form.periodicite !== 'PONCTUEL' && form.date_fin) {
      payload.date_fin = form.date_fin
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/charges/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setFeedback({ type: 'error', message: formatApiErrors(data.detail) })
      } else {
        setFeedback({ type: 'success', message: `Charge "${data.designation}" enregistrée avec succès.` })
        setForm(initialState)
        if (onSuccess) onSuccess()
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau. Vérifiez que le serveur est démarré.' })
    } finally {
      setLoading(false)
    }
  }

  const formContent = (
    <>
      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="ch-designation">Désignation *</label>
          <input
            id="ch-designation"
            type="text"
            name="designation"
            value={form.designation}
            onChange={handleChange}
            required
            placeholder="Loyer, assurance, matériel..."
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ch-montant">Montant (€) *</label>
            <input
              id="ch-montant"
              type="number"
              name="montant"
              value={form.montant}
              onChange={handleChange}
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label htmlFor="ch-periodicite">Périodicité *</label>
            <select
              id="ch-periodicite"
              name="periodicite"
              value={form.periodicite}
              onChange={handleChange}
              required
            >
              <option value="PONCTUEL">Ponctuel</option>
              <option value="MENSUEL">Mensuel</option>
              <option value="TRIMESTRIEL">Trimestriel</option>
              <option value="ANNUEL">Annuel</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ch-date_debut">Date de début *</label>
            <input
              id="ch-date_debut"
              type="date"
              name="date_debut"
              value={form.date_debut}
              onChange={handleChange}
              required
              min="2020-01-01"
            />
          </div>

          {form.periodicite !== 'PONCTUEL' && (
            <div className="form-group">
              <label htmlFor="ch-date_fin">Date de fin</label>
              <input
                id="ch-date_fin"
                type="date"
                name="date_fin"
                value={form.date_fin}
                onChange={handleChange}
                min={form.date_debut || '2020-01-02'}
              />
            </div>
          )}
        </div>

        <div className="form-group form-group--checkbox">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="lissage_mensuel"
              checked={form.lissage_mensuel}
              onChange={handleChange}
            />
            <span>Lissage mensuel</span>
          </label>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Envoi en cours...' : 'Ajouter la charge'}
        </button>
      </form>
    </>
  )

  if (embedded) return formContent

  return (
    <div className="form-card">
      <h2>Ajouter une charge</h2>
      {formContent}
    </div>
  )
}
