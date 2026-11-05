# Décisions

Statuts : `ouvert` (bloque le lot indiqué) · `proposé` (valable par défaut, à confirmer) · `adopté` · `reporté`.

| N° | Sujet | Proposition / décision | À trancher avant le lot | Statut |
|---|---|---|---|---|
| 1 | Mix automatique / manuel à l'approbation d'une association | Espace et compte créés automatiquement ; décision, plan et message manuels | 1.3 | proposé |
| 2 | Identifiants du souscripteur | Code d'activation remis par le gestionnaire (8 caractères, 72 h) ; la personne choisit son mot de passe | 2.3 | adopté (sans fournisseur) |
| 3 | Fournisseur SMS et identifiant d'expéditeur | Sans objet avant le lot 6.2 (option) | 6.2 | reporté |
| 4 | Fournisseur ou serveur email | Sans objet avant le lot 6.1 (option) | 6.1 | reporté |
| 5 | Pays d'hébergement | À décider avec l'avis juridique | 7.1 | ouvert |
| 6 | Trop-perçu | Refusé en V1 (amount_exceeds_remaining) | 3.3 | adopté |
| 7 | Dispense d'une échéance | Statut waived prévu ; écran à ajouter si besoin confirmé | 4.3 | ouvert |
| 8 | Durées de conservation | Tableau de architecture/13-compliance.md | 7.1 | ouvert |
| 9 | Contenu des plans et quotas | Structure figée (`plans` de `schema.sql`, quotas projets, souscripteurs et gestionnaires, `null` = illimité). Valeurs de départ, pour les données initiales et la démo : celles de `seed-reference.yaml` (Découverte 0 F, 1 / 20 / 1 ; Essentiel 10 000 F, 5 / 100 / 2 ; Pro 25 000 F, illimité / 500 / 5). Les valeurs commerciales définitives se règlent ensuite depuis l'écran super-admin (`pf.plan.write`), sans changement de code | 1.2 | adopté |
| 10 | Second VPS d'observabilité | Recommandé ; sinon Loki + Uptime Kuma hors du VPS applicatif | 7.1 | ouvert |
| 11 | Statut « due » (échue, dans le délai de grâce) | Affiché « À venir » (la spec UI n'a pas de badge dédié) | 2.4 | adopté |
| 12 | Anti-robots sans service tiers | Champ piège + ALTCHA auto-hébergé + limitation de débit | 1.3 | adopté |
| 13 | Chiffres de Moussa dans la spec UI | 2 échéances × 25 000 F = **50 000 F** en retard, comme les maquettes et la V0 ; `seed-reference.yaml` corrigé | 0.3 | adopté |
| 14 | Organisation du dépôt | `frontend/` (Nuxt 4 existant) + `backend/` (NestJS) + `packages/*`, workspace pnpm à la racine ; pas de `apps/` | 0.1 | adopté |
| 15 | Contrat d'API de référence | `docs/specs/endpoints.yaml` (`/api/v1`, anglais) ; la V0 (`docs/api-v0.md`, chemins français) est alignée au lot 0.3 | 0.2 | adopté |
| 16 | Données simulées | Mocks Nitro conservés (pas de MSW), alignés sur le contrat ; bascule par proxy Nitro (`frontend/server/bascule/`) | 0.3 | adopté |
| 17 | Tableau de bord souscripteur | Route `/accueil` (la spec UI dit `/`, pris par la landing) | — | adopté |
| 18 | Maquette et « sans fournisseur » | Le rendu suit `design/` ; seuls les écarts listés dans `specs/ui-deviations.md` priment sur la maquette, dans le lot de l'écran | — | adopté |
| 19 | Espace `system` sur des routes HTTP (`sys.health`, `psp.webhook` dans `endpoints.yaml`) alors que `architecture/02` le réserve au worker | Passer ces deux routes en `space: public` ; le contexte tenant refuse `system` hors du worker (test au lot 0.4) ; `psp.webhook` ouvre ensuite un contexte `association` pour l'association du paiement confirmé | 0.4 | ouvert |
| 20 | Échéancier d'une inscription en attente de signature : `architecture/04-flows.md` le génère à la création (§ 4.3, ligne 20) et à la signature (§ 4.6, ligne 64) | Généré **à la signature** ; rien avant (aucune échéance, pas de retard possible). `enrolledFrom` = date d'entrée choisie à l'inscription (`startsFrom`), pas la date de signature. Appliqué par les mocks du lot 0.3 | 2.3 | proposé |
| 21 | Chiffres des maquettes non réalisables par les seuls souscripteurs nommés (52 souscripteurs, 14 en retard, 9 594 000 F…) | Mocks du lot 0.3 : calcul sur les inscriptions nommées + complément agrégé déclaré et réalisable (`frontend/server/mocks/db/seed.ts`, `UNLISTED`). Le seed de démonstration (lot 0.4+) génère de vraies inscriptions. Appliqué au lot 2.6 : 47 souscripteurs de démonstration réels dans `seed-dev` (Entraide Yopougon), chiffres de référence retrouvés au 2026-09-25 (`backend/test/integration/reporting-seed-reference.test.ts`) | 0.4 | adopté |
| 22 | Essais de code d'activation et existence d'un compte (lot 1.1, étape 7) | Un identifiant sans code en base (inconnu, ou sans code) compte ses essais dans Redis comme un vrai code les compte en base : `too_many_attempts` au même essai, aucune différence visible. Reste visible : `code_expired` (seulement pour un compte qui a un code échu), conformément à `errors.yaml`. Un tiers qui connaît un identifiant peut épuiser un code en 5 essais : réparable, le gestionnaire régénère le code | 1.1 | adopté |
| 23 | Accès `cotiz_platform` (BYPASSRLS), audit des routes `/platform`, `If-Match` d'une création (lot 1.2) | [ADR 0017](adr/0017-acces-plateforme-if-match.md) : connexion choisie d'après la route `/platform` du contrat, jamais d'après le jeton ; écritures auditées, lectures si `audited` ; `seed-dev` seul script autorisé (dev et test) ; exception `ifMatch: false` sur un POST 201 | 1.2 | adopté |
| 24 | Logo d'association : `fl.upload` refuse un jeton association (403), le jeton ne portant pas l'association (lot 1.2, choix Q1 : association lue dans l'URL) | Route de dépôt sous `/associations/{aid}/…` (mêmes schémas que `fl.upload`), vérifiée par `MembershipGuard` ; pas d'`associationId` dans le corps | 2.1 | adopté (`as.upload`, `as.file`) |
| 25 | Passage d'une appartenance de `invited` à `active` (non spécifié) | À l'usage du code remis : `auth.activate` pour un souscripteur (lot 3.1), acceptation du code `team_invite` pour un gestionnaire (lot 4.5) ; `joined_at` posé à ce moment. D'ici là, connexion et activation acceptent `invited` (lot 1.2) | 3.1 | proposé |
| 26 | `/me` : rôle et permissions de la première association gérée active (lot 1.2) ; même règle pour la cloche du gestionnaire (`nt.list`, compteur de non-lus, lot 2.5) | Conservé tant qu'une personne gère une seule association ; le choix de l'association courante (`/me`, en-tête du front, cloche) arrive avec le multi-associations | 4.5 | proposé |
