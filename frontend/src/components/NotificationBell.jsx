import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch, API_BASE } from '../utils/api'

const REFRESH_MS = 60 * 1000

function fmtE(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA')
}

export default function NotificationBell({ token, refreshKey, onNavigate }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [actioning, setActioning] = useState(new Set())
  const [refusingDevis, setRefusingDevis] = useState(null)
  const [motifRefus, setMotifRefus] = useState('')
  const [motifError, setMotifError] = useState(false)
  const ref = useRef()

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
    } catch {}
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load, refreshKey])

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function startAction(key) {
    setActioning(prev => new Set([...prev, key]))
  }

  function endAction(key) {
    setActioning(prev => { const s = new Set(prev); s.delete(key); return s })
  }

  function openRefus(devis) {
    setRefusingDevis(devis)
    setMotifRefus('')
    setMotifError(false)
    setOpen(false)
  }

  function closeRefus() {
    setRefusingDevis(null)
    setMotifError(false)
  }

  async function refuserDevis() {
    if (!motifRefus.trim()) { setMotifError(true); return }
    const devis = refusingDevis
    const key = `d-${devis.id_devis}`
    closeRefus()
    startAction(key)
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/devis/${devis.id_devis}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statut: 'REFUSE', date_decision: todayISO(), motif_refus: motifRefus.trim() }),
      })
      if (res.ok) {
        setData(prev => ({
          ...prev,
          devis_relance: prev.devis_relance.filter(d => d.id_devis !== devis.id_devis),
          total: prev.total - 1,
        }))
      }
    } catch {} finally {
      endAction(key)
    }
  }

  async function accepterDevis(devis) {
    const key = `d-${devis.id_devis}`
    if (actioning.has(key)) return
    startAction(key)
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/devis/${devis.id_devis}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statut: 'ACCEPTE', date_decision: todayISO() }),
      })
      if (res.ok) {
        setData(prev => ({
          ...prev,
          devis_relance: prev.devis_relance.filter(d => d.id_devis !== devis.id_devis),
          total: prev.total - 1,
        }))
      }
    } catch {} finally {
      endAction(key)
    }
  }

  async function encaisserCheque(cheque) {
    const key = `c-${cheque.id_cheque}`
    if (actioning.has(key)) return
    startAction(key)
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/cheques/${cheque.id_cheque}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statut: 'DEPOSE' }),
      })
      if (res.ok) {
        setData(prev => ({
          ...prev,
          cheques_depot: prev.cheques_depot.filter(c => c.id_cheque !== cheque.id_cheque),
          total: prev.total - 1,
        }))
      }
    } catch {} finally {
      endAction(key)
    }
  }

  const total = data?.total ?? 0

  return (
    <>
      <div className="notif-bell" ref={ref}>
        <button
          className={`notif-bell__btn${open ? ' notif-bell__btn--active' : ''}`}
          onClick={() => setOpen(o => !o)}
          title="Notifications"
        >
          <span className="notif-bell__icon">🔔</span>
          {total > 0 && (
            <span className="notif-bell__badge">{total > 99 ? '99+' : total}</span>
          )}
        </button>

        {open && (
          <div className="notif-bell__dropdown">
            <div className="notif-bell__header">
              <span className="notif-bell__title">Notifications</span>
              <button className="notif-bell__refresh" onClick={load} title="Actualiser">↻</button>
            </div>

            {total === 0 ? (
              <div className="notif-bell__empty">Aucune action en attente</div>
            ) : (
              <>
                {data.devis_relance.length > 0 && (
                  <section className="notif-bell__section">
                    <div className="notif-bell__section-title notif-bell__section-title--devis">
                      Devis à relancer ({data.devis_relance.length})
                    </div>
                    {data.devis_relance.map(d => (
                      <div key={d.id_devis} className="notif-bell__item notif-bell__item--devis">
                        <button
                          className="notif-bell__item-body notif-bell__item--clickable"
                          onClick={() => { onNavigate?.('devis', d.id_patient); setOpen(false) }}
                        >
                          <div className="notif-bell__item-main">
                            <span className="notif-bell__patient">{d.id_patient}</span>
                            <span className="notif-bell__amount">{fmtE(d.montant)}</span>
                          </div>
                          <div className="notif-bell__item-sub">
                            {d.praticien} · {d.jours_attente}j d'attente
                          </div>
                        </button>
                        <div className="notif-bell__item-actions">
                          <button
                            className="notif-bell__action notif-bell__action--accept"
                            onClick={() => accepterDevis(d)}
                            disabled={actioning.has(`d-${d.id_devis}`)}
                            title="Accepter (date décision = aujourd'hui)"
                          >
                            {actioning.has(`d-${d.id_devis}`) ? '…' : '✓'}
                          </button>
                          <button
                            className="notif-bell__action notif-bell__action--refuse"
                            onClick={() => openRefus(d)}
                            disabled={actioning.has(`d-${d.id_devis}`)}
                            title="Refuser"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {data.cheques_depot.length > 0 && (
                  <section className="notif-bell__section">
                    <div className="notif-bell__section-title notif-bell__section-title--cheque">
                      Chèques à déposer ({data.cheques_depot.length})
                    </div>
                    {data.cheques_depot.map(c => (
                      <div key={c.id_cheque} className="notif-bell__item notif-bell__item--cheque">
                        <button
                          className="notif-bell__item-body notif-bell__item--clickable"
                          onClick={() => { onNavigate?.('cheques', c.id_patient); setOpen(false) }}
                        >
                          <div className="notif-bell__item-main">
                            <span className="notif-bell__patient">{c.id_patient}</span>
                            <span className="notif-bell__amount">{fmtE(c.montant)}</span>
                          </div>
                          <div className="notif-bell__item-sub">
                            {c.praticien} ·{' '}
                            {c.jours_retard === 0
                              ? "à déposer aujourd'hui"
                              : `${c.jours_retard}j de retard`}
                          </div>
                        </button>
                        <div className="notif-bell__item-actions">
                          <button
                            className="notif-bell__action notif-bell__action--accept"
                            onClick={() => encaisserCheque(c)}
                            disabled={actioning.has(`c-${c.id_cheque}`)}
                            title="Marquer comme encaissé"
                          >
                            {actioning.has(`c-${c.id_cheque}`) ? '…' : '✓'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {refusingDevis && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) closeRefus() }}
        >
          <div className="modal-card">
            <div className="modal-header">
              <h3>Refuser le devis — patient {refusingDevis.id_patient}</h3>
              <button className="modal-close" onClick={closeRefus}>×</button>
            </div>
            {motifError && (
              <div className="alert alert--error">Le motif de refus est obligatoire.</div>
            )}
            <div className="form-group">
              <label>Motif de refus *</label>
              <textarea
                rows={3}
                value={motifRefus}
                onChange={e => { setMotifRefus(e.target.value); setMotifError(false) }}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={closeRefus}>Annuler</button>
              <button className="btn-danger" onClick={refuserDevis}>Confirmer le refus</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
