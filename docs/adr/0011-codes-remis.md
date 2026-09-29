# ADR 0011 · Codes d'activation remis par une personne

**Statut :** adopté · 2026-09-29

## Décision

Code de 8 caractères sans ambiguïté, 72 h, haché ; copie chiffrée ré-affichable par les gestionnaires jusqu'à consommation ; la personne choisit son mot de passe. Réinitialisation : code 6 chiffres émis par le rôle supérieur.

## Pourquoi

Jamais de mot de passe transmis ; le gestionnaire connaît déjà ses membres et peut vérifier leur identité hors ligne.

## Alternatives écartées

Mot de passe envoyé par SMS (mauvaise pratique) ; lien magique par email (fournisseur).
