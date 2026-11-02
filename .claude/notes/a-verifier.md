# À vérifier par un humain

Format : **date** · point — constat, source · ce qui est attendu. Rayer (`~~…~~`) ou retirer une fois tranché, avec la réponse.

## Points ouverts

- **2026-11-02** · `docs/progress.md` et lot 2.4 — Sur `backend`, le lot 2.4 est `à faire` alors que ses étapes 1 à 9 sont fusionnées
  (PR #25, 0c15832). *`docs/progress.md`, `git log origin/backend`.* · `/fin-lot 2.4` reste-t-il à faire, ou le lot est-il incomplet ?
- **2026-11-02** · « Où en est-on » de `CLAUDE.md` — Indique « Back-end : en cours de démarrage » et « Le workspace pnpm… est créé au
  lot 0.1. Jusque-là, le front se lance depuis `frontend/` avec npm », alors que les lots 0.1 à 2.3 sont terminés. Non modifié
  (hors demande). *`CLAUDE.md` lignes 8–26.* · Mettre ce passage à jour ?
- **2026-11-02** · retard de `main` — `main` a 176 commits de retard sur `backend` ; la copie locale était restée sur `main`.
  *`git rev-list --count main..origin/backend`.* · Normal (fusion « sur demande ») : rien à faire, sauf si une fusion est souhaitée.
- **2026-11-02** · dépendances non installées — Ni `pnpm` ni `node_modules` sur cette machine : `pnpm verify` et les hooks husky ne
  peuvent pas tourner. Installer = `corepack enable` (ou `corepack pnpm`) puis `pnpm install` depuis le `pnpm-lock.yaml` du dépôt.
  · Accord pour installer à la prochaine étape qui demande des tests (source : registre npm, versions verrouillées par le lockfile) ?
- **2026-11-02** · ADR 0016 — Exception d'audit temporaire « réexamen au plus tard le 2026-11-09 » (remarque du lot 0.3 dans
  `docs/progress.md`). *`docs/progress.md`, `docs/adr/0016-exception-audit-nuxt.md`.* · Échéance dans 7 jours.

- **2026-11-02** · mode autonome et « Méthode de travail » — `CLAUDE.md` dit aussi « Commence par un plan ; ne modifie rien avant
  validation » (`/lot`) et « Si une information manque… demander ». La section « Mode autonome » ajoutée laisse ces règles
  et les non négociables en vigueur, et ne couvre que les choix techniques à option conventionnelle. *`CLAUDE.md`.*
  · Faut-il qu'en autonome le plan d'un `/lot` soit exécuté sans validation ?

## Demandes d'accord (actions sensibles)

- **2026-11-02** · `git push` de `chore/notes-claude` — Non fait : la consigne est de ne pas pousser sans demande.
