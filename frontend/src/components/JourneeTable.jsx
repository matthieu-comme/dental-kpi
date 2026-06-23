import { useState, useEffect, useRef } from 'react'
import Pagination from './Pagination'

const API_BASE = 'http://localhost:8000'

const INIT_FILTERS = {
  praticienId: '',
  dateFrom: '',
  dateTo: '',
}

function buildEditForm(item) {
  return {
    date_jour: item.date_jour,
    nb_patients_vus: String(item.nb_patients_vus),
    nb_rdv_manques_connus: String(item.nb_rdv_manques_connus),
    nb_rdv_manques_nouveaux: String(item.nb_rdv_manques_nouveaux),
    temps_presence_minutes: String(item.temps_presence_minutes),
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
    const presence = parseInt(editForm.temps_presence_minutes, 10)
    const perdu = parseInt(editForm.temps_perdu_minutes, 10)
    if (perdu > presence) {
      setEditError('Le temps perdu ne peut pas dépasser le temps de présence.')
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
        setEditError(Array.isArray(result.detail)
          ? result.detail.map(d => d.msg).join(', ')
          : result.detail)
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

  const colSpan = isSecretary ? 9 : 8

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
                  <th>#</th>
                  <th>Date</th>
                  {isSecretary && <th>Praticien</th>}
                  <th>Patients vus</th>
                  <th>Nouveaux</th>
                  <th>RDV non-honorés connus</th>
                  <th>RDV non-honorés nouveaux</th>
                  <th>Présence (min)</th>
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
                    <td>{j.id_journee}</td>
                    <td>{j.date_jour}</td>
                    {isSecretary && <td>{praticiensMap[j.id_praticien] ?? `#${j.id_praticien}`}</td>}
                    <td>{j.nb_patients_vus}</td>
                    <td>{j.nb_nouveaux_patients}</td>
                    <td>{j.nb_rdv_manques_connus}</td>
                    <td>{j.nb_rdv_manques_nouveaux}</td>
                    <td>{j.temps_presence_minutes}</td>
                    <td>
                      <button className="btn-action btn-action--edit" onClick={() => openEdit(j)}>
                        Modifier
                      </button>
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
              <div className="form-row">
                <div className="form-group">
                  <label>Patients vus *</label>
                  <input type="number" name="nb_patients_vus" value={editForm.nb_patients_vus} onChange={onEditChange} required min="0" />
                </div>
                <div className="form-group">
                  <label>Temps de présence (min) *</label>
                  <input type="number" name="temps_presence_minutes" value={editForm.temps_presence_minutes} onChange={onEditChange} required min="1" />
                </div>
              </div>
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
