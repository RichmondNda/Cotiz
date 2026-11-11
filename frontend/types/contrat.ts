import type { DateISO, Identifiant, MontantFCFA } from './commun'

/** Incertain : les maquettes montrent « Signature attendue » / « Signé » ; pas d'état « refusé » vu. */
export type StatutContrat = 'a_signer' | 'signe'

export interface Contrat {
  id: Identifiant
  projetId: Identifiant
  souscripteurId: Identifiant
  associationId: Identifiant
  /** Texte final, variables du modèle remplacées. */
  texte: string
  engagement: MontantFCFA // ex. 500 000 F (Centre), 170 000 F (Voyage)
  statut: StatutContrat
  envoyeLe: DateISO
  signeLe?: DateISO
  /** Signature de l'association à la création du projet (« Je signe ce contrat au nom de l'association »). */
  signeParAssociationLe?: DateISO
  /** Signataire pour l'association (« Awa Koné, trésorière »). */
  signataireAssociation?: string
  /** PDF signé (fl.get), une fois produit par le serveur (lot 4.1). */
  pdfFichierId?: Identifiant
  /** Inscription retirée depuis la signature : contrat consultable, PDF téléchargeable (« adhésion terminée »). */
  inscriptionRetiree?: boolean
}
