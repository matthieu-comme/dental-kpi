const FIELD_LABELS = {
  // Devis
  id_patient: 'N° patient',
  montant: 'Montant',
  temps_previsionnel_minutes: 'Temps prévu',
  date_emission: "Date d'émission",
  date_decision: 'Date de décision',
  statut: 'Statut',
  motif_refus: 'Motif de refus',
  // Chèques
  date_reception: 'Date de réception',
  date_depot_prevue: 'Date de dépôt prévue',
  // Journées
  date_jour: 'Date',
  nb_patients_vus: 'Patients vus',
  nb_nouveaux_patients: 'Nouveaux patients',
  nb_rdv_manques_connus: 'RDV manqués connus',
  nb_rdv_manques_nouveaux: 'RDV manqués nouveaux',
  temps_presence_minutes: 'Temps de présence',
  temps_perdu_minutes: 'Temps perdu',
  // Charges
  designation: 'Désignation',
  periodicite: 'Périodicité',
  date_debut: 'Date de début',
  date_fin: 'Date de fin',
  lissage_mensuel: 'Lissage mensuel',
  // Paramètres
  taux_horaire_cible: 'Taux horaire cible',
  ca_mensuel_cible: 'CA mensuel cible',
  delai_relance_jours: 'Délai de relance',
  seuil_devis_sms: 'Seuil SMS',
  seuil_devis_assistante: 'Seuil assistante',
  // Auth / Config
  pin_clair: 'Code PIN',
  nom: 'Nom',
  telephone_cabinet: 'Téléphone',
  password_global_clair: 'Mot de passe',
  // KPI
  ca_declare: 'CA déclaré',
}

// Messages spécifiques pour certaines combinaisons (champ, type d'erreur)
const SPECIFIC = {
  'pin_clair:string_pattern_mismatch': 'Le code PIN doit contenir exactement 6 chiffres.',
  'telephone_cabinet:string_pattern_mismatch':
    'Le téléphone doit contenir 10 chiffres (ex : 0612345678).',
}

function fmtDateCtx(val) {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-')
    return `${d}/${m}/${y}`
  }
  return val
}

function lbl(field) {
  return FIELD_LABELS[field] ?? field
}

function one(err) {
  const loc = err.loc ?? []
  const field = [...loc].reverse().find(s => typeof s === 'string' && s !== 'body') ?? ''
  const ctx = err.ctx ?? {}
  const type = err.type ?? ''

  const specific = SPECIFIC[`${field}:${type}`]
  if (specific) return specific

  const l = lbl(field)

  switch (type) {
    case 'missing':
      return `${l} est obligatoire.`
    case 'greater_than':
      return `${l} doit être supérieur à ${fmtDateCtx(ctx.gt)}.`
    case 'greater_than_equal':
      return `${l} doit être supérieur ou égal à ${fmtDateCtx(ctx.ge)}.`
    case 'less_than':
      return `${l} doit être inférieur à ${fmtDateCtx(ctx.lt)}.`
    case 'less_than_equal':
      return `${l} doit être inférieur ou égal à ${fmtDateCtx(ctx.le)}.`
    case 'string_too_short':
      return `${l} doit contenir au moins ${ctx.min_length} caractère${ctx.min_length > 1 ? 's' : ''}.`
    case 'string_too_long':
      return `${l} ne doit pas dépasser ${ctx.max_length} caractères.`
    case 'string_pattern_mismatch':
      return `${l} : format invalide.`
    case 'int_parsing':
    case 'int_type':
      return `${l} doit être un nombre entier.`
    case 'float_parsing':
    case 'float_type':
    case 'decimal_parsing':
      return `${l} doit être un nombre.`
    case 'date_from_datetime_parsing':
    case 'date_parsing':
    case 'date_type':
      return `${l} doit être une date valide (AAAA-MM-JJ).`
    case 'enum':
      return `${l} : valeur non reconnue.`
    case 'value_error': {
      const msg = (err.msg ?? '').replace(/^Value error,?\s*/i, '')
      return msg ? `${l} : ${msg}` : `${l} : valeur invalide.`
    }
    default: {
      const msg = err.msg ?? ''
      return msg ? `${l} : ${msg}` : `${l} : valeur invalide.`
    }
  }
}

/**
 * Convertit le champ `detail` d'une réponse FastAPI en message lisible en français.
 * Accepte un tableau Pydantic (422), une chaîne (400/403/404) ou null.
 */
export function formatApiErrors(detail) {
  if (!detail) return 'Erreur inconnue.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(one).join('\n')
  return String(detail)
}
