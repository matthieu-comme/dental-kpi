import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:8000'

const MOIS_NOMS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtE(n, decimals = 0) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: decimals,
  }).format(n)
}

function fmtPct(n) {
  return n == null ? '—' : `${n.toFixed(1)} %`
}

function fmtMin(min) {
  if (min == null || min === 0) return '0 h'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

// ── Status (color coding) ────────────────────────────────────────────────────
// reversed = lower is better

function st(value, { good, warn, reversed = false } = {}) {
  if (value == null || good == null) return 'neutral'
  if (reversed) {
    if (value <= good) return 'good'
    if (value <= warn) return 'warn'
    return 'bad'
  }
  if (value >= good) return 'good'
  if (value >= warn) return 'warn'
  return 'bad'
}

// ── Week helpers ─────────────────────────────────────────────────────────────

function getWeekBounds(offset) {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    debut: monday.toLocaleDateString('en-CA'),
    fin: sunday.toLocaleDateString('en-CA'),
  }
}

function fmtWeekLabel({ debut, fin }) {
  const [, , d1] = debut.split('-').map(Number)
  const [, m2, d2] = fin.split('-').map(Number)
  return `${d1} – ${d2} ${MOIS_NOMS[m2 - 1].slice(0, 3)}.`
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, hint, status = 'neutral' }) {
  return (
    <div className={`kpi-card kpi-card--${status}`}>
      <p className="kpi-card__title">{title}</p>
      <p className={`kpi-card__value kpi-value--${status}`}>{value}</p>
      {sub && <p className="kpi-card__sub">{sub}</p>}
      {hint && <p className="kpi-card__hint">{hint}</p>}
    </div>
  )
}

function KpiSection({ number, title, children }) {
  return (
    <section className="kpi-section">
      <h2 className="kpi-section__title">
        <span className="kpi-section__num">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function CaDeclare({ token, idPraticien, mois, annee, onDeclared, onCancel, initialValue = '' }) {
  const [montant, setMontant] = useState(initialValue !== '' ? String(initialValue) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const r1 = await fetch(`${API_BASE}/api/v1/performances/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const perfs = await r1.json()
      const existing = Array.isArray(perfs)
        ? perfs.find(p => p.mois === mois && p.annee === annee)
        : null

      const url = existing
        ? `${API_BASE}/api/v1/performances/${existing.id_perf}`
        : `${API_BASE}/api/v1/performances/`
      const method = existing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mois, annee, ca_declare: parseFloat(montant), id_praticien: idPraticien }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.detail || 'Erreur lors de la saisie.')
      } else {
        onDeclared()
      }
    } catch {
      setError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="kpi-ca-form" onSubmit={handleSubmit}>
      <input
        type="number"
        className="kpi-ca-input"
        value={montant}
        onChange={e => setMontant(e.target.value)}
        min="0"
        step="0.01"
        placeholder="CA du mois (€)"
        required
      />
      <button className="btn-primary kpi-ca-btn" type="submit" disabled={loading}>
        {loading ? '...' : 'Valider'}
      </button>
      {onCancel && (
        <button type="button" className="btn-ghost-sm" onClick={onCancel}>
          Annuler
        </button>
      )}
      {error && <span className="kpi-ca-error">{error}</span>}
    </form>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

const SALARY_RATES = [15, 16, 18, 19, 20]

export default function KpiView({ token, idPraticien }) {
  const now = new Date()
  const [mois, setMois] = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [weekOffset, setWeekOffset] = useState(0)
  const [seuil, setSeuil] = useState(0)
  const [salaireTaux, setSalaireTaux] = useState(18)
  const [refresh, setRefresh] = useState(0)
  const [editingCA, setEditingCA] = useState(false)

  const [data, setData] = useState(null)
  const [weekData, setWeekData] = useState(null)
  const [encours, setEncours] = useState(null)
  const [loading, setLoading] = useState(true)

  const weekBounds = getWeekBounds(weekOffset)
  const isCurrentMonth = mois === now.getMonth() + 1 && annee === now.getFullYear()

  // Monthly KPIs
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setEditingCA(false)
    fetch(`${API_BASE}/api/v1/kpis/mensuel?mois=${mois}&annee=${annee}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, mois, annee, refresh])

  // Weekly KPIs
  useEffect(() => {
    let cancelled = false
    fetch(
      `${API_BASE}/api/v1/kpis/hebdomadaire?date_debut=${weekBounds.debut}&date_fin=${weekBounds.fin}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(r => r.json())
      .then(d => { if (!cancelled) setWeekData(d) })
    return () => { cancelled = true }
  }, [token, weekBounds.debut, weekBounds.fin])

  // Encours
  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/v1/kpis/encours?seuil=${seuil}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (!cancelled) setEncours(d) })
    return () => { cancelled = true }
  }, [token, seuil])

  function prevMonth() {
    if (mois === 1) { setMois(12); setAnnee(a => a - 1) }
    else setMois(m => m - 1)
  }

  function nextMonth() {
    if (isCurrentMonth) return
    if (mois === 12) { setMois(1); setAnnee(a => a + 1) }
    else setMois(m => m + 1)
  }

  const d = data

  return (
    <div className="kpi-view">

      {/* ── Period bar + CA ── */}
      <div className="kpi-period-bar">
        <button className="kpi-nav-btn" onClick={prevMonth}>‹</button>
        <span className="kpi-period-label">{MOIS_NOMS[mois - 1]} {annee}</span>
        <button className="kpi-nav-btn" onClick={nextMonth} disabled={isCurrentMonth}>›</button>

        {!loading && d?.ca_declare != null && (
          <>
            <div className="kpi-period-bar__sep" />
            <span className="kpi-ca-declared__label">CA :</span>
            {editingCA ? (
              <CaDeclare
                token={token}
                idPraticien={idPraticien}
                mois={mois}
                annee={annee}
                initialValue={d.ca_declare}
                onDeclared={() => { setRefresh(r => r + 1); setEditingCA(false) }}
                onCancel={() => setEditingCA(false)}
              />
            ) : (
              <>
                <strong className="kpi-ca-declared__value">{fmtE(d.ca_declare)}</strong>
                <button className="btn-ghost-sm" onClick={() => setEditingCA(true)}>Modifier</button>
              </>
            )}
          </>
        )}
      </div>

      {loading && <p className="kpi-loading">Chargement des indicateurs…</p>}

      {/* Banner CA manquant */}
      {!loading && d?.ca_declare == null && (
        <div className="kpi-ca-banner">
          <div>
            <strong>CA non déclaré</strong> pour {MOIS_NOMS[mois - 1]} {annee} — les KPIs financiers
            ne peuvent pas être calculés.
          </div>
          <CaDeclare
            token={token}
            idPraticien={idPraticien}
            mois={mois}
            annee={annee}
            onDeclared={() => setRefresh(r => r + 1)}
          />
        </div>
      )}

      {!loading && (
        <>
          {/* ── 1. Performance Financière ── */}
          <KpiSection number="1" title="Performance Financière">
            <div className="kpi-grid">
              <KpiCard
                title="Taux horaire réel"
                value={d?.taux_horaire_reel != null ? `${fmtE(d.taux_horaire_reel)} / h` : '—'}
                sub={d?.taux_horaire_cible ? `Cible : ${fmtE(d.taux_horaire_cible)} / h` : undefined}
                status={st(d?.taux_horaire_reel, { good: d?.taux_horaire_cible, warn: d?.taux_horaire_cible * 0.8 })}
                hint={!d?.ca_declare ? 'CA non déclaré' : d?.temps_productif_minutes === 0 ? 'Aucune journée saisie' : undefined}
              />
              <KpiCard
                title="Écart taux horaire"
                value={d?.ecart_taux_horaire != null
                  ? `${d.ecart_taux_horaire >= 0 ? '+' : ''}${fmtE(d.ecart_taux_horaire)} / h`
                  : '—'}
                sub="Réel − Cible"
                status={d?.ecart_taux_horaire != null
                  ? (d.ecart_taux_horaire >= 0 ? 'good' : d.ecart_taux_horaire >= -20 ? 'warn' : 'bad')
                  : 'neutral'}
              />
              <KpiCard
                title="Montant moyen / devis"
                value={fmtE(d?.montant_moyen_devis)}
                sub={d?.nb_devis_emis ? `${d.nb_devis_emis} devis émis` : 'Aucun devis ce mois'}
                status="neutral"
              />
              <KpiCard
                title="CA déclaré"
                value={fmtE(d?.ca_declare)}
                sub={d?.ca_mensuel_cible ? `Objectif : ${fmtE(d.ca_mensuel_cible)}` : undefined}
                status={st(d?.taux_atteinte_ca, { good: 100, warn: 80 })}
                hint={d?.taux_atteinte_ca != null ? `${fmtPct(d.taux_atteinte_ca)} de l'objectif` : undefined}
              />
              <KpiCard
                title="Ratio charges"
                value={fmtPct(d?.ratio_charges)}
                sub={d?.charges_mensuelles != null ? `Charges : ${fmtE(d.charges_mensuelles)}` : undefined}
                status={st(d?.ratio_charges, { good: 40, warn: 60, reversed: true })}
                hint="Part du CA absorbée par les charges"
              />
            </div>

            {/* Salary estimator */}
            <div className="kpi-salary">
              <p className="kpi-salary__label">Estimation salaire (% du CA)</p>
              <div className="kpi-salary__row">
                <div className="kpi-salary__rates">
                  {SALARY_RATES.map(r => (
                    <button
                      key={r}
                      className={`kpi-salary__rate${salaireTaux === r ? ' kpi-salary__rate--active' : ''}`}
                      onClick={() => setSalaireTaux(r)}
                    >
                      {r} %
                    </button>
                  ))}
                </div>
                <span className="kpi-salary__result">
                  {d?.salaire_par_taux
                    ? fmtE(d.salaire_par_taux[salaireTaux])
                    : '—'}
                </span>
              </div>
              {d?.salaire_estime != null && (
                <p className="kpi-salary__sub">
                  Estimé (CA − charges) : <strong>{fmtE(d.salaire_estime)}</strong>
                </p>
              )}
            </div>
          </KpiSection>

          {/* ── 2. Optimisation Opérationnelle ── */}
          <KpiSection number="2" title="Optimisation Opérationnelle">
            <div className="kpi-grid kpi-grid--3">
              <KpiCard
                title="Temps productif (mois)"
                value={fmtMin(d?.temps_productif_minutes)}
                sub={d?.temps_presence_minutes ? `Présence : ${fmtMin(d.temps_presence_minutes)}` : undefined}
                hint={d?.nb_patients_vus ? `${d.nb_patients_vus} patients vus` : undefined}
                status="neutral"
              />
              <KpiCard
                title="Taux d'atteinte CA"
                value={fmtPct(d?.taux_atteinte_ca)}
                sub={d?.ca_declare != null && d?.ca_mensuel_cible
                  ? `${fmtE(d.ca_declare)} / ${fmtE(d.ca_mensuel_cible)}`
                  : undefined}
                status={st(d?.taux_atteinte_ca, { good: 100, warn: 80 })}
              />
              <KpiCard
                title="Temps perdu (absences)"
                value={fmtMin(d?.temps_perdu_minutes)}
                sub={d?.cout_absenteisme != null && d.cout_absenteisme > 0
                  ? `Coût estimé : ${fmtE(d.cout_absenteisme)}`
                  : 'Aucune perte ce mois'}
                status={st(d?.temps_perdu_minutes, { good: 0, warn: 120, reversed: true })}
              />
            </div>

            {/* Weekly zoom */}
            <div className="kpi-week-zoom">
              <div className="kpi-week-header">
                <span className="kpi-week-title">Zoom semaine</span>
                <div className="kpi-week-nav">
                  <button className="kpi-nav-btn kpi-nav-btn--sm" onClick={() => setWeekOffset(o => o - 1)}>‹</button>
                  <span className="kpi-week-label">{fmtWeekLabel(weekBounds)}</span>
                  <button className="kpi-nav-btn kpi-nav-btn--sm" onClick={() => setWeekOffset(o => o + 1)}>›</button>
                </div>
              </div>
              <div className="kpi-grid kpi-grid--3">
                <KpiCard
                  title="Taux d'occupation"
                  value={fmtPct(weekData?.taux_occupation)}
                  sub={weekData?.temps_productif_minutes != null
                    ? `${fmtMin(weekData.temps_productif_minutes)} productifs`
                    : undefined}
                  status={st(weekData?.taux_occupation, { good: 85, warn: 70 })}
                  hint="(Présence − pertes) / Présence"
                />
                <KpiCard
                  title="Volume perte de temps"
                  value={fmtMin(weekData?.temps_perdu_minutes)}
                  sub={weekData?.temps_presence_minutes
                    ? `Sur ${fmtMin(weekData.temps_presence_minutes)} présents`
                    : undefined}
                  status={st(weekData?.temps_perdu_minutes, { good: 0, warn: 60, reversed: true })}
                />
                <KpiCard
                  title="Ratio anticipation devis"
                  value={weekData?.ratio_anticipation != null
                    ? `× ${weekData.ratio_anticipation.toFixed(2)}`
                    : '—'}
                  sub={weekData?.montant_devis_semaine != null
                    ? `${fmtE(weekData.montant_devis_semaine)} émis`
                    : undefined}
                  status={st(weekData?.ratio_anticipation, { good: 0.5, warn: 0.25 })}
                  hint="Devis / (CA cible ÷ 4)"
                />
              </div>
            </div>
          </KpiSection>

          {/* ── 3. Gestion du Manque à Gagner ── */}
          <KpiSection number="3" title="Gestion du Manque à Gagner">
            <div className="kpi-grid">
              <KpiCard
                title="Taux de conversion (nb)"
                value={fmtPct(d?.taux_conversion_nb)}
                sub="Devis acceptés / décidés"
                status={st(d?.taux_conversion_nb, { good: 70, warn: 50 })}
              />
              <KpiCard
                title="Taux de conversion (€)"
                value={fmtPct(d?.taux_conversion_montant)}
                sub="Montant accepté / décidé"
                status={st(d?.taux_conversion_montant, { good: 70, warn: 50 })}
              />
              <KpiCard
                title="Ratio anticipation devis (mois)"
                value={d?.ratio_anticipation != null
                  ? `× ${d.ratio_anticipation.toFixed(2)}`
                  : '—'}
                sub={`${fmtE(d?.montant_devis_emis)} émis`}
                status={st(d?.ratio_anticipation, { good: 2, warn: 1 })}
                hint="Objectif ≥ 2× le CA cible"
              />
              <KpiCard
                title="Taux de proposition"
                value={fmtPct(d?.taux_proposition)}
                sub={d?.nb_devis_emis != null && d?.nb_patients_vus != null
                  ? `${d.nb_devis_emis} devis / ${d.nb_patients_vus} patients`
                  : undefined}
                status={st(d?.taux_proposition, { good: 50, warn: 30 })}
                hint="Devis proposés / consultations"
              />
              <KpiCard
                title="Coût estimé de l'absentéisme"
                value={d?.cout_absenteisme != null ? fmtE(d.cout_absenteisme) : '—'}
                sub={d?.temps_perdu_minutes ? `${fmtMin(d.temps_perdu_minutes)} non remplacés` : undefined}
                status={d?.cout_absenteisme != null
                  ? (d.cout_absenteisme === 0 ? 'good' : d.cout_absenteisme < 500 ? 'warn' : 'bad')
                  : 'neutral'}
                hint="(Minutes perdues ÷ 60) × Taux horaire réel"
              />
            </div>

            {/* Encours */}
            <div className="kpi-encours">
              <div className="kpi-encours__header">
                <span className="kpi-encours__title">Devis à relancer</span>
                <div className="kpi-encours__filters">
                  {[[0, 'Tous'], [500, '> 500 €'], [1500, '> 1 500 €']].map(([s, label]) => (
                    <button
                      key={s}
                      className={`kpi-encours__seuil${seuil === s ? ' kpi-encours__seuil--active' : ''}`}
                      onClick={() => setSeuil(s)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {encours ? (
                encours.total === 0 ? (
                  <p className="kpi-encours__empty">
                    Aucun devis en attente de relance{encours.delai_relance_jours ? ` (délai : ${encours.delai_relance_jours} j)` : ''}.
                  </p>
                ) : (
                  <>
                    <div className="kpi-encours__summary">
                      <span className="badge badge--en_attente">{encours.total} devis</span>
                      <span>Total : <strong>{fmtE(encours.montant_total)}</strong></span>
                      <span className="text-muted">Délai de relance : {encours.delai_relance_jours} j</span>
                    </div>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Dossier patient</th>
                            <th>Montant</th>
                            <th>Date émission</th>
                            <th>Attente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {encours.devis.map(dv => (
                            <tr key={dv.id_devis}>
                              <td>{dv.id_patient}</td>
                              <td>{fmtE(dv.montant)}</td>
                              <td>{new Date(dv.date_emission + 'T12:00:00').toLocaleDateString('fr-FR')}</td>
                              <td>
                                <span className={`badge ${dv.jours_attente > 30 ? 'badge--refuse' : 'badge--en_attente'}`}>
                                  {dv.jours_attente} j
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              ) : (
                <p className="kpi-loading">Chargement…</p>
              )}
            </div>
          </KpiSection>

          {/* ── 4. Dynamique Patientèle ── */}
          <KpiSection number="4" title="Dynamique Patientèle">
            <div className="kpi-grid kpi-grid--3">
              <KpiCard
                title="Nouveaux patients (mois)"
                value={d?.nb_nouveaux_patients ?? '—'}
                sub={d?.nb_patients_vus != null
                  ? `sur ${d.nb_patients_vus} patients vus`
                  : undefined}
                status="neutral"
              />
              <KpiCard
                title="Taux de désistement (nouveaux)"
                value={fmtPct(d?.taux_desistement_nouveaux)}
                sub="Non-honorés nouveaux / total nouveaux RDV"
                status={st(d?.taux_desistement_nouveaux, { good: 10, warn: 20, reversed: true })}
              />
              <div className="kpi-card kpi-card--neutral kpi-card--unavailable">
                <p className="kpi-card__title">Taux de maintenance</p>
                <p className="kpi-card__value kpi-value--neutral">N/D</p>
                <p className="kpi-card__hint">Nécessite un type de consultation dans le modèle</p>
              </div>
            </div>
          </KpiSection>
        </>
      )}
    </div>
  )
}
