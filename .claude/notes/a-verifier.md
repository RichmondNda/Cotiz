# À vérifier par un humain

Format : **date** · point — constat, source · ce qui est attendu. Une fois tranché : déplacer dans « Tranché », avec la réponse.

## Points ouverts

- **2026-11-02** · lot 2.4, deux points de la définition de fini — (1) « `pnpm verify` vert en CI » pour la PR #25 : non vérifiable
  ici (dépôt privé, pas de `gh`) ; (2) « Revue humaine ligne à ligne de la transaction de validation » (`lg.pay.validate`,
  `backend/src/modules/ledger/application/`) : à faire par un humain. Le lot est marqué `terminé` sous cette réserve.
  · Confirmer les deux, ou installer `gh` (`sudo apt install gh` puis `gh auth login`) pour que Claude lise la CI.
- **2026-11-02** · accès Docker — `dev` n'est pas dans le groupe `docker` : les tests base, intégration et isolation ne tournent pas
  en local, et la démonstration locale est impossible. · Lancer `sudo usermod -aG docker dev`, puis ouvrir une nouvelle session.
- **2026-11-02** · décision 11 — Toujours `proposé` dans `docs/decisions.md` (`due` affiché « À venir ») alors que le lot 2.4
  l'applique. · L'adopter ?
- **2026-11-02** · ADR 0016 — Exception d'audit temporaire, « réexamen au plus tard le 2026-11-09 » (lot 0.3, `docs/progress.md`).
  · Échéance dans 7 jours.

## Demandes d'accord (actions sensibles)

- **2026-11-02** · `git push` de `chore/notes-claude` (vers GitHub, puis PR vers `backend`) — Non fait : l'utilisateur doit le demander.

## Tranché

- **2026-11-02** · `/fin-lot 2.4` → oui, fait (`docs/progress.md`).
- **2026-11-02** · mise à jour de « Où en est-on » de `CLAUDE.md` → oui, faite.
- **2026-11-02** · plan d'un `/lot` sans validation → oui (`CLAUDE.md`, `.claude/commands/lot.md`).
- **2026-11-02** · installation des dépendances → oui, faite (pnpm via corepack, `pnpm install`).
- **2026-11-02** · retard de `main` sur `backend` → normal, `backend` n'est fusionnée dans `main` que sur demande.
