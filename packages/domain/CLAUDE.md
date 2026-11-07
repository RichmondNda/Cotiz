# packages/domain — règles métier pures

- Aucune dépendance (ni NestJS, ni Nuxt, ni base, ni date-fns lourd) ; dates manipulées en `YYYY-MM-DD` avec un petit utilitaire interne.
- Référence : `docs/specs/domain-rules.md`. Les vecteurs `docs/specs/test-vectors/*.json` sont chargés tels quels par les tests et doivent passer à l'identique (valeurs et codes d'erreur).
- Tests de propriétés fast-check en plus des vecteurs ; couverture 95 %.
- Exporte : `Money`, `formatMoney`, `newId` (UUID v7), `generateSchedule`, `firstSubscriptionPeriod`, `periodEnd`, `monthlyEquivalent`, `monthlyRecurringRevenue`, `proposeAllocation`, `openRemainingOf`, `validateAllocation`, `excludingPayment`, `installmentStatus`, `enrollmentTotals`, `associationTransition`, `lateSince`, `lateSinceOf`, `hourIn`, `moveAllocations`, `byDueOrder`, `memberStanding`, `todayIn`, `subscriberHistoryFigures` (historique, lot 3.4), `DomainError`. Validation par un gestionnaire : `validateAllocation(reçu ?? déclaré, allocations, excludingPayment(échéances, allocationsProposées), { enrollmentId })` ; « aujourd'hui » = `todayIn(fuseau de l'association)`.
- `Money` est une forme JSON : chaque opération revalide ses entrées (`Money.check`). Un montant lu en base passe par `Money.fromDb(bigint | string, devise)`, jamais par `Number()`/`parseFloat`.
- U+202F et U+00A0 s'écrivent en échappement (`'\u202f'`), jamais en caractère littéral : ESLint (`no-irregular-whitespace`, chaînes comprises) le refuse.
- Échéancier, répartition, statuts : montants en entiers de la plus petite unité (l'appelant passe `money.amount`, la devise est celle du projet) ; `null` venu de la base vaut « absent » ; dates d'entrée bornées à 1900–2199.
