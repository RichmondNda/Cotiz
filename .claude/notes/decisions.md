# Décisions prises en mode autonome

Format : **date** · sujet — décision (option retenue) · raison. Les décisions de projet vont dans `docs/decisions.md` ou un ADR.

- **2026-11-02** · branche de la mise en place des notes — Branche `chore/notes-claude` créée depuis `origin/backend`
  (et non depuis `main`). · `main` est 176 commits derrière `backend`, qui est la branche d'intégration où se fait le travail
  (`CLAUDE.md`) ; on ne commite pas directement sur la branche par défaut. La PR éventuelle visera `backend`.
- **2026-11-02** · vérifications avant commit — Pas de `pnpm verify` pour ce commit. · Le changement ne touche que des fichiers
  Markdown (`.claude/notes/`, `CLAUDE.md`), ignorés par Prettier et hors du périmètre lint/types/tests ; de plus les dépendances
  ne sont pas installées sur cette machine (voir `apprentissages.md`). Contrôle fait à la place : `git diff --stat` limité à ces fichiers.
- **2026-11-02** · statut du lot 2.4 — `terminé` au 2026-11-02 (date de fusion de la PR #25), avec dans les remarques ce qui n'a pas
  pu être vérifié. · Les 9 étapes sont fusionnées, chaque point de la définition de fini a un test dans le code, et les échecs locaux
  viennent tous de l'absence de Docker (aucune assertion en échec). Précédent : le lot 1.1 avait été clôturé avec « CI non encore
  exécutée ». La CI et la revue humaine restent à confirmer (`a-verifier.md`) ; s'il y a un problème, on repasse le lot `en cours`.
- **2026-11-02** · mode autonome pour `/lot` — Plan consigné ici puis exécuté sans validation (`CLAUDE.md`, `.claude/commands/lot.md`).
  Une décision métier `ouvert` ou une contradiction avec `docs/specs/` arrête toujours le travail. · Accord de l'utilisateur (« je serais
  pas toujours dispo pour valider ») ; les décisions `ouvert` sont des choix de produit, pas des choix techniques.
- **2026-11-02** · installation de pnpm — `corepack enable --install-directory ~/.local/bin` plutôt que `corepack enable` (qui écrit
  dans `/usr/bin`, donc sudo). · Version imposée par `packageManager` ; rien à modifier sur le système.
- **2026-11-02** · emplacement des notes — Notes dans `.claude/notes/`, versionnées (le `.gitignore` n'exclut que
  `.claude/settings.local.json`). · Demande explicite ; versionner permet de les retrouver sur toute machine.
