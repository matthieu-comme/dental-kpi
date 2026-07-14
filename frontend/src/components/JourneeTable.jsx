import { useState, useEffect, useRef } from 'react'
import Pagination from './Pagination'
import { formatApiErrors } from '../utils/apiErrors'

import { API_BASE } from '../utils/api'

const INIT_FILTERS = {
  praticienId: '',
  dateFrom: '',
  dateTo: '',
}

function minToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function buildEditForm(item) {
  const arrivalMin = 9 * 60
  return {
    date_jour: item.date_jour,
    nb_patients_vus: String(item.nb_patients_vus),
    nb_rdv_manques_connus: String(item.nb_rdv_manques_connus),
    nb_rdv_manques_nouveaux: String(item.nb_rdv_manques_nouveaux),
    heure_arrivee: '09:00',
    heure_depart: minToTime(arrivalMin + item.temps_presence_minutes),
    temps_perdu_minutes: String(item.temps_perdu_minutes),
  }
}

export default function JourneeTable({ token, isSecretary, praticiensMap }) {
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
    if (f.praticienId) params.set('id_praticien', f.praticienId)
    if (f.dateFrom) params.set('date_from', f.dateFrom)
    if (f.dateTo) params.set('date_to', f.dateTo)
    params.set('skip', (pageRef.current - 1) * pageSizeRef.current)
    params.set('limit', pageSizeRef.current)
    try {
      const res = await fetch(`${API_BASE}/api/v1/journees/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setData(await res.json())
        setTotal(parseInt(res.headers.get('x-total-count') ?? '0', 10))
      } else setFetchError('Impossible de charger les journées.')
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
    setEditForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')

    // Validation locale : temps_perdu <= temps_presence
    const presence = timeToMin(editForm.heure_depart) - timeToMin(editForm.heure_arrivee)
    if (presence <= 0) {
      setEditError("L'heure de départ doit être après l'heure d'arrivée.")
      setEditLoading(false)
      return
    }
    const perdu = parseInt(editForm.temps_perdu_minutes, 10)
    if (!isNaN(perdu) && perdu > presence) {
      setEditError(`Le temps perdu (${perdu} min) ne peut pas dépasser le temps de présence (${presence} min).`)
      setEditLoading(false)
      return
    }

    const payload = {
      date_jour: editForm.date_jour,
      nb_patients_vus: parseInt(editForm.nb_patients_vus, 10),
      nb_rdv_manques_connus: parseInt(editForm.nb_rdv_manques_connus, 10),
      nb_rdv_manques_nouveaux: parseInt(editForm.nb_rdv_manques_nouveaux, 10),
      temps_presence_minutes: presence,
      temps_perdu_minutes: perdu,
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/journees/${editItem.id_journee}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        setEditError(formatApiErrors(result.detail))
      } else {
        setEditItem(null)
        setFeedback({ type: 'success', message: `Journée #${result.id_journee} modifiée.` })
        load()
      }
    } catch {
      setEditError('Erreur réseau.')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer la journée du ${item.date_jour} ?\nCette action est irréversible.`)) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/journees/${item.id_journee}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setFeedback({ type: 'success', message: `Journée du ${item.date_jour} supprimée.` })
        load()
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
          <label>Date — du</label>
          <input type="date" name="dateFrom" value={filters.dateFrom} onChange={onFilterChange} />
        </div>
        <div className="filter-item">
          <label>au</label>
          <input type="date" name="dateTo" value={filters.dateTo} onChange={onFilterChange} />
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
                  <th>Date</th>
                  {isSecretary && <th>Praticien</th>}
                  <th>Patients</th>
                  <th>Nvx</th>
                  <th>RDV connus</th>
                  <th>RDV nvx</th>
                  <th>Présence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="table-empty">Aucun résultat</td>
                  </tr>
                ) : data.map(j => (
                  <tr key={j.id_journee}>
                    <td>{j.date_jour.split('-').reverse().join('/')}</td>
                    {isSecretary && <td>{praticiensMap[j.id_praticien] ?? `#${j.id_praticien}`}</td>}
                    <td>{j.nb_patients_vus}</td>
                    <td>{j.nb_nouveaux_patients}</td>
                    <td>{j.nb_rdv_manques_connus}</td>
                    <td>{j.nb_rdv_manques_nouveaux}</td>
                    <td>{minToTime(j.temps_presence_minutes)}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-action btn-action--edit btn-action--icon" onClick={() => openEdit(j)} title="Modifier">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="btn-action btn-action--delete btn-action--icon" onClick={() => handleDelete(j)} title="Supprimer">
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
              <h3>Modifier la journée #{editItem.id_journee}</h3>
              <button className="modal-close" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} noValidate>
              {editError && <div className="alert alert--error">{editError}</div>}
              <div className="form-group">
                <label>Date *</label>
                <input type="date" name="date_jour" value={editForm.date_jour} onChange={onEditChange} required min="2020-01-02" />
              </div>
              <div className="form-group">
                <label>Patients vus *</label>
                <input type="number" name="nb_patients_vus" value={editForm.nb_patients_vus} onChange={onEditChange} required min="0" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Heure d'arrivée *</label>
                  <input type="time" name="heure_arrivee" value={editForm.heure_arrivee} onChange={onEditChange} required />
                </div>
                <div className="form-group">
                  <label>Heure de départ *</label>
                  <input type="time" name="heure_depart" value={editForm.heure_depart} onChange={onEditChange} required />
                </div>
              </div>
              {(() => {
                const diff = timeToMin(editForm.heure_depart) - timeToMin(editForm.heure_arrivee)
                if (diff <= 0) return <p className="time-hint time-hint--error">⚠ L'heure de départ doit être après l'heure d'arrivée</p>
                const h = Math.floor(diff / 60), m = diff % 60
                return <p className="time-hint">→ Temps de présence : {diff} min ({h}h{m > 0 ? String(m).padStart(2, '0') : '00'})</p>
              })()}
              <div className="form-row">
                <div className="form-group">
                  <label>RDV non-honorés connus *</label>
                  <input type="number" name="nb_rdv_manques_connus" value={editForm.nb_rdv_manques_connus} onChange={onEditChange} required min="0" />
                </div>
                <div className="form-group">
                  <label>RDV non-honorés nouveaux *</label>
                  <input type="number" name="nb_rdv_manques_nouveaux" value={editForm.nb_rdv_manques_nouveaux} onChange={onEditChange} required min="0" />
                </div>
              </div>
              <div className="form-group">
                <label>Temps perdu (min) *</label>
                <input type="number" name="temps_perdu_minutes" value={editForm.temps_perdu_minutes} onChange={onEditChange} required min="0" />
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
