# Avancement

Mis à jour par `/fin-lot`. Statuts : `à faire` · `en cours` · `terminé` · `bloqué`.

## Front V0 (lots front, `prompts/`) — terminé

Tous les écrans de la maquette sur mocks Nitro, lots 00 à 09 fusionnés sur `main` (PR #1 à #7) : `frontend/`, CI (`.github/workflows/ci.yml`), contrat V0 `docs/api-v0.md`, placeholders `docs/placeholders-v0.md`.

## Back-end et intégration (lots `docs/lots/`)

| Lot | Titre | Statut | Étape en cours | Terminé le | Jours estimés | Jours réels | Remarques |
|---|---|---|---|---|---|---|---|
| 0.1 | Monorepo, CI et environnements | terminé | — | 2026-10-01 | 4 | — | PR #9 ; CI complète en 5 min ; bascule de `sys.health` reportée au lot 0.3 (registre et proxy créés à son étape 4, aucun écran ni mock concerné) ; ClamAV local `unhealthy` à surveiller au lot 0.5 |
| 0.2 | Contrats et logique métier partagée | à faire | — | — | 10 | — | |
| 0.3 | Aligner la V0 du front sur le contrat | à faire | — | — | 8 | — | |
| 0.4 | Base de données, isolation et contexte tenant | à faire | — | — | 7 | — | |
| 0.5 | Socle transverse : outbox, stockage, audit, idempotence | à faire | — | — | 8 | — | |
| 0.6 | Observabilité minimale | à faire | — | — | 3 | — | |
| 1.1 | Identité, authentification et activation | à faire | — | — | 11 | — | |
| 1.2 | Associations, plans et abonnements (socle) | à faire | — | — | 8 | — | |
| 1.3 | Demandes, approbation et création directe | à faire | — | — | 9 | — | |
| 1.4 | Gestion des associations et tableau de bord plateforme | à faire | — | — | 8 | — | |
| 2.1 | Espace association et configuration | à faire | — | — | 5 | — | |
| 2.2 | Projets | à faire | — | — | 9 | — | |
| 2.3 | Souscripteurs, inscriptions, échéances et codes à remettre | à faire | — | — | 13 | — | |
| 2.4 | Registre : grille et validation des paiements | à faire | — | — | 14 | — | |
| 2.5 | Notifications dans l'application | à faire | — | — | 5 | — | |
| 2.6 | Rapport de projet et tableau de bord | à faire | — | — | 6 | — | |
| 3.1 | Activation du souscripteur, profil et réinitialisations | à faire | — | — | 5 | — | |
| 3.2 | Tableau de bord et projets du souscripteur | à faire | — | — | 5 | — | |
| 3.3 | Déclaration de paiement | à faire | — | — | 8 | — | |
| 3.4 | Historique du souscripteur | à faire | — | — | 3 | — | |
| 3.5 | Recette locale du jalon V1 | à faire | — | — | 5 | — | |
| 4.1 | Contrats et génération PDF | à faire | — | — | 12 | — | |
| 4.2 | Temps réel et Web Push | à faire | — | — | 9 | — | |
| 4.3 | Relances automatiques et file « À relancer » | à faire | — | — | 6 | — | |
| 4.4 | Imports en masse | à faire | — | — | 8 | — | |
| 4.5 | Équipe et multi-associations | à faire | — | — | 5 | — | |
| 4.6 | Facturation, exports et statistiques d'usage | à faire | — | — | 9 | — | |
| 4.7 | Sécurité renforcée et audit consultable | à faire | — | — | 6 | — | |
| 5.1 | Rapprochement par relevés importés | à faire | — | — | 12 | — | |
| 5.2 | API publique, webhooks sortants et analytique | à faire | — | — | 18 | — | |
| 6.1 | Email (option) | à faire | — | — | 6 | — | |
| 6.2 | Passerelle SMS (option) | à faire | — | — | 6 | — | |
| 6.3 | Paiement en ligne via prestataire agréé (option) | à faire | — | — | 25 | — | |
| 7.1 | Mise en ligne : recette Dokploy, observabilité et production | à faire | — | — | 10 | — | |
