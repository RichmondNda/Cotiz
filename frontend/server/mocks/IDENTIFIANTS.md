# Identifiants des écrans de connexion

Les trois espaces se connectent au vrai back depuis le lot 1.2 (`server/bascule/real-endpoints.ts` : `auth.*`, `me`).
Le cookie `cotiz_role` n'est plus qu'un relais pour les écrans encore simulés : la garde de l'espace le pose après une
vraie connexion (`app/utils/garde-espace.ts`).

Prérequis : `docker compose -f infra/compose/local.yml up -d`, `pnpm db:migrate`, `pnpm dev` (api + web), puis les
données de développement (comptes, associations, plans, abonnements et appartenances, aux UUID des données simulées) :

```bash
COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev   # développement seulement ; PLATFORM_DATABASE_URL requise
```

Mot de passe des comptes actifs : `Plateau-Dev-Cotiz-2026`.

| Espace | Page | Identifiant | Personne | Arrivée |
|---|---|---|---|---|
| Souscripteur | `/connexion` | 05 44 21 87 90 | Moussa Diarra (Entraide Yopougon, Ressortissants de Man) | `/accueil` |
| Souscripteur | `/connexion` | 07 55 66 77 88 | Jean Kouassi | `/accueil` |
| Souscripteur | `/activer?espace=souscripteur&t=0122334455` | 01 22 33 44 55 | Fatou Traoré, **non activée** : code d'activation affiché par `seed-dev` (nouveau à chaque exécution), puis mot de passe au choix | `/accueil` |
| Gestionnaire | `/connexion/association` | awa@entraide.ci | Awa Koné, owner d'Entraide Yopougon | `/asso` |
| Super-admin | `/connexion/plateforme` | richy@cotiz.app | Richy, owner plateforme (pas de second facteur avant le lot 4.7) | `/plateforme` |

Autre mot de passe : « Identifiant ou mot de passe incorrect » ; au 5ᵉ échec, blocage de 15 min (compteur Redis :
`docker compose -f infra/compose/local.yml restart redis` pour l'effacer). Les écrans encore simulés montrent toujours
les données de Moussa Diarra et d'Awa Koné, quel que soit le compte connecté (`cotiz_role` → personne fixe,
`server/mocks/http.ts`) : connecté en Jean ou Fatou, un écran simulé affiche les inscriptions de Moussa. L'isolation
entre souscripteurs ne se vérifie donc à l'écran que sur les endpoints basculés.

États d'erreur des captures (`/verifier-ecran`) : réponses imposées par `scripts/reponses-imposees.mjs` (association
suspendue, compte bloqué, compte non activé, code expiré…), sans toucher aux comptes de développement.

Nouveau compte plateforme, sans fournisseur : `pnpm --filter backend cli create-platform-owner <email> <prénom> <nom>`
affiche un code à remettre et le lien `/activer?espace=plateforme`. Mot de passe perdu du personnel plateforme :
`pnpm --filter backend cli reset-password <email>` affiche un code à 6 chiffres, à saisir sur
`/mot-de-passe?profil=plateforme`. Gestionnaires et souscripteurs : code remis par une personne (lots 1.3 et 2.3).

## Ajout d'un souscripteur — recherche du téléphone

| Téléphone | Résultat |
|---|---|
| 05 44 21 87 90 (sur un projet où Moussa est inscrit) | « déjà inscrit » |
| 01 00 00 00 01 (Ibrahim Touré, hors du projet) | compte existant |
| autre | nouveau compte (code d'activation `K7M4-P9QX`) |

## Identifiants (UUID)

Les ressources des mocks ont des UUID déterministes (`server/mocks/ids.ts`, `uid('project', 'centre-communautaire')`).
