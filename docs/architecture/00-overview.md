# 00 · Vue d'ensemble

> Lire en premier. Les autres fichiers de ce dossier détaillent chaque sujet.
> En cas de conflit entre un document HTML historique (architecture, roadmap, plan) et ce dossier, **ce dossier fait foi**.
> Pour le **rendu** d'un écran, la maquette `design/` fait foi, sauf les écarts listés dans `specs/ui-deviations.md`.

## Le produit en une phrase
Cotiz est un SaaS multi-tenant qui permet à une association (Afrique de l'Ouest francophone, montants en F CFA) de gérer des **projets de cotisation** : elle inscrit des **souscripteurs**, un **échéancier** est généré pour chacun, le souscripteur paie **hors plateforme** (virement, mobile money, espèces) puis **déclare** son paiement avec une preuve ; un **gestionnaire valide**. Un paiement peut couvrir **plusieurs échéances** (répartition / allocations).

## Les trois espaces (+ le site public)
| Espace | Utilisateurs | Préfixe API | Préfixe front |
|---|---|---|---|
| Public | Visiteurs | `/public`, `/auth` | `/`, `/demande`, `/connexion/*` |
| Plateforme (super-admin) | Personnel Cotiz | `/platform` | `/plateforme` |
| Association (gestionnaire) | owner, manager, viewer | `/associations/{aid}` | `/asso` |
| Souscripteur | Membres qui cotisent | `/me` | `/accueil`, `/projets`, `/paiements`, `/historique`… (connecté) |

## Principe directeur : aucun fournisseur externe avant le groupe 6
Tout le produit (lots 0.1 à 5.2) fonctionne **sans aucun service tiers** : ni SMS, ni email transactionnel, ni prestataire de paiement, ni captcha hébergé, ni polices Google.
| Besoin | Solution intégrée | Option (groupe 6) |
|---|---|---|
| Remettre un code d'activation | Code affiché au gestionnaire + message prêt (Copier, lien WhatsApp `wa.me`, lien `sms:`, fiche imprimable avec QR) | SMS automatique (6.2) |
| Mot de passe oublié | Demande traitée par le rôle supérieur qui émet un code ; super-admin : script | Libre-service par email (6.1) |
| Prévenir d'un événement | Cloche in-app, SSE, Web Push standard (clés VAPID à nous) | Email, SMS |
| Relancer | Rappels in-app/push + file « À relancer » avec messages prêts | Envoi automatique SMS/email |
| Confirmer un paiement | Déclaration + preuve + validation ; rapprochement par relevés importés (5.1) | Prestataire agréé (6.3) |
| Anti-robots | Champ piège + preuve de travail auto-hébergée (ALTCHA) + limitation de débit | — |
| Polices | Poppins et Inter auto-hébergées (`@fontsource`) — la V0 charge encore Google Fonts : migration au lot 0.1 | — |
| PDF, fichiers, antivirus, journaux | Gotenberg, MinIO, ClamAV, ELK hébergés par nous | — |

Tous les canaux passent par l'interface `NotificationChannel` (voir 07). Un canal du groupe 6 s'active par configuration **et** par `features` ; désactivé, le produit fonctionne à l'identique.

> Web Push utilise les services de push des navigateurs (Google, Mozilla, Apple) comme simple transport chiffré : aucun compte, contrat ni clé tierce. C'est accepté comme « sans fournisseur ».

## Pile technique
- **Front** : Nuxt 4 dans `frontend/` (V0 livrée : tous les écrans, sur mocks Nitro), TypeScript strict, design system CSS de `design/` (ni Tailwind ni bibliothèque UI). Données simulées : handlers Nitro alignés sur le contrat (lot 0.3), bascule endpoint par endpoint vers NestJS.
- **Back** : NestJS, deux processus depuis la même image : `api` (HTTP) et `worker` (outbox, BullMQ, tâches planifiées).
- **Données** : PostgreSQL 16 + PgBouncer (mode transaction), Redis 7 (BullMQ, cache court, limitation, révocation), MinIO (S3).
- **Services** : Gotenberg (HTML → PDF), ClamAV.
- **Accès base** : Drizzle ORM.
- **Dépôt** : workspace pnpm + Turborepo (`frontend/`, `backend/`, `packages/*`).
- **Observabilité** : pino → ELK existant, Prometheus + Grafana, OpenTelemetry → Tempo, GlitchTip, Uptime Kuma.
- **Déploiement** : Docker Compose via Dokploy sur VPS, Traefik.

## Conteneurs
| Conteneur | Rôle | Réplicas au départ |
|---|---|---|
| web | Nuxt | 1 → 2 |
| api | NestJS HTTP, sans état | 2 |
| worker | Même code, point d'entrée `worker.ts` | 1 |
| gotenberg | Rendu PDF | 1 |
| clamav | Antivirus | 1 |
| postgres + pgbouncer, redis, minio | Données | 1 |

## Où trouver quoi
| Sujet | Fichier |
|---|---|
| Modules et frontières | [01-modules.md](01-modules.md) |
| Isolation multi-tenant, permissions | [02-tenancy-security.md](02-tenancy-security.md) |
| Authentification, codes | [03-auth.md](03-auth.md) |
| Flux critiques (approbation, projet, inscription, déclaration, validation) | [04-flows.md](04-flows.md) |
| Événements, files, tâches planifiées | [05-events-jobs.md](05-events-jobs.md) |
| Conventions d'API | [06-api-conventions.md](06-api-conventions.md) |
| Notifications et canaux | [07-notifications.md](07-notifications.md) |
| Fichiers et PDF | [08-files-pdf.md](08-files-pdf.md) |
| Cache et performance | [09-cache-performance.md](09-cache-performance.md) |
| Intégration front (contrat, mocks Nitro, bascule) | [10-front-integration.md](10-front-integration.md) |
| Observabilité, infra, sauvegardes | [11-ops.md](11-ops.md) |
| Tests | [12-testing.md](12-testing.md) |
| Conformité et données personnelles | [13-compliance.md](13-compliance.md) |
| Organisation du code | [14-code-organization.md](14-code-organization.md) |
| Spécifications structurées | [../specs/](../specs/) |
