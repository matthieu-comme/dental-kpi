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

const STATUT_LABELS = { EN_ATTENTE: 'En attente', DEPOSE: 'Déposé' }

function StatutBadge({ statut }) {
  return (
    <span className={`badge badge--${statut.toLowerCase()}`}>
      {STATUT_LABELS[statut] ?? statut}
    </span>
  )
}

function buildEditForm(item) {
  return {
    id_patient: item.id_patient,
    montant: String(item.montant),
    date_reception: item.date_reception,
    date_depot_prevue: item.date_depot_prevue ?? '',
    statut: item.statut,
  }
}

export default function ChequeTable({ token, isSecretary, praticiensMap, onMutate }) {
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
      statut: editForm.statut,
    }
    if (editForm.date_depot_prevue) payload.date_depot_prevue = editForm.date_depot_prevue

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
            <option value="DEPOSE">Déposé</option>
          </select>
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
                  <th>#</th>
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
                    <td>{c.id_cheque}</td>
                    <td>{c.id_patient}</td>
                    {isSecretary && <td>{praticiensMap[c.id_praticien] ?? `#${c.id_praticien}`}</td>}
                    <td>{c.montant.toFixed(2)} €</td>
                    <td>{c.date_reception}</td>
                    <td>{c.date_depot_prevue ?? '—'}</td>
                    <td><StatutBadge statut={c.statut} /></td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-action btn-action--edit" onClick={() => openEdit(c)}>
                          Modifier
                        </button>
                        <button className="btn-action btn-action--delete" onClick={() => handleDelete(c)}>
                          Supprimer
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
                    <option value="DEPOSE">Déposé</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date de réception *</label>
                  <input type="date" name="date_reception" value={editForm.date_reception} onChange={onEditChange} required min="2020-01-02" />
                </div>
                <div className="form-group">
                  <label>Date de dépôt prévue</label>
                  <input type="date" name="date_depot_prevue" value={editForm.date_depot_prevue} onChange={onEditChange} min={editForm.date_reception || '2020-01-02'} />
                </div>
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
