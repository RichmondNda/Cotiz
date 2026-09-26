# Identifiants mockés des écrans de connexion (V0)

Chaque état d'erreur de `design/INVENTAIRE.md` est atteignable avec les saisies ci-dessous.
Logique : `server/mocks/auth.ts` et `server/api/session/*`, `server/api/mot-de-passe/*`.

## Souscripteur — `/connexion`

| Téléphone | Mot de passe | Résultat |
|---|---|---|
| 05 44 21 87 90 (Moussa Diarra) | `motdepasse` | connexion → `/accueil` |
| 05 44 21 87 90 | `provisoire` | première connexion (« Bienvenue Moussa ! ») → `/bienvenue` |
| 05 44 21 87 90 | autre | « Mot de passe incorrect » |
| numéro absent des mocks (ex. 07 00 00 00 00) | — | « Ce numéro n’est rattaché à aucun compte » |

Les autres souscripteurs des mocks ayant un téléphone (Fatou Traoré, Jean Kouassi…) se connectent aussi avec
`motdepasse` ; la session mockée reste celle de Moussa Diarra.

## Gestionnaire — `/connexion/association`

| Email | Mot de passe | Résultat |
|---|---|---|
| awa@entraide.ci | `motdepasse` | connexion → `/asso` |
| awa@entraide.ci | `suspendu` | « L’espace de votre association est suspendu » |
| awa@entraide.ci (ou email inconnu) | autre | « Email ou mot de passe incorrect » |
| même email, 5ᵉ échec consécutif | — | « Trop de tentatives » : blocage 15 min (mémoire du serveur ; redémarrer `npm run dev` pour l’effacer) |

État « chargement » : pendant l’envoi. `?scenario=chargement` sur la page allonge la latence à 10 s.

## Super-admin — `/connexion/plateforme`

| Email | Mot de passe | Résultat |
|---|---|---|
| richy@cotiz.app | `motdepasse` | étape « Code de vérification » ; code `481902` → `/plateforme` |
| autre | — | « Email ou mot de passe incorrect » |

## Mot de passe oublié — `/mot-de-passe`

Tout téléphone ou email bien formé reçoit un code (on ne révèle pas si le compte existe).

| Code | Résultat |
|---|---|
| `123456` | étape « Nouveau mot de passe » |
| `000000` | « Code expiré » |
| autre | « Code incorrect » |
