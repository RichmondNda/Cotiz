# À vérifier par un humain

Format : **date** · point — constat, source · ce qui est attendu. Une fois tranché : déplacer dans « Tranché », avec la réponse.

## Points ouverts

- **2026-11-02** · lot 2.4, deux points de la définition de fini — (1) « `pnpm verify` vert en CI » pour la PR #25 : non vérifiable
  ici (dépôt privé, pas de `gh`) ; (2) « Revue humaine ligne à ligne de la transaction de validation » (`lg.pay.validate`,
  `backend/src/modules/ledger/application/`) : à faire par un humain. Le lot est marqué `terminé` sous cette réserve.
  · Confirmer les deux, ou installer `gh` (`sudo apt install gh` puis `gh auth login`) pour que Claude lise la CI.
  Revérifié le 2026-11-02 : `gh` est installé (`/usr/bin/gh`) mais pas connecté → lancer `! gh auth login`.
- **2026-11-02** · accès Docker — `dev` n'est pas dans le groupe `docker` : les tests base, intégration et isolation ne tournent pas
  en local, et la démonstration locale est impossible. · Lancer `sudo usermod -aG docker dev`, puis ouvrir une nouvelle session.
  Revérifié le 2026-11-02 : toujours non (`id -nG` → `dev sudo users`, `docker ps` → permission denied).
- **2026-11-02** · décision 11 — Toujours `proposé` dans `docs/decisions.md` (`due` affiché « À venir ») alors que le lot 2.4
  l'applique. · L'adopter ?
- **2026-11-02** · ADR 0016 — Exception d'audit temporaire, « réexamen au plus tard le 2026-11-09 » (lot 0.3, `docs/progress.md`).
  · Échéance dans 7 jours.
  Revérifié le 2026-11-02 (`pnpm audit --prod` sortie 0 ; `pnpm view`) : aucune GHSA retirable — `braces` 3.0.3 et
  `deepmerge` 4.3.1 sans nouvelle version, `@sentry/bundler-plugins` 11.10.0 dépend toujours de `glob ^13.0.6`.
  Nouveau chemin non signalé dans l'ADR : `glob`/`minimatch` arrivent aussi par
  `nuxt > @nuxt/nitro-server > nitropack 2.13.5 > archiver > archiver-utils`/`readdir-glob` (outil de build).
  `nuxt` 4.6.4 est publié (`@nuxt/nitro-server` 4.6.4 → `nitropack ^2.13.6` → `archiver ^8`) : monter `nuxt`
  supprimerait sans doute ce chemin. À faire au réexamen (ou dans le prochain lot touchant le front).

## Demandes d'accord (actions sensibles)

- **2026-11-02** · `git push` de `chore/notes-claude` (vers GitHub, puis PR vers `backend`) — Non fait : l'utilisateur doit le demander.

## Tranché

- **2026-11-02** · `/fin-lot 2.4` → oui, fait (`docs/progress.md`).
- **2026-11-02** · mise à jour de « Où en est-on » de `CLAUDE.md` → oui, faite.
- **2026-11-02** · plan d'un `/lot` sans validation → oui (`CLAUDE.md`, `.claude/commands/lot.md`).
- **2026-11-02** · installation des dépendances → oui, faite (pnpm via corepack, `pnpm install`).
- **2026-11-02** · retard de `main` sur `backend` → normal, `backend` n'est fusionnée dans `main` que sur demande.
