// Données de référence de la V0 — design/DONNEES-REFERENCE.md et blocs renderVals() des sources de la maquette.
// Mêmes personnes, mêmes montants partout. Les placeholders (`[N]`, `[MONTANT]`, `[DATE]`…) restent tels quels.
import type {
  Association,
  Contrat,
  Demande,
  Gestionnaire,
  Notification,
  Plan,
  Projet,
  Souscripteur,
  Souscription,
} from '~~/types'

// ---------------------------------------------------------------- Plans
export const plans: Plan[] = [
  {
    id: 'decouverte', nom: 'Découverte', prixMensuel: '[PRIX]', prixAnnuel: '[PRIX]',
    quotas: { projets: '[N]', souscripteurs: '[N]', gestionnaires: '[N]' },
    fonctionnalites: ['Grille d’échéances', 'Déclaration et validation des paiements'],
    associationsAbonnees: 41, misEnAvant: false, statut: 'actif',
  },
  {
    id: 'essentiel', nom: 'Essentiel', prixMensuel: '[PRIX]', prixAnnuel: '[PRIX]',
    quotas: { projets: '[N]', souscripteurs: '[N]', gestionnaires: '[N]' },
    fonctionnalites: ['Tout Découverte', 'Contrats à signer en ligne', 'Relances automatiques'],
    associationsAbonnees: 78, misEnAvant: true, statut: 'actif',
  },
  {
    id: 'pro', nom: 'Pro', prixMensuel: '[PRIX]', prixAnnuel: '[PRIX]',
    quotas: { projets: 5, souscripteurs: 200, gestionnaires: 3 },
    fonctionnalites: ['Tout Essentiel', 'Import de membres par Excel', 'Rapports avancés'],
    associationsAbonnees: 28, misEnAvant: false, statut: 'actif',
  },
]

// ---------------------------------------------------------------- Associations
export const associations: Association[] = [
  {
    id: 'entraide-yopougon', nom: 'Entraide Yopougon', sigle: 'EY', type: 'association', ville: 'Abidjan', pays: 'Côte d’Ivoire',
    telephoneContact: '+225 07 08 09 10 11', emailContact: 'awa@entraide.ci',
    description: 'Entraide entre familles du quartier de Yopougon.',
    statut: 'active', planId: 'essentiel', abonnementProchaineEcheance: '[DATE]',
    // Coordonnées affichées dans « Comment payer » (MbAssociation, MbProjet).
    modalitesPaiement: [
      { moyen: 'mobile_money', numeroMobileMoney: '+225 07 08 09 10 11', operateur: '[Opérateur]' },
      { moyen: 'virement', iban: '[IBAN DE L’ASSOCIATION]' },
    ],
    nbProjets: 3, nbSouscripteurs: 52, nbGestionnaires: 2, creeeLe: '2024-02-03',
  },
  {
    id: 'ressortissants-man', nom: 'Association des ressortissants de Man', sigle: 'RM', type: 'association', ville: 'Abidjan', pays: 'Côte d’Ivoire',
    statut: 'impayee', planId: 'pro',
    modalitesPaiement: [{ moyen: 'mobile_money', numeroMobileMoney: '+225 [XX XX XX XX]', operateur: '[Opérateur]' }],
    nbProjets: 5, nbSouscripteurs: 142, nbGestionnaires: 1, creeeLe: '2025-01-14',
  },
  {
    id: 'jeunesse-bouake', nom: 'Jeunesse solidaire de Bouaké', sigle: 'JS', type: 'association', ville: 'Bouaké', pays: 'Côte d’Ivoire',
    statut: 'onboarding', planId: 'decouverte', modalitesPaiement: [],
    nbProjets: 0, nbSouscripteurs: 0, nbGestionnaires: 1, creeeLe: '2026-09-20',
  },
]

export const gestionnaires: Gestionnaire[] = [
  { id: 'awa-kone', associationId: 'entraide-yopougon', prenom: 'Awa', nom: 'Koné', fonction: 'trésorière', email: 'awa@entraide.ci', telephone: '+225 07 08 09 10 11', role: 'principal', statut: 'actif' },
  { id: 'aminata-konate', associationId: 'entraide-yopougon', prenom: 'Aminata', nom: 'Konaté', email: '[email]', role: 'secondaire', statut: 'actif' },
]

/** Super-admin de la plateforme. */
export const superadmin = { id: 'richy', prenom: 'Richy' }

// ---------------------------------------------------------------- Projets
// Texte du contrat de la maquette (MbContrat). `**…**` : passage en gras ; paragraphes séparés par une ligne vide.
// Variables remplacées à la génération du contrat de chaque souscripteur (mocks/store.ts).
export const CONTRAT_MODELE = [
  '**Entre** l’association {association}, et **{nom_souscripteur}**, souscripteur, joignable au {telephone}.',
  '**Article 1 — Objet.** Le souscripteur s’engage à participer au financement du projet {projet}.',
  '**Article 2 — Montant.** La participation totale est de {montant} CFA : un fonds d’entrée de {fonds_entree}, puis {nb_echeances} échéances {frequence} de {montant_echeance}, payables le {jour} de chaque mois.',
  '**Article 3 — Paiement.** Les versements sont effectués par mobile money ou virement, puis déclarés sur Cotiz. Un paiement n’est acquis qu’après validation par l’association.',
  '**Article 4 — Retard.** [CONDITIONS EN CAS DE RETARD DÉFINIES PAR L’ASSOCIATION]',
  '**Article 5 — Résiliation.** [CONDITIONS DE RÉSILIATION DÉFINIES PAR L’ASSOCIATION]',
].join('\n\n')

export const projets: Projet[] = [
  {
    id: 'centre-communautaire', associationId: 'entraide-yopougon', nom: 'Centre communautaire', statut: 'en_cours',
    fondsEntree: 50000, montantEcheance: 25000, frequence: 'mensuelle', jourEcheance: 5,
    typeCalendrier: 'dates_fixes', dateDebut: '2026-03-05', dateFin: '2027-08-05', nbEcheances: 18, delaiGraceJours: 5,
    // Paramètres (MgProjetParametres) : description et instructions de la capture web, coordonnées de la capture mobile.
    description: 'Construction d’un centre communautaire pour les familles du quartier.', imageCouvertureNom: 'couverture_centre.jpg',
    souscripteursRequis: 60, contratModele: CONTRAT_MODELE,
    modalitesPaiement: [
      { moyen: 'virement', iban: 'CI[XX] [XXXX XXXX XXXX XXXX XXXX]' },
      { moyen: 'mobile_money', numeroMobileMoney: '+225 07 08 09 10 11', operateur: '[Opérateur]' },
    ],
    instructionsPaiement: 'Indiquez votre nom et « Centre » en référence du virement.',
    nbSouscripteurs: 52, montantCollecte: 9594000, montantAttenduADate: 11700000, tauxRecouvrement: 82, avancement: 37,
    nbEnRetard: 14, nbPaiementsAValider: 4, nbSignaturesAttendues: 1, prochaineEcheance: '2026-10-05', engagementParSouscripteur: 500000,
    // Contrat signé pour l'association à la création (MgProjetContrat : « Signé le 01/03/2026 »).
    signataire: { nom: 'Awa Koné', fonction: 'trésorière' }, creeLe: '2026-03-01',
    // Pile d'avatars de la carte (MgDashboard) : AK, MD en retard, +50.
    apercuSouscripteurs: [{ nom: 'Awa Koné' }, { nom: 'Moussa Diarra', ton: 'danger' }],
  },
  {
    id: 'tontine-solidaire-2027', associationId: 'entraide-yopougon', nom: 'Tontine solidaire 2027', statut: 'inscriptions_ouvertes',
    fondsEntree: null, montantEcheance: 10000, frequence: 'mensuelle',
    typeCalendrier: 'cycle_roulant', dateDebut: '2027-01-05', delaiGraceJours: 5,
    souscripteursRequis: 30, modalitesPaiement: [{ moyen: 'mobile_money' }], contratModele: CONTRAT_MODELE,
    nbSouscripteurs: 12, montantCollecte: 0, montantAttenduADate: 0, tauxRecouvrement: 0, avancement: 40,
    nbEnRetard: 0, nbPaiementsAValider: 0, nbSignaturesAttendues: 0, prochaineEcheance: '2027-01-05',
  },
  {
    id: 'voyage-solidaire', associationId: 'entraide-yopougon', nom: 'Voyage solidaire', statut: 'en_cours',
    fondsEntree: 50000, montantEcheance: 10000, frequence: 'mensuelle', jourEcheance: 5,
    typeCalendrier: 'dates_fixes', dateDebut: '[DATE]', nbEcheances: 12, delaiGraceJours: 5,
    souscripteursRequis: null, modalitesPaiement: [{ moyen: 'mobile_money' }, { moyen: 'virement' }], contratModele: CONTRAT_MODELE,
    nbSouscripteurs: '[N]', montantCollecte: '[MONTANT]', montantAttenduADate: '[MONTANT]', tauxRecouvrement: '[N]', avancement: '[N]',
    nbEnRetard: 0, nbPaiementsAValider: 2, nbSignaturesAttendues: 1, prochaineEcheance: '2026-10-05', engagementParSouscripteur: 170000,
    apercuSouscripteurs: [{ nom: 'Moussa Diarra', ton: 'danger' }],
  },
  {
    // Projet de Moussa Diarra dans l'Association des ressortissants de Man (accueil souscripteur, historique).
    // Fonds d'entrée 20 000 F + 10 × 10 000 F = 120 000 F, déduits de l'historique (« entrée + juillet » = 30 000 F).
    id: 'mutuelle-sante', associationId: 'ressortissants-man', nom: 'Mutuelle santé', statut: 'en_cours',
    fondsEntree: 20000, montantEcheance: 10000, frequence: 'mensuelle', jourEcheance: 5,
    typeCalendrier: 'dates_fixes', dateDebut: '2026-07-05', nbEcheances: 10, delaiGraceJours: 5,
    souscripteursRequis: null, modalitesPaiement: [{ moyen: 'mobile_money' }], contratModele: CONTRAT_MODELE,
    nbSouscripteurs: '[N]', montantCollecte: '[MONTANT]', montantAttenduADate: '[MONTANT]', tauxRecouvrement: '[N]', avancement: '[N]',
    nbEnRetard: 0, nbPaiementsAValider: 0, nbSignaturesAttendues: 0, prochaineEcheance: '2026-10-05', engagementParSouscripteur: 120000,
  },
]

// ---------------------------------------------------------------- Souscripteurs
const TEL_INCONNU = '+225 [XX XX XX XX]'

export const souscripteurs: Souscripteur[] = [
  { id: 'moussa-diarra', prenom: 'Moussa', nom: 'Diarra', telephone: '+225 05 44 21 87 90', associationIds: ['entraide-yopougon', 'ressortissants-man'], membreDepuis: '2024-02-03' },
  { id: 'koffi-brou', prenom: 'Koffi', nom: 'Brou', telephone: '+225 07 [XX XX XX XX]', associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'jean-kouassi', prenom: 'Jean', nom: 'Kouassi', telephone: '+225 07 55 66 77 88', associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'fatou-traore', prenom: 'Fatou', nom: 'Traoré', telephone: '+225 01 22 33 44 55', associationIds: ['entraide-yopougon'], membreDepuis: '2026-09-02' },
  { id: 'awa-kone', prenom: 'Awa', nom: 'Koné', telephone: '+225 07 08 09 10 11', email: 'awa@entraide.ci', associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'kadiatou-sanogo', prenom: 'Kadiatou', nom: 'Sanogo', telephone: '+225 01 [XX XX XX XX]', associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'serge-gnagne', prenom: 'Serge', nom: 'Gnagne', telephone: '+225 05 [XX XX XX XX]', associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'ibrahim-toure', prenom: 'Ibrahim', nom: 'Touré', telephone: TEL_INCONNU, associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'adjoua-yao', prenom: 'Adjoua', nom: 'Yao', telephone: TEL_INCONNU, associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  // Présents dans les listes de la maquette, sans autre donnée.
  { id: 'mariam-diallo', prenom: 'Mariam', nom: 'Diallo', telephone: TEL_INCONNU, associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'yves-ahoussou', prenom: 'Yves', nom: 'Ahoussou', telephone: TEL_INCONNU, associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'clarisse-aka', prenom: 'Clarisse', nom: 'Aka', telephone: TEL_INCONNU, associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
  { id: 'aicha-bamba', prenom: 'Aïcha', nom: 'Bamba', telephone: TEL_INCONNU, associationIds: ['entraide-yopougon'], membreDepuis: '[DATE]' },
]

/**
 * Grille d'échéances de Centre communautaire (MgProjetPaiements.dc.html).
 * Un caractère par échéance : la 1re est le fonds d'entrée, puis mars 2026, avril… ;
 * `o` payée · `l` en retard · `W` déclarée, à valider · `P` partielle · `f` à venir. Au-delà : à venir.
 */
export const SEQUENCES_CENTRE: Record<string, string> = {
  'moussa-diarra': 'ooooooll',
  'koffi-brou': 'ooooooll',
  'jean-kouassi': 'ooooooPo',
  'awa-kone': 'oooooooWWW',
  'kadiatou-sanogo': 'oooooooW',
  'serge-gnagne': 'oooooooW',
  'fatou-traore': 'f',
  // Retardataires de la vue d'ensemble (MgProjet) : une échéance en retard (septembre).
  'mariam-diallo': 'oooooool',
  'yves-ahoussou': 'oooooool',
  'clarisse-aka': 'oooooool',
}

/** Mutuelle santé de Moussa Diarra : fonds d'entrée + juillet, août, septembre payés. */
export const SEQUENCES_MUTUELLE: Record<string, string> = {
  'moussa-diarra': 'oooo',
}

export const souscriptions: Souscription[] = [
  // Centre communautaire (annuaire, extrait)
  { id: 'sc-moussa-centre', souscripteurId: 'moussa-diarra', projetId: 'centre-communautaire', inscritLe: '2026-03-12', contratId: 'ct-moussa-centre', contratSigneLe: '2026-03-12', verse: 175000, reste: 325000, engagement: 500000, statut: 'en_retard', montantEnRetard: 50000 },
  { id: 'sc-koffi-centre', souscripteurId: 'koffi-brou', projetId: 'centre-communautaire', inscritLe: '2026-03-14', contratSigneLe: '2026-03-14', verse: 175000, reste: 325000, engagement: 500000, statut: 'en_retard', montantEnRetard: 50000 },
  { id: 'sc-jean-centre', souscripteurId: 'jean-kouassi', projetId: 'centre-communautaire', inscritLe: '2026-03-12', contratSigneLe: '2026-03-12', verse: 212500, reste: 287500, engagement: 500000, statut: 'en_retard', montantEnRetard: 12500 },
  { id: 'sc-fatou-centre', souscripteurId: 'fatou-traore', projetId: 'centre-communautaire', inscritLe: '2026-09-02', contratId: 'ct-fatou-centre', verse: 0, reste: 500000, engagement: 500000, statut: 'signature_attendue', montantEnRetard: 0 },
  { id: 'sc-awa-centre', souscripteurId: 'awa-kone', projetId: 'centre-communautaire', inscritLe: '2026-03-12', contratSigneLe: '2026-03-12', verse: 200000, reste: 300000, engagement: 500000, statut: 'a_jour', montantEnRetard: 0 },
  { id: 'sc-kadiatou-centre', souscripteurId: 'kadiatou-sanogo', projetId: 'centre-communautaire', inscritLe: '2026-03-20', contratSigneLe: '2026-03-20', verse: 200000, reste: 300000, engagement: 500000, statut: 'a_jour', montantEnRetard: 0 },
  { id: 'sc-serge-centre', souscripteurId: 'serge-gnagne', projetId: 'centre-communautaire', inscritLe: '2026-04-02', contratSigneLe: '2026-04-02', verse: 200000, reste: 300000, engagement: 500000, statut: 'a_jour', montantEnRetard: 0 },
  { id: 'sc-mariam-centre', souscripteurId: 'mariam-diallo', projetId: 'centre-communautaire', inscritLe: '[DATE]', contratSigneLe: '[DATE]', verse: 200000, reste: 300000, engagement: 500000, statut: 'en_retard', montantEnRetard: 25000 },
  { id: 'sc-yves-centre', souscripteurId: 'yves-ahoussou', projetId: 'centre-communautaire', inscritLe: '[DATE]', contratSigneLe: '[DATE]', verse: 200000, reste: 300000, engagement: 500000, statut: 'en_retard', montantEnRetard: 25000 },
  { id: 'sc-clarisse-centre', souscripteurId: 'clarisse-aka', projetId: 'centre-communautaire', inscritLe: '[DATE]', contratSigneLe: '[DATE]', verse: 200000, reste: 300000, engagement: 500000, statut: 'en_retard', montantEnRetard: 25000 },
  // Tontine solidaire 2027
  { id: 'sc-kadiatou-tontine', souscripteurId: 'kadiatou-sanogo', projetId: 'tontine-solidaire-2027', inscritLe: '[DATE]', verse: 0, reste: 0, engagement: 0, statut: 'a_jour', montantEnRetard: 0 },
  // Voyage solidaire
  { id: 'sc-moussa-voyage', souscripteurId: 'moussa-diarra', projetId: 'voyage-solidaire', inscritLe: '2026-09-18', contratId: 'ct-moussa-voyage', verse: 0, reste: 170000, engagement: 170000, statut: 'signature_attendue', montantEnRetard: 0 },
  { id: 'sc-ibrahim-voyage', souscripteurId: 'ibrahim-toure', projetId: 'voyage-solidaire', inscritLe: '[DATE]', verse: 0, reste: 170000, engagement: 170000, statut: 'a_jour', montantEnRetard: 0 },
  { id: 'sc-adjoua-voyage', souscripteurId: 'adjoua-yao', projetId: 'voyage-solidaire', inscritLe: '[DATE]', contratId: 'ct-adjoua-voyage', verse: 0, reste: 170000, engagement: 170000, statut: 'a_jour', montantEnRetard: 0 },
  // Mutuelle santé (Association des ressortissants de Man)
  { id: 'sc-moussa-mutuelle', souscripteurId: 'moussa-diarra', projetId: 'mutuelle-sante', inscritLe: '2026-07-01', contratId: 'ct-moussa-mutuelle', contratSigneLe: '2026-07-01', verse: 50000, reste: 70000, engagement: 120000, statut: 'a_jour', montantEnRetard: 0 },
]

/** Montants de l'annuaire donnés en placeholder dans la maquette (Ibrahim Touré). */
export const ANNUAIRE_PLACEHOLDERS: Record<string, { totalVerse: '[MONTANT]', totalReste: '[MONTANT]' }> = {
  'ibrahim-toure': { totalVerse: '[MONTANT]', totalReste: '[MONTANT]' },
}

// ---------------------------------------------------------------- Contrats
export const contrats: Contrat[] = [
  { id: 'ct-moussa-centre', projetId: 'centre-communautaire', souscripteurId: 'moussa-diarra', associationId: 'entraide-yopougon', texte: '[TEXTE DU CONTRAT]', engagement: 500000, statut: 'signe', envoyeLe: '2026-03-12', signeLe: '2026-03-12' },
  { id: 'ct-moussa-mutuelle', projetId: 'mutuelle-sante', souscripteurId: 'moussa-diarra', associationId: 'ressortissants-man', texte: '[TEXTE DU CONTRAT]', engagement: 120000, statut: 'signe', envoyeLe: '2026-07-01', signeLe: '2026-07-01' },
  { id: 'ct-moussa-voyage', projetId: 'voyage-solidaire', souscripteurId: 'moussa-diarra', associationId: 'entraide-yopougon', texte: '[TEXTE DU CONTRAT]', engagement: 170000, statut: 'a_signer', envoyeLe: '2026-09-18', signeParAssociationLe: '2026-09-18' },
  { id: 'ct-adjoua-voyage', projetId: 'voyage-solidaire', souscripteurId: 'adjoua-yao', associationId: 'entraide-yopougon', texte: '[TEXTE DU CONTRAT]', engagement: 170000, statut: 'a_signer', envoyeLe: '[DATE]' },
  { id: 'ct-fatou-centre', projetId: 'centre-communautaire', souscripteurId: 'fatou-traore', associationId: 'entraide-yopougon', texte: '[TEXTE DU CONTRAT]', engagement: 500000, statut: 'a_signer', envoyeLe: '[DATE]' },
]

// ---------------------------------------------------------------- Notifications
export const notifications: Notification[] = [
  // Moussa Diarra (MbNotifications) — 2 non lues
  { id: 'nt-mb-1', destinataireId: 'moussa-diarra', type: 'contrat_a_signer', titre: 'Contrat à signer', message: 'Entraide Yopougon vous invite à signer le contrat du projet Voyage solidaire.', creeeLe: '2026-09-25T09:12:00', lue: false, lien: '/projets/voyage-solidaire/contrat', libelleAction: 'Signer le contrat' },
  { id: 'nt-mb-2', destinataireId: 'moussa-diarra', type: 'echeance_en_retard', titre: 'Échéances en retard', message: 'Centre communautaire : 50 000 F en retard (août et septembre).', creeeLe: '2026-09-25T08:00:00', lue: false, lien: '/paiements/declarer?projet=centre-communautaire', libelleAction: 'Régulariser' },
  { id: 'nt-mb-3', destinataireId: 'moussa-diarra', type: 'echeance_proche', titre: 'Rappel d’échéance', message: 'Prochaine échéance le 5 octobre : 25 000 F pour Centre communautaire.', creeeLe: '2026-09-21T09:00:00', lue: true, lien: '/projets/centre-communautaire', libelleAction: 'Voir le projet' },
  { id: 'nt-mb-4', destinataireId: 'moussa-diarra', type: 'paiement_valide', titre: 'Paiement validé', message: 'Vos 10 000 F pour Mutuelle santé ont été validés.', creeeLe: '2026-09-06T09:00:00', lue: true, lien: '/historique', libelleAction: 'Voir l’historique' },
  { id: 'nt-mb-5', destinataireId: 'moussa-diarra', type: 'paiement_valide', titre: 'Paiement validé', message: 'Vos 10 000 F pour Mutuelle santé ont été validés.', creeeLe: '2026-08-06T09:00:00', lue: true, lien: '/historique', libelleAction: 'Voir l’historique' },
  { id: 'nt-mb-6', destinataireId: 'moussa-diarra', type: 'paiement_valide', titre: 'Paiement validé', message: 'Vos 25 000 F pour Centre communautaire ont été validés.', creeeLe: '2026-07-07T09:00:00', lue: true, lien: '/historique', libelleAction: 'Voir l’historique' },
  // Awa Koné, gestionnaire (MgNotifications) — 3 non lues
  { id: 'nt-mg-1', destinataireId: 'awa-kone', type: 'paiement_declare', titre: 'Nouvelle déclaration de paiement', message: 'Moussa Diarra a déclaré 75 000 F pour Centre communautaire (août, septembre, octobre).', creeeLe: '2026-09-25T10:41:00', lue: false, lien: '/asso/paiements', libelleAction: 'Vérifier et valider' },
  { id: 'nt-mg-2', destinataireId: 'awa-kone', type: 'paiement_declare', titre: '6 paiements à valider', message: 'Dont 4 sur Centre communautaire.', creeeLe: '2026-09-25T08:00:00', lue: false, lien: '/asso/paiements', libelleAction: 'Ouvrir la file de validation' },
  { id: 'nt-mg-3', destinataireId: 'awa-kone', type: 'relance', titre: 'Relance automatique envoyée', message: 'Règle « 15 jours de retard » : 14 souscripteurs relancés sur Centre communautaire.', creeeLe: '2026-09-25T07:30:00', lue: false, lien: '/asso/relances', libelleAction: 'Voir les retardataires' },
  { id: 'nt-mg-4', destinataireId: 'awa-kone', type: 'contrat_signe', titre: 'Contrat signé', message: '[Souscripteur] a signé le contrat Voyage solidaire.', creeeLe: '2026-09-22T09:00:00', lue: true, lien: '/asso/contrats', libelleAction: 'Voir les contrats' },
  { id: 'nt-mg-5', destinataireId: 'awa-kone', type: 'contrat_a_signer', titre: 'Contrat non signé', message: 'Fatou Traoré n’a pas encore signé le contrat Centre communautaire.', creeeLe: '2026-09-21T09:00:00', lue: true, lien: '/asso/souscripteurs/fatou-traore', libelleAction: 'Voir le souscripteur' },
  { id: 'nt-mg-6', destinataireId: 'awa-kone', type: 'abonnement', titre: 'Facture d’abonnement disponible', message: 'Facture [N° FACTURE] · formule Essentiel.', creeeLe: '[DATE]', lue: true, lien: '/asso/abonnement', libelleAction: 'Voir l’abonnement' },
  { id: 'nt-mg-7', destinataireId: 'awa-kone', type: 'paiement_valide', titre: 'Paiement validé par Serge Gnagne', message: 'Jean Kouassi · 12 500 F · Centre communautaire.', creeeLe: '[DATE]', lue: true, lien: '/asso/paiements', libelleAction: 'Voir le paiement' },
]

// ---------------------------------------------------------------- Demandes de création (SaDemandes)
function demande(
  id: string, nom: string, type: Demande['association']['type'], responsable: string, email: string, ville: string,
  souscripteursEstimes: string, planSouhaiteId: string, recueLe: string, statut: Demande['statut'], associationId?: string,
): Demande {
  const [prenom, ...reste] = responsable.split(' ')
  return {
    id, reference: '[RÉFÉRENCE]', recueLe, statut,
    association: { nom, type, ville, pays: 'Côte d’Ivoire', description: '[DESCRIPTION]' },
    responsable: { prenom: prenom ?? responsable, nom: reste.join(' '), fonction: '[FONCTION]', email, telephone: '[TÉLÉPHONE]' },
    besoins: { souscripteursEstimes, projetsEnvisages: '[N]', planSouhaiteId, source: '[SOURCE]' },
    cguAcceptees: true,
    ...(associationId ? { associationId } : {}),
  }
}

export const demandes: Demande[] = [
  demande('tontine-commercantes-adjame', 'Tontine des commerçantes d’Adjamé', 'tontine', 'Mariam Ouattara', 'm.ouattara@[domaine]', 'Abidjan', '50 à 100', 'essentiel', '2026-09-21', 'a_traiter'),
  demande('mutuelle-enseignants-daloa', 'Mutuelle des enseignants de Daloa', 'mutuelle', 'Koffi N’Guessan', 'k.nguessan@[domaine]', 'Daloa', 'Plus de 250', 'pro', '2026-09-22', 'a_traiter'),
  demande('groupement-femmes-korhogo', 'Groupement des femmes de Korhogo', 'groupement', 'Salimata Coulibaly', 's.coulibaly@[domaine]', 'Korhogo', 'Moins de 50', 'decouverte', '2026-09-23', 'a_traiter'),
  demande('etudiants-yamoussoukro', 'Association des étudiants de Yamoussoukro', 'association', 'Yao Kouamé', 'y.kouame@[domaine]', 'Yamoussoukro', '50 à 100', 'decouverte', '2026-09-24', 'a_traiter'),
  demande('jeunesse-bouake', 'Jeunesse solidaire de Bouaké', 'association', '[Responsable]', '[email]', 'Bouaké', 'Moins de 50', 'decouverte', '2026-09-20', 'approuvee', 'jeunesse-bouake'),
  demande('ressortissants-man', 'Association des ressortissants de Man', 'association', '[Responsable]', '[email]', 'Abidjan', '100 à 250', 'pro', '2025-01-14', 'approuvee', 'ressortissants-man'),
  demande('entraide-yopougon', 'Entraide Yopougon', 'association', 'Awa Koné', 'awa@entraide.ci', 'Abidjan', '50 à 100', 'decouverte', '2024-02-03', 'approuvee', 'entraide-yopougon'),
  demande('amis-grand-bassam', 'Club des amis de Grand-Bassam', 'association', '[Responsable]', '[email]', 'Grand-Bassam', 'Moins de 50', 'decouverte', '2026-09-11', 'refusee'),
]
