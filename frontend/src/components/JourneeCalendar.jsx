import { useState, useEffect } from 'react'
import { API_BASE } from '../utils/api'

function fmtMinutes(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

function fmtDateLong(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtMontant(m) {
  return (m ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const DEVIS_STATUT_LABELS = {
  EN_ATTENTE: 'En attente',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
}

const CHEQUE_STATUT_LABELS = {
  EN_ATTENTE: 'En attente',
  DEPOSE: 'Encaissé',
}

export default function JourneeCalendar({ token, isSecretary, praticiensMap }) {
  const [data, setData] = useState([])
  const [devisData, setDevisData] = useState([])
  const [chequesData, setChequesData] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [currentDate, setCurrentDate] = useState(new Date())
  const [praticienId, setPraticienId] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    if (isSecretary && praticienId === '') {
      const firstId = Object.keys(praticiensMap)[0]
      if (firstId) setPraticienId(firstId)
    }
  }, [praticiensMap])

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

  useEffect(() => { load() }, [token, currentDate, praticienId])

  const prevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const selectedDevis = selectedDay ? devisData.filter(d => d.date_emission === selectedDay) : []
  const selectedCheques = selectedDay ? chequesData.filter(c => c.date_reception === selectedDay) : []

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
          onClick={() => hasActivity && setSelectedDay(dateStr)}
          title={hasActivity ? 'Cliquer pour voir le détail' : undefined}
        >
          <span className="cal-cell__day">{day}</span>
          {hasActivity && (
            <div className="cal-cell__stats">
              {dayData && (
                <>
                  <span className="cal-stat cal-stat--patients">{dayData.nb_patients_vus} patients</span>
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

      {selectedDay && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelectedDay(null) }}>
          <div className="modal-card modal-card--wide modal-card--day-detail">
            <div className="modal-header">
              <h3 style={{ textTransform: 'capitalize' }}>{fmtDateLong(selectedDay)}</h3>
              <button className="modal-close" onClick={() => setSelectedDay(null)}>×</button>
            </div>

            <div className="modal-day-detail">
              <div className="modal-subsection">
                <h4 className="modal-subsection__title">Devis ({selectedDevis.length})</h4>
                {selectedDevis.length === 0 ? (
                  <p className="text-muted">Aucun devis.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Montant</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDevis.map(d => (
                          <tr key={d.id_devis}>
                            <td>{d.id_patient}</td>
                            <td>{fmtMontant(d.montant)}</td>
                            <td>{DEVIS_STATUT_LABELS[d.statut] ?? d.statut}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="modal-subsection">
                <h4 className="modal-subsection__title">Chèques ({selectedCheques.length})</h4>
                {selectedCheques.length === 0 ? (
                  <p className="text-muted">Aucun chèque.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Montant</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCheques.map(c => (
                          <tr key={c.id_cheque}>
                            <td>{c.id_patient}</td>
                            <td>{fmtMontant(c.montant)}</td>
                            <td>{CHEQUE_STATUT_LABELS[c.statut] ?? c.statut}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setSelectedDay(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
