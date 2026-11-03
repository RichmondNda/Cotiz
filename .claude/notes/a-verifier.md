# À vérifier par un humain

Format : **date** · point — constat, source · ce qui est attendu. Une fois tranché : déplacer dans « Tranché », avec la réponse.

## Points ouverts

- **2026-11-03** · `architecture/07-notifications.md` renvoie à une section `notification-matrix` de `specs/events.yaml` qui
  n'existe pas — la matrice est le tableau d'`architecture/07` (cohérent avec les consommateurs d'`events.yaml`). Lot 2.5 :
  matrice en code + test contre `events.yaml`. · Ajouter la section à `events.yaml` ou corriger le renvoi (au choix).

## Demandes d'accord (actions sensibles)

## Tranché

- **2026-11-03** · revue humaine du lot 2.4 (transaction de validation) → validée par l'utilisateur ; `docs/progress.md` mis à jour.
  Règle durable ajoutée dans `CLAUDE.md` (« Méthode de travail ») : la revue humaine est acquise quand l'utilisateur approuve
  ou fusionne la PR qui porte le code.

- **2026-11-03** · `git push` des branches `lot/*` et `chore/*` + PR vers `backend` → autorisé durablement (règle ajoutée
  dans « Mode autonome » de `CLAUDE.md`). Fusion d'une PR, `--force`, push vers `main`/`backend` : toujours sur demande.
  Appliqué aussitôt à `chore/notes-claude` et `chore/nuxt-4.6.4`.

- **2026-11-02** · accès Docker → `dev` ajouté au groupe `docker` (`getent group docker`). En attendant une nouvelle session,
  passer par `sg docker -c "<commande>"`. `pnpm verify` sur `chore/nuxt-4.6.4` : tout vert sauf `enrollment-create`,
  tombé au démarrage (`Lock is not acquired/owned by you`, verrou du reaper testcontainers) ; relancé seul : 41/41.
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
