import { useState } from 'react'
import ChequeForm from './ChequeForm'
import { API_BASE } from '../utils/api'
import { formatApiErrors } from '../utils/apiErrors'

const STATUTS = [
  { value: 'EN_ATTENTE', symbol: '?',  cls: 'attente', label: 'En attente' },
  { value: 'ACCEPTE',    symbol: '✓',  cls: 'accepte', label: 'Accepté' },
  { value: 'REFUSE',     symbol: '✕',  cls: 'refuse',  label: 'Refusé' },
]

function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function timeToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const INIT = {
  id_patient: '',
  statut: 'EN_ATTENTE',
  montant: '',
  temps_time: '',
  date_emission: todayStr(),
  date_decision: '',
  motif_refus: '',
}

function QuickDevisForm({ token, idPraticien }) {
  const [form, setForm] = useState(INIT)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null) // 'ok' | 'err'

  function set(name, value) {
    setForm(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'statut' && value === 'EN_ATTENTE') {
        next.date_decision = ''
        next.motif_refus = ''
      }
      return next
    })
  }

  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')
    const mins = timeToMin(form.temps_time)

    if (!form.id_patient)                                    { setStatus('err'); setErrorMsg('N° patient requis.');         return }
    if (!form.montant || parseFloat(form.montant) <= 0)      { setStatus('err'); setErrorMsg('Montant requis.');            return }
    if (mins <= 0)                                           { setStatus('err'); setErrorMsg('Temps requis.');              return }
    if (form.statut !== 'EN_ATTENTE' && !form.date_decision) { setStatus('err'); setErrorMsg('Date de décision requise.'); return }
    if (form.statut === 'REFUSE' && !form.motif_refus.trim()){ setStatus('err'); setErrorMsg('Motif de refus requis.');    return }

    setLoading(true)
    setStatus(null)

    const payload = {
      id_praticien: idPraticien,
      id_patient: form.id_patient,
      montant: parseFloat(form.montant),
      temps_previsionnel_minutes: mins,
      date_emission: form.date_emission,
      statut: form.statut,
      date_decision: form.statut !== 'EN_ATTENTE' ? form.date_decision : null,
    }
    if (form.statut === 'REFUSE') payload.motif_refus = form.motif_refus

    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setForm({ ...INIT })
        setStatus('ok')
        setErrorMsg('')
        setTimeout(() => setStatus(null), 2000)
      } else {
        const data = await res.json().catch(() => null)
        setStatus('err')
        setErrorMsg(formatApiErrors(data?.detail))
      }
    } catch {
      setStatus('err')
      setErrorMsg('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  const needsDecision = form.statut !== 'EN_ATTENTE'

  return (
    <form className="pip-form" onSubmit={handleSubmit} noValidate>
      {/* Ligne 1 : patient + statut */}
      <div className="pip-row">
        <input
          className="pip-field pip-field--patient"
          type="text"
          inputMode="numeric"
          placeholder="N° patient"
          value={form.id_patient}
          onChange={e => set('id_patient', e.target.value.replace(/\D/g, ''))}
        />
        <div className="pip-statut-btns">
          {STATUTS.map(s => (
            <button
              key={s.value}
              type="button"
              className={`statut-icon statut-icon--${s.cls} pip-statut-btn${form.statut === s.value ? ' pip-statut-btn--active' : ' pip-statut-btn--inactive'}`}
              onClick={() => set('statut', s.value)}
              title={s.label}
            >
              {s.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Ligne 2 : montant + temps */}
      <div className="pip-row">
        <input
          className="pip-field"
          type="number"
          placeholder="Montant €"
          value={form.montant}
          onChange={e => set('montant', e.target.value)}
          min="0.01"
          step="0.01"
        />
        <input
          className="pip-field pip-field--time"
          type="time"
          value={form.temps_time}
          onChange={e => set('temps_time', e.target.value)}
          title="Temps prévisionnel"
        />
      </div>

      {/* Ligne 3 : date émission + date décision si besoin */}
      <div className="pip-row">
        <input
          className="pip-field"
          type="date"
          value={form.date_emission}
          onChange={e => set('date_emission', e.target.value)}
          title="Date d'émission"
        />
        {needsDecision && (
          <input
            className="pip-field"
            type="date"
            value={form.date_decision}
            onChange={e => set('date_decision', e.target.value)}
            min={form.date_emission}
            title="Date de décision"
          />
        )}
      </div>

      {/* Motif refus si REFUSE */}
      {form.statut === 'REFUSE' && (
        <div className="pip-row">
          <input
            className="pip-field pip-field--full"
            type="text"
            placeholder="Motif de refus"
            value={form.motif_refus}
            onChange={e => set('motif_refus', e.target.value)}
          />
        </div>
      )}

      <div className="pip-actions">
        {status === 'ok' && <span className="pip-feedback pip-feedback--ok">✓ Enregistré</span>}
        {status === 'err' && <span className="pip-feedback pip-feedback--err">{errorMsg || 'Erreur'}</span>}
        <button className="pip-submit" type="submit" disabled={loading}>
          {loading ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

export default function PipContent({ token, isSecretary, praticiens = [], initialPraticienId }) {
  const [tab, setTab] = useState('devis')
  const [selectedId, setSelectedId] = useState(initialPraticienId ?? null)

  return (
    <div className="pip-container">
      <div className="pip-header">
        <span className="pip-title">⚡ Saisie rapide</span>
      </div>

      {isSecretary && praticiens.length > 0 && (
        <div className="pip-praticien-bar">
          <label className="pip-praticien-label">Praticien</label>
          <select
            className="pip-praticien-select"
            value={selectedId ?? ''}
            onChange={e => setSelectedId(parseInt(e.target.value, 10))}
          >
            {praticiens.map(p => (
              <option key={p.id_praticien} value={p.id_praticien}>{p.nom}</option>
            ))}
          </select>
        </div>
      )}

      <div className="pip-tabs">
        <button className={`pip-tab ${tab === 'devis' ? 'pip-tab--active' : ''}`} onClick={() => setTab('devis')}>Devis</button>
        <button className={`pip-tab ${tab === 'cheque' ? 'pip-tab--active' : ''}`} onClick={() => setTab('cheque')}>Chèque</button>
      </div>

      <div className="pip-body">
        {!selectedId ? (
          <p className="text-muted pip-empty">Sélectionnez un praticien pour commencer.</p>
        ) : tab === 'devis' ? (
          <QuickDevisForm token={token} idPraticien={selectedId} />
        ) : (
          <ChequeForm token={token} idPraticien={selectedId} embedded />
        )}
      </div>
    </div>
  )
}
