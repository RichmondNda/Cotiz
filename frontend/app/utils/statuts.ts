// Table de correspondance statut → libellé + ton de badge (design-system/components/Badge).
// À respecter partout : échéance à venir = info, déclarée ou partielle = warning, payée = success,
// en retard = danger ; projet brouillon / terminé = neutre ; association suspendue = danger ; demande à traiter = warning.
import type {
  StatutAssociation,
  StatutContrat,
  StatutDemande,
  StatutEcheance,
  StatutPaiement,
  StatutPlan,
  StatutProjet,
  StatutSouscription,
} from '~~/types'

export type TonStatut = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

export interface LibelleStatut {
  libelle: string
  ton: TonStatut
}

export const STATUTS_ECHEANCE: Record<StatutEcheance, LibelleStatut> = {
  a_venir: { libelle: 'À venir', ton: 'info' },
  declaree: { libelle: 'Déclarée', ton: 'warning' },
  payee: { libelle: 'Payée', ton: 'success' },
  partielle: { libelle: 'Partielle', ton: 'warning' },
  en_retard: { libelle: 'En retard', ton: 'danger' },
}

export const STATUTS_PAIEMENT: Record<StatutPaiement, LibelleStatut> = {
  en_attente: { libelle: 'En attente', ton: 'warning' },
  valide: { libelle: 'Validé', ton: 'success' },
  rejete: { libelle: 'Rejeté', ton: 'danger' },
}

export const STATUTS_PROJET: Record<StatutProjet, LibelleStatut> = {
  brouillon: { libelle: 'Brouillon', ton: 'neutral' },
  inscriptions_ouvertes: { libelle: 'Inscriptions ouvertes', ton: 'info' },
  en_cours: { libelle: 'En cours', ton: 'success' },
  termine: { libelle: 'Terminé', ton: 'neutral' },
}

export const STATUTS_SOUSCRIPTION: Record<StatutSouscription, LibelleStatut> = {
  signature_attendue: { libelle: 'Signature attendue', ton: 'warning' },
  a_jour: { libelle: 'À jour', ton: 'success' },
  en_retard: { libelle: 'En retard', ton: 'danger' },
}

export const STATUTS_ASSOCIATION: Record<StatutAssociation, LibelleStatut> = {
  active: { libelle: 'Active', ton: 'success' },
  impayee: { libelle: 'Impayé', ton: 'warning' },
  suspendue: { libelle: 'Suspendue', ton: 'danger' },
  onboarding: { libelle: 'Onboarding', ton: 'info' },
}

export const STATUTS_DEMANDE: Record<StatutDemande, LibelleStatut> = {
  a_traiter: { libelle: 'À traiter', ton: 'warning' },
  approuvee: { libelle: 'Approuvée', ton: 'success' },
  refusee: { libelle: 'Refusée', ton: 'danger' },
}

export const STATUTS_CONTRAT: Record<StatutContrat, LibelleStatut> = {
  a_signer: { libelle: 'Signature attendue', ton: 'warning' },
  signe: { libelle: 'Signé', ton: 'success' },
}

export const STATUTS_PLAN: Record<StatutPlan, LibelleStatut> = {
  actif: { libelle: 'Actif', ton: 'success' },
  archive: { libelle: 'Archivé', ton: 'neutral' },
}

export const TABLES_STATUTS = {
  echeance: STATUTS_ECHEANCE,
  paiement: STATUTS_PAIEMENT,
  projet: STATUTS_PROJET,
  souscription: STATUTS_SOUSCRIPTION,
  association: STATUTS_ASSOCIATION,
  demande: STATUTS_DEMANDE,
  contrat: STATUTS_CONTRAT,
  plan: STATUTS_PLAN,
} as const

export type TypeStatut = keyof typeof TABLES_STATUTS

export function libelleStatut(type: TypeStatut, statut: string): LibelleStatut {
  const table = TABLES_STATUTS[type] as Record<string, LibelleStatut>
  return table[statut] ?? { libelle: statut, ton: 'neutral' }
}

const FREQUENCES = {
  hebdomadaire: 'Hebdomadaire',
  mensuelle: 'Mensuel',
  trimestrielle: 'Trimestriel',
  semestrielle: 'Semestriel',
  annuelle: 'Annuel',
} as const

/** Libellé court de fréquence, tel qu'affiché sur les cartes (« Mensuel »). */
export function libelleFrequence(f: keyof typeof FREQUENCES): string {
  return FREQUENCES[f]
}
