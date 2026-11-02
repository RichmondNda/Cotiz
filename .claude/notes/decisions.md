# Décisions prises en mode autonome

Format : **date** · sujet — décision (option retenue) · raison. Les décisions de projet vont dans `docs/decisions.md` ou un ADR.

- **2026-11-02** · branche de la mise en place des notes — Branche `chore/notes-claude` créée depuis `origin/backend`
  (et non depuis `main`). · `main` est 176 commits derrière `backend`, qui est la branche d'intégration où se fait le travail
  (`CLAUDE.md`) ; on ne commite pas directement sur la branche par défaut. La PR éventuelle visera `backend`.
- **2026-11-02** · vérifications avant commit — Pas de `pnpm verify` pour ce commit. · Le changement ne touche que des fichiers
  Markdown (`.claude/notes/`, `CLAUDE.md`), ignorés par Prettier et hors du périmètre lint/types/tests ; de plus les dépendances
  ne sont pas installées sur cette machine (voir `apprentissages.md`). Contrôle fait à la place : `git diff --stat` limité à ces fichiers.
- **2026-11-02** · emplacement des notes — Notes dans `.claude/notes/`, versionnées (le `.gitignore` n'exclut que
  `.claude/settings.local.json`). · Demande explicite ; versionner permet de les retrouver sur toute machine.
