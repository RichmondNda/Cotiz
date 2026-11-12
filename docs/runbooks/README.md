# Runbooks (à rédiger au lot 7.1)

- `restore.md` — restauration complète PostgreSQL + MinIO sur un nouveau VPS
- `incident.md` — qui prévenir, comment diagnostiquer (GlitchTip → Kibana → Tempo), communication
- `suspend-association.md` — suspension d'urgence
- `suspected-leak.md` — fuite de données suspectée : gel, investigation par l'audit, notification
- `rotate-secrets.md` — clés JWT, clé de chiffrement des codes (re-chiffrement), VAPID, accès base
- `reset-platform-password.md` — CLI `reset-password`
- `web-push.md` — activer le Web Push : clés VAPID et liste `WEB_PUSH_HOSTS` (lot 4.2, rédigé)
- `tester-push-docker.md` — tester le Web Push sur un PC avec Docker (lot 4.2, rédigé)
- `recette-dokploy.md` — recette sur Dokploy : cotiz.regisnda.com, `tools/recette-dokploy.mjs` (lot 7.1 étape 2, anticipée)
- `dev-dokploy.md` — pile de dev en ligne : cotiz.dev.regisnda.com, comptes de démonstration au mot de passe secret
