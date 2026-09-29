# Décisions

Statuts : `ouvert` (bloque le lot indiqué) · `proposé` (valable par défaut, à confirmer) · `adopté` · `reporté`.

| N° | Sujet | Proposition / décision | À trancher avant le lot | Statut |
|---|---|---|---|---|
| 1 | Mix automatique / manuel à l'approbation d'une association | Espace et compte créés automatiquement ; décision, plan et message manuels | 1.3 | proposé |
| 2 | Identifiants du souscripteur | Code d'activation remis par le gestionnaire (8 caractères, 72 h) ; la personne choisit son mot de passe | 2.3 | adopté (sans fournisseur) |
| 3 | Fournisseur SMS et identifiant d'expéditeur | Sans objet avant le lot 6.2 (option) | 6.2 | reporté |
| 4 | Fournisseur ou serveur email | Sans objet avant le lot 6.1 (option) | 6.1 | reporté |
| 5 | Pays d'hébergement | À décider avec l'avis juridique | 3.5 | ouvert |
| 6 | Trop-perçu | Refusé en V1 (amount_exceeds_remaining) | 3.3 | adopté |
| 7 | Dispense d'une échéance | Statut waived prévu ; écran à ajouter si besoin confirmé | 4.3 | ouvert |
| 8 | Durées de conservation | Tableau de architecture/13-compliance.md | 3.5 | ouvert |
| 9 | Contenu des plans et quotas | Structure prête ; valeurs commerciales à définir | 1.2 | ouvert |
| 10 | Second VPS d'observabilité | Recommandé ; sinon Loki + Uptime Kuma hors du VPS applicatif | 3.5 | ouvert |
| 11 | Statut « due » (échue, dans le délai de grâce) | Affiché « À venir » (la spec UI n'a pas de badge dédié) | 2.4 | proposé |
| 12 | Anti-robots sans service tiers | Champ piège + ALTCHA auto-hébergé + limitation de débit | 1.3 | adopté |
| 13 | Chiffres de Moussa dans la spec UI | 2 échéances × 25 000 F = **50 000 F** en retard, comme les maquettes et la V0 ; `seed-reference.yaml` corrigé | 0.3 | adopté |
| 14 | Organisation du dépôt | `frontend/` (Nuxt 4 existant) + `backend/` (NestJS) + `packages/*`, workspace pnpm à la racine ; pas de `apps/` | 0.1 | adopté |
| 15 | Contrat d'API de référence | `docs/specs/endpoints.yaml` (`/api/v1`, anglais) ; la V0 (`docs/api-v0.md`, chemins français) est alignée au lot 0.3 | 0.2 | adopté |
| 16 | Données simulées | Mocks Nitro conservés (pas de MSW), alignés sur le contrat ; bascule par proxy Nitro (`frontend/server/bascule/`) | 0.3 | adopté |
| 17 | Tableau de bord souscripteur | Route `/accueil` (la spec UI dit `/`, pris par la landing) | — | adopté |
| 18 | Maquette et « sans fournisseur » | Le rendu suit `design/` ; seuls les écarts listés dans `specs/ui-deviations.md` priment sur la maquette, dans le lot de l'écran | — | adopté |
