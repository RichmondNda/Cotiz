# packages/domain — règles métier pures

- Aucune dépendance (ni NestJS, ni Nuxt, ni base, ni date-fns lourd) ; dates manipulées en `YYYY-MM-DD` avec un petit utilitaire interne.
- Référence : `docs/specs/domain-rules.md`. Les vecteurs `docs/specs/test-vectors/*.json` sont chargés tels quels par les tests et doivent passer à l'identique (valeurs et codes d'erreur).
- Tests de propriétés fast-check en plus des vecteurs ; couverture 95 %.
- Exporte : `Money`, `formatMoney`, `newId` (UUID v7), `generateSchedule`, `proposeAllocation`, `validateAllocation`, `installmentStatus`, `lateSince`, `memberStanding`, `DomainError`.
