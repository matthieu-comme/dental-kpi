import { useState, useEffect } from 'react'
import { formatApiErrors } from '../utils/apiErrors'
import { API_BASE } from '../utils/api'

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
  return {
    date_jour: item.date_jour,
    nb_patients_vus: String(item.nb_patients_vus),
    nb_rdv_manques_connus: String(item.nb_rdv_manques_connus),
    nb_rdv_manques_nouveaux: String(item.nb_rdv_manques_nouveaux),
    temps_presence_time: minToTime(item.temps_presence_minutes),
    temps_perdu_minutes: String(item.temps_perdu_minutes),
  }
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function JourneeCalendar({ token, isSecretary, praticiensMap }) {
  const [data, setData] = useState([])
  const [devisData, setDevisData] = useState([])
  const [chequesData, setChequesData] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [feedback, setFeedback] = useState(null)

  const [currentDate, setCurrentDate] = useState(new Date())
  const [praticienId, setPraticienId] = useState('')

  useEffect(() => {
    if (isSecretary && praticienId === '') {
      const firstId = Object.keys(praticiensMap)[0]
      if (firstId) setPraticienId(firstId)
    }
  }, [praticiensMap])

  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')

    const year = currentDate.getFullYear()
    const month = String(currentDate.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(year, currentDate.getMonth() + 1, 0).getDate()
    const dateFrom = `${year}-${month}-01`
    const dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`

    const headers = { Authorization: `Bearer ${token}` }

    const pJournees = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, skip: 0, limit: 31 })
    if (praticienId) pJournees.set('id_praticien', praticienId)

    const pDevis = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, skip: 0, limit: 500 })
    if (praticienId) pDevis.set('id_praticien', praticienId)

    const pCheques = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, skip: 0, limit: 500 })
    if (praticienId) pCheques.set('id_praticien', praticienId)

    try {
      const [resJ, resD, resC] = await Promise.all([
        fetch(`${API_BASE}/api/v1/journees/?${pJournees}`, { headers }),
        fetch(`${API_BASE}/api/v1/devis/?${pDevis}`, { headers }),
        fetch(`${API_BASE}/api/v1/cheques/?${pCheques}`, { headers }),
      ])
      if (!resJ.ok) { setFetchError('Impossible de charger les journées.'); return }
      setData(await resJ.json())
      setDevisData(resD.ok ? await resD.json() : [])
      setChequesData(resC.ok ? await resC.json() : [])
    } catch {
      setFetchError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, currentDate, praticienId])

  const prevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

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

    const presence = timeToMin(editForm.temps_presence_time)
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

  const renderCalendarDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDayIndex = new Date(year, month, 1).getDay() || 7

    const cells = []

    for (let i = 1; i < firstDayIndex; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-cell cal-cell--empty" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayData = data.find(d => d.date_jour === dateStr)
      const rdvManques = dayData
        ? dayData.nb_rdv_manques_connus + dayData.nb_rdv_manques_nouveaux
        : 0
      const nbDevis = devisData.filter(d => d.date_emission === dateStr).length
      const nbCheques = chequesData.filter(c => c.date_reception === dateStr).length
      const hasActivity = dayData || nbDevis > 0 || nbCheques > 0

      cells.push(
        <div
          key={day}
          className={`cal-cell${dayData ? ' cal-cell--has-data' : hasActivity ? ' cal-cell--has-activity' : ''}`}
          onClick={() => dayData && openEdit(dayData)}
          title={dayData ? 'Cliquer pour modifier' : undefined}
        >
          <span className="cal-cell__day">{day}</span>
          {hasActivity && (
            <div className="cal-cell__stats">
              {dayData && (
                <>
                  <span className="cal-stat cal-stat--patients">{dayData.nb_patients_vus} pts</span>
                  {rdvManques > 0 && (
                    <span className="cal-stat cal-stat--rdv">{rdvManques} RDV</span>
                  )}
                  <span className="cal-stat cal-stat--time">{fmtMinutes(dayData.temps_presence_minutes)}</span>
                </>
              )}
              {nbDevis > 0 && (
                <span className="cal-stat cal-stat--devis">{nbDevis} devis</span>
              )}
              {nbCheques > 0 && (
                <span className="cal-stat cal-stat--cheque">{nbCheques} chèque{nbCheques > 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </div>
      )
    }
    return cells
  }

  return (
    <div className="data-section">
      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <div className="cal-header">
        {isSecretary && (
          <select
            className="cal-praticien-select"
            value={praticienId}
            onChange={e => setPraticienId(e.target.value)}
          >
            {Object.entries(praticiensMap).map(([id, nom]) => (
              <option key={id} value={id}>{nom}</option>
            ))}
          </select>
        )}

        <div className="cal-nav">
          <button className="btn-ghost-sm" onClick={prevMonth}>‹</button>
          <h2 className="cal-month-title">
            {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button className="btn-ghost-sm" onClick={nextMonth}>›</button>
        </div>
      </div>

      {loading && <p className="text-muted">Chargement...</p>}
      {fetchError && <div className="alert alert--error">{fetchError}</div>}

      {!loading && !fetchError && (
        <div className="cal-grid">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
            <div key={d} className="cal-weekday">{d}</div>
          ))}
          {renderCalendarDays()}
        </div>
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
                <input type="date" name="date_jour" value={editForm.date_jour} onChange={onEditChange} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Patients vus *</label>
                  <input type="number" name="nb_patients_vus" value={editForm.nb_patients_vus} onChange={onEditChange} required min="0" />
                </div>
                <div className="form-group">
                  <label>Temps de présence *</label>
                  <input type="time" name="temps_presence_time" value={editForm.temps_presence_time} onChange={onEditChange} required />
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
