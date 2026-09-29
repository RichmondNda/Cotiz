# Lots d'implémentation

Ordre conseillé de haut en bas. Un lot ne commence que si ses dépendances sont terminées (`docs/progress.md`).

La V0 du front (tous les écrans, sur mocks Nitro) est **déjà livrée** : lots front 00 à 09 de `prompts/`, commande `/lot-front`. Les lots ci-dessous construisent le back-end et basculent le front endpoint par endpoint.

Les lots 0.3 (front) et 0.4–0.6 (back) peuvent avancer en parallèle après 0.2 / 0.1 ; ensuite, le front d'un lot reste sur données simulées pendant que le back est construit.

| Lot | Titre | Phase | Jours | Dépend de | Tables | Endpoints |
|---|---|---|---|---|---|---|
| [0.1](0.1-monorepo-ci.md) | Monorepo, CI et environnements | Phase 0 · Fondations | 5 | — | 0 | 1 |
| [0.2](0.2-contrats-domaine.md) | Contrats et logique métier partagée | Phase 0 · Fondations | 10 | 0.1 | 0 | 0 |
| [0.3](0.3-v0-contrat.md) | Aligner la V0 du front sur le contrat | Phase 0 · Fondations | 8 | 0.2 | 0 | 0 |
| [0.4](0.4-base-isolation.md) | Base de données, isolation et contexte tenant | Phase 0 · Fondations | 7 | 0.1 | 0 | 0 |
| [0.5](0.5-socle-transverse.md) | Socle transverse : outbox, stockage, audit, idempotence | Phase 0 · Fondations | 8 | 0.4 | 3 | 2 |
| [0.6](0.6-observabilite.md) | Observabilité minimale | Phase 0 · Fondations | 4 | 0.1 | 0 | 0 |
| [1.1](1.1-identite-auth.md) | Identité, authentification et activation | V1 · Super-admin | 11 | 0.5 | 6 | 8 |
| [1.2](1.2-associations-plans.md) | Associations, plans et abonnements (socle) | V1 · Super-admin | 8 | 1.1 | 5 | 4 |
| [1.3](1.3-demandes-approbation.md) | Demandes, approbation et création directe | V1 · Super-admin | 9 | 1.2 | 1 | 7 |
| [1.4](1.4-gestion-associations.md) | Gestion des associations et tableau de bord plateforme | V1 · Super-admin | 8 | 1.3 | 0 | 7 |
| [2.1](2.1-espace-association.md) | Espace association et configuration | V1 · Gestionnaire | 5 | 1.4 | 0 | 5 |
| [2.2](2.2-projets.md) | Projets | V1 · Gestionnaire | 9 | 2.1 | 2 | 8 |
| [2.3](2.3-souscripteurs-codes.md) | Souscripteurs, inscriptions, échéances et codes à remettre | V1 · Gestionnaire | 13 | 2.2 | 3 | 12 |
| [2.4](2.4-registre-validation.md) | Registre : grille et validation des paiements | V1 · Gestionnaire | 14 | 2.3 | 2 | 7 |
| [2.5](2.5-notifications-in-app.md) | Notifications dans l'application | V1 · Gestionnaire | 5 | 2.4 | 2 | 2 |
| [2.6](2.6-rapports-dashboard.md) | Rapport de projet et tableau de bord | V1 · Gestionnaire | 6 | 2.4 | 0 | 2 |
| [3.1](3.1-activation-profil.md) | Activation du souscripteur, profil et réinitialisations | V1 · Souscripteur | 5 | 2.5 | 0 | 2 |
| [3.2](3.2-espace-souscripteur.md) | Tableau de bord et projets du souscripteur | V1 · Souscripteur | 5 | 3.1 | 0 | 3 |
| [3.3](3.3-declaration.md) | Déclaration de paiement | V1 · Souscripteur | 8 | 3.2 | 0 | 3 |
| [3.4](3.4-historique.md) | Historique du souscripteur | V1 · Souscripteur | 3 | 3.3 | 0 | 1 |
| [3.5](3.5-jalon-v1.md) | Recette du jalon V1 et mise en production | V1 · Souscripteur | 10 | 3.4 | 0 | 0 |
| [4.1](4.1-contrats-pdf.md) | Contrats et génération PDF | V2 · Automatisation | 12 | 3.5 | 2 | 5 |
| [4.2](4.2-temps-reel-push.md) | Temps réel et Web Push | V2 · Automatisation | 9 | 3.5 | 3 | 3 |
| [4.3](4.3-relances.md) | Relances automatiques et file « À relancer » | V2 · Automatisation | 6 | 4.2 | 2 | 4 |
| [4.4](4.4-imports.md) | Imports en masse | V2 · Automatisation | 8 | 3.5 | 2 | 4 |
| [4.5](4.5-equipe-multi-assos.md) | Équipe et multi-associations | V2 · Automatisation | 5 | 3.5 | 0 | 2 |
| [4.6](4.6-facturation-exports.md) | Facturation, exports et statistiques d'usage | V2 · Automatisation | 9 | 4.1 | 3 | 5 |
| [4.7](4.7-securite-audit.md) | Sécurité renforcée et audit consultable | V2 · Automatisation | 6 | 3.5 | 1 | 3 |
| [5.1](5.1-rapprochement.md) | Rapprochement par relevés importés | V3 · Ouverture | 12 | 4.4 | 2 | 2 |
| [5.2](5.2-api-publique.md) | API publique, webhooks sortants et analytique | V3 · Ouverture | 18 | 5.1 | 3 | 3 |
| [6.1](6.1-option-email.md) | Email (option) | Groupe 6 · Fournisseurs externes (options) | 6 | 4.2 | 0 | 0 |
| [6.2](6.2-option-sms.md) | Passerelle SMS (option) | Groupe 6 · Fournisseurs externes (options) | 6 | 4.3 | 0 | 0 |
| [6.3](6.3-option-paiement-en-ligne.md) | Paiement en ligne via prestataire agréé (option) | Groupe 6 · Fournisseurs externes (options) | 25 | 5.1 | 1 | 2 |

| Phase | Jours-personne |
|---|---|
| Phase 0 · Fondations | 42 |
| V1 · Super-admin | 36 |
| V1 · Gestionnaire | 52 |
| V1 · Souscripteur | 31 |
| V2 · Automatisation | 55 |
| V3 · Ouverture | 30 |
| Groupe 6 · Fournisseurs externes (options) | 37 |
| **Jusqu'au jalon V1 (3.5)** | **161** |
| **Total** | **283** |

Estimations en jours de travail concentré, tests et revue inclus, **hors** marge (+25 % conseillés). Avec Claude Code, la saisie va plus vite ; la revue, la recette et les décisions prennent le même temps : recaler après les lots 0.2 et 1.1.
