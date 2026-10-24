# 03 · Authentification, codes et sessions

## Une identité, trois portes
Un seul endpoint `POST /auth/login` avec `space` : `platform`, `association` ou `subscriber`. L'API vérifie que la personne a un rôle actif dans cet espace (sinon `wrong_space`, message identique à `invalid_credentials` côté interface). Une même personne peut être gestionnaire d'une association et souscriptrice d'une autre.

| Espace | Identifiant | Exigences |
|---|---|---|
| Plateforme | Email | V1 : liste d'adresses IP autorisées (config) ; V2 (lot 4.7) : TOTP obligatoire |
| Association | Email | TOTP proposé en V2 |
| Souscripteur | Téléphone E.164 (`+225…`) | Mot de passe |

## Jetons
| Élément | Choix |
|---|---|
| Accès | JWT EdDSA (Ed25519), 15 min, en mémoire côté front. Claims : `sub`, `space`, `sid` (aucune association : `MembershipGuard` vérifie le `{aid}` de l’URL en base, lot 1.2) |
| Rafraîchissement | Opaque 256 bits, cookie `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, stocké haché (SHA-256) dans `sessions`. Durée **absolue** de 30 jours depuis la connexion, jamais prolongée par les rotations. « Rester connecté » (`sessions.remember_me`) : cookie persistant jusqu'à cette échéance ; sinon cookie de session |
| Rotation | Chaque `POST /auth/refresh` émet un nouveau jeton et révoque l'ancien, avec la même échéance. Réutilisation d'un jeton révoqué = vol présumé : **toute la famille** (`family_id`) est révoquée. Le droit à l'espace est revérifié à chaque rotation. Le front ne lance qu'un renouvellement à la fois, tous onglets confondus |
| Déconnexion | Session révoquée ; `sid` en liste noire Redis jusqu'à expiration du JWT |
| Suspension d'association | `MembershipGuard` lit le statut de l'association en base à chaque requête : 403 `association_suspended` dès la requête suivante. Le consommateur de `association.suspended` révoque les sessions de l'espace association des gestionnaires (familles entières, `sid` en liste noire Redis) ; reconnexion refusée (`association_suspended`). Aucune clé Redis par association |
| Hachage | argon2id (paramètres OWASP : m=19 MiB, t=2, p=1) |
| Verrouillage | 5 échecs → 15 min (`account_locked`) ; limite complémentaire par IP |

## Codes remis par une personne (sans fournisseur)
Table `one_time_codes`, colonne `delivery = 'manual'`.

| Usage | Format | Durée | Émis par | Ré-affichable |
|---|---|---|---|---|
| `activation` (souscripteur) | 8 caractères, alphabet sans ambiguïté `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, affiché `K7M4-P9QX` | 72 h | Automatique à l'inscription, ou « Régénérer » | Oui, par les gestionnaires de l'association, jusqu'à consommation (`code_encrypted`) |
| `activation` (gestionnaire créé à l'approbation) | idem | 72 h | Approbation par le super-admin | Non (affiché une fois, régénérable par le super-admin) |
| `password_reset` | 6 chiffres | 15 min | Gestionnaire (pour un souscripteur) ou super-admin (pour un gestionnaire) | Non : affiché une fois |
| `team_invite`, `staff_invite` | 8 caractères | 72 h | Owner de l'association / owner plateforme | Non |

Règles communes :
- Toujours stocké **haché** (argon2id) dans `code_hash` ; `code_encrypted` n'existe que pour l'activation et est effacé à la consommation ou à l'expiration.
- 5 essais maximum par code (`too_many_attempts`), puis le code est invalidé.
- Émettre un nouveau code invalide les codes non consommés du même usage pour la même personne.
- Chaque émission et chaque « remis » sont audités.

### Message prêt à transmettre
L'API renvoie, avec le code, un objet `handoff` que le front affiche :
```json
{
  "code": "K7M4-P9QX",
  "expiresAt": "2026-10-02T14:00:00Z",
  "activationUrl": "https://app.cotiz.app/activer?t=+2250544218790",
  "message": "Bonjour Moussa, Entraide Yopougon vous a inscrit sur Cotiz. Activez votre compte sur https://app.cotiz.app/activer avec le code K7M4-P9QX (valable jusqu'au 2 octobre).",
  "whatsappUrl": "https://wa.me/2250544218790?text=…",
  "smsUrl": "sms:+2250544218790?body=…"
}
```
- Le front ajoute Copier, Imprimer (fiche A6 avec QR code du lien d'activation, généré côté client) et, sur mobile, le partage natif (`navigator.share`).
- Le lien d'activation contient le téléphone, **jamais le code**.

## Activation (`POST /auth/activate`)
Entrée : identifiant (téléphone du souscripteur ou email du gestionnaire), code, nouveau mot de passe. Construit au lot 1.1, utilisé par le super-admin, les gestionnaires et les souscripteurs. Effets : code consommé, `users.status = active`, `must_change_password = false`, session créée (connecté directement), événement `user.activated`, notification au gestionnaire.

## Mot de passe oublié sans fournisseur
1. `POST /auth/password/forgot` avec l'identifiant et l'espace. Réponse **toujours identique** (202), que le compte existe ou non.
2. Si le compte existe : `password_reset_requests` (pending) + événement → notification in-app aux gestionnaires de ses associations (souscripteur) ou au personnel plateforme (gestionnaire). Limite : 3 demandes par 24 h.
3. Le gestionnaire ouvre « Demandes de réinitialisation », vérifie l'identité **hors ligne** (appel, en personne), clique « Générer un code » : code 6 chiffres affiché une fois avec message prêt.
4. La personne saisit le code (`/auth/password/verify-code` → jeton de réinitialisation 10 min), puis le nouveau mot de passe (`/auth/password/reset`) : toutes ses sessions sont révoquées.
5. Super-admin : `pnpm --filter backend cli reset-password <email>` (script d'exploitation, audité).

Au lot 6.1 (option email), l'étape 3 devient automatique si la personne a un email vérifié ; le chemin manuel reste disponible.

## `GET /me`
Renvoie : identité, espace courant, associations et rôles, `permissions` (chaînes de `permissions.yaml`), `features` (voir `docs/specs/features.yaml`), préférences. Le front s'en sert pour les menus, les boutons et « Bientôt disponible ».
