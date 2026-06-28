import { useState, useEffect, useRef } from 'react'
import Pagination from './Pagination'
import { formatApiErrors } from '../utils/apiErrors'

import { API_BASE } from '../utils/api'

const INIT_FILTERS = {
  patientId: '',
  praticienId: '',
  statut: '',
  dateFrom: '',
  dateTo: '',
  montantMin: '',
  montantMax: '',
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const STATUT_ICONS = {
  ACCEPTE:    { symbol: '✓', cls: 'accepte', title: 'Accepté' },
  EN_ATTENTE: { symbol: '?', cls: 'attente', title: 'En attente' },
  REFUSE:     { symbol: '✕', cls: 'refuse',  title: 'Refusé' },
}

function StatutIcon({ statut, motifRefus }) {
  const { symbol, cls, title } = STATUT_ICONS[statut] ?? { symbol: statut, cls: '', title: statut }
  const icon = (
    <span
      className={`statut-icon statut-icon--${cls}${statut === 'REFUSE' && motifRefus ? ' badge--has-tooltip' : ''}`}
      title={motifRefus ? undefined : title}
    >
      {symbol}
    </span>
  )
  if (statut === 'REFUSE' && motifRefus) {
    return (
      <span className="tooltip-wrap">
        {icon}
        <span className="tooltip-box">{motifRefus}</span>
      </span>
    )
  }
  return icon
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

export default function DevisTable({ token, isSecretary, praticiensMap, onMutate, focusPatientId }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [filters, setFilters] = useState(INIT_FILTERS)
  const [feedback, setFeedback] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)

  // État de la modale d'édition
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const pageRef = useRef(page)
  pageRef.current = page
  const pageSizeRef = useRef(pageSize)
  pageSizeRef.current = pageSize

  useEffect(() => {
    if (!focusPatientId) return
    setFilters(prev => ({ ...prev, patientId: focusPatientId }))
    setPage(1)
  }, [focusPatientId])

  async function load() {
    const f = filtersRef.current
    setLoading(true)
    setFetchError('')
    const params = new URLSearchParams()
    if (f.patientId) params.set('id_patient', f.patientId)
    if (f.praticienId) params.set('id_praticien', f.praticienId)
    if (f.statut) params.set('statut', f.statut)
    if (f.dateFrom) params.set('date_from', f.dateFrom)
    if (f.dateTo) params.set('date_to', f.dateTo)
    if (f.montantMin) params.set('montant_min', f.montantMin)
    if (f.montantMax) params.set('montant_max', f.montantMax)
    params.set('skip', (pageRef.current - 1) * pageSizeRef.current)
    params.set('limit', pageSizeRef.current)
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setData(await res.json())
        setTotal(parseInt(res.headers.get('x-total-count') ?? '0', 10))
      } else setFetchError('Impossible de charger les devis.')
    } catch {
      setFetchError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [token, filters, page, pageSize])

  function onFilterChange(e) {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
    setPage(1)
  }

  function openEdit(item) {
    setEditItem(item)
    setEditForm(buildEditForm(item))
    setEditError('')
  }

  function onEditChange(e) {
    const { name, value } = e.target
    setEditForm(prev => {
      const next = { ...prev, [name]: name === 'id_patient' ? value.replace(/\D/g, '') : value }
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
    payload.date_decision = editForm.statut === 'EN_ATTENTE'
      ? null
      : (editForm.date_decision || null)
    if (editForm.statut === 'REFUSE') payload.motif_refus = editForm.motif_refus

    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/${editItem.id_devis}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        setEditError(formatApiErrors(result.detail))
      } else {
        setEditItem(null)
        setFeedback({ type: 'success', message: `Devis #${result.id_devis} modifié.` })
        load()
        onMutate?.()
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
        load()
        onMutate?.()
      } else {
        const d = await res.json()
        setFeedback({ type: 'error', message: d.detail || 'Erreur lors de la suppression.' })
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau.' })
    }
  }

  const colSpan = isSecretary ? 8 : 7

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
        <button className="btn-ghost-sm" onClick={() => { setFilters(INIT_FILTERS); setPage(1) }}>
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
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="table-empty">Aucun résultat</td>
                  </tr>
                ) : data.map(d => (
                  <tr key={d.id_devis}>
                    <td>{d.id_patient}</td>
                    {isSecretary && <td>{praticiensMap[d.id_praticien] ?? `#${d.id_praticien}`}</td>}
                    <td>{d.montant.toFixed(2)} €</td>
                    <td>{d.temps_previsionnel_minutes}</td>
                    <td>{fmtDate(d.date_emission)}</td>
                    <td>{fmtDate(d.date_decision)}</td>
                    <td><StatutIcon statut={d.statut} motifRefus={d.motif_refus} /></td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-action btn-action--edit btn-action--icon" onClick={() => openEdit(d)} title="Modifier">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="btn-action btn-action--delete btn-action--icon" onClick={() => handleDelete(d)} title="Supprimer">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
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
                <input type="text" inputMode="numeric" name="id_patient" value={editForm.id_patient} onChange={onEditChange} required />
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
