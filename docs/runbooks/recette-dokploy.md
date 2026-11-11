# Recette sur Dokploy (lot 7.1, étape 2, anticipée)

Pile de production (`infra/compose/staging.yml`, dérivée de `production.yml`) déployée par le Dokploy du serveur, avec
un vrai nom de domaine en https. Sert à tester depuis n'importe quel appareil (ordinateur, téléphone, PWA iOS, push).

| | |
|---|---|
| Application | <https://cotiz.regisnda.com> (service `web`, port 3000) |
| Stockage public | <https://cotiz-fichiers.regisnda.com> (service `minio`, port 9000 : liens signés des preuves et PDF) |
| Dokploy | projet **Cotiz** › environnement *production* › compose **cotiz-recette** |
| Source | dépôt GitHub public, branche `backend`, fichier `./infra/compose/staging.yml` |
| Certificats | Let's Encrypt par le Traefik de Dokploy (DNS `*.regisnda.com` vers ce serveur) |

`NODE_ENV=production` : aucune donnée de démonstration (`seed-dev` refusé), aucun mot de passe connu. Les écrans des
lots pas encore livrés n'ont pas de données (front construit sans handlers simulés).

## Configurer ou mettre à jour

```bash
node tools/recette-dokploy.mjs                 # source, variables, domaines (sans déployer)
node tools/recette-dokploy.mjs --deployer      # idem, puis déploiement (images construites sur le serveur)
node tools/recette-dokploy.mjs --branche lot/x --deployer   # essayer une branche avant sa fusion
```

- Clé d'API Dokploy : `~/.config/cotiz-dokploy.key` (droits 600), ou `DOKPLOY_API_KEY`. Création : Dokploy › Settings ›
  Profile › API/CLI.
- Les secrets (base, JWT, chiffrement des codes, MinIO, VAPID) sont générés **une seule fois** et rangés dans l'onglet
  Environment du service ; une relance garde ceux qui y sont. Ne pas les modifier à la main : un mot de passe de base
  changé ne s'applique pas à un volume existant, une clé de chiffrement changée rend illisibles les codes en attente.
- Après une fusion sur `backend`, redéployer : `--deployer`, ou le bouton **Deploy** de Dokploy.

## Premier compte (owner plateforme)

À lancer **dans son propre terminal** (le code d'activation ne doit passer ni par un chat ni par des journaux partagés) :

```bash
docker exec -it $(docker ps -q -f name=cotizrecette -f label=com.docker.compose.service=api) \
  node dist/cli.js create-platform-owner vous@exemple.ci Prénom Nom
```

La commande affiche un code d'activation et le lien `/activer?espace=plateforme` : ouvrir
<https://cotiz.regisnda.com/activer?espace=plateforme>, saisir l'email, le code, choisir un mot de passe. Ensuite, depuis
l'espace plateforme : créer un plan (`/plateforme/plans`), puis faire une demande d'association depuis la page publique
(`/demande`) et l'accepter.

## Vérifier

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cotiz.regisnda.com/api/v1/health/ready   # 200
```

Suivi d'un déploiement : Dokploy › cotiz-recette › Deployments (journal de construction) ; journaux d'un service :
onglet Logs, ou `docker logs <conteneur>`.

## Arrêter ou supprimer

Dokploy › cotiz-recette › **Stop** (données gardées). La suppression du service et de ses volumes efface la base de
recette : à demander explicitement.
