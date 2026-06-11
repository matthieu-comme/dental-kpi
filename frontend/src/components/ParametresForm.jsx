import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:8000'

const emptyState = {
  taux_horaire_cible: '',
  ca_mensuel_cible: '',
  delai_relance_jours: '',
  seuil_devis_sms: '',
  seuil_devis_assistante: '',
}

export default function ParametresForm({ token, idPraticien }) {
  const [form, setForm] = useState(emptyState)
  const [exists, setExists] = useState(null) // null=chargement, true=mode màj, false=mode création
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(false)

  // Chargement des paramètres existants au montage
  useEffect(() => {
    async function loadParams() {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/praticiens/${idPraticien}/parametres`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const data = await res.json()
          setForm({
            taux_horaire_cible: String(data.taux_horaire_cible),
            ca_mensuel_cible: String(data.ca_mensuel_cible),
            delai_relance_jours: String(data.delai_relance_jours),
            seuil_devis_sms: String(data.seuil_devis_sms),
            seuil_devis_assistante: String(data.seuil_devis_assistante),
          })
          setExists(true)
        } else {
          setExists(false)
        }
      } catch {
        setExists(false)
      }
    }
    loadParams()
  }, [token, idPraticien])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFeedback(null)

    const sms = parseFloat(form.seuil_devis_sms)
    const assistante = parseFloat(form.seuil_devis_assistante)
    if (!isNaN(sms) && !isNaN(assistante) && sms >= assistante) {
      setFeedback({
        type: 'error',
        message: `Le seuil SMS (${sms} €) doit être strictement inférieur au seuil assistante (${assistante} €).`,
      })
      return
    }

    setLoading(true)

    const payload = {
      taux_horaire_cible: parseFloat(form.taux_horaire_cible),
      ca_mensuel_cible: parseFloat(form.ca_mensuel_cible),
      delai_relance_jours: parseInt(form.delai_relance_jours, 10),
      seuil_devis_sms: parseFloat(form.seuil_devis_sms),
      seuil_devis_assistante: parseFloat(form.seuil_devis_assistante),
    }

    try {
      let res
      if (exists) {
        // Mise à jour via PUT
        res = await fetch(
          `${API_BASE}/api/v1/praticiens/${idPraticien}/parametres`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          }
        )
      } else {
        // Création via POST (id_praticien requis dans le body)
        res = await fetch(`${API_BASE}/api/v1/praticiens/parametres`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...payload, id_praticien: idPraticien }),
        })
      }

      const data = await res.json()

      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map(d => d.msg).join(', ')
          : data.detail
        setFeedback({ type: 'error', message: detail || 'Une erreur est survenue.' })
      } else {
        setFeedback({ type: 'success', message: 'Paramètres enregistrés avec succès.' })
        setExists(true)
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau. Vérifiez que le serveur est démarré.' })
    } finally {
      setLoading(false)
    }
  }

  if (exists === null) {
    return (
      <div className="form-card">
        <p className="text-muted">Chargement des paramètres...</p>
      </div>
    )
  }

  return (
    <div className="form-card">
      <h2>Paramètres praticien</h2>

      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="p-taux">Taux horaire cible (€/h) *</label>
            <input
              id="p-taux"
              type="number"
              name="taux_horaire_cible"
              value={form.taux_horaire_cible}
              onChange={handleChange}
              required
              min="0.01"
              step="0.01"
              placeholder="150"
            />
          </div>

          <div className="form-group">
            <label htmlFor="p-ca">CA mensuel cible (€) *</label>
            <input
              id="p-ca"
              type="number"
              name="ca_mensuel_cible"
              value={form.ca_mensuel_cible}
              onChange={handleChange}
              required
              min="0.01"
              step="0.01"
              placeholder="20000"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="p-delai">Délai de relance (jours) *</label>
            <input
              id="p-delai"
              type="number"
              name="delai_relance_jours"
              value={form.delai_relance_jours}
              onChange={handleChange}
              required
              min="1"
              placeholder="15"
            />
          </div>

          <div className="form-group">
            <label htmlFor="p-sms">Seuil devis SMS (€) *</label>
            <input
              id="p-sms"
              type="number"
              name="seuil_devis_sms"
              value={form.seuil_devis_sms}
              onChange={handleChange}
              required
              min="0.01"
              step="0.01"
              placeholder="500"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="p-assistante">Seuil devis assistante (€) *</label>
          <input
            id="p-assistante"
            type="number"
            name="seuil_devis_assistante"
            value={form.seuil_devis_assistante}
            onChange={handleChange}
            required
            min="0.01"
            step="0.01"
            placeholder="1500"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Enregistrement...' : exists ? 'Mettre à jour' : 'Créer les paramètres'}
        </button>
      </form>
    </div>
  )
}
