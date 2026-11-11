# Environnement de dev sur Dokploy

La pile Docker de développement (`local.yml` + `app.yml`, réunis dans `infra/compose/dev-dokploy.yml`), en ligne pour
tester sans rien installer : écrans encore simulés compris, comptes de démonstration prêts.

| | |
|---|---|
| Application | <https://cotiz.dev.regisnda.com> (service `web`, port 3000), **derrière un mot de passe d'accès** |
| Stockage public | <https://cotiz-fichiers.dev.regisnda.com> (service `minio`, port 9000 : liens signés seulement) |
| Dokploy | projet **Cotiz** › environnement *dev* › compose **cotiz-dev** |
| Source | dépôt GitHub public, branche `backend`, fichier `./infra/compose/dev-dokploy.yml` |

Différences avec la recette (`recette-dokploy.md`) : `NODE_ENV=development`, mocks Nitro pour les endpoints pas encore
réels, données de démonstration (`seed-dev` relancé à chaque déploiement), clés JWT éphémères (un redéploiement de
l'api déconnecte tout le monde).

## Mot de passe d'accès

Le dépôt est public : les mots de passe des comptes de démonstration (`frontend/server/mocks/IDENTIFIANTS.md`) sont
connus de tous. Tout le site est donc derrière une authentification HTTP (basic auth de Traefik) : utilisateur `cotiz`,
mot de passe généré au premier passage de l'outil, lisible par son propriétaire seul :

```bash
cat ~/.config/cotiz-dev-acces      # dans son propre terminal
```

Dans Dokploy, seul son hash est rangé (`COTIZ_DEV_BASIC_AUTH`). Pour en changer : supprimer cette variable dans l'onglet
Environment, relancer l'outil avec `--deployer`.

Limite : derrière une authentification HTTP, l'installation en application (PWA, iPhone « Sur l'écran d'accueil ») est
peu fiable. Pour tester le push sur iPhone, utiliser la recette.

## Configurer ou mettre à jour

```bash
node tools/recette-dokploy.mjs --cible dev                  # environnement, service, variables, domaines
node tools/recette-dokploy.mjs --cible dev --deployer       # idem, puis déploiement
node tools/recette-dokploy.mjs --cible dev --branche lot/x --deployer   # essayer une branche avant sa fusion
```

Clé d'API Dokploy : `~/.config/cotiz-dokploy.key` (voir `recette-dokploy.md`).

## Comptes

Ceux de `frontend/server/mocks/IDENTIFIANTS.md` (souscripteur Moussa Diarra, gestionnaire Awa Koné, super-admin…).
Code d'activation de Fatou Traoré (compte non activé) : journaux du service `seed` du dernier déploiement (Dokploy ›
cotiz-dev › Logs › seed).

## Vérifier

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cotiz.dev.regisnda.com/               # 401 sans mot de passe
curl -s -o /dev/null -w '%{http_code}\n' -u "cotiz:$(sed -n 's/^mot de passe : //p' ~/.config/cotiz-dev-acces)" \
  https://cotiz.dev.regisnda.com/api/v1/health/ready                                    # 200
```
