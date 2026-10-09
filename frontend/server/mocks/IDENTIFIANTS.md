# Identifiants mockés des écrans de connexion

Chaque état d'erreur de `design/INVENTAIRE.md` est atteignable avec les saisies ci-dessous.
Logique : `server/mocks/handlers/session.ts` (`auth.*`). Le cookie `cotiz_role` reste la session mockée jusqu'au lot 1.1.

## Souscripteur — `/connexion`

| Téléphone | Mot de passe | Résultat |
|---|---|---|
| 05 44 21 87 90 (Moussa Diarra) | `motdepasse` | connexion → `/accueil` |
| 05 44 21 87 90 | `K7M4-P9QX` (code d'activation remis par l'association) | première connexion → `/bienvenue` |
| 05 44 21 87 90 | autre | « Mot de passe incorrect » |
| numéro absent des mocks (ex. 07 00 00 00 00) | — | « Mot de passe incorrect » (le contrat ne révèle pas si un compte existe : écart R7) |

Fatou Traoré (01 22 33 44 55) et Jean Kouassi (07 55 66 77 88) se connectent aussi avec `motdepasse` ;
la session mockée reste celle de Moussa Diarra.

## Gestionnaire — `/connexion/association`

| Email | Mot de passe | Résultat |
|---|---|---|
| awa@entraide.ci | `motdepasse` | connexion → `/asso` |
| awa@entraide.ci | `K7M4-P9QX` | premier accès → onboarding `/asso/bienvenue` |
| awa@entraide.ci | `suspendu` | « L’espace de votre association est suspendu » |
| awa@entraide.ci (ou email inconnu) | autre | « Email ou mot de passe incorrect » |
| même email, 5ᵉ échec consécutif | — | « Trop de tentatives » : blocage 15 min (mémoire du serveur ; redémarrer `pnpm dev` pour l’effacer) |

État « chargement » : pendant l’envoi. `?scenario=chargement` sur la page allonge la latence à 10 s.

## Super-admin — `/connexion/plateforme`

| Email | Mot de passe | Résultat |
|---|---|---|
| richy@cotiz.app | `motdepasse` | étape « Code de vérification » ; code `481902` → `/plateforme` |
| autre | — | « Email ou mot de passe incorrect » |

## Mot de passe oublié — `/mot-de-passe`

Tout téléphone ou email bien formé est accepté (on ne révèle pas si le compte existe).

| Code | Résultat |
|---|---|
| `123456` | étape « Nouveau mot de passe » |
| `000000` | « Code expiré » |
| autre | « Code incorrect » |

## Ajout d'un souscripteur — recherche du téléphone

| Téléphone | Résultat |
|---|---|
| 05 44 21 87 90 (sur un projet où Moussa est inscrit) | « déjà inscrit » |
| 01 00 00 00 01 (Ibrahim Touré, hors du projet) | compte existant |
| autre | nouveau compte (code d'activation `K7M4-P9QX`) |

## Identifiants (UUID)

Les ressources des mocks ont des UUID déterministes (`server/mocks/ids.ts`, `uid('project', 'centre-communautaire')`).
