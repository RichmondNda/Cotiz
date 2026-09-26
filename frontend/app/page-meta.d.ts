// Métadonnées de page propres à Cotiz (definePageMeta).
declare module '#app' {
  interface PageMeta {
    /** Titre affiché dans la barre supérieure du back-office quand la page ne fournit pas de fil d'Ariane. */
    titre?: string
    /** Souscripteur mobile : masque le bouton flottant « Déclarer un paiement » (parcours de déclaration). */
    fab?: boolean
    /** Thème des écrans de connexion (panneau à la couleur du profil). */
    theme?: 'member' | 'manager' | 'superadmin'
    /** Back-office : espace imposé (sinon déduit du chemin, /plateforme → super-admin). */
    espace?: 'gestionnaire' | 'superadmin'
  }
}

export {}
