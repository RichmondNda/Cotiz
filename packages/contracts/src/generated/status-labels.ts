// Généré par scripts/gen.mjs depuis docs/specs/status-mapping.yaml. Ne pas modifier : lancer « pnpm --filter contracts gen ».

/** Libellé affiché et ton (couleur fonctionnelle) de chaque statut, par famille `table.colonne`. */
export const STATUS_LABELS = {
  'installments.status': {
    upcoming: { label: 'À venir', tone: 'info' },
    due: { label: 'À venir', tone: 'info' },
    declared: { label: 'Déclarée', tone: 'warning' },
    partial: { label: 'Partielle', tone: 'warning' },
    paid: { label: 'Payée', tone: 'success' },
    late: { label: 'En retard', tone: 'danger' },
    waived: { label: 'Dispensée', tone: 'neutral' },
    canceled: { label: 'Annulée', tone: 'neutral' },
  },
  'payments.status': {
    pending: { label: 'En attente', tone: 'warning' },
    validated: { label: 'Validé', tone: 'success' },
    rejected: { label: 'Rejeté', tone: 'danger' },
    canceled: { label: 'Annulé', tone: 'neutral' },
  },
  'projects.status': {
    draft: { label: 'Brouillon', tone: 'neutral' },
    enrolling: { label: 'Inscriptions ouvertes', tone: 'info' },
    active: { label: 'En cours', tone: 'success' },
    completed: { label: 'Terminé', tone: 'neutral' },
    archived: { label: 'Archivé', tone: 'neutral' },
  },
  memberStanding: {
    signature_required: { label: 'Signature attendue', tone: 'warning' },
    up_to_date: { label: 'À jour', tone: 'success' },
    late: { label: 'En retard', tone: 'danger' },
    withdrawn: { label: 'Retiré', tone: 'neutral' },
    activation_pending: { label: 'Activation en attente', tone: 'info' },
  },
  'associations.status': {
    onboarding: { label: 'Onboarding', tone: 'info' },
    active: { label: 'Active', tone: 'success' },
    past_due: { label: 'Impayé', tone: 'warning' },
    suspended: { label: 'Suspendue', tone: 'danger' },
    closed: { label: 'Fermée', tone: 'neutral' },
  },
  'association_requests.status': {
    pending: { label: 'À traiter', tone: 'warning' },
    approved: { label: 'Approuvée', tone: 'success' },
    rejected: { label: 'Refusée', tone: 'danger' },
  },
  'reminder_runs.status': {
    to_handle: { label: 'À relancer', tone: 'warning' },
    handled: { label: 'Relancé', tone: 'success' },
    dismissed: { label: 'Ignoré', tone: 'neutral' },
    auto_sent: { label: 'Rappel envoyé', tone: 'info' },
  },
  'password_reset_requests.status': {
    pending: { label: 'À traiter', tone: 'warning' },
    code_issued: { label: 'Code remis', tone: 'info' },
    completed: { label: 'Terminée', tone: 'success' },
    expired: { label: 'Expirée', tone: 'neutral' },
    dismissed: { label: 'Ignorée', tone: 'neutral' },
  },
} as const;
export type StatusFamily = keyof typeof STATUS_LABELS;
export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
