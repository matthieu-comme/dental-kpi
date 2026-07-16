import { useState, useEffect, useRef } from 'react'
import Pagination from './Pagination'
import { formatApiErrors } from '../utils/apiErrors'

import { API_BASE } from '../utils/api'

const INIT_FILTERS = {
  patientId: '',
  praticienId: '',
  statuts: ['EN_ATTENTE', 'A_DEPOSER', 'DEPOSE'],
  dateFrom: '',
  dateTo: '',
  montantMin: '',
  montantMax: '',
}

const STATUT_PILLS = [
  { value: 'EN_ATTENTE', label: 'En attente', cls: 'attente'   },
  { value: 'A_DEPOSER',  label: 'À déposer',  cls: 'a-deposer' },
  { value: 'DEPOSE',     label: 'Encaissés',  cls: 'encaisse'  },
]

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function getChequeStatut(c) {
  if (c.statut === 'DEPOSE') return { label: 'Encaissé', cls: 'encaisse' }
  const today = new Date().toISOString().split('T')[0]
  if (c.date_depot_prevue && c.date_depot_prevue <= today) {
    return { label: 'À déposer', cls: 'a-deposer' }
  }
  return { label: 'En attente', cls: 'attente' }
}

function StatutBadge({ cheque }) {
  const { label, cls } = getChequeStatut(cheque)
  return <span className={`badge badge--${cls}`}>{label}</span>
}

function buildEditForm(item) {
  const today = new Date().toISOString().split('T')[0]
  let statut = item.statut
  if (item.statut === 'EN_ATTENTE' && item.date_depot_prevue && item.date_depot_prevue <= today) {
    statut = 'A_DEPOSER'
  }
  return {
    id_patient: item.id_patient,
    montant: String(item.montant),
    date_reception: item.date_reception,
    date_depot_prevue: item.date_depot_prevue ?? '',
    statut,
  }
}

export default function ChequeTable({ token, isSecretary, praticiensMap, onMutate, focusPatientId, refreshKey = 0 }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [filters, setFilters] = useState(INIT_FILTERS)
  const [feedback, setFeedback] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)

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
    const wantAttente  = f.statuts.includes('EN_ATTENTE')
    const wantADeposer = f.statuts.includes('A_DEPOSER')
    const wantDepose   = f.statuts.includes('DEPOSE')
    if (wantDepose) params.append('statut', 'DEPOSE')
    if (wantAttente && wantADeposer) {
      params.append('statut', 'EN_ATTENTE')
    } else if (wantAttente) {
      params.append('statut', 'EN_ATTENTE')
      params.set('depot_echu', 'false')
    } else if (wantADeposer) {
      params.append('statut', 'EN_ATTENTE')
      params.set('depot_echu', 'true')
    }
    if (f.dateFrom) params.set('date_from', f.dateFrom)
    if (f.dateTo) params.set('date_to', f.dateTo)
    if (f.montantMin) params.set('montant_min', f.montantMin)
    if (f.montantMax) params.set('montant_max', f.montantMax)
    params.set('skip', (pageRef.current - 1) * pageSizeRef.current)
    params.set('limit', pageSizeRef.current)
    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setData(await res.json())
        setTotal(parseInt(res.headers.get('x-total-count') ?? '0', 10))
      } else setFetchError('Impossible de charger les chèques.')
    } catch {
      setFetchError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [token, filters, page, pageSize, refreshKey])

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
    setEditForm(prev => ({ ...prev, [name]: name === 'id_patient' ? value.replace(/\D/g, '') : value }))
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')

    const payload = {
      id_patient: editForm.id_patient,
      montant: parseFloat(editForm.montant),
      date_reception: editForm.date_reception,
      statut: editForm.statut === 'A_DEPOSER' ? 'EN_ATTENTE' : editForm.statut,
    }
    if (editForm.statut === 'A_DEPOSER') {
      payload.date_depot_prevue = editForm.date_reception
    } else if (editForm.date_depot_prevue) {
      payload.date_depot_prevue = editForm.date_depot_prevue
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/${editItem.id_cheque}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        setEditError(formatApiErrors(result.detail))
      } else {
        setEditItem(null)
        setFeedback({ type: 'success', message: `Chèque #${result.id_cheque} modifié.` })
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
    if (!window.confirm(`Supprimer le chèque #${item.id_cheque} du patient « ${item.id_patient} » ?\nCette action est irréversible.`)) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/${item.id_cheque}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setFeedback({ type: 'success', message: `Chèque #${item.id_cheque} supprimé.` })
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

  const colSpan = isSecretary ? 7 : 6

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
        <div className="filter-item filter-item--pills">
          <label>Statut</label>
          <div className="statut-pills">
            {STATUT_PILLS.map(p => {
              const active = filters.statuts.includes(p.value)
              return (
                <button
                  key={p.value}
                  className={`statut-pill${active ? ` statut-pill--${p.cls}` : ''}`}
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      statuts: active
                        ? prev.statuts.filter(s => s !== p.value)
                        : [...prev.statuts, p.value],
                    }))
                    setPage(1)
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="filter-item">
          <label>Date réception — du</label>
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
                  <th>Date réception</th>
                  <th>Date dépôt prévue</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="table-empty">Aucun résultat</td>
                  </tr>
                ) : data.map(c => (
                  <tr key={c.id_cheque}>
                    <td>{c.id_patient}</td>
                    {isSecretary && <td>{praticiensMap[c.id_praticien] ?? `#${c.id_praticien}`}</td>}
                    <td>{c.montant.toFixed(2)} €</td>
                    <td>{fmtDate(c.date_reception)}</td>
                    <td>{fmtDate(c.date_depot_prevue)}</td>
                    <td><StatutBadge cheque={c} /></td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-action btn-action--edit btn-action--icon" onClick={() => openEdit(c)} title="Modifier">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="btn-action btn-action--delete btn-action--icon" onClick={() => handleDelete(c)} title="Supprimer">
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

      {editItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditItem(null) }}>
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Modifier le chèque #{editItem.id_cheque}</h3>
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
                  <label>Statut *</label>
                  <select name="statut" value={editForm.statut} onChange={onEditChange} required>
                    <option value="EN_ATTENTE">En attente</option>
                    <option value="A_DEPOSER">À déposer</option>
                    <option value="DEPOSE">Encaissé</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date de réception *</label>
                  <input type="date" name="date_reception" value={editForm.date_reception} onChange={onEditChange} required min="2020-01-02" />
                </div>
                {editForm.statut === 'EN_ATTENTE' && (
                  <div className="form-group">
                    <label>Date de dépôt prévue</label>
                    <input type="date" name="date_depot_prevue" value={editForm.date_depot_prevue} onChange={onEditChange} min={editForm.date_reception || '2020-01-02'} />
                  </div>
                )}
              </div>
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
