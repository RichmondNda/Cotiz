// Pages légales (/legal/[document]) : titres et sections de la maquette (source-maquette/Legal.dc.html).
// Les textes juridiques ne sont pas fournis : placeholders de la maquette, à remplacer par le conseil juridique.

export type DocumentLegal = 'cgu' | 'confidentialite' | 'mentions'

export interface ContenuLegal {
  /** Libellé de l'onglet. */
  onglet: string
  titre: string
  miseAJour: string
  sections: string[]
}

export const DOCUMENTS_LEGAUX: Record<DocumentLegal, ContenuLegal> = {
  cgu: {
    onglet: 'CGU',
    titre: 'Conditions générales d’utilisation',
    miseAJour: '[DATE]',
    sections: ['Objet', 'Accès au service', 'Comptes et identifiants', 'Paiements entre membres et associations', 'Abonnements', 'Responsabilités', 'Résiliation', 'Droit applicable'],
  },
  confidentialite: {
    onglet: 'Confidentialité',
    titre: 'Politique de confidentialité',
    miseAJour: '[DATE]',
    sections: ['Données collectées', 'Finalités', 'Durée de conservation', 'Destinataires', 'Sécurité', 'Vos droits', 'Contact'],
  },
  mentions: {
    onglet: 'Mentions légales',
    titre: 'Mentions légales',
    miseAJour: '[DATE]',
    sections: ['Éditeur', 'Directeur de la publication', 'Hébergement', 'Propriété intellectuelle', 'Contact'],
  },
}

export const estDocumentLegal = (v: unknown): v is DocumentLegal =>
  typeof v === 'string' && Object.hasOwn(DOCUMENTS_LEGAUX, v)
