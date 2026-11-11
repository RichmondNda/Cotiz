// Identifiants de docs/specs/endpoints.yaml servis par le vrai back (NestJS), et pour quels espaces.
// `all` : toute requête de l'endpoint part vers NestJS. Liste d'espaces : seulement les requêtes de ces espaces
// (espace lu dans le jeton Bearer, le corps ou le jeton de réinitialisation : server/bascule/proxy.ts) ; les autres
// restent sur le mock. Ajouter un id = commande /bascule. Tout part vers NestJS quand NUXT_MOCKS=0.
import type { EndpointId } from '@cotiz/contracts'

export type BasculeSpace = 'platform' | 'association' | 'subscriber'
export type BasculeRule = 'all' | readonly BasculeSpace[]

/**
 * Dépôt et lecture de fichiers (fl.*) : espace plateforme. Le logo d'une association passe par as.upload et as.file
 * (décision 24, lot 2.1). La preuve d'un souscripteur se dépose par fl.upload depuis le lot 3.3 et se relit par fl.get
 * depuis le lot 3.4 (justificatifs de l'historique). La preuve vue par un gestionnaire reste simulée.
 */

export const REAL_ENDPOINTS: ReadonlyMap<EndpointId, BasculeRule> = new Map<EndpointId, BasculeRule>([
  ['sys.health', 'all'],
  // Lot 1.1, ouverts aux trois espaces au lot 1.2 (appartenances réelles) : connexion, session et identité.
  ['auth.login', 'all'],
  ['auth.refresh', 'all'],
  ['auth.logout', 'all'],
  ['auth.activate', 'all'],
  ['auth.forgot', 'all'],
  ['auth.verify', 'all'],
  ['auth.reset', 'all'],
  ['me', 'all'],
  ['fl.upload', ['platform', 'subscriber']],
  ['fl.get', ['platform', 'subscriber']],
  // Lot 1.2 : plans (tarifs publics, gestion par le super-admin).
  ['pub.plans', 'all'],
  ['pf.plans', 'all'],
  ['pf.plan.write', 'all'],
  ['pf.plan.archive', 'all'],
  // Lot 1.3 : demandes de création (formulaire public, anti-robot, pages légales), approbation et création directe.
  ['pub.challenge', 'all'],
  ['pub.request', 'all'],
  ['pub.legal', 'all'],
  ['pf.req.list', 'all'],
  ['pf.req.get', 'all'],
  ['pf.req.approve', 'all'],
  ['pf.req.reject', 'all'],
  ['pf.asso.create', 'all'],
  // Lot 1.4 : liste, fiche, modification, suspension et changement de plan des associations (super-admin).
  ['pf.asso.list', 'all'],
  ['pf.asso.get', 'all'],
  ['pf.asso.patch', 'all'],
  ['pf.asso.suspend', 'all'],
  ['pf.asso.plan', 'all'],
  // Lot 1.4 : demandes de réinitialisation des gestionnaires (écran ajouté, sans mock).
  ['pf.resets', 'all'],
  // Lot 1.4 : tableau de bord plateforme (vues matérialisées, tâche stats.refresh).
  ['pf.dashboard', 'all'],
  // Lot 2.1 : profil, logo, moyens de paiement, onboarding et abonnement de l'association (espace gestionnaire).
  ['as.get', 'all'],
  ['as.patch', 'all'],
  ['as.upload', 'all'],
  ['as.file', 'all'],
  ['as.pm', 'all'],
  ['as.pm.list', 'all'],
  ['as.onb', 'all'],
  ['bl.sub', 'all'],
  // Lot 2.2 : projets (liste, assistant de création et aperçu, paramètres, cycle de vie, vue d'ensemble).
  ['pr.list', 'all'],
  ['pr.create', 'all'],
  ['pr.preview', 'all'],
  ['pr.get', 'all'],
  ['pr.patch', 'all'],
  ['pr.lifecycle', 'all'],
  ['pr.delete', 'all'],
  ['pr.overview', 'all'],
  // Lot 2.3 : souscripteurs (recherche, inscription, ajout en lot, retrait, annuaire, fiche, frise), codes à remettre
  // et onglets Projets / Souscripteurs de la fiche plateforme.
  ['mb.lookup', 'all'],
  ['en.list', 'all'],
  ['en.create', 'all'],
  ['en.withdraw', 'all'],
  ['en.bulk', 'all'],
  ['mb.resend', 'all'],
  ['mb.codes', 'all'],
  ['mb.list', 'all'],
  ['mb.get', 'all'],
  ['mb.patch', 'all'],
  ['mb.timeline', 'all'],
  ['pf.asso.sub', 'all'],
  // Lot 2.4 : registre (grille d'un projet, détail d'une échéance), file et détail des paiements, validation, rejet et
  // annulation d'une validation.
  ['lg.grid', 'all'],
  ['lg.inst', 'all'],
  ['lg.pay.list', 'all'],
  ['lg.pay.get', 'all'],
  ['lg.pay.validate', 'all'],
  ['lg.pay.reject', 'all'],
  ['lg.pay.revert', 'all'],
  // Lot 2.5 : notifications dans l'application (cloche, compteur, pages de notifications des trois espaces).
  ['nt.list', 'all'],
  ['nt.read', 'all'],
  // Lot 4.2 : flux temps réel de la cloche (SSE, aucun handler simulé).
  ['nt.stream', 'all'],
  // Lot 4.2 : abonnement Web Push de l'appareil (aucun handler simulé : bloc masqué sans le vrai back).
  ['me.push', 'all'],
  // Lot 4.2 : préférences de notification. Plateforme encore simulée : SaProfil règle des types sans événement (lot 6).
  ['me.prefs', ['association', 'subscriber']],
  // Lot 2.6 : rapport de projet (onglet Rapports), tableau de bord gestionnaire.
  ['rp.report', 'all'],
  ['as.dashboard', 'all'],
  // Lot 3.1 : profil de la personne connectée, réinitialisations des souscripteurs (mg-resets).
  ['me.profile', 'all'],
  ['as.resets', 'all'],
  // Lot 3.2 : tableau de bord et projets du souscripteur.
  ['me.dash', 'all'],
  ['me.projects', 'all'],
  ['me.project', 'all'],
  // Lot 3.3 : déclaration de paiement (aperçu de répartition ; l'assistant garde aussi son calcul local), suivi.
  ['me.alloc', 'all'],
  ['me.declare', 'all'],
  ['me.payment', 'all'],
  // Lot 3.4 : historique du souscripteur (liste et série mensuelle).
  ['me.history', 'all'],
  // Lot 4.1 : contrats (éditeur et liste du gestionnaire, signature et contrats du souscripteur, PDF signé).
  ['ct.get', 'all'],
  ['ct.list', 'all'],
  ['me.contract', 'all'],
  ['me.sign', 'all'],
  ['me.contracts', 'all'],
])
