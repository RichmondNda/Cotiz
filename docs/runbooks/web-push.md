# Activer le Web Push (lot 4.2)

Le push suit le standard Web Push (RFC 8030/8291, VAPID), sans SDK ni compte chez un fournisseur. C'est le navigateur
qui choisit le service de push de l'appareil ; le worker appelle l'URL que le navigateur a fournie. Le push est
**désactivé** tant que ces variables manquent (`GET /me` n'annonce pas `web_push`, et le bloc « Notifications sur
cet appareil » n'apparaît pas).

| Variable | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | paire générée par `pnpm --filter backend cli push-vapid-keys` (secret : coffre du déploiement) |
| `VAPID_SUBJECT` | `mailto:` ou URL de contact de l'exploitant |
| `WEB_PUSH_HOSTS` | services de push acceptés, suffixes d'hôte séparés par des virgules (voir ci-dessous) |

`WEB_PUSH_HOSTS` sert de garde contre le SSRF : une URL d'abonnement hors de la liste est refusée (422
`unsupported_push_service`), et un appareil dont le service est retiré de la liste est désabonné au prochain envoi. Il n'y a
pas de valeur par défaut dans le code : le test « sans fournisseur » (lot 3.5) interdit d'y écrire un hôte de fournisseur.

Valeur pour les navigateurs courants :

```
WEB_PUSH_HOSTS=fcm.googleapis.com,updates.push.services.mozilla.com,push.apple.com,notify.windows.com
```

- `fcm.googleapis.com` : Chrome, Edge, Android (navigateurs Chromium)
- `updates.push.services.mozilla.com` : Firefox
- `push.apple.com` : Safari (macOS, iOS 16.4+ en application installée sur l'écran d'accueil)
- `notify.windows.com` : anciens Edge et applications Windows

Les deux processus (api et worker) doivent recevoir les mêmes valeurs. Pour changer les clés VAPID, voir
`rotate-secrets.md` (lot 7.1) : chaque appareil doit alors se réabonner.
