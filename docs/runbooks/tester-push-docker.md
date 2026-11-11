# Tester le Web Push sur un autre PC, avec Docker (lot 4.2)

Pile de développement complète (base, Redis, stockage, api, worker, front) dans Docker, push activé. Rien d'autre à
installer que Docker et git. Fonctionnement du push et liste des services : `web-push.md`.

## Prérequis

- Docker avec Compose v2 (`docker compose version`), git, environ 6 Go de disque pour les images.
- Accès à internet : le navigateur passe par le service de push de son éditeur (`fcm.googleapis.com` pour Chrome et Edge,
  `updates.push.services.mozilla.com` pour Firefox).
- Chrome, Edge ou Firefox **sur ce même PC** : `http://localhost` est un contexte sécurisé, le service worker y est accepté.
  Depuis un autre appareil du réseau (téléphone), il faudrait du https : hors de cette fiche.
- Ports libres : ceux de `infra/compose/local.yml` (PostgreSQL, Redis, stockage…), plus 4000 (api) et 3080 (front).
- Notifications du système autorisées pour le navigateur (Windows : Paramètres › Notifications ; macOS : Réglages ›
  Notifications ; mode « Ne pas déranger » coupé).

## 1. Récupérer le code

```bash
git clone https://github.com/RichmondNda/Cotiz.git
cd Cotiz
git checkout backend          # branche d'intégration, avec le lot 4.2 fusionné
```

Toutes les commandes suivantes se lancent depuis la racine du dépôt.

## 2. Construire l'image et générer les clés VAPID

```bash
docker compose -f infra/compose/local.yml -f infra/compose/app.yml build api
docker compose -f infra/compose/local.yml -f infra/compose/app.yml run --rm --no-deps api \
  node dist/cli.js push-vapid-keys | grep '^VAPID_'
```

Deux lignes s'affichent : `VAPID_PUBLIC_KEY=…` et `VAPID_PRIVATE_KEY=…`. Elles sont propres à ce PC : ne les commitez
pas, ne les envoyez pas. Gardez-les le temps du test (une nouvelle paire oblige à réactiver le push dans le navigateur).

## 3. Exporter les variables du push

Bash (Linux, macOS, WSL, Git Bash) — remplacez `…` par les valeurs de l'étape 2 :

```bash
export COTIZ_VAPID_PUBLIC_KEY=…
export COTIZ_VAPID_PRIVATE_KEY=…
export COTIZ_WEB_PUSH_HOSTS=fcm.googleapis.com,updates.push.services.mozilla.com,push.apple.com,notify.windows.com
```

PowerShell :

```powershell
$env:COTIZ_VAPID_PUBLIC_KEY = "…"
$env:COTIZ_VAPID_PRIVATE_KEY = "…"
$env:COTIZ_WEB_PUSH_HOSTS = "fcm.googleapis.com,updates.push.services.mozilla.com,push.apple.com,notify.windows.com"
```

Ces variables ne valent que pour ce terminal : lancer les étapes suivantes depuis le même terminal.

## 4. Démarrer la pile avec le push, puis créer les comptes

```bash
docker compose -f infra/compose/local.yml -f infra/compose/app.yml -f infra/compose/push.yml up -d --build
docker compose -f infra/compose/local.yml -f infra/compose/app.yml --profile seed run --rm seed
```

Le premier `up` construit le front et lance les migrations (quelques minutes). Une variable manquante arrête tout de suite
avec « required variable COTIZ_… is missing a value » : reprendre l'étape 3. Le seed affiche aussi des codes d'activation :
inutiles pour ce test.

## 5. Contrôler que le push est actif

```bash
docker compose -f infra/compose/local.yml -f infra/compose/app.yml -f infra/compose/push.yml exec api \
  sh -c 'test -n "$VAPID_PUBLIC_KEY" && test -n "$VAPID_PRIVATE_KEY" && test -n "$WEB_PUSH_HOSTS" && echo "push configuré"'
```

Attendu : `push configuré` (rien d'autre : les clés ne s'affichent pas). Sinon : reprendre l'étape 3, puis l'étape 4 dans
le même terminal. Même contrôle possible sur `worker` à la place d'`api`.

## 6. Scénario de test

Comptes et mot de passe de démonstration : `frontend/server/mocks/IDENTIFIANTS.md`.

1. **Souscripteur** : ouvrir <http://localhost:3080/connexion>, se connecter en Moussa Diarra (05 44 21 87 90).
2. Aller sur **Profil**. Le bloc « Notifications sur cet appareil » et la colonne **Push** de « Me prévenir quand… »
   doivent être là. Activer l'interrupteur, puis **Autoriser** dans la demande du navigateur.
3. **Gestionnaire**, dans une fenêtre de navigation privée (ou un autre navigateur) :
   <http://localhost:3080/connexion/association>, Awa Koné (awa@entraide.ci).
4. **Paiements** › à valider : valider le paiement en attente de **Moussa Diarra**.
5. Attendu, côté souscripteur :
   - onglet ouvert : la cloche se met à jour seule, sans recharger (flux temps réel) ;
   - onglet ou navigateur fermé : une notification du système « Paiement validé » ; un clic ouvre Cotiz.
6. Couper le réglage **Push** de « Paiement validé » dans le profil : un nouvel envoi de ce type arrive dans la cloche,
   plus sur le système. Pour un deuxième essai sans autre paiement en attente, **rejeter** une déclaration de Moussa
   (« Déclaration rejetée » : type « action requise », sa cloche ne se coupe jamais, son push si).
7. **Se déconnecter** côté souscripteur : l'appareil est désabonné ; un nouvel envoi n'arrive plus.

**Heures calmes** : de 21 h à 8 h, heure de l'association (Abidjan, UTC+0), un push non urgent (paiement validé,
rejeté…) est différé à 8 h ; la cloche, elle, est immédiate. Tester en journée, ou attendre 8 h.

## 7. Si rien n'arrive

Derniers envois push (le worker crée la ligne au moment d'envoyer) :

```bash
docker compose -f infra/compose/local.yml -f infra/compose/app.yml exec postgres \
  psql -U cotiz -d cotiz -c "SELECT status, attempts, last_error, recipient_masked, created_at FROM deliveries WHERE channel = 'push' ORDER BY created_at DESC LIMIT 5"
```

Journaux du worker (seuls les échecs y sont écrits, message « envoi push en échec ») :

```bash
docker compose -f infra/compose/local.yml -f infra/compose/app.yml -f infra/compose/push.yml logs -f worker
```

| Ce qu'on voit | Cause probable |
|---|---|
| Pas de bloc appareil dans le profil | push non configuré (étape 5), ou navigateur sans Web Push (navigation privée de Firefox, par exemple) |
| « Bloquées dans les réglages du navigateur » | permission refusée : la rétablir dans les réglages du site (cadenas de la barre d'adresse) |
| « Navigateur non pris en charge » | service de push du navigateur absent de `COTIZ_WEB_PUSH_HOSTS` |
| Aucune ligne `deliveries` après la validation | heures calmes (envoi différé à 8 h), réglage Push coupé pour ce type, ou appareil non activé |
| `failed`, `last_error = no_device` | appareil désabonné entre-temps (déconnexion, autre personne sur ce navigateur) : réactiver le push |
| `failed` avec une autre erreur, ou « envoi push en échec » dans les journaux | pas d'accès à internet, ou clés VAPID changées depuis l'abonnement : désactiver puis réactiver le push |
| `sent`, aucune notification | notifications du système coupées pour le navigateur, ou mode « Ne pas déranger » |

## 8. Arrêter

```bash
docker compose -f infra/compose/local.yml -f infra/compose/app.yml -f infra/compose/push.yml down
```

Les données restent dans les volumes Docker. `down -v` les supprime aussi (base, stockage) : à ne faire que pour
repartir de zéro.
