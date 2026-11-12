# Environnement de dev sur Dokploy

La pile Docker de développement (`local.yml` + `app.yml`, réunis dans `infra/compose/dev-dokploy.yml`), en ligne pour
tester sans rien installer : écrans encore simulés compris, comptes de démonstration prêts.

| | |
|---|---|
| Application | <https://cotiz.dev.regisnda.com> (service `web`, port 3000) |
| Stockage public | <https://cotiz-fichiers.dev.regisnda.com> (service `minio`, port 9000 : liens signés seulement) |
| Dokploy | projet **Cotiz** › environnement *dev* › compose **cotiz-dev** |
| Source | dépôt GitHub public, branche `backend`, fichier `./infra/compose/dev-dokploy.yml` |

Différences avec la recette (`recette-dokploy.md`) : `NODE_ENV=development`, mocks Nitro pour les endpoints pas encore
réels, données de démonstration (`seed-dev` relancé à chaque déploiement), clés JWT éphémères (un redéploiement de
l'api déconnecte tout le monde).

## Mot de passe des comptes de démonstration

Le dépôt est public : le mot de passe des comptes de démonstration écrit dans `frontend/server/mocks/IDENTIFIANTS.md` est
connu de tous. Ici, il est remplacé par un mot de passe secret (`COTIZ_DEV_SEED_PASSWORD`, onglet Environment de
Dokploy), généré au premier passage de l'outil et lisible par son propriétaire seul :

```bash
cat ~/.config/cotiz-dev-acces      # dans son propre terminal
```

Le seed le pose sur tous les comptes actifs à chaque déploiement et ne l'affiche jamais. Pour en changer : supprimer la
variable dans l'onglet Environment, relancer l'outil avec `--deployer`.

Pas d'authentification HTTP devant le site : le front envoie son jeton dans l'en-tête `Authorization`, que Traefik
réserverait à son mot de passe (toute requête à l'api refusée en 401). Pages publiques (accueil, demande d'association)
visibles de tous, comme en recette ; PWA et push utilisables, iPhone compris.

## Configurer ou mettre à jour

```bash
node tools/recette-dokploy.mjs --cible dev                  # environnement, service, variables, domaines
node tools/recette-dokploy.mjs --cible dev --deployer       # idem, puis déploiement
node tools/recette-dokploy.mjs --cible dev --branche lot/x --deployer   # essayer une branche avant sa fusion
```

Clé d'API Dokploy : `~/.config/cotiz-dokploy.key` (voir `recette-dokploy.md`).

## Comptes

Ceux de `frontend/server/mocks/IDENTIFIANTS.md` (souscripteur Moussa Diarra, gestionnaire Awa Koné, super-admin…), avec
le mot de passe secret ci-dessus.
Code d'activation de Fatou Traoré (compte non activé) : journaux du service `seed` du dernier déploiement (Dokploy ›
cotiz-dev › Logs › seed).

## Vérifier

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cotiz.dev.regisnda.com/api/v1/health/ready   # 200
```
