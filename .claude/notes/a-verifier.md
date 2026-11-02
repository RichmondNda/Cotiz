# À vérifier par un humain

Format : **date** · point — constat, source · ce qui est attendu. Une fois tranché : déplacer dans « Tranché », avec la réponse.

## Points ouverts

- **2026-11-02** · lot 2.4, revue humaine ligne à ligne de la transaction de validation (`lg.pay.validate`,
  `backend/src/modules/ledger/application/`) — à faire par un humain. Le lot est marqué `terminé` sous cette réserve.
  · Confirmer la revue.
- **2026-11-02** · accès Docker — `dev` n'est pas dans le groupe `docker` : les tests base, intégration et isolation ne tournent pas
  en local, et la démonstration locale est impossible. · Lancer `sudo usermod -aG docker dev`, puis ouvrir une nouvelle session.
  Revérifié le 2026-11-02 : toujours non (`id -nG` → `dev sudo users`, `docker ps` → permission denied).

## Demandes d'accord (actions sensibles)

- **2026-11-02** · `git push` de `chore/notes-claude` (vers GitHub, puis PR vers `backend`) — Non fait : l'utilisateur doit le demander.
- **2026-11-02** · `git push` de `chore/nuxt-4.6.4` (commit `9db93b2`, part de `origin/backend`), puis PR vers `backend`
  — Non fait : à demander. Les tests base, intégration et isolation n'ont pas tourné en local (pas de Docker) : la CI les jouera.

## Tranché

- **2026-11-02** · ADR 0016 → feu vert pour nuxt 4.6.4 : fait sur `chore/nuxt-4.6.4`. Aucune GHSA retirable ; chemin
  `nitropack > @vercel/nft > glob` ajouté à l'ADR ; prochain réexamen au plus tard le 2026-12-07.
- **2026-11-02** · décision 11 (`due` affiché « À venir ») → adoptée, `docs/decisions.md` mis à jour.
- **2026-11-02** · CI de la PR #25 (lot 2.4) → verte : `gh pr view 25` montre 6 vérifications sur 6 en `SUCCESS`
  (dont « Vérifications (pnpm verify) et build »), sur le commit `4c2a163`, fusionnée le 2026-11-02.
- **2026-11-02** · `/fin-lot 2.4` → oui, fait (`docs/progress.md`).
- **2026-11-02** · mise à jour de « Où en est-on » de `CLAUDE.md` → oui, faite.
- **2026-11-02** · plan d'un `/lot` sans validation → oui (`CLAUDE.md`, `.claude/commands/lot.md`).
- **2026-11-02** · installation des dépendances → oui, faite (pnpm via corepack, `pnpm install`).
- **2026-11-02** · retard de `main` sur `backend` → normal, `backend` n'est fusionnée dans `main` que sur demande.
