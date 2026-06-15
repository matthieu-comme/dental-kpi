import { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'
const TODAY = new Date().toISOString().split('T')[0]

const DEVIS_LABELS = { EN_ATTENTE: 'En attente', ACCEPTE: 'Accepté', REFUSE: 'Refusé' }
const CHEQUE_LABELS = { EN_ATTENTE: 'En attente', DEPOSE: 'Déposé' }

function apiErr(data) {
  return Array.isArray(data?.detail)
    ? data.detail.map(d => d.msg).join(', ')
    : (data?.detail || 'Erreur inconnue')
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  return (
    <div className="cloture-steps">
      <div className={`cloture-step ${step === 1 ? 'cloture-step--active' : 'cloture-step--done'}`}>
        <span className="cloture-step__dot">{step > 1 ? '✓' : '1'}</span>
        <span className="cloture-step__label">Journée</span>
      </div>
      <span className="cloture-step__line" />
      <div className={`cloture-step ${step === 2 ? 'cloture-step--active' : ''}`}>
        <span className="cloture-step__dot">2</span>
        <span className="cloture-step__label">Devis & Chèques</span>
      </div>
    </div>
  )
}

// ─── Step 1: Journée ──────────────────────────────────────────────────────────

const INIT_JOURNEE = {
  date_jour: TODAY,
  nb_patients_vus: '',
  nb_nouveaux_patients: '',
  nb_rdv_manques_connus: '',
  nb_rdv_manques_nouveaux: '',
  temps_presence_minutes: '',
  temps_perdu_minutes: '',
}

function JourneeStep({ token, idPraticien, praticienNom, onSuccess }) {
  const [form, setForm] = useState(INIT_JOURNEE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(null)

  useEffect(() => { setForm(INIT_JOURNEE); setConflict(null); setError('') }, [idPraticien])

  function onChange(e) {
    const { name, value } = e.target
    if (name === 'date_jour') { setConflict(null); setError('') }
    setForm(p => ({ ...p, [name]: value }))
  }

  function buildPayload() {
    return {
      id_praticien: idPraticien,
      date_jour: form.date_jour,
      nb_patients_vus: parseInt(form.nb_patients_vus, 10),
      nb_nouveaux_patients: parseInt(form.nb_nouveaux_patients, 10),
      nb_rdv_manques_connus: parseInt(form.nb_rdv_manques_connus, 10),
      nb_rdv_manques_nouveaux: parseInt(form.nb_rdv_manques_nouveaux, 10),
      temps_presence_minutes: parseInt(form.temps_presence_minutes, 10),
      temps_perdu_minutes: parseInt(form.temps_perdu_minutes, 10),
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setConflict(null)

    try {
      const res = await fetch(`${API_BASE}/api/v1/journees/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildPayload()),
      })

      if (res.status === 409) {
        const allRes = await fetch(`${API_BASE}/api/v1/journees/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const all = await allRes.json()
        const existing = all.find(j => j.id_praticien === idPraticien && j.date_jour === form.date_jour)
        if (existing) {
          setConflict({ id_journee: existing.id_journee })
          setError(`Une journée existe déjà pour ${praticienNom} à la date du ${form.date_jour}.`)
        } else {
          setError('Conflit inattendu : journée introuvable.')
        }
        return
      }

      const data = await res.json()
      if (!res.ok) setError(apiErr(data))
      else onSuccess(data.date_jour)
    } catch {
      setError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForceUpdate() {
    if (!conflict) return
    setLoading(true)
    setError('')
    const { id_praticien, date_jour, ...updatePayload } = buildPayload()
    try {
      const res = await fetch(`${API_BASE}/api/v1/journees/${conflict.id_journee}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updatePayload),
      })
      const data = await res.json()
      if (!res.ok) setError(apiErr(data))
      else onSuccess(data.date_jour)
    } catch {
      setError('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-card cloture-form-card">
      <div className="cloture-section-header">
        <h2>Données de la journée</h2>
        <span className="cloture-praticien-tag">{praticienNom}</span>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label>Date *</label>
          <input type="date" name="date_jour" value={form.date_jour} onChange={onChange} required min="2020-01-02" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Patients vus *</label>
            <input type="number" name="nb_patients_vus" value={form.nb_patients_vus} onChange={onChange} required min="0" placeholder="0" />
          </div>
          <div className="form-group">
            <label>dont nouveaux *</label>
            <input type="number" name="nb_nouveaux_patients" value={form.nb_nouveaux_patients} onChange={onChange} required min="0" placeholder="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>RDV manqués connus *</label>
            <input type="number" name="nb_rdv_manques_connus" value={form.nb_rdv_manques_connus} onChange={onChange} required min="0" placeholder="0" />
          </div>
          <div className="form-group">
            <label>RDV manqués nouveaux *</label>
            <input type="number" name="nb_rdv_manques_nouveaux" value={form.nb_rdv_manques_nouveaux} onChange={onChange} required min="0" placeholder="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Temps de présence (min) *</label>
            <input type="number" name="temps_presence_minutes" value={form.temps_presence_minutes} onChange={onChange} required min="1" placeholder="480" />
          </div>
          <div className="form-group">
            <label>Temps perdu (min) *</label>
            <input type="number" name="temps_perdu_minutes" value={form.temps_perdu_minutes} onChange={onChange} required min="0" placeholder="0" />
          </div>
        </div>
        <div className="cloture-form-actions">
          {conflict && (
            <button type="button" className="btn-ghost-sm" onClick={handleForceUpdate} disabled={loading}>
              Mettre à jour quand même
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Enregistrement…' : 'Continuer →'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Mini devis section (step 2) ──────────────────────────────────────────────

const INIT_DEVIS = {
  id_patient: '', montant: '', temps_previsionnel_minutes: '',
  date_emission: TODAY, date_decision: '', statut: 'EN_ATTENTE', motif_refus: '',
}

function buildDevisForm(item) {
  return {
    id_patient: item.id_patient,
    montant: String(item.montant),
    temps_previsionnel_minutes: String(item.temps_previsionnel_minutes),
    date_emission: item.date_emission,
    date_decision: item.date_decision ?? '',
    statut: item.statut,
    motif_refus: item.motif_refus ?? '',
  }
}

function devisPayload(f, idPraticien) {
  const p = {
    id_patient: f.id_patient,
    montant: parseFloat(f.montant),
    temps_previsionnel_minutes: parseInt(f.temps_previsionnel_minutes, 10),
    date_emission: f.date_emission,
    statut: f.statut,
  }
  if (idPraticien !== undefined) p.id_praticien = idPraticien
  if (f.statut !== 'EN_ATTENTE' && f.date_decision) p.date_decision = f.date_decision
  if (f.statut === 'REFUSE') p.motif_refus = f.motif_refus
  return p
}

function DevisFields({ form, onChange, prefix = '' }) {
  return (
    <>
      <div className="form-group">
        <label>ID Patient *</label>
        <input type="text" name="id_patient" id={`${prefix}id_patient`} value={form.id_patient} onChange={onChange} required />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Montant (€) *</label>
          <input type="number" name="montant" value={form.montant} onChange={onChange} required min="0.01" step="0.01" />
        </div>
        <div className="form-group">
          <label>Temps (min) *</label>
          <input type="number" name="temps_previsionnel_minutes" value={form.temps_previsionnel_minutes} onChange={onChange} required min="1" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Date d'émission *</label>
          <input type="date" name="date_emission" value={form.date_emission} onChange={onChange} required min="2020-01-02" />
        </div>
        <div className="form-group">
          <label>Statut *</label>
          <select name="statut" value={form.statut} onChange={onChange} required>
            <option value="EN_ATTENTE">En attente</option>
            <option value="ACCEPTE">Accepté</option>
            <option value="REFUSE">Refusé</option>
          </select>
        </div>
      </div>
      {form.statut !== 'EN_ATTENTE' && (
        <div className="form-group">
          <label>Date de décision *</label>
          <input type="date" name="date_decision" value={form.date_decision} onChange={onChange}
            min={form.date_emission || '2020-01-02'} required />
        </div>
      )}
      {form.statut === 'REFUSE' && (
        <div className="form-group">
          <label>Motif de refus *</label>
          <textarea name="motif_refus" value={form.motif_refus} onChange={onChange} required rows={2} />
        </div>
      )}
    </>
  )
}

function MiniDevisSection({ token, idPraticien, dateJour }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...INIT_DEVIS, date_emission: dateJour })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [feedback, setFeedback] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const all = await res.json()
        setItems(all.filter(d => d.id_praticien === idPraticien && d.date_emission === dateJour))
      }
    } finally { setLoading(false) }
  }, [token, idPraticien, dateJour])

  useEffect(() => { load() }, [load])

  function onAddChange(e) {
    const { name, value } = e.target
    setAddForm(p => {
      const next = { ...p, [name]: value }
      if (name === 'statut' && value === 'EN_ATTENTE') { next.date_decision = ''; next.motif_refus = '' }
      return next
    })
  }

  async function handleAdd(e) {
    e.preventDefault()
    setAddLoading(true); setAddError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(devisPayload(addForm, idPraticien)),
      })
      const data = await res.json()
      if (!res.ok) setAddError(apiErr(data))
      else {
        setAddForm({ ...INIT_DEVIS, date_emission: dateJour })
        setShowAdd(false)
        setFeedback({ type: 'success', message: `Devis #${data.id_devis} ajouté.` })
        load()
      }
    } catch { setAddError('Erreur réseau.') }
    finally { setAddLoading(false) }
  }

  function openEdit(item) { setEditItem(item); setEditForm(buildDevisForm(item)); setEditError('') }

  function onEditChange(e) {
    const { name, value } = e.target
    setEditForm(p => {
      const next = { ...p, [name]: value }
      if (name === 'statut' && value === 'EN_ATTENTE') { next.date_decision = ''; next.motif_refus = '' }
      return next
    })
  }

  async function handleEdit(e) {
    e.preventDefault()
    setEditLoading(true); setEditError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/${editItem.id_devis}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(devisPayload(editForm)),
      })
      const data = await res.json()
      if (!res.ok) setEditError(apiErr(data))
      else { setEditItem(null); setFeedback({ type: 'success', message: `Devis #${data.id_devis} modifié.` }); load() }
    } catch { setEditError('Erreur réseau.') }
    finally { setEditLoading(false) }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer le devis #${item.id_devis} ?`)) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/${item.id_devis}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setFeedback({ type: 'success', message: `Devis #${item.id_devis} supprimé.` })
        setItems(p => p.filter(d => d.id_devis !== item.id_devis))
      }
    } catch { setFeedback({ type: 'error', message: 'Erreur réseau.' }) }
  }

  return (
    <div className="cloture-card">
      <div className="cloture-card__header">
        <h3>Devis</h3>
        <span className="cloture-count">{items.length}</span>
      </div>

      {feedback && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}

      {loading ? <p className="text-muted">Chargement…</p> : items.length > 0 && (
        <div className="cloture-table-wrap">
          <table className="data-table">
            <thead><tr><th>Patient</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {items.map(d => (
                <tr key={d.id_devis}>
                  <td>{d.id_patient}</td>
                  <td>{d.montant.toFixed(2)} €</td>
                  <td><span className={`badge badge--${d.statut.toLowerCase()}`}>{DEVIS_LABELS[d.statut]}</span></td>
                  <td>
                    <div className="action-btns">
                      <button className="btn-action btn-action--edit" onClick={() => openEdit(d)}>Modifier</button>
                      <button className="btn-action btn-action--delete" onClick={() => handleDelete(d)}>Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 && !showAdd && (
        <p className="cloture-empty">Aucun devis saisi ce jour.</p>
      )}

      {!showAdd ? (
        <button className="btn-ghost-sm cloture-add-btn" onClick={() => setShowAdd(true)}>+ Ajouter un devis</button>
      ) : (
        <form onSubmit={handleAdd} noValidate className="cloture-add-form">
          {addError && <div className="alert alert--error">{addError}</div>}
          <DevisFields form={addForm} onChange={onAddChange} prefix="add-d-" />
          <div className="cloture-add-actions">
            <button type="button" className="btn-ghost-sm" onClick={() => { setShowAdd(false); setAddError('') }}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={addLoading}>{addLoading ? 'Ajout…' : 'Ajouter'}</button>
          </div>
        </form>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditItem(null) }}>
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Modifier le devis #{editItem.id_devis}</h3>
              <button className="modal-close" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit} noValidate>
              {editError && <div className="alert alert--error">{editError}</div>}
              <DevisFields form={editForm} onChange={onEditChange} prefix="edit-d-" />
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setEditItem(null)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={editLoading}>{editLoading ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Mini chèques section (step 2) ───────────────────────────────────────────

const INIT_CHEQUE = {
  id_patient: '', montant: '', date_reception: TODAY, date_depot_prevue: '', statut: 'EN_ATTENTE',
}

function buildChequeForm(item) {
  return {
    id_patient: item.id_patient,
    montant: String(item.montant),
    date_reception: item.date_reception,
    date_depot_prevue: item.date_depot_prevue ?? '',
    statut: item.statut,
  }
}

function chequePayload(f, idPraticien) {
  const p = { id_patient: f.id_patient, montant: parseFloat(f.montant), date_reception: f.date_reception, statut: f.statut }
  if (idPraticien !== undefined) p.id_praticien = idPraticien
  if (f.date_depot_prevue) p.date_depot_prevue = f.date_depot_prevue
  return p
}

function ChequeFields({ form, onChange }) {
  return (
    <>
      <div className="form-group">
        <label>ID Patient *</label>
        <input type="text" name="id_patient" value={form.id_patient} onChange={onChange} required />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Montant (€) *</label>
          <input type="number" name="montant" value={form.montant} onChange={onChange} required min="0.01" step="0.01" />
        </div>
        <div className="form-group">
          <label>Statut *</label>
          <select name="statut" value={form.statut} onChange={onChange} required>
            <option value="EN_ATTENTE">En attente</option>
            <option value="DEPOSE">Déposé</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Date de réception *</label>
          <input type="date" name="date_reception" value={form.date_reception} onChange={onChange} required min="2020-01-02" />
        </div>
        <div className="form-group">
          <label>Date de dépôt prévue</label>
          <input type="date" name="date_depot_prevue" value={form.date_depot_prevue} onChange={onChange} min={form.date_reception || '2020-01-02'} />
        </div>
      </div>
    </>
  )
}

function MiniChequeSection({ token, idPraticien, dateJour }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...INIT_CHEQUE, date_reception: dateJour })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [feedback, setFeedback] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const all = await res.json()
        setItems(all.filter(c => c.id_praticien === idPraticien && c.date_reception === dateJour))
      }
    } finally { setLoading(false) }
  }, [token, idPraticien, dateJour])

  useEffect(() => { load() }, [load])

  const onChange = (setter) => (e) => {
    const { name, value } = e.target
    setter(p => ({ ...p, [name]: value }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setAddLoading(true); setAddError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(chequePayload(addForm, idPraticien)),
      })
      const data = await res.json()
      if (!res.ok) setAddError(apiErr(data))
      else {
        setAddForm({ ...INIT_CHEQUE, date_reception: dateJour })
        setShowAdd(false)
        setFeedback({ type: 'success', message: `Chèque #${data.id_cheque} ajouté.` })
        load()
      }
    } catch { setAddError('Erreur réseau.') }
    finally { setAddLoading(false) }
  }

  function openEdit(item) { setEditItem(item); setEditForm(buildChequeForm(item)); setEditError('') }

  async function handleEdit(e) {
    e.preventDefault()
    setEditLoading(true); setEditError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/${editItem.id_cheque}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(chequePayload(editForm)),
      })
      const data = await res.json()
      if (!res.ok) setEditError(apiErr(data))
      else { setEditItem(null); setFeedback({ type: 'success', message: `Chèque #${data.id_cheque} modifié.` }); load() }
    } catch { setEditError('Erreur réseau.') }
    finally { setEditLoading(false) }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer le chèque #${item.id_cheque} ?`)) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/${item.id_cheque}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setFeedback({ type: 'success', message: `Chèque #${item.id_cheque} supprimé.` })
        setItems(p => p.filter(c => c.id_cheque !== item.id_cheque))
      }
    } catch { setFeedback({ type: 'error', message: 'Erreur réseau.' }) }
  }

  return (
    <div className="cloture-card">
      <div className="cloture-card__header">
        <h3>Chèques</h3>
        <span className="cloture-count">{items.length}</span>
      </div>

      {feedback && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}

      {loading ? <p className="text-muted">Chargement…</p> : items.length > 0 && (
        <div className="cloture-table-wrap">
          <table className="data-table">
            <thead><tr><th>Patient</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id_cheque}>
                  <td>{c.id_patient}</td>
                  <td>{c.montant.toFixed(2)} €</td>
                  <td><span className={`badge badge--${c.statut.toLowerCase()}`}>{CHEQUE_LABELS[c.statut]}</span></td>
                  <td>
                    <div className="action-btns">
                      <button className="btn-action btn-action--edit" onClick={() => openEdit(c)}>Modifier</button>
                      <button className="btn-action btn-action--delete" onClick={() => handleDelete(c)}>Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 && !showAdd && (
        <p className="cloture-empty">Aucun chèque saisi ce jour.</p>
      )}

      {!showAdd ? (
        <button className="btn-ghost-sm cloture-add-btn" onClick={() => setShowAdd(true)}>+ Ajouter un chèque</button>
      ) : (
        <form onSubmit={handleAdd} noValidate className="cloture-add-form">
          {addError && <div className="alert alert--error">{addError}</div>}
          <ChequeFields form={addForm} onChange={onChange(setAddForm)} />
          <div className="cloture-add-actions">
            <button type="button" className="btn-ghost-sm" onClick={() => { setShowAdd(false); setAddError('') }}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={addLoading}>{addLoading ? 'Ajout…' : 'Ajouter'}</button>
          </div>
        </form>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditItem(null) }}>
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Modifier le chèque #{editItem.id_cheque}</h3>
              <button className="modal-close" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit} noValidate>
              {editError && <div className="alert alert--error">{editError}</div>}
              <ChequeFields form={editForm} onChange={onChange(setEditForm)} />
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setEditItem(null)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={editLoading}>{editLoading ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 2: Recap ────────────────────────────────────────────────────────────

function RecapStep({ token, idPraticien, praticienNom, dateJour, onBack, onClose }) {
  const [done, setDone] = useState(false)

  function handleClose() {
    setDone(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div>
      <div className="cloture-section-header" style={{ marginBottom: '1.5rem' }}>
        <h2>Devis & Chèques — {dateJour}</h2>
        <span className="cloture-praticien-tag">{praticienNom}</span>
      </div>

      {done && (
        <div className="alert alert--success" style={{ marginBottom: '1.25rem' }}>
          Journée du {dateJour} clôturée avec succès.
        </div>
      )}

      <div className="cloture-stack">
        <MiniDevisSection token={token} idPraticien={idPraticien} dateJour={dateJour} />
        <MiniChequeSection token={token} idPraticien={idPraticien} dateJour={dateJour} />
      </div>

      <div className="cloture-recap-actions">
        <button type="button" className="btn-ghost-sm" onClick={onBack} disabled={done}>
          ← Modifier la journée
        </button>
        <button type="button" className="btn-primary" onClick={handleClose} disabled={done}>
          Enregistrer la journée
        </button>
      </div>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ClotureJournee({ token, idPraticien, praticienNom, onClose }) {
  const [step, setStep] = useState(1)
  const [dateJour, setDateJour] = useState(TODAY)

  useEffect(() => { setStep(1) }, [idPraticien])

  return (
    <div className="cloture-journee">
      <StepIndicator step={step} />
      {step === 1 && (
        <JourneeStep
          token={token}
          idPraticien={idPraticien}
          praticienNom={praticienNom}
          onSuccess={date => { setDateJour(date); setStep(2) }}
        />
      )}
      {step === 2 && (
        <RecapStep
          token={token}
          idPraticien={idPraticien}
          praticienNom={praticienNom}
          dateJour={dateJour}
          onBack={() => setStep(1)}
          onClose={onClose}
        />
      )}
    </div>
  )
}
