import { useState, useEffect } from 'react'

import { API_BASE } from '../utils/api'

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

// Compact formatters for Y-axis labels
function compactE(v) {
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k€`
  if (v >= 1000)  return `${(v / 1000).toFixed(1)}k€`
  return `${Math.round(v)}€`
}
function compactPct(v) { return `${Math.round(v)}%` }
function compactMin(v) {
  const h = Math.floor(v / 60)
  const m = Math.round(v % 60)
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2,'0')}`
}

// ── Status ───────────────────────────────────────────────────────────────────

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

// ── KpiMensuel (existing monthly dashboard) ──────────────────────────────────

const SALARY_MIN = 15
const SALARY_MAX = 20

function KpiMensuel({ token, idPraticien }) {
  const now = new Date()
  const [mois, setMois] = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [weekOffset, setWeekOffset] = useState(0)
  const [seuil, setSeuil] = useState(0)
  const [salaireTaux, setSalaireTaux] = useState(17)
  const [refresh, setRefresh] = useState(0)
  const [editingCA, setEditingCA] = useState(false)

  const [data, setData] = useState(null)
  const [weekData, setWeekData] = useState(null)
  const [encours, setEncours] = useState(null)
  const [loading, setLoading] = useState(true)

  const weekBounds = getWeekBounds(weekOffset)
  const isCurrentMonth = mois === now.getMonth() + 1 && annee === now.getFullYear()

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
    <div>
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

            <div className="kpi-salary">
              <div className="kpi-salary__display">
                <span className="kpi-salary__formula">
                  {d?.ca_declare != null ? fmtE(d.ca_declare) : '—'}
                  {' × '}
                  <strong>{salaireTaux} %</strong>
                </span>
                <span className="kpi-salary__equals">=</span>
                <span className="kpi-salary__result">
                  {d?.ca_declare != null ? fmtE(d.ca_declare * salaireTaux / 100) : '—'}
                </span>
              </div>
              <div className="kpi-salary__slider-row">
                <span className="kpi-salary__bound">{SALARY_MIN} %</span>
                <input
                  type="range"
                  className="kpi-salary__slider"
                  min={SALARY_MIN}
                  max={SALARY_MAX}
                  step={1}
                  value={salaireTaux}
                  onChange={e => setSalaireTaux(Number(e.target.value))}
                />
                <span className="kpi-salary__bound">{SALARY_MAX} %</span>
              </div>
              {d?.salaire_estime != null && (
                <p className="kpi-salary__sub">
                  Net estimé (CA − charges) : <strong>{fmtE(d.salaire_estime)}</strong>
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
                sub="Devis acceptés / émis"
                status={st(d?.taux_conversion_nb, { good: 70, warn: 50 })}
              />
              <KpiCard
                title="Taux de conversion (€)"
                value={fmtPct(d?.taux_conversion_montant)}
                sub="Montant accepté / émis"
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

// ── KpiGraphiques ─────────────────────────────────────────────────────────────

const INDICATORS = [
  { value: 'ca_declare',              label: 'CA déclaré (€)',          fmt: fmtE,   yFmt: compactE,   yDomain: [0, null] },
  { value: 'ca_cumule',               label: 'CA cumulé (€)',           fmt: fmtE,   yFmt: compactE,   yDomain: [0, null], cumulative: 'ca_declare' },
  { value: 'taux_horaire_reel',       label: 'Taux horaire réel (€/h)', fmt: v => v != null ? `${fmtE(v, 0)}/h` : '—', yFmt: v => `${Math.round(v)}€`, yDomain: [0, null] },
  { value: 'taux_conversion_nb',      label: 'Taux conversion nb (%)',  fmt: fmtPct, yFmt: compactPct, yDomain: [0, 100] },
  { value: 'taux_conversion_montant', label: 'Taux conversion € (%)',   fmt: fmtPct, yFmt: compactPct, yDomain: [0, 100] },
  { value: 'nb_devis_emis',           label: 'Devis émis',              fmt: v => v != null ? String(v) : '—', yFmt: v => String(Math.round(v)), yDomain: [0, null] },
  { value: 'montant_devis_emis',      label: 'Montant devis émis (€)',  fmt: fmtE,   yFmt: compactE,   yDomain: [0, null] },
  { value: 'taux_atteinte_ca',        label: "Taux d'atteinte CA (%)",  fmt: fmtPct, yFmt: compactPct, yDomain: [0, 100] },
  { value: 'ratio_charges',           label: 'Ratio charges (%)',       fmt: fmtPct, yFmt: compactPct, yDomain: [0, 100] },
  { value: 'nb_patients_vus',         label: 'Patients vus',            fmt: v => v != null ? String(v) : '—', yFmt: v => String(Math.round(v)), yDomain: [0, null] },
  { value: 'temps_productif_minutes', label: 'Temps productif',         fmt: fmtMin, yFmt: compactMin, yDomain: [0, null] },
]

const Q_LABELS = ['T1 jan–mars', 'T2 avr–juin', 'T3 juil–sept', 'T4 oct–déc']

function buildPeriodGroups(availableMonths) {
  if (!availableMonths || availableMonths.length === 0) return []
  const monthSet = new Set(availableMonths)
  const hasMonth = (mois, annee) => monthSet.has(`${annee}-${String(mois).padStart(2, '0')}`)
  const hasQuarter = (q, annee) => {
    const s = (q - 1) * 3 + 1
    return hasMonth(s, annee) || hasMonth(s + 1, annee) || hasMonth(s + 2, annee)
  }
  const years = [...new Set(availableMonths.map(m => parseInt(m.slice(0, 4))))].sort().reverse()
  return years.map(y => ({
    year: y,
    quarters: [1, 2, 3, 4].filter(q => hasQuarter(q, y)),
  }))
}

function periodToMonths(mode, fixed, from, to, CY, CM) {
  if (mode === 'fixe') {
    if (fixed.startsWith('year-')) {
      const y = parseInt(fixed.slice(5))
      const last = y === CY ? CM : 12
      return Array.from({ length: last }, (_, i) => ({ mois: i + 1, annee: y }))
    }
    if (/^q\d-\d{4}$/.test(fixed)) {
      const q = parseInt(fixed[1])
      const y = parseInt(fixed.slice(3))
      const s = (q - 1) * 3 + 1
      return [{ mois: s, annee: y }, { mois: s + 1, annee: y }, { mois: s + 2, annee: y }]
    }
    return []
  }
  if (!from || !to) return []
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const months = []
  let y = fy, m = fm
  while ((y < ty || (y === ty && m <= tm)) && months.length < 36) {
    months.push({ mois: m, annee: y })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

function ChartTooltip({ x, y, label, value, W, PAD }) {
  const tw = 120, th = 36
  const tx = Math.min(Math.max(x - tw / 2, PAD.left), W - PAD.right - tw)
  const ty = y - th - 10 < PAD.top ? y + 10 : y - th - 10
  return (
    <g>
      <rect x={tx} y={ty} width={tw} height={th} rx="5" ry="5" fill="#2d3748" opacity="0.92" />
      <text x={tx + tw / 2} y={ty + 13} textAnchor="middle" fontSize="10" fill="#a0aec0">{label}</text>
      <text x={tx + tw / 2} y={ty + 28} textAnchor="middle" fontSize="12" fontWeight="600" fill="white">{value}</text>
    </g>
  )
}

function LineChart({ points, formatter, axisFormatter, yDomain }) {
  const [hovered, setHovered] = useState(null)

  const W = 580, H = 220
  const PAD = { top: 20, right: 20, bottom: 38, left: 64 }
  const IW = W - PAD.left - PAD.right
  const IH = H - PAD.top - PAD.bottom

  const valid = points.filter(p => p.value != null)

  if (valid.length === 0) {
    return <p className="kpi-chart-empty">Aucune donnée disponible pour cette période.</p>
  }

  const vals = valid.map(p => p.value)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const span = maxV - minV || Math.abs(maxV) * 0.2 || 1
  const lo = yDomain?.[0] ?? minV - span * 0.12
  const hi = yDomain?.[1] ?? maxV + span * 0.12

  const n = points.length
  const xOf = i => PAD.left + (n <= 1 ? IW / 2 : (i / (n - 1)) * IW)
  const yOf = v => PAD.top + IH - ((v - lo) / (hi - lo)) * IH

  // Build SVG path (segments between non-null values)
  const pathParts = []
  let cur = ''
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.value != null) {
      cur += cur === '' ? `M ${xOf(i)} ${yOf(p.value)} ` : `L ${xOf(i)} ${yOf(p.value)} `
    } else if (cur !== '') {
      pathParts.push(cur)
      cur = ''
    }
  }
  if (cur !== '') pathParts.push(cur)

  // Y gridlines (5 levels)
  const yTicks = Array.from({ length: 5 }, (_, i) => lo + (i / 4) * (hi - lo))

  const hovPoint = hovered != null ? points[hovered] : null

  return (
    <div className="kpi-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="kpi-chart">
        {/* Grid + Y labels */}
        {yTicks.map((v, i) => {
          const y = yOf(v)
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#a0aec0">
                {axisFormatter(v)}
              </text>
            </g>
          )
        })}

        {/* Axes */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#cbd5e0" strokeWidth="1" />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#cbd5e0" strokeWidth="1" />

        {/* X labels */}
        {points.map((p, i) => (
          <text key={i} x={xOf(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="#718096">
            {p.label}
          </text>
        ))}

        {/* Line */}
        {pathParts.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#3182ce" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Dots + hover hit areas */}
        {points.map((p, i) => p.value != null ? (
          <g
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={xOf(i)} cy={yOf(p.value)} r="10" fill="transparent" />
            <circle
              cx={xOf(i)} cy={yOf(p.value)}
              r={hovered === i ? 5.5 : 4}
              fill={hovered === i ? '#2b6cb0' : 'white'}
              stroke="#3182ce"
              strokeWidth="2"
            />
          </g>
        ) : null)}

        {/* Tooltip */}
        {hovPoint != null && hovPoint.value != null && (
          <ChartTooltip
            x={xOf(hovered)}
            y={yOf(hovPoint.value)}
            label={hovPoint.label}
            value={formatter(hovPoint.value)}
            W={W}
            PAD={PAD}
          />
        )}
      </svg>
    </div>
  )
}

function KpiGraphiques({ token }) {
  const now = new Date()
  const CY = now.getFullYear()
  const CM = now.getMonth() + 1

  const [periodMode, setPeriodMode] = useState('fixe')
  const [fixedPeriod, setFixedPeriod] = useState(null)
  const [customFrom, setCustomFrom] = useState(`${CY}-01`)
  const [customTo, setCustomTo] = useState(`${CY}-${String(CM).padStart(2, '0')}`)
  const [indicator, setIndicator] = useState('ca_declare')
  const [rawData, setRawData] = useState({})
  const [loading, setLoading] = useState(false)
  const [availableMonths, setAvailableMonths] = useState(null)

  // Load available periods once
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/kpis/periodes-disponibles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const months = d?.mois_disponibles ?? []
        setAvailableMonths(months)
        if (months.length > 0 && fixedPeriod === null) {
          const latestYear = Math.max(...months.map(m => parseInt(m.slice(0, 4))))
          setFixedPeriod(`year-${latestYear}`)
        }
      })
      .catch(() => setAvailableMonths([]))
  }, [token])

  // Load KPI data for the selected period
  useEffect(() => {
    if (fixedPeriod === null && periodMode === 'fixe') return
    const months = periodToMonths(periodMode, fixedPeriod, customFrom, customTo, CY, CM)
    if (months.length === 0) return
    let cancelled = false
    setLoading(true)
    setRawData({})
    Promise.all(
      months.map(({ mois, annee }) =>
        fetch(`${API_BASE}/api/v1/kpis/mensuel?mois=${mois}&annee=${annee}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.ok ? r.json() : null)
          .then(d => [`${annee}-${String(mois).padStart(2, '0')}`, d])
          .catch(() => [`${annee}-${String(mois).padStart(2, '0')}`, null])
      )
    ).then(entries => {
      if (cancelled) return
      setRawData(Object.fromEntries(entries))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [token, periodMode, fixedPeriod, customFrom, customTo])

  const months = fixedPeriod !== null || periodMode === 'custom'
    ? periodToMonths(periodMode, fixedPeriod, customFrom, customTo, CY, CM)
    : []
  const ind = INDICATORS.find(i => i.value === indicator) || INDICATORS[0]

  const srcField = ind.cumulative || indicator
  let running = 0
  const chartPoints = months.map(({ mois, annee }) => {
    const key = `${annee}-${String(mois).padStart(2, '0')}`
    const d = rawData[key]
    const label = months.length > 6
      ? `${MOIS_NOMS[mois - 1].slice(0, 3)} ${String(annee).slice(2)}`
      : MOIS_NOMS[mois - 1].slice(0, 3)
    const raw = d != null ? (d[srcField] ?? null) : null
    if (ind.cumulative) {
      if (raw != null) running += raw
      return { label, value: raw != null ? running : null }
    }
    return { label, value: raw }
  })

  const periodGroups = buildPeriodGroups(availableMonths)

  return (
    <div className="kpi-graphiques">
      <div className="kpi-graph-controls">
        <div className="kpi-graph-period-row">
          <div className="kpi-graph-mode-toggle">
            <button
              className={`kpi-mode-btn${periodMode === 'fixe' ? ' kpi-mode-btn--active' : ''}`}
              onClick={() => setPeriodMode('fixe')}
            >
              Période fixe
            </button>
            <button
              className={`kpi-mode-btn${periodMode === 'custom' ? ' kpi-mode-btn--active' : ''}`}
              onClick={() => setPeriodMode('custom')}
            >
              Personnalisé
            </button>
          </div>

          {periodMode === 'fixe' ? (
            availableMonths === null ? (
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Chargement…</span>
            ) : periodGroups.length === 0 ? (
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Aucune donnée disponible.</span>
            ) : (
              <select
                className="kpi-graph-select"
                value={fixedPeriod ?? ''}
                onChange={e => setFixedPeriod(e.target.value)}
              >
                {periodGroups.map(({ year, quarters }) => (
                  <optgroup key={year} label={`── ${year} ──`}>
                    <option value={`year-${year}`}>Année complète {year}</option>
                    {quarters.map(q => (
                      <option key={q} value={`q${q}-${year}`}>{Q_LABELS[q - 1]} {year}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )
          ) : (
            <div className="kpi-graph-custom-range">
              <input
                type="month"
                className="kpi-graph-month"
                value={customFrom}
                max={customTo || undefined}
                onChange={e => setCustomFrom(e.target.value)}
              />
              <span className="kpi-graph-arrow">→</span>
              <input
                type="month"
                className="kpi-graph-month"
                value={customTo}
                min={customFrom || undefined}
                onChange={e => setCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="kpi-graph-indicator-row">
          <label className="kpi-graph-label">Indicateur</label>
          <select
            className="kpi-graph-select kpi-graph-select--wide"
            value={indicator}
            onChange={e => setIndicator(e.target.value)}
          >
            {INDICATORS.map(i => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="kpi-loading">Chargement…</p>
      ) : (
        <LineChart points={chartPoints} formatter={ind.fmt} axisFormatter={ind.yFmt} yDomain={ind.yDomain} />
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function KpiView({ token, idPraticien }) {
  const [kpiTab, setKpiTab] = useState('mensuel')

  return (
    <div className="kpi-view">
      <div className="kpi-subtabs">
        <button
          className={`kpi-subtab${kpiTab === 'mensuel' ? ' kpi-subtab--active' : ''}`}
          onClick={() => setKpiTab('mensuel')}
        >
          Mensuel
        </button>
        <button
          className={`kpi-subtab${kpiTab === 'graphiques' ? ' kpi-subtab--active' : ''}`}
          onClick={() => setKpiTab('graphiques')}
        >
          Graphiques
        </button>
      </div>

      {kpiTab === 'mensuel' && <KpiMensuel token={token} idPraticien={idPraticien} />}
      {kpiTab === 'graphiques' && <KpiGraphiques token={token} idPraticien={idPraticien} />}
    </div>
  )
}
