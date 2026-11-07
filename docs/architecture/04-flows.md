# 04 · Flux critiques

Chaque flux indique le lot où il est construit. Les règles de calcul et leurs vecteurs de test sont dans [../specs/domain-rules.md](../specs/domain-rules.md).

## 4.1 Approbation d'une association (lot 1.3)
1. Le super-admin clique « Approuver et créer l'espace » avec le plan choisi (`Idempotency-Key`).
2. Une transaction (rôle `cotiz_platform`) : `associations` (status `onboarding`), `subscriptions` (période et statut par `firstSubscriptionPeriod`, domain-rules § 10), `users` du gestionnaire (ou rattachement par email), `memberships` (owner, active), `one_time_codes` (activation, émis par la plateforme sans association), mise à jour de la demande, audit, événement `association.approved`.
   - Rattachement par email : seulement un compte **actif** qui n'est owner d'aucune association et ne fait pas partie du personnel de la plateforme ; aucun code n'est émis. L'email d'une demande n'étant pas vérifié, un compte pas encore activé, verrouillé ou désactivé est refusé (`owner_account_unavailable`) : émettre un code pour lui le livrerait au demandeur. Déjà owner : `email_already_owner`.
   - Contrôles avant toute écriture, sous verrou de l'adresse (deux approbations simultanées pour la même adresse : la seconde voit la première).
3. Réponse : `handoff` (identifiant email, code, message prêt avec lien `mailto:` et WhatsApp) ; `null` pour un compte rattaché. **Aucun email n'est envoyé par Cotiz.**
4. Approuver deux fois la même demande avec la même `Idempotency-Key` renvoie la même réponse : rien n'en est mémorisé en clair, le rejeu la reconstruit depuis la base (code déchiffré tant qu'il sert, `handoff` `null` ensuite). Avec une autre clé, une demande déjà traitée : `request_already_handled`.

## 4.2 Création de projet et échéancier (lot 2.2)
- Projet créé en `draft`. `POST …/schedule-preview` appelle `generateSchedule()` de `@cotiz/domain` : **même fonction** que l'aperçu front.
- `publish` → `enrolling` (inscriptions ouvertes) ; passage à `active` à la date de début (tâche quotidienne) ; `close` → `completed`.
- **Verrouillage** : au premier paiement validé, `financial_terms_locked_at` est posé ; montant, fonds d'entrée, fréquence, jour et dates deviennent non modifiables (`financial_terms_locked`).
- Cycle roulant : 12 échéances matérialisées par inscription ; tâche mensuelle `schedule.extend-rolling` qui maintient l'horizon.

## 4.3 Inscription d'un souscripteur (lot 2.3)
1. `POST …/members/lookup` avec le téléphone normalisé E.164 (libphonenumber, pays par défaut de l'association).
2. Réponse : `new` · `existing_user` (prénom + initiale du nom seulement) · `already_enrolled`. Endpoint limité en débit et audité (ne doit pas servir d'annuaire).
3. `POST …/projects/{pid}/enrollments` : création de `users` si nouveau (status `pending_activation`), `memberships` (subscriber) si besoin, `enrollments` (active en V1 ; `pending_signature` si le projet exige un contrat à partir du lot 4.1), `installments` via `generateSchedule()`, contrôle de quota. Tout dans **une** transaction.
4. Si nouveau compte : code d'activation créé, réponse avec `handoff`. Le compte apparaît dans « Codes à remettre » jusqu'à activation.
5. Événement `member.enrolled` : notification in-app si le compte existe déjà.

## 4.4 Déclaration d'un paiement (lot 3.3)
1. Le front appelle `proposeAllocation()` localement (ou `POST /me/payments/allocation-preview`) pour pré-cocher les échéances.
2. Preuve : `POST /uploads` → dépôt direct MinIO → `POST /uploads/{id}/complete` → worker (type réel, ClamAV, EXIF, SHA-256) → `clean`.
3. `POST /me/payments` avec `Idempotency-Key` (UUID généré par le front à l'ouverture de l'assistant). Contrôles : inscription active (sinon `signature_required` ou `invalid_state`), preuve `clean` (sinon `file_not_clean`, ou `file_scan_pending` si l'analyse n'est pas finie) et pas déjà citée par un paiement en attente ou validé (`proof_already_used`) **ou** référence de transaction, `validateAllocation()`.
4. Transaction : `payments` (pending), `allocations` (proposed), `installments.amount_pending += …` et statut `declared` pour chaque échéance touchée, audit, événement `payment.declared`.

Le contexte d'une déclaration est `space = subscriber` ; les politiques RLS autorisent l'insertion de ses propres paiements et la mise à jour de ses échéances.

## 4.5 Validation d'un paiement — la transaction la plus critique (lot 2.4)
```sql
BEGIN;
SET LOCAL app.association_id = $aid; SET LOCAL app.user_id = $uid; SET LOCAL app.space = 'association';
-- 1. verrouiller le paiement, vérifier statut et version (If-Match)
SELECT … FROM payments WHERE id = $1 AND status = 'pending' AND version = $2 FOR UPDATE;
-- 0 ligne → payment_already_reviewed (409) ou version_conflict (412)
-- 1 bis. verrouiller le projet (ordre paiement → projet → échéances, comme en.create et en.withdraw : aucun cycle)
SELECT … FROM projects WHERE id = $project FOR NO KEY UPDATE;
-- 2. verrouiller les échéances de l'inscription (reste dû) et celles visées, dans un ordre stable
SELECT … FROM installments WHERE enrollment_id = $eid OR id = ANY($ids) ORDER BY id FOR UPDATE;
-- 3. répartition finale (celle du souscripteur ou ajustée) vérifiée par validateAllocation()
--    sur le montant reçu (amount_received ?? amount_declared), avec pending recalculé hors ce paiement
UPDATE allocations SET state = 'voided' WHERE payment_id = $1;          -- anciennes propositions
INSERT INTO allocations (… state = 'confirmed') …;                       -- répartition finale
UPDATE installments SET amount_pending = amount_pending - <proposé>,
                        amount_paid = amount_paid + <confirmé>, status = installmentStatus(…), paid_at = …;
-- 4. clôturer, verrouiller les conditions financières, auditer, publier
UPDATE payments SET status = 'validated', reviewed_by = $uid, reviewed_at = now(), version = version + 1;
UPDATE projects SET financial_terms_locked_at = now() WHERE id = $project AND financial_terms_locked_at IS NULL;
INSERT INTO audit_logs …; INSERT INTO outbox_events ('payment.validated', …);
COMMIT;  -- le trigger différé vérifie Σ allocations confirmées = montant reçu
```
- Deux gestionnaires simultanés : le second reçoit `payment_already_reviewed` (409) avec le nom de la personne qui a traité.
- **Annulation** (bouton du toast, 10 min, auteur seulement) : `revert-validation` = opération compensatoire. Les allocations confirmées passent `voided`, les montants sont retirés de `amount_paid`, le paiement repasse `pending` avec ses allocations proposées recréées ; audit `payment.reverted`. Jamais de suppression.
- **Rejet** : allocations `voided`, `amount_pending` libéré, statuts recalculés, motif obligatoire.
- **Montant reçu différent** : `amount_received` saisi ; la répartition doit totaliser ce montant ; le souscripteur est notifié de l'écart.

## 4.6 Passage en retard (lot 2.4, tâche planifiée)
Tâche quotidienne à 01:00 dans le fuseau de chaque association : `upcoming → due` le jour J ; `→ late` quand `today > due_date + grace_days` et non soldée, avec `late_since`. Une requête `UPDATE … RETURNING` par association, puis **un** événement `installment.late` par souscripteur (regroupé).

## 4.7 Signature du contrat (lot 4.1)
1. `GET /me/projects/{pid}/contract` : texte personnalisé + empreinte SHA-256.
2. `POST …/contract/sign` avec l'empreinte affichée et le texte de consentement ; si le texte a changé : `contract_changed`.
3. `contract_signatures` (empreinte, consentement exact, horodatage, IP, navigateur), inscription → `active`, échéancier généré.
4. Worker : PDF signé avec page de preuve (Gotenberg), stocké dans `cotiz-legal` (WORM), notification au gestionnaire. Un PDF signé n'est jamais régénéré.

## 4.8 Import (lot 4.4)
Quatre états (`uploaded → mapped → validated → importing → completed`). Analyse et validation dans le worker ; l'exécution réutilise **exactement** le cas d'usage d'inscription unitaire, ligne par ligne. À la fin : lien vers « Codes à remettre » et fiche imprimable groupée.

## 4.9 Relances sans fournisseur (lot 4.3)
Tâche quotidienne 08:30 locale : pour chaque règle active, trouve les échéances visées, crée `reminder_runs` (unique par règle, échéance et jour), envoie un rappel in-app + push au souscripteur (`auto_sent`), et ajoute une entrée `to_handle` dans la file « À relancer » du gestionnaire avec le message prêt. Le gestionnaire copie ou ouvre WhatsApp puis marque `handled` ou `dismissed`.

## 4.10 Rapprochement par relevés (lot 5.1)
Import CSV/Excel d'un relevé → `statement_lines` → score de correspondance (montant exact +0,6 ; référence contenue +0,3 ; date ±3 jours +0,1) avec les paiements `pending` → propositions ≥ 0,7. Confirmer une proposition appelle le cas d'usage de validation (4.5). Aucune validation automatique.
