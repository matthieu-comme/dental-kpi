import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch, API_BASE } from '../utils/api'

const REFRESH_MS = 60 * 1000

function fmtE(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export default function NotificationBell({ token, refreshKey }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
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

  const total = data?.total ?? 0

  return (
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
                      <div className="notif-bell__item-main">
                        <span className="notif-bell__patient">{d.id_patient}</span>
                        <span className="notif-bell__amount">{fmtE(d.montant)}</span>
                      </div>
                      <div className="notif-bell__item-sub">
                        {d.praticien} · {d.jours_attente}j d'attente
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
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
