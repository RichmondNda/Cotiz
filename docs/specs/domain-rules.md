# Règles métier (packages/domain)

Ces règles sont implémentées **une seule fois** dans `packages/domain` (TypeScript, fonctions pures, sans dépendance) et utilisées à l'identique par le front (aperçus, compteurs) et le back (transactions). Les vecteurs de `test-vectors/*.json` sont **normatifs** : l'implémentation doit produire exactement ces sorties (valeurs et codes d'erreur).

## 1. Argent
- Montant = entier dans la plus petite unité de la devise (le franc CFA n'a pas de subdivision : 25 000 F = `25000`). Jamais de flottant, jamais de `numeric` pour l'argent.
- Base : `bigint`. JSON : nombre entier (sûr jusqu'à 2^53).
- `formatMoney(amount, currency)` : séparateur de milliers U+202F (espace fine insécable), espace insécable U+00A0 avant le symbole ; `XOF` et `XAF` → `F`, `GNF` → `FG`. Vecteurs : `money.json`.

## 2. Échéancier — `generateSchedule(input)`
Entrée :
| Champ | Type | Règle |
|---|---|---|
| `installmentAmount` | int > 0 | sinon `invalid_amount` |
| `entryFeeAmount` | int ≥ 0 ou absent | fonds d'entrée ; 0 ou absent = aucun |
| `frequency` | `weekly` · `monthly` · `quarterly` · `semiannual` · `annual` | sinon `invalid_frequency` |
| `dueDay` | 1–31 (1–7 = jour ISO pour `weekly`) | sinon `invalid_due_day` |
| `scheduleType` | `fixed` · `rolling` | |
| `startDate` | date | début du projet |
| `endDate` | date | obligatoire si `fixed` (`end_date_required`), ≥ `startDate` (`end_before_start`) |
| `enrolledFrom` | date, défaut `startDate` | date d'entrée du souscripteur |
| `horizon` | int, défaut 12 | `rolling` seulement |

Règles :
1. **Dates périodiques du projet** : pour les fréquences mensuelles, les mois se comptent depuis le mois de `startDate` par pas de 1, 3, 6 ou 12 ; le jour est `min(dueDay, dernier jour du mois)` (31 → 30 ou 28/29). Une date antérieure à `startDate` est sautée. Pour `weekly` : premier jour ISO `dueDay` ≥ `startDate`, puis tous les 7 jours.
2. **Numérotation** : `sequence` = rang de la date dans le projet (1, 2, …), **identique pour tous les souscripteurs**, pour que les colonnes de la grille s'alignent.
3. **Entrée en cours de projet** : seules les dates ≥ `enrolledFrom` sont générées ; aucune échéance rétroactive ; les numéros du projet sont conservés (un souscripteur entré en octobre commence à la séquence 8).
4. **Fonds d'entrée** : `sequence = 0`, `kind = entry_fee`, dû à la **première** date périodique du souscripteur.
5. **Dates fixes** : toutes les dates jusqu'à `endDate` incluse.
6. **Cycle roulant** : seulement les `horizon` prochaines dates à partir de `enrolledFrom` ; la tâche `schedule.extend-rolling` maintient l'horizon.
   La tâche (`extendRollingSchedule(input, lastSequence, today)`, lot 2.3) ajoute, à la suite de la dernière échéance
   générée, les dates manquantes jusqu'à ce que `horizon` échéances soient datées d'aujourd'hui ou plus tard (celle du jour
   comprise) ; jamais de date antérieure à `enrolledFrom` ni de fonds d'entrée. Vecteurs : `schedule-extend.json`.
7. **Conditions d'un projet** (pr.create, pr.preview ; lot 2.2) : montants dans la devise de l'association
   (`currency_mismatch`) ; dates fixes : au moins une date périodique dans le projet (`endDate: no_installment`, sinon le
   fonds d'entrée n'aurait pas de date) ; total par souscripteur (fonds d'entrée compris) représentable en entier sûr,
   sinon pr.create refuse (`installmentAmount: total_too_large`) et l'aperçu donne un total `null`.

Vecteurs : `schedule.json` (15 cas dont 4 erreurs).

## 3. Reste dû d'une échéance
`remaining = amountDue − amountPaid − amountPending`. `amountPending` = somme des allocations **proposées** de paiements `pending`. Invariant base : `amountPaid + amountPending ≤ amountDue`.

Une échéance est **ouverte** si son statut n'est ni `paid`, ni `waived`, ni `canceled`, et si `remaining > 0`.

## 4. Proposition de répartition — `proposeAllocation(amount, installments)`
1. `amount` entier > 0, sinon `invalid_amount`.
2. Échéances ouvertes triées par `dueDate` croissante, puis fonds d'entrée avant mensualité à date égale, puis `sequence`.
3. Si `amount` > Σ `remaining` → `amount_exceeds_remaining` avec `maxAmount` (trop-perçu refusé en V1).
4. Remplissage glouton : chaque échéance reçoit `min(reste à répartir, remaining)`. La dernière peut être partielle.

Vecteurs : `allocation.json`.

## 5. Contrôle d'une répartition — `validateAllocation(amount, allocations, installments)`
Renvoie `{ ok, errors[], remainingToAllocate }` (le compteur « Reste à répartir » de l'interface). Erreurs possibles, toutes rapportées (pas d'arrêt à la première) :
| Code | Condition |
|---|---|
| `invalid_amount` | montant non entier ou ≤ 0 |
| `duplicate_installment` | même échéance deux fois |
| `allocation_not_positive` | allocation ≤ 0 ou non entière |
| `installment_not_open` | échéance inconnue, payée, dispensée ou annulée |
| `allocation_exceeds_remaining` | allocation > `remaining` de l'échéance |
| `mixed_enrollments` | échéances de plusieurs inscriptions |
| `allocation_mismatch` | Σ allocations ≠ montant |

**À la validation par le gestionnaire**, le back appelle `validateAllocation` avec le montant reçu (`amountReceived ?? amountDeclared`) et des échéances dont `amountPending` **exclut** les allocations proposées du paiement en cours.

Vecteurs : `validation.json`.

## 6. Statut d'une échéance — `installmentStatus(installment, today, graceDays)`
Ordre d'évaluation (le premier qui s'applique gagne) :
1. `waived` ou `canceled` persistés → inchangés.
2. `amountPaid ≥ amountDue` → `paid`.
3. `amountPending > 0` → `declared` (le souscripteur a fait sa part ; l'action est côté gestionnaire).
4. `today > dueDate + graceDays` → `late` ; `lateSince = dueDate + graceDays + 1 jour`.
5. `amountPaid > 0` → `partial`.
6. `today ≥ dueDate` → `due`.
7. sinon → `upcoming`.

`today` est la date **dans le fuseau de l'association** (`Africa/Abidjan` par défaut). Correspondance avec les badges : `status-mapping.yaml`. Vecteurs : `status.json`.

## 7. Situation d'un souscripteur sur un projet — `memberStanding(enrollmentStatus, installmentStatuses)`
`pending_signature` → `signature_required` ; `withdrawn` → `withdrawn` ; au moins une échéance `late` → `late` ; sinon `up_to_date`. Compte non activé : `activation_pending` (calculé par le back à partir de `users.status`).

## 8. Transitions de statut
| Objet | Transitions autorisées |
|---|---|
| Projet | `draft → enrolling` (publish) · `enrolling → active` (date de début) · `enrolling/active → completed` (close) · `completed → archived` ; suppression : `draft` seulement |
| Inscription | `pending_signature → active` (signature) · `active → withdrawn` · `active → completed` (fin de projet) |
| Paiement | `pending → validated` · `pending → rejected` · `validated → pending` (annulation ≤ 10 min, auteur) · `pending → canceled` (retrait par le souscripteur, V2) |
| Association | `onboarding → active` · `active ↔ suspended` · `active → past_due → suspended` (V2) · `* → closed` |
| Demande de création | `pending → approved` · `pending → rejected` |

Toute autre transition → `invalid_state`.

## 9. Verrouillage des conditions financières
Au **premier paiement validé** d'un projet, `financial_terms_locked_at` est posé. Deviennent non modifiables : `installment_amount`, `entry_fee_amount`, `frequency`, `due_day`, `schedule_type`, `start_date`, `end_date`, `currency`. Restent modifiables : nom, description, couverture, délai de grâce (pour l'avenir), moyens de paiement.

## 10. Première période d'un abonnement — `firstSubscriptionPeriod({ startsOn, billingPeriod, trialDays })`
Abonnement créé à l'approbation d'une demande ou à la création directe d'une association.
- **Fin d'une période payante** — `periodEnd(start, billingPeriod)` : `start` + 1 mois (`monthly`) ou + 12 mois (`yearly`), jour ramené au dernier jour du mois s'il n'existe pas, **moins un jour** (dernier jour inclus). 1er nov. → 30 nov. ; 15 nov. → 14 déc. ; 31 janv. 2027 → 27 févr. ; 29 févr. 2028 en annuel → 27 févr. 2029.
- **Sans essai** (`trialDays` `null`) : statut `active`, `currentPeriodEnd = periodEnd(startsOn)`, `trialEndsAt = null`.
- **Avec essai** (1 à 365 jours, le jour de début compris) : statut `trialing`, `trialEndsAt = startsOn + trialDays − 1`, et la période en cours **est** l'essai : `currentPeriodEnd = trialEndsAt`. La première période payante commence le lendemain (lot 4.6).
- Erreurs : date illisible `invalid_date`, période inconnue `invalid_billing_period`, durée d'essai hors bornes `invalid_trial_days`.
- Comptes gestionnaires : `manager_seats_override` n'est posé que si le nombre accordé diffère de celui du plan (`null` ou absent = le plan, illimité compris).
- Vecteurs : `test-vectors/subscription.json`.
