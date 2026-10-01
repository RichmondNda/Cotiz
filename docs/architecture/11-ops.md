# 11 · Exploitation : observabilité, infrastructure, sauvegardes

## Observabilité
| Pilier | Outil | Contenu |
|---|---|---|
| Journaux | pino (JSON) → Logstash → Elasticsearch → Kibana (stack ELK existante, deviantony/docker-elk sur Dokploy) | Une ligne par requête et par tâche : `requestId`, `traceId`, route, statut, durée, `associationId`, utilisateur pseudonymisé. **Jamais** : corps de requête, mot de passe, code, téléphone en clair |
| Métriques | Prometheus + Grafana | RED par route ; PostgreSQL/PgBouncer ; files BullMQ ; âge du plus vieil événement outbox ; métier (déclarations, validations, délai médian, activations, codes non remis) |
| Traces | OpenTelemetry → Collector → Tempo | HTTP → PostgreSQL → Redis → BullMQ → worker ; 10 %, 100 % des erreurs |
| Erreurs | GlitchTip (SDK Sentry, auto-hébergé) | Front et back, version déployée, données personnelles filtrées |
| Disponibilité | Uptime Kuma | `/health/ready`, TLS, parcours de connexion synthétique |

Alertes Grafana → **ntfy auto-hébergé** (application mobile) ; Telegram possible si accepté.
| Alerte | Seuil | Gravité |
|---|---|---|
| 5xx | > 2 % / 5 min | Critique |
| Latence p95 | > 1 s / 10 min | Avertissement |
| Outbox en retard | > 2 min | Critique |
| Tâches en échec | > 20 / 15 min | Avertissement |
| Disque | > 80 % | Avertissement |
| Dernière sauvegarde | > 26 h | Critique |
| Certificat TLS | < 14 jours | Avertissement |
| Échecs de connexion | × 5 la normale | Sécurité |

SLO : disponibilité 99,5 %/mois ; 99 % des notifications in-app créées < 2 min après l'événement.
Recommandation : ELK, Prometheus, Grafana, Tempo, GlitchTip et Uptime Kuma sur un **second VPS** (sinon Loki à la place d'Elasticsearch, Uptime Kuma hors du VPS applicatif).

## Environnements
| Env | Où | Données | Déploiement |
|---|---|---|---|
| Local | `docker compose` (`infra/compose/local.yml`) ; pile de production répétée en local au lot 3.5 (`infra/compose/production.yml`) | Jeu de référence | Manuel |
| Recette | Projet Dokploy séparé (à partir du lot 7.1) | Fictives uniquement | Automatique à chaque fusion sur `main` |
| Production | VPS applicatif (à partir du lot 7.1) | Réelles | Sur étiquette de version, validation manuelle |

Tout est développé et testé en local avant la mise en ligne : la recette Dokploy, le raccordement de l'observabilité et la production arrivent ensemble au lot 7.1, en dernier.

## CI/CD (GitHub Actions)
1. PR : lint, types, tests unitaires, intégration (Testcontainers), isolation, frontières de modules, conformité des mocks, `oasdiff`, contrôle de cohérence des docs.
2. Fusion sur `main` : images, Trivy, GHCR, webhook Dokploy recette, Playwright en recette (à partir du lot 7.1 ; avant, la CI construit les images sans les publier).
3. Étiquette : migrations en tâche préalable, déploiement production après validation.
Migrations « étendre puis contracter » : jamais de `DROP` dans le même déploiement qu'un changement de code.

## Sauvegarde et reprise
| Élément | Méthode | Objectif |
|---|---|---|
| PostgreSQL | pgBackRest ou WAL-G : complète quotidienne + WAL continu vers le second VPS (ou stockage objet hors site) | RPO 5 min |
| MinIO | Versionnement + `mc mirror` nocturne hors site | RPO 24 h |
| Redis | AOF | Reconstruisible depuis l'outbox |
| Configuration | `infra/` dans Git | Réinstallation reproductible |
| Reprise complète | Runbook testé | RTO 4 h |
Restauration complète testée une fois par mois, avec alerte si elle échoue.

## Dimensionnement de départ
VPS applicatif 4 vCPU, 8 Go, 160 Go SSD ; VPS observabilité 4 vCPU, 8 Go.
