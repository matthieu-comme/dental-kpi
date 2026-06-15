import { useState, useEffect, useMemo } from 'react'

const API_BASE = 'http://localhost:8000'

const INIT_FILTERS = {
  patientId: '',
  praticienId: '',
  statut: '',
  dateFrom: '',
  dateTo: '',
  montantMin: '',
  montantMax: '',
}

const STATUT_LABELS = { EN_ATTENTE: 'En attente', ACCEPTE: 'Accepté', REFUSE: 'Refusé' }

function StatutBadge({ statut, motifRefus }) {
  const badge = (
    <span className={`badge badge--${statut.toLowerCase()}${statut === 'REFUSE' && motifRefus ? ' badge--has-tooltip' : ''}`}>
      {STATUT_LABELS[statut] ?? statut}
    </span>
  )

  if (statut === 'REFUSE' && motifRefus) {
    return (
      <span className="tooltip-wrap">
        {badge}
        <span className="tooltip-box">{motifRefus}</span>
      </span>
    )
  }

  return badge
}

function buildEditForm(item) {
  return {
    id_patient: item.id_patient,
    montant: String(item.montant),
    temps_previsionnel_minutes: String(item.temps_previsionnel_minutes),
    date_emission: item.date_emission,
    date_decision: item.date_decision ?? '',
    statut: item.statut,
    motif_refus: item.motif_refus ?? '',
  }
}

export default function DevisTable({ token, isSecretary, praticiensMap }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [filters, setFilters] = useState(INIT_FILTERS)
  const [feedback, setFeedback] = useState(null)

  // État de la modale d'édition
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
      else setFetchError('Impossible de charger les devis.')
    } catch {
      setFetchError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const filtered = useMemo(() => data.filter(d => {
    if (filters.patientId && !d.id_patient.toLowerCase().includes(filters.patientId.toLowerCase())) return false
    if (filters.praticienId && d.id_praticien !== parseInt(filters.praticienId)) return false
    if (filters.statut && d.statut !== filters.statut) return false
    if (filters.dateFrom && d.date_emission < filters.dateFrom) return false
    if (filters.dateTo && d.date_emission > filters.dateTo) return false
    if (filters.montantMin && d.montant < parseFloat(filters.montantMin)) return false
    if (filters.montantMax && d.montant > parseFloat(filters.montantMax)) return false
    return true
  }), [data, filters])

  function onFilterChange(e) {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  function openEdit(item) {
    setEditItem(item)
    setEditForm(buildEditForm(item))
    setEditError('')
  }

  function onEditChange(e) {
    const { name, value } = e.target
    setEditForm(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'statut' && value === 'EN_ATTENTE') next.date_decision = ''
      return next
    })
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')

    // Validation date_decision selon statut
    if (editForm.statut === 'EN_ATTENTE') {
      // date_decision doit être absente
    } else {
      if (!editForm.date_decision) {
        setEditError("La date de décision est requise pour un statut Accepté ou Refusé.")
        setEditLoading(false)
        return
      }
      if (editForm.date_decision < editForm.date_emission) {
        setEditError("La date de décision doit être supérieure ou égale à la date d'émission.")
        setEditLoading(false)
        return
      }
    }

    const payload = {
      id_patient: editForm.id_patient,
      montant: parseFloat(editForm.montant),
      temps_previsionnel_minutes: parseInt(editForm.temps_previsionnel_minutes, 10),
      date_emission: editForm.date_emission,
      statut: editForm.statut,
    }
    if (editForm.statut !== 'EN_ATTENTE' && editForm.date_decision) {
      payload.date_decision = editForm.date_decision
    }
    if (editForm.statut === 'REFUSE') payload.motif_refus = editForm.motif_refus

    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/${editItem.id_devis}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        setEditError(Array.isArray(result.detail)
          ? result.detail.map(d => d.msg).join(', ')
          : result.detail)
      } else {
        setEditItem(null)
        setFeedback({ type: 'success', message: `Devis #${result.id_devis} modifié.` })
        load()
      }
    } catch {
      setEditError('Erreur réseau.')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer le devis #${item.id_devis} du patient « ${item.id_patient} » ?\nCette action est irréversible.`)) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/${item.id_devis}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setFeedback({ type: 'success', message: `Devis #${item.id_devis} supprimé.` })
        setData(prev => prev.filter(d => d.id_devis !== item.id_devis))
      } else {
        const d = await res.json()
        setFeedback({ type: 'error', message: d.detail || 'Erreur lors de la suppression.' })
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau.' })
    }
  }

  const colSpan = isSecretary ? 9 : 8

  return (
    <div className="data-section">
      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <div className="filters-bar">
        <div className="filter-item">
          <label>N° dossier patient</label>
          <input type="text" name="patientId" value={filters.patientId} onChange={onFilterChange} placeholder="Rechercher…" />
        </div>
        {isSecretary && (
          <div className="filter-item">
            <label>Praticien</label>
            <select name="praticienId" value={filters.praticienId} onChange={onFilterChange}>
              <option value="">Tous</option>
              {Object.entries(praticiensMap).map(([id, nom]) => (
                <option key={id} value={id}>{nom}</option>
              ))}
            </select>
          </div>
        )}
        <div className="filter-item">
          <label>Statut</label>
          <select name="statut" value={filters.statut} onChange={onFilterChange}>
            <option value="">Tous</option>
            <option value="EN_ATTENTE">En attente</option>
            <option value="ACCEPTE">Accepté</option>
            <option value="REFUSE">Refusé</option>
          </select>
        </div>
        <div className="filter-item">
          <label>Date émission — du</label>
          <input type="date" name="dateFrom" value={filters.dateFrom} onChange={onFilterChange} />
        </div>
        <div className="filter-item">
          <label>au</label>
          <input type="date" name="dateTo" value={filters.dateTo} onChange={onFilterChange} />
        </div>
        <div className="filter-item">
          <label>Montant min (€)</label>
          <input type="number" name="montantMin" value={filters.montantMin} onChange={onFilterChange} min="0" step="0.01" placeholder="0" />
        </div>
        <div className="filter-item">
          <label>Montant max (€)</label>
          <input type="number" name="montantMax" value={filters.montantMax} onChange={onFilterChange} min="0" step="0.01" placeholder="∞" />
        </div>
        <button className="btn-ghost-sm" onClick={() => setFilters(INIT_FILTERS)}>
          Réinitialiser
        </button>
      </div>

      {loading && <p className="text-muted">Chargement...</p>}
      {fetchError && <div className="alert alert--error">{fetchError}</div>}

      {!loading && !fetchError && (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  {isSecretary && <th>Praticien</th>}
                  <th>Montant</th>
                  <th>Temps (min)</th>
                  <th>Date émission</th>
                  <th>Date décision</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="table-empty">Aucun résultat</td>
                  </tr>
                ) : filtered.map(d => (
                  <tr key={d.id_devis}>
                    <td>{d.id_devis}</td>
                    <td>{d.id_patient}</td>
                    {isSecretary && <td>{praticiensMap[d.id_praticien] ?? `#${d.id_praticien}`}</td>}
                    <td>{d.montant.toFixed(2)} €</td>
                    <td>{d.temps_previsionnel_minutes}</td>
                    <td>{d.date_emission}</td>
                    <td>{d.date_decision ?? '—'}</td>
                    <td><StatutBadge statut={d.statut} motifRefus={d.motif_refus} /></td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-action btn-action--edit" onClick={() => openEdit(d)}>
                          Modifier
                        </button>
                        <button className="btn-action btn-action--delete" onClick={() => handleDelete(d)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-count">{filtered.length} résultat(s)</p>
        </>
      )}

      {/* Modale d'édition */}
      {editItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditItem(null) }}>
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Modifier le devis #{editItem.id_devis}</h3>
              <button className="modal-close" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} noValidate>
              {editError && <div className="alert alert--error">{editError}</div>}
              <div className="form-group">
                <label>ID Patient *</label>
                <input type="text" name="id_patient" value={editForm.id_patient} onChange={onEditChange} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Montant (€) *</label>
                  <input type="number" name="montant" value={editForm.montant} onChange={onEditChange} required min="0.01" step="0.01" />
                </div>
                <div className="form-group">
                  <label>Temps prévisionnel (min) *</label>
                  <input type="number" name="temps_previsionnel_minutes" value={editForm.temps_previsionnel_minutes} onChange={onEditChange} required min="1" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date d'émission *</label>
                  <input type="date" name="date_emission" value={editForm.date_emission} onChange={onEditChange} required min="2020-01-02" />
                </div>
                <div className="form-group">
                  <label>
                    Date de décision
                    {editForm.statut !== 'EN_ATTENTE' && ' *'}
                  </label>
                  <input
                    type="date"
                    name="date_decision"
                    value={editForm.date_decision}
                    onChange={onEditChange}
                    min={editForm.date_emission || '2020-01-02'}
                    disabled={editForm.statut === 'EN_ATTENTE'}
                    required={editForm.statut !== 'EN_ATTENTE'}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Statut *</label>
                <select name="statut" value={editForm.statut} onChange={onEditChange} required>
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="ACCEPTE">Accepté</option>
                  <option value="REFUSE">Refusé</option>
                </select>
              </div>
              {editForm.statut === 'REFUSE' && (
                <div className="form-group">
                  <label>Motif de refus *</label>
                  <textarea name="motif_refus" value={editForm.motif_refus} onChange={onEditChange} required rows={2} />
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setEditItem(null)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={editLoading}>
                  {editLoading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
