# Glossaire (interface en français, code en anglais)

| Interface | Code / base | Définition |
|---|---|---|
| Association | `association` (tenant) | Client de Cotiz ; racine de l'isolation |
| Super-admin, équipe Cotiz | `platform_staff` (owner, admin, support) | Personnel de la plateforme |
| Gestionnaire | `membership.role` = owner · manager · viewer | Personne qui gère une association |
| Souscripteur | `subscriber` (`membership.role` = subscriber) | Personne qui cotise |
| Projet | `project` | Collecte avec échéancier (dates fixes ou cycle roulant) |
| Inscription | `enrollment` | Un souscripteur dans un projet |
| Échéance | `installment` | Somme attendue à une date ; une case de la grille |
| Fonds d'entrée | `entry_fee` | Échéance de rang 0 |
| Déclarer un paiement | `declare` → `payment` (pending) | Le souscripteur signale un paiement fait hors plateforme |
| Répartition | `allocation` | Part d'un paiement affectée à une échéance |
| Valider / rejeter | `validate` / `reject` | Décision du gestionnaire |
| Reste dû | `remaining` | `amountDue − amountPaid − amountPending` |
| En retard | `late` | Échue depuis plus que le délai de grâce |
| Délai de grâce | `grace_days` | Jours entre l'échéance et le passage en retard |
| Code d'activation | `one_time_codes` (activation) | Remis par le gestionnaire pour la première connexion |
| Message prêt | `handoff` | Texte + liens (WhatsApp, SMS, impression) à transmettre soi-même |
| Relance | `reminder` | Rappel in-app/push + entrée dans la file « À relancer » |
| Formule, plan | `plan` | Offre commerciale avec quotas et fonctionnalités |
| Rapprochement | `reconciliation` | Comparaison d'un relevé importé avec les déclarations |
